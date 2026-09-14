// Item 317: POST /api/usage, plus the retention purge and the deploy marker.
//
// The endpoint's job is as much about refusing as accepting, so most of what
// is pinned here is a refusal: a body cannot attribute events to another
// account, a wrong clock cannot bend a chart, a replay cannot double-count,
// an account with sharing off writes nothing at all, and no response ever
// tells a caller which of those happened.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { USAGE_BATCH_MAX } from "@blw/shared";
import {
  TEST_USAGE_CONTEXT,
  createTestApp,
  createTestDb,
  signUpUser,
  usageEnvelope,
  type TestUser,
} from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { dedupeById, USAGE_BODY_LIMIT_BYTES } from "../routes/usage.js";
import { recordDeploy } from "../usage/deploys.js";
import { purgeExpiredUsageEvents, retentionCutoff } from "../usage/retention.js";
import { startUsageBackgroundJobs } from "../usage/boot.js";
import { testEnv } from "./helpers.js";

const DAY_MS = 24 * 60 * 60 * 1000;

async function userIdFor(db: Database, email: string): Promise<string> {
  const [row] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  if (!row) throw new Error(`no user row for ${email}`);
  return row.id;
}

describe("POST /api/usage", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let user: TestUser;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    user = await signUpUser(app);
  });

  afterEach(async () => {
    await close();
  });

  const post = (payload: unknown, cookie?: string) =>
    app.inject({
      method: "POST",
      url: "/api/usage",
      headers: cookie ? { cookie } : {},
      payload: payload as Record<string, unknown>,
    });

  it("stores a valid batch against the caller's session", async () => {
    const events = [
      usageEnvelope(),
      usageEnvelope({ name: "meal_logged", route: "/log-meal", props: {
        food_count: "2",
        recipe_kind: "none",
        from_storage: false,
        via: "log_page",
        leftovers_saved: false,
        has_notes: false,
        is_first_meal: true,
        backdated: "now",
        offline: false,
      } }),
    ];

    const response = await post({ events }, user.cookie);
    expect(response.statusCode).toBe(204);

    const rows = await db.select().from(schema.usageEvents);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.name).sort()).toEqual(["meal_logged", "screen_viewed"]);
    expect(new Set(rows.map((row) => row.userId))).toEqual(new Set([await userIdFor(db, user.email)]));
    expect(rows[0]?.context).toEqual(TEST_USAGE_CONTEXT);
    // Server-stamped, so a wrong device clock cannot move it.
    expect(rows[0]?.receivedAt).toBeInstanceOf(Date);
  });

  it("takes the user id from the session and never from the body", async () => {
    const other = await signUpUser(app, "Other Parent");
    const otherId = await userIdFor(db, other.email);

    // The shared envelope is `.strict()`, so a body that tries to name an
    // account is not "ignored" — it is refused outright.
    const response = await post({ events: [usageEnvelope({ userId: otherId })] }, user.cookie);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
    expect(await db.select().from(schema.usageEvents)).toHaveLength(0);
  });

  it("accepts anonymous events, with no user attached", async () => {
    const response = await post({
      events: [usageEnvelope({ route: "/login", props: { route_pattern: "/login", from_route: null } })],
    });

    expect(response.statusCode).toBe(204);
    const [row] = await db.select().from(schema.usageEvents);
    // The sign-in and sign-up screens are where the funnel starts, so they
    // have to be measurable — without inventing an identity for the visitor.
    expect(row?.userId).toBeNull();
    expect(row?.route).toBe("/login");
  });

  it("stores nothing, and says nothing, when the caller has sharing off", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/preferences",
      headers: { cookie: user.cookie },
      payload: { shareUsageData: false },
    });

    const response = await post({ events: [usageEnvelope()] }, user.cookie);

    // 204, exactly like a stored batch: a distinguishable answer would let a
    // caller probe an account's setting, and the client has nothing to do
    // differently either way.
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(await db.select().from(schema.usageEvents)).toHaveLength(0);
  });

  it("dedupes a replayed batch, by id, across requests and within one", async () => {
    const event = usageEnvelope();

    expect((await post({ events: [event] }, user.cookie)).statusCode).toBe(204);
    // The same batch again — a flush whose 204 the browser never saw.
    expect((await post({ events: [event] }, user.cookie)).statusCode).toBe(204);
    // And the same id twice inside one request.
    expect((await post({ events: [event, event] }, user.cookie)).statusCode).toBe(204);

    expect(await db.select().from(schema.usageEvents)).toHaveLength(1);
  });

  it("clamps a wrong client clock into a sane window", async () => {
    const ancient = usageEnvelope({ occurredAt: "2019-01-01T00:00:00.000Z" });
    const future = usageEnvelope({ occurredAt: "2031-01-01T00:00:00.000Z" });

    const before = Date.now();
    expect((await post({ events: [ancient, future] }, user.cookie)).statusCode).toBe(204);
    const after = Date.now();

    const rows = await db.select().from(schema.usageEvents);
    const stamped = rows.map((row) => row.occurredAt.getTime()).sort((a, b) => a - b);

    // Seven days back, five minutes forward — never 2019 and never 2031.
    expect(stamped[0]).toBeGreaterThanOrEqual(before - 7 * DAY_MS - 1000);
    expect(stamped[0]).toBeLessThanOrEqual(after - 7 * DAY_MS + 1000);
    expect(stamped[1]).toBeGreaterThanOrEqual(before + 5 * 60_000 - 1000);
    expect(stamped[1]).toBeLessThanOrEqual(after + 5 * 60_000 + 1000);
  });

  it("rejects an unknown event, a stray prop, and a payload with an address in it", async () => {
    const bodies = [
      { events: [usageEnvelope({ name: "meal_eaten", props: {} })] },
      { events: [usageEnvelope({ props: { route_pattern: "/", from_route: null, note: "hi" } })] },
      // A real path segment would carry a slug or an id.
      { events: [usageEnvelope({ route: "/foods/sweet-potato" })] },
      {
        events: [
          usageEnvelope({
            appVersion: "ops@littlemeals.org",
            context: { ...TEST_USAGE_CONTEXT, app_version: "ops@littlemeals.org" },
          }),
        ],
      },
      { events: [] },
      { events: Array.from({ length: USAGE_BATCH_MAX + 1 }, () => usageEnvelope()) },
      { events: [usageEnvelope()], userId: "user-1" },
    ];

    for (const body of bodies) {
      const response = await post(body, user.cookie);
      expect(response.statusCode, JSON.stringify(body).slice(0, 80)).toBe(400);
      // No `details`: a rejected payload is never echoed back.
      expect(response.json()).toEqual({ error: "invalid_request" });
    }

    expect(await db.select().from(schema.usageEvents)).toHaveLength(0);
  });

  it("fails the whole batch when one event in it is bad", async () => {
    const response = await post(
      { events: [usageEnvelope(), usageEnvelope({ props: { route_pattern: "/nope", from_route: null } })] },
      user.cookie,
    );

    expect(response.statusCode).toBe(400);
    expect(await db.select().from(schema.usageEvents)).toHaveLength(0);
  });

  it("spends a per-user hourly budget and answers 429 with retry-after", async () => {
    const limited = await createTestApp({ USAGE_RATE_LIMIT_MAX: 2 });
    try {
      const parent = await signUpUser(limited.app, "Budget Parent");
      const send = () =>
        limited.app.inject({
          method: "POST",
          url: "/api/usage",
          headers: { cookie: parent.cookie },
          payload: { events: [usageEnvelope()] },
        });

      expect((await send()).statusCode).toBe(204);
      expect((await send()).statusCode).toBe(204);

      const blocked = await send();
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json<{ error: string }>().error).toBe("rate_limited");
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);

      // The blocked request wrote nothing.
      expect(await limited.db.select().from(schema.usageEvents)).toHaveLength(2);
    } finally {
      await limited.close();
    }
  });

  it("budgets anonymous callers too, by IP", async () => {
    // Otherwise the endpoint is an open write path into the disk: it has to
    // accept sessionless requests, so it has to limit them.
    const limited = await createTestApp({ USAGE_RATE_LIMIT_MAX: 1 });
    try {
      const send = () =>
        limited.app.inject({ method: "POST", url: "/api/usage", payload: { events: [usageEnvelope()] } });

      expect((await send()).statusCode).toBe(204);
      expect((await send()).statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });

  it("caps the body at 32 KB", async () => {
    expect(USAGE_BODY_LIMIT_BYTES).toBe(32 * 1024);

    const response = await app.inject({
      method: "POST",
      url: "/api/usage",
      headers: { cookie: user.cookie, "content-type": "application/json" },
      payload: `{"events":[],"pad":"${"x".repeat(USAGE_BODY_LIMIT_BYTES + 1)}"}`,
    });

    expect(response.statusCode).toBe(413);
    expect(await db.select().from(schema.usageEvents)).toHaveLength(0);
  });

  it("goes away with the account it belongs to", async () => {
    await post({ events: [usageEnvelope()] }, user.cookie);
    const userId = await userIdFor(db, user.email);

    await db.delete(schema.user).where(eq(schema.user.id, userId));

    expect(await db.select().from(schema.usageEvents)).toHaveLength(0);
  });
});

