// Parent feedback and the admin inbox (items 358–359).
//
// Three things are on trial here, in descending order of how bad getting
// them wrong would be:
//
//   1. **The inbox does not exist for anybody else.** Every admin route is
//      diffed byte for byte against a URL that was never registered, for an
//      anonymous caller AND for a signed-in parent. A message is somebody's
//      prose with their address attached; "you cannot read it" is not enough,
//      the routes must not be discoverable at all.
//   2. **The transitions are honest.** Every PATCH that changes something
//      writes exactly one audit row per changed dimension, naming the admin,
//      the sender and the message — and a PATCH that changes nothing writes
//      nothing at all.
//   3. **Nothing here deletes.** "Clear" is a timestamp and Restore takes it
//      back; the only thing that removes a message is the sender's own
//      account going away, and the audit row outlives even that.
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adminFeedbackListResponseSchema,
  adminFeedbackSummarySchema,
  accountExportSchema,
  FEEDBACK_MESSAGE_MAX,
} from "@blw/shared";
import type { Database } from "../db/index.js";
import { adminAudit, feedback, user } from "../db/schema.js";
import { cookieHeader, createTestApp, signUpUser, TEST_ORIGIN, type TestUser } from "./helpers.js";

const OWNER_EMAIL = "owner@littlemeals.test";
const APP_VERSION = "abc123def456";
/** A syntactically valid uuid that is not in the table. */
const ABSENT_ID = "11111111-2222-4333-8444-555555555555";

/** Signs up with a specific address, which `signUpUser` deliberately cannot.
 * (Copied from admin.test.ts; promoting both helpers to test/helpers.ts is a
 * tidy-up of its own.) */
async function signUpAs(app: FastifyInstance, email: string): Promise<TestUser> {
  const password = "correct-horse-battery-staple";
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: TEST_ORIGIN },
    payload: { email, password, name: "Owner" },
  });
  if (response.statusCode !== 200) {
    throw new Error(`sign-up failed (${response.statusCode}): ${response.body}`);
  }
  return {
    email,
    password,
    cookie: cookieHeader(response.headers["set-cookie"] as string | string[] | undefined),
  };
}

/**
 * Everything a caller could use to tell two responses apart, minus the three
 * values that differ between ANY two requests. (Copied from admin.test.ts.)
 */
function comparable(response: { statusCode: number; body: string; headers: Record<string, unknown> }) {
  const headers = { ...response.headers };
  delete headers["x-request-id"];
  delete headers["date"];
  delete headers["x-ratelimit-remaining"];
  delete headers["x-ratelimit-reset"];
  return { statusCode: response.statusCode, body: response.body, headers };
}

async function userIdFor(db: Database, email: string): Promise<string> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (!row) throw new Error(`no user for ${email}`);
  return row.id;
}

interface SeedFeedback {
  userId: string;
  message: string;
  createdAt: Date;
  status?: "new" | "read" | "resolved";
  archivedAt?: Date | null;
  routePattern?: string | null;
}

/** Writes rows straight to the table, for the list/summary shapes that would
 * otherwise need dozens of POSTs against a 5-per-hour budget. */
async function seedFeedback(db: Database, seeds: SeedFeedback[]): Promise<string[]> {
  const rows = await db
    .insert(feedback)
    .values(
      seeds.map((seed) => ({
        userId: seed.userId,
        message: seed.message,
        routePattern: seed.routePattern ?? "/more",
        appVersion: APP_VERSION,
        status: seed.status ?? ("new" as const),
        archivedAt: seed.archivedAt ?? null,
        createdAt: seed.createdAt,
      })),
    )
    .returning();
  return rows.map((row) => row.id);
}

// ---------------------------------------------------------------------------
// POST /api/feedback
// ---------------------------------------------------------------------------