describe("dedupeById", () => {
  it("keeps the first of each id, in order", () => {
    const events = [{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "a", n: 3 }];
    expect(dedupeById(events)).toEqual([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
  });
});

describe("retention", () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });

  afterEach(async () => {
    await close();
  });

  const insertAt = async (receivedAt: Date, id: string) => {
    await db.insert(schema.usageEvents).values({
      id,
      userId: null,
      name: "session_started",
      props: {},
      route: null,
      appVersion: "abc123def456",
      context: TEST_USAGE_CONTEXT,
      occurredAt: receivedAt,
      receivedAt,
    });
  };

  it("cuts on received_at, so a wrong device clock cannot keep a row alive", async () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    const old = new Date(now.getTime() - 181 * DAY_MS);
    const recent = new Date(now.getTime() - 179 * DAY_MS);

    await insertAt(old, "11111111-1111-4111-8111-111111111111");
    await insertAt(recent, "22222222-2222-4222-8222-222222222222");
    // `occurred_at` far in the future, `received_at` long past: the row still
    // goes, because the server's own clock is the one that counts.
    await db.insert(schema.usageEvents).values({
      id: "33333333-3333-4333-8333-333333333333",
      userId: null,
      name: "session_started",
      props: {},
      route: null,
      appVersion: "abc123def456",
      context: TEST_USAGE_CONTEXT,
      occurredAt: new Date("2031-01-01T00:00:00.000Z"),
      receivedAt: old,
    });

    const deleted = await purgeExpiredUsageEvents(db, 180, now);

    expect(deleted).toBe(2);
    const left = await db.select().from(schema.usageEvents);
    expect(left.map((row) => row.id)).toEqual(["22222222-2222-4222-8222-222222222222"]);
  });

  it("is a no-op on an empty window", async () => {
    expect(await purgeExpiredUsageEvents(db, 180)).toBe(0);
  });

  it("puts the cutoff exactly retentionDays back", () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    expect(retentionCutoff(30, now).toISOString()).toBe("2026-08-14T12:00:00.000Z");
  });
});

describe("the deploy marker", () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });

  afterEach(async () => {
    await close();
  });

  it("writes one row per build, however many times the container restarts", async () => {
    expect(await recordDeploy(db, "abc123def456")).toBe(true);
    expect(await recordDeploy(db, "abc123def456")).toBe(false);
    expect(await recordDeploy(db, "ffffff000000")).toBe(true);

    const rows = await db.select().from(schema.deploys);
    expect(rows.map((row) => row.sha).sort()).toEqual(["abc123def456", "ffffff000000"]);
    expect(rows[0]?.deployedAt).toBeInstanceOf(Date);
  });

  it("does nothing without a version, so dev and test boot unchanged", async () => {
    expect(await recordDeploy(db, undefined)).toBe(false);
    expect(await db.select().from(schema.deploys)).toHaveLength(0);
  });
});

describe("startUsageBackgroundJobs", () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });

  afterEach(async () => {
    vi.useRealTimers();
    await close();
  });

  it("records the deploy, purges at boot, and keeps purging daily", async () => {
    vi.useFakeTimers();
    const log = { info: vi.fn(), error: vi.fn() };
    const env = testEnv({ APP_VERSION: "abc123def456", USAGE_RETENTION_DAYS: 1 });

    await db.insert(schema.usageEvents).values({
      id: "44444444-4444-4444-8444-444444444444",
      userId: null,
      name: "session_started",
      props: {},
      route: null,
      appVersion: "abc123def456",
      context: TEST_USAGE_CONTEXT,
      occurredAt: new Date(Date.now() - 5 * DAY_MS),
      receivedAt: new Date(Date.now() - 5 * DAY_MS),
    });

    const stop = startUsageBackgroundJobs({ db, env, log });
    // The jobs are fire-and-forget; let their promises settle.
    await vi.waitFor(async () => {
      expect(await db.select().from(schema.usageEvents)).toHaveLength(0);
    });
    expect(await db.select().from(schema.deploys)).toHaveLength(1);

    // A second stale row appears; the daily tick sweeps it without a restart.
    await db.insert(schema.usageEvents).values({
      id: "55555555-5555-4555-8555-555555555555",
      userId: null,
      name: "session_started",
      props: {},
      route: null,
      appVersion: "abc123def456",
      context: TEST_USAGE_CONTEXT,
      occurredAt: new Date(Date.now() - 5 * DAY_MS),
      receivedAt: new Date(Date.now() - 5 * DAY_MS),
    });

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 1000);
    await vi.waitFor(async () => {
      expect(await db.select().from(schema.usageEvents)).toHaveLength(0);
    });

    stop();
    expect(log.error).not.toHaveBeenCalled();
  });
});