describe("POST /api/feedback", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let parent: TestUser;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp({ ADMIN_EMAILS: [OWNER_EMAIL] }));
    parent = await signUpUser(app);
  });

  afterEach(async () => {
    await close();
  });

  /** `cookie: null` means anonymous; anything else is that session. */
  const send = (payload: unknown, cookie: string | null = parent.cookie) =>
    app.inject({
      method: "POST",
      url: "/api/feedback",
      ...(cookie === null ? {} : { headers: { cookie } }),
      payload: payload as Record<string, unknown>,
    });

  const valid = (overrides: Record<string, unknown> = {}) => ({
    message: "The log form saves twice when I tap fast.",
    routePattern: "/log-meal",
    appVersion: APP_VERSION,
    ...overrides,
  });

  it("stores a message against the SESSION's account, as new and unarchived", async () => {
    const response = await send(valid({ message: "  Trailing spaces, please trim me.  " }));
    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string };
    expect(body).toEqual({ id: expect.any(String) });
    // Nothing is echoed back but the id — no status, no timestamps, and
    // certainly not the message.
    expect(Object.keys(body)).toEqual(["id"]);

    const [row] = await db.select().from(feedback).where(eq(feedback.id, body.id));
    expect(row).toMatchObject({
      userId: await userIdFor(db, parent.email),
      message: "Trailing spaces, please trim me.",
      routePattern: "/log-meal",
      appVersion: APP_VERSION,
      status: "new",
      archivedAt: null,
      readAt: null,
      resolvedAt: null,
      resolvedBy: null,
    });
  });

  it("accepts a message exactly at the limit and refuses one character more", async () => {
    const atLimit = await send(valid({ message: "a".repeat(FEEDBACK_MESSAGE_MAX) }));
    expect(atLimit.statusCode).toBe(201);

    const over = await send(valid({ message: "a".repeat(FEEDBACK_MESSAGE_MAX + 1) }));
    expect(over.statusCode).toBe(400);
    expect(over.json()).toMatchObject({ error: "invalid_request" });
    expect((over.json() as { details: Record<string, string[]> }).details.message).toBeTruthy();
  });

  it("refuses everything the contract does not allow", async () => {
    const cases: { name: string; payload: unknown; field?: string }[] = [
      { name: "empty message", payload: valid({ message: "" }), field: "message" },
      // Trimmed first, so a box holding three spaces is a blank box.
      { name: "whitespace-only message", payload: valid({ message: "   " }), field: "message" },
      {
        name: "a real path instead of a pattern",
        payload: valid({ routePattern: "/foods/sweet-potato" }),
        field: "routePattern",
      },
      { name: "a missing route pattern key", payload: { message: "hi", appVersion: APP_VERSION } },
      { name: "an app version that is prose", payload: valid({ appVersion: "not a version!" }), field: "appVersion" },
      { name: "an extra key", payload: valid({ status: "resolved" }) },
      { name: "an id the caller chose", payload: valid({ userId: "somebody-else" }) },
    ];

    for (const testCase of cases) {
      // A fresh sender each time: the budget is spent by the ATTEMPT, before
      // the body is looked at (the limiter is a preHandler), so seven
      // rejections from one account would hit the hourly ceiling rather than
      // the contract — which is the subject of its own test below.
      const sender = await signUpUser(app);
      const response = await send(testCase.payload, sender.cookie);
      expect(response.statusCode, testCase.name).toBe(400);
      const body = response.json() as { error: string; details?: Record<string, string[]> };
      expect(body.error, testCase.name).toBe("invalid_request");
      expect(body.details, testCase.name).toBeTruthy();
      if (testCase.field) {
        expect(body.details?.[testCase.field], testCase.name).toBeTruthy();
      }
    }

    // Nothing above reached the table.
    const rows = await db.select().from(feedback);
    expect(rows).toHaveLength(0);
  });

  it("refuses an anonymous sender, and says so plainly — this route is not a secret", async () => {
    const response = await send(valid(), null);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
  });

  it("stops at five an hour, with a retry-after the client can render", async () => {
    for (let i = 0; i < 5; i += 1) {
      const allowed = await send(valid({ message: `Message number ${i + 1}` }));
      expect(allowed.statusCode, `send ${i + 1}`).toBe(201);
    }

    const refused = await send(valid({ message: "One too many." }));
    expect(refused.statusCode).toBe(429);
    expect(refused.headers["retry-after"]).toBeTruthy();
    const body = refused.json() as { error: string; retryAfterSeconds: number };
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);

    // The budget is per account, not global: somebody else can still write.
    const other = await signUpUser(app);
    const theirs = await send(valid({ message: "A different parent." }), other.cookie);
    expect(theirs.statusCode).toBe(201);

    expect(await db.select().from(feedback)).toHaveLength(6);
  });

  it("spends the budget on the attempt, not on the message — a rejected send still counts", async () => {
    for (let i = 0; i < 5; i += 1) {
      const rejected = await send(valid({ message: "" }));
      expect(rejected.statusCode, `attempt ${i + 1}`).toBe(400);
    }

    // The limiter is a preHandler, so it runs before the body is looked at.
    // That is deliberate: otherwise a scripted caller would buy unlimited
    // tries by sending rubbish. The form validates locally, so a parent
    // never meets this — an empty box does not reach the network at all.
    const refused = await send(valid());
    expect(refused.statusCode).toBe(429);
    expect(await db.select().from(feedback)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Invisibility
// ---------------------------------------------------------------------------

describe("/api/admin/feedback* is invisible to everybody else", () => {
  let app: FastifyInstance;
  let close: () => Promise<void>;
  let parent: TestUser;

  beforeEach(async () => {
    ({ app, close } = await createTestApp({ ADMIN_EMAILS: [OWNER_EMAIL] }));
    parent = await signUpUser(app);
  });

  afterEach(async () => {
    await close();
  });

  const inboxRoutes = [
    { method: "GET" as const, url: "/api/admin/feedback" },
    { method: "GET" as const, url: "/api/admin/feedback?filter=archived" },
    { method: "GET" as const, url: "/api/admin/feedback?filter=nonsense" },
    { method: "GET" as const, url: "/api/admin/feedback/summary" },
    { method: "PATCH" as const, url: `/api/admin/feedback/${ABSENT_ID}`, payload: { status: "read" } },
    { method: "PATCH" as const, url: "/api/admin/feedback/not-a-uuid", payload: { status: "read" } },
  ];

  it("answers a signed-in parent exactly as it answers an unknown route", async () => {
    const unknown = await app.inject({
      method: "GET",
      url: "/api/admin/nonsense",
      headers: { cookie: parent.cookie },
    });
    expect(unknown.statusCode).toBe(404);

    for (const route of inboxRoutes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { cookie: parent.cookie },
        ...(route.payload ? { payload: route.payload } : {}),
      });
      expect(comparable(response), route.url).toEqual(comparable(unknown));
    }
  });

  it("answers an anonymous caller exactly as it answers an unknown route", async () => {
    const unknown = await app.inject({ method: "GET", url: "/api/admin/nonsense" });
    expect(unknown.statusCode).toBe(404);

    for (const route of inboxRoutes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        ...(route.payload ? { payload: route.payload } : {}),
      });
      expect(comparable(response), route.url).toEqual(comparable(unknown));
    }
  });

  it("never rate-limits a non-admin into a different answer", async () => {
    // The inbox budgets sit BEHIND the guard on purpose: a 429 after sixty
    // tries would tell a parent there is something here to try.
    const unknown = await app.inject({ method: "GET", url: "/api/admin/nonsense" });
    for (let i = 0; i < 70; i += 1) {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/admin/feedback/${ABSENT_ID}`,
        headers: { cookie: parent.cookie },
        payload: { status: "read" },
      });
      expect(comparable(response), `attempt ${i}`).toEqual(comparable(unknown));
    }
  });
});

// ---------------------------------------------------------------------------
// The inbox itself
// ---------------------------------------------------------------------------

describe("the admin inbox", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let owner: TestUser;
  let parent: TestUser;
  let ownerId: string;
  let parentId: string;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp({ ADMIN_EMAILS: [OWNER_EMAIL] }));
    owner = await signUpAs(app, OWNER_EMAIL);
    parent = await signUpUser(app);
    ownerId = await userIdFor(db, owner.email);
    parentId = await userIdFor(db, parent.email);
  });

  afterEach(async () => {
    await close();
  });

  const list = (query = "") =>
    app.inject({ method: "GET", url: `/api/admin/feedback${query}`, headers: { cookie: owner.cookie } });

  const summary = () =>
    app.inject({ method: "GET", url: "/api/admin/feedback/summary", headers: { cookie: owner.cookie } });

  const patch = (id: string, body: unknown) =>
    app.inject({
      method: "PATCH",
      url: `/api/admin/feedback/${id}`,
      headers: { cookie: owner.cookie },
      payload: body as Record<string, unknown>,
    });

  /** Two senders, one of each tab, deliberately out of insertion order. */
  async function seedThree(): Promise<{ open: string; resolved: string; archived: string }> {
    const [open, resolved, archived] = await seedFeedback(db, [
      { userId: parentId, message: "Open one", createdAt: new Date("2026-09-10T10:00:00Z") },
      {
        userId: ownerId,
        message: "Resolved one",
        createdAt: new Date("2026-09-11T10:00:00Z"),
        status: "resolved",
      },
      {
        userId: parentId,
        message: "Cleared one",
        createdAt: new Date("2026-09-12T10:00:00Z"),
        status: "read",
        archivedAt: new Date("2026-09-13T10:00:00Z"),
      },
    ]);
    return { open: open!, resolved: resolved!, archived: archived! };
  }

  it("lists one tab at a time, newest first, with the sender's address", async () => {
    const ids = await seedThree();

    const open = await list();
    expect(open.statusCode).toBe(200);
    expect(open.headers["cache-control"]).toBe("no-store");
    const openBody = adminFeedbackListResponseSchema.parse(open.json());
    expect(openBody.items).toHaveLength(1);
    expect(openBody.items[0]).toMatchObject({
      id: ids.open,
      message: "Open one",
      senderEmail: parent.email,
      routePattern: "/more",
      appVersion: APP_VERSION,
      status: "new",
      archived: false,
      readAt: null,
      resolvedAt: null,
    });

    // No filter and `?filter=open` are the same request.
    expect(adminFeedbackListResponseSchema.parse((await list("?filter=open")).json())).toEqual(openBody);

    const resolved = adminFeedbackListResponseSchema.parse((await list("?filter=resolved")).json());
    expect(resolved.items.map((item) => item.id)).toEqual([ids.resolved]);
    expect(resolved.items[0]?.senderEmail).toBe(owner.email);

    const archived = adminFeedbackListResponseSchema.parse((await list("?filter=archived")).json());
    expect(archived.items.map((item) => item.id)).toEqual([ids.archived]);
    // Archived is its own tab, whatever status the row was left in.
    expect(archived.items[0]).toMatchObject({ status: "read", archived: true });
  });

  it("puts a read-but-unarchived message in Open, and a resolved-then-archived one only in Archived", async () => {
    const [read, resolvedArchived] = await seedFeedback(db, [
      { userId: parentId, message: "Seen, not done", createdAt: new Date("2026-09-10T10:00:00Z"), status: "read" },
      {
        userId: parentId,
        message: "Done and cleared",
        createdAt: new Date("2026-09-11T10:00:00Z"),
        status: "resolved",
        archivedAt: new Date("2026-09-12T10:00:00Z"),
      },
    ]);

    expect(
      adminFeedbackListResponseSchema.parse((await list()).json()).items.map((i) => i.id),
    ).toEqual([read]);
    expect(
      adminFeedbackListResponseSchema.parse((await list("?filter=resolved")).json()).items,
    ).toHaveLength(0);
    expect(
      adminFeedbackListResponseSchema.parse((await list("?filter=archived")).json()).items.map((i) => i.id),
    ).toEqual([resolvedArchived]);
  });

  it("orders newest first and stops at two hundred", async () => {
    const base = Date.parse("2026-01-01T00:00:00Z");
    await seedFeedback(
      db,
      Array.from({ length: 205 }, (_, index) => ({
        userId: parentId,
        message: `Message ${index}`,
        createdAt: new Date(base + index * 60_000),
      })),
    );

    const body = adminFeedbackListResponseSchema.parse((await list()).json());
    expect(body.items).toHaveLength(200);
    // The newest 200, newest first — the cap drops the oldest five, not the
    // newest five.
    expect(body.items[0]?.message).toBe("Message 204");
    expect(body.items[199]?.message).toBe("Message 5");
  });

  it("refuses a filter it does not know", async () => {
    const response = await list("?filter=everything");
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("counts the four buckets, with archived rows in exactly one of them", async () => {
    await seedThree();
    await seedFeedback(db, [
      { userId: parentId, message: "Another new", createdAt: new Date("2026-09-09T10:00:00Z") },
      {
        userId: parentId,
        message: "Another cleared",
        createdAt: new Date("2026-09-08T10:00:00Z"),
        status: "resolved",
        archivedAt: new Date("2026-09-14T10:00:00Z"),
      },
    ]);

    const response = await summary();
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    // Two new, one resolved, two archived (one of which is `read`, one
    // `resolved` — neither shows up in those buckets).
    expect(adminFeedbackSummarySchema.parse(response.json())).toEqual({
      new: 2,
      read: 0,
      resolved: 1,
      archived: 2,
    });
  });

  it("answers an empty table with four zeroes rather than nothing", async () => {
    expect(adminFeedbackSummarySchema.parse((await summary()).json())).toEqual({
      new: 0,
      read: 0,
      resolved: 0,
      archived: 0,
    });
  });

  // -------------------------------------------------------------------------
  // Transitions
  // -------------------------------------------------------------------------

  async function auditRows(): Promise<{ action: string; targetUserId: string | null; targetRef: string | null; actorUserId: string | null }[]> {
    return db
      .select({
        action: adminAudit.action,
        targetUserId: adminAudit.targetUserId,
        targetRef: adminAudit.targetRef,
        actorUserId: adminAudit.actorUserId,
      })
      .from(adminAudit)
      .orderBy(desc(adminAudit.at));
  }

  it("marks read, and records who did it to whose message", async () => {
    const [id] = await seedFeedback(db, [
      { userId: parentId, message: "Please fix", createdAt: new Date("2026-09-10T10:00:00Z") },
    ]);

    const response = await patch(id!, { status: "read" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const item = response.json() as { status: string; readAt: string | null; senderEmail: string };
    expect(item.status).toBe("read");
    expect(item.readAt).toBeTruthy();
    // The address survives the round trip — the response is the item the
    // inbox re-renders, not a stub.
    expect(item.senderEmail).toBe(parent.email);

    expect(await auditRows()).toEqual([
      { action: "feedback_read", targetUserId: parentId, targetRef: id, actorUserId: ownerId },
    ]);
  });

  it("resolves, reopens, and takes the resolution back with the reopen", async () => {
    const [id] = await seedFeedback(db, [
      { userId: parentId, message: "A bug", createdAt: new Date("2026-09-10T10:00:00Z"), status: "read" },
    ]);
    const readAtBefore = (await db.select().from(feedback).where(eq(feedback.id, id!)))[0]?.readAt;

    const resolved = await patch(id!, { status: "resolved" });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ status: "resolved" });
    expect((resolved.json() as { resolvedAt: string | null }).resolvedAt).toBeTruthy();
    expect((await db.select().from(feedback).where(eq(feedback.id, id!)))[0]?.resolvedBy).toBe(ownerId);

    const reopened = await patch(id!, { status: "read" });
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json()).toMatchObject({ status: "read", resolvedAt: null });
    const [row] = await db.select().from(feedback).where(eq(feedback.id, id!));
    expect(row?.resolvedBy).toBeNull();
    expect(row?.resolvedAt).toBeNull();
    // Reopening is not re-reading: the moment somebody first read it stands.
    expect(row?.readAt).toEqual(readAtBefore);

    expect((await auditRows()).map((r) => r.action)).toEqual(["feedback_reopened", "feedback_resolved"]);
  });

  it("resolving straight from new still stamps the read time", async () => {
    const [id] = await seedFeedback(db, [
      { userId: parentId, message: "Straight to done", createdAt: new Date("2026-09-10T10:00:00Z") },
    ]);

    const response = await patch(id!, { status: "resolved" });
    expect(response.statusCode).toBe(200);
    const item = response.json() as { readAt: string | null; resolvedAt: string | null };
    // Leaving `new` IS the read, however far it jumps.
    expect(item.readAt).toBeTruthy();
    expect(item.resolvedAt).toBeTruthy();

    // One dimension changed, so exactly one audit row, named for where it
    // landed rather than for every step it skipped.
    expect((await auditRows()).map((r) => r.action)).toEqual(["feedback_resolved"]);
  });

  it("clears and restores without ever deleting a row", async () => {
    const [id] = await seedFeedback(db, [
      { userId: parentId, message: "Tidy me away", createdAt: new Date("2026-09-10T10:00:00Z"), status: "read" },
    ]);

    const cleared = await patch(id!, { archived: true });
    expect(cleared.json()).toMatchObject({ archived: true, status: "read" });
    expect((await db.select().from(feedback).where(eq(feedback.id, id!)))[0]?.archivedAt).toBeTruthy();

    const restored = await patch(id!, { archived: false });
    expect(restored.json()).toMatchObject({ archived: false, status: "read" });
    expect((await db.select().from(feedback).where(eq(feedback.id, id!)))[0]?.archivedAt).toBeNull();

    // The message itself never moved.
    expect((await db.select().from(feedback)).map((r) => r.message)).toEqual(["Tidy me away"]);
    expect((await auditRows()).map((r) => r.action)).toEqual(["feedback_restored", "feedback_archived"]);
  });

  it("writes one audit row per changed dimension when a caller sends both", async () => {
    const [id] = await seedFeedback(db, [
      { userId: parentId, message: "Both at once", createdAt: new Date("2026-09-10T10:00:00Z") },
    ]);

    const response = await patch(id!, { status: "resolved", archived: true });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "resolved", archived: true });
    expect((await auditRows()).map((r) => r.action).sort()).toEqual([
      "feedback_archived",
      "feedback_resolved",
    ]);
  });

  it("writes nothing at all for a PATCH that asks for what is already true", async () => {
    const [id] = await seedFeedback(db, [
      { userId: parentId, message: "Already read", createdAt: new Date("2026-09-10T10:00:00Z"), status: "read" },
    ]);
    const before = (await db.select().from(feedback).where(eq(feedback.id, id!)))[0];

    const response = await patch(id!, { status: "read", archived: false });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "read", archived: false });

    expect((await db.select().from(feedback).where(eq(feedback.id, id!)))[0]).toEqual(before);
    // An audit trail full of no-ops is an audit trail nobody reads.
    expect(await auditRows()).toEqual([]);
  });

  it("refuses a body that asks for nothing", async () => {
    const [id] = await seedFeedback(db, [
      { userId: parentId, message: "Untouched", createdAt: new Date("2026-09-10T10:00:00Z") },
    ]);

    for (const body of [{}, { status: "archived" }, { archived: "yes" }, { note: "hello" }]) {
      const response = await patch(id!, body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
      expect((response.json() as { error: string }).error).toBe("invalid_request");
    }
    expect(await auditRows()).toEqual([]);
  });

  it("answers 404 for an id that is not there — and for one that is not an id", async () => {
    const absent = await patch(ABSENT_ID, { status: "read" });
    expect(absent.statusCode).toBe(404);
    expect(absent.json()).toEqual({ error: "not_found" });

    // `feedback.id` is a uuid column, so an unparseable id would reach
    // Postgres as a failed cast and come back a 500. A malformed id is
    // simply an id that does not exist.
    for (const id of ["not-a-uuid", "12345", "'; drop table feedback; --"]) {
      const response = await patch(encodeURIComponent(id), { status: "read" });
      expect(response.statusCode, id).toBe(404);
      expect(response.json(), id).toEqual({ error: "not_found" });
    }
    // Still there.
    expect(await db.select().from(feedback)).toHaveLength(0);
  });

  it("stops an admin at sixty writes per window, reads untouched", async () => {
    const ids = await seedFeedback(
      db,
      Array.from({ length: 2 }, (_, index) => ({
        userId: parentId,
        message: `Row ${index}`,
        createdAt: new Date(Date.parse("2026-09-10T10:00:00Z") + index * 1000),
      })),
    );

    // Alternating so every request actually changes something.
    for (let i = 0; i < 60; i += 1) {
      const response = await patch(ids[i % 2]!, { archived: i % 4 < 2 });
      expect(response.statusCode, `write ${i}`).toBeLessThan(300);
    }

    const refused = await patch(ids[0]!, { archived: true });
    expect(refused.statusCode).toBe(429);
    expect(refused.headers["retry-after"]).toBeTruthy();
    expect(refused.json()).toMatchObject({ error: "rate_limited" });

    // Reading is a separate budget: the inbox still loads.
    expect((await list()).statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// The account's own copy, and what deleting it does
// ---------------------------------------------------------------------------

describe("feedback and the account it belongs to", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let owner: TestUser;
  let parent: TestUser;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp({ ADMIN_EMAILS: [OWNER_EMAIL] }));
    owner = await signUpAs(app, OWNER_EMAIL);
    parent = await signUpUser(app);
  });

  afterEach(async () => {
    await close();
  });

  it("comes back in the account export, in the parent's own words", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/feedback",
      headers: { cookie: parent.cookie },
      payload: { message: "Storage is my favourite bit.", routePattern: "/storage", appVersion: APP_VERSION },
    });
    expect(created.statusCode).toBe(201);

    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: parent.cookie },
    });
    const bundle = accountExportSchema.parse(response.json());
    expect(bundle.exportVersion).toBe(14);
    expect(bundle.feedback).toHaveLength(1);
    // Exactly these four keys: what they wrote, what has been done with it,
    // where they were — and nothing about which admin touched it.
    expect(Object.keys(bundle.feedback[0]!).sort()).toEqual([
      "createdAt",
      "message",
      "routePattern",
      "status",
    ]);
    expect(bundle.feedback[0]).toMatchObject({
      message: "Storage is my favourite bit.",
      status: "new",
      routePattern: "/storage",
    });
  });

  it("an admin sees only their own messages in their own export", async () => {
    await app.inject({
      method: "POST",
      url: "/api/feedback",
      headers: { cookie: parent.cookie },
      payload: { message: "A parent's private words.", routePattern: "/more", appVersion: APP_VERSION },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: owner.cookie },
    });
    // Being an admin is not a way to get somebody else's prose into your own
    // download: the export is scoped by `feedback.user_id` like everything else.
    expect(accountExportSchema.parse(response.json()).feedback).toEqual([]);
  });

  it("goes with the account, while the audit trail outlives it", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/feedback",
      headers: { cookie: parent.cookie },
      payload: { message: "Delete me with my account.", routePattern: "/more", appVersion: APP_VERSION },
    });
    const { id } = created.json() as { id: string };

    const resolved = await app.inject({
      method: "PATCH",
      url: `/api/admin/feedback/${id}`,
      headers: { cookie: owner.cookie },
      payload: { status: "resolved" },
    });
    expect(resolved.statusCode).toBe(200);

    const parentId = await userIdFor(db, parent.email);
    await db.delete(user).where(eq(user.id, parentId));

    expect(await db.select().from(feedback)).toHaveLength(0);
    // The record that an admin acted survives the account it was about, with
    // the person's id gone and the row reference still readable — which is
    // the whole reason `target_ref` carries no foreign key.
    const [audit] = await db
      .select({
        action: adminAudit.action,
        targetUserId: adminAudit.targetUserId,
        targetRef: adminAudit.targetRef,
      })
      .from(adminAudit);
    expect(audit).toEqual({ action: "feedback_resolved", targetUserId: null, targetRef: id });
  });

  it("survives the admin who resolved it being deleted", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/feedback",
      headers: { cookie: parent.cookie },
      payload: { message: "Outlives the admin.", routePattern: "/more", appVersion: APP_VERSION },
    });
    const { id } = created.json() as { id: string };

    await app.inject({
      method: "PATCH",
      url: `/api/admin/feedback/${id}`,
      headers: { cookie: owner.cookie },
      payload: { status: "resolved" },
    });

    await db.delete(user).where(eq(user.id, await userIdFor(db, owner.email)));

    const [row] = await db.select().from(feedback).where(eq(feedback.id, id));
    // `resolved_by` is SET NULL for exactly this: a parent's message must not
    // leave with a member of staff.
    expect(row).toMatchObject({ message: "Outlives the admin.", status: "resolved", resolvedBy: null });
    expect(row?.resolvedAt).toBeTruthy();
  });
});
