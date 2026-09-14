import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACCOUNT_REAUTH_MAX_AGE_MS,
  adminCollaboratorsResponseSchema,
  adminMetricsResponseSchema,
  type AccountExport,
  type AdminCollaboratorsResponse,
} from "@blw/shared";
import { isAdmin, isEnvAdmin, normalizeEmail } from "../admin/access.js";
import type { Database } from "../db/index.js";
import { adminAudit, session, user } from "../db/schema.js";
import { cookieHeader, createTestApp, signUpUser, TEST_ORIGIN, type TestUser } from "./helpers.js";

const OWNER_EMAIL = "owner@littlemeals.test";
const GHOST_EMAIL = "never-signed-up@littlemeals.test";

/** Signs up with a specific address, which `signUpUser` deliberately cannot. */
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

/** Ages a session past the re-auth window without waiting ten minutes. */
async function staleSession(db: Database, email: string): Promise<void> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (!row) throw new Error(`no user for ${email}`);
  await db
    .update(session)
    .set({ createdAt: new Date(Date.now() - ACCOUNT_REAUTH_MAX_AGE_MS - 60_000) })
    .where(eq(session.userId, row.id));
}

async function userIdFor(db: Database, email: string): Promise<string> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (!row) throw new Error(`no user for ${email}`);
  return row.id;
}

/**
 * Everything a caller could use to tell two responses apart, minus the three
 * values that differ between ANY two requests: the per-request id, the clock,
 * and the rate limiter's running count. None of those says anything about
 * whether a route exists.
 */
function comparable(response: { statusCode: number; body: string; headers: Record<string, unknown> }) {
  const headers = { ...response.headers };
  delete headers["x-request-id"];
  delete headers["date"];
  delete headers["x-ratelimit-remaining"];
  delete headers["x-ratelimit-reset"];
  return { statusCode: response.statusCode, body: response.body, headers };
}

// ---------------------------------------------------------------------------
// The rule itself, without a server
// ---------------------------------------------------------------------------

describe("isAdmin", () => {
  const env = { ADMIN_EMAILS: ["owner@littlemeals.test", "second@littlemeals.test"] };

  it("accepts the role column", () => {
    expect(isAdmin({ email: "someone@example.com", role: "admin" }, env)).toBe(true);
    expect(isAdmin({ email: "someone@example.com", role: "parent" }, env)).toBe(false);
    expect(isAdmin({ email: "someone@example.com", role: null }, env)).toBe(false);
    // Not a role we know is not a role that grants anything.
    expect(isAdmin({ email: "someone@example.com", role: "owner" }, env)).toBe(false);
    expect(isAdmin({ email: "someone@example.com", role: "ADMIN" }, env)).toBe(false);
  });

  it("accepts a bootstrap address, however it was typed", () => {
    expect(isAdmin({ email: "owner@littlemeals.test", role: "parent" }, env)).toBe(true);
    expect(isAdmin({ email: "OWNER@LittleMeals.test", role: "parent" }, env)).toBe(true);
    expect(isAdmin({ email: "  owner@littlemeals.test  ", role: "parent" }, env)).toBe(true);
    expect(isAdmin({ email: "owner@littlemeals.test.evil.example", role: "parent" }, env)).toBe(false);
    expect(isAdmin({ email: "owner", role: "parent" }, env)).toBe(false);
  });

  it("refuses everything else", () => {
    expect(isAdmin(null, env)).toBe(false);
    expect(isAdmin(undefined, env)).toBe(false);
    expect(isAdmin({}, env)).toBe(false);
    expect(isAdmin({ email: "", role: "" }, env)).toBe(false);
    expect(isAdmin({ email: null, role: null }, env)).toBe(false);
    // An empty ADMIN_EMAILS must not match an empty address.
    expect(isAdmin({ email: "", role: "parent" }, { ADMIN_EMAILS: [] })).toBe(false);
    expect(isEnvAdmin("owner@littlemeals.test", { ADMIN_EMAILS: [] })).toBe(false);
    expect(normalizeEmail("  Mixed@Case.TEST ")).toBe("mixed@case.test");
    expect(normalizeEmail(null)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Invisibility
// ---------------------------------------------------------------------------

describe("/api/admin/* is invisible to everybody else", () => {
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

  const adminRoutes = [
    { method: "GET" as const, url: "/api/admin/me" },
    { method: "GET" as const, url: "/api/admin/metrics" },
    { method: "GET" as const, url: "/api/admin/metrics?range=4w" },
    { method: "GET" as const, url: "/api/admin/collaborators" },
    { method: "POST" as const, url: "/api/admin/collaborators", payload: { email: "someone@example.com" } },
    { method: "DELETE" as const, url: "/api/admin/collaborators/anything" },
  ];

  it("answers a signed-in parent exactly as it answers an unknown route", async () => {
    const unknown = await app.inject({
      method: "GET",
      url: "/api/admin/there-is-nothing-here",
      headers: { cookie: parent.cookie },
    });
    expect(unknown.statusCode).toBe(404);

    for (const route of adminRoutes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { cookie: parent.cookie },
        ...(route.payload ? { payload: route.payload } : {}),
      });
      // Byte for byte: status, body and every header a caller can see.
      expect(comparable(response), route.url).toEqual(comparable(unknown));
    }
  });

  it("answers an anonymous caller exactly as it answers an unknown route", async () => {
    const unknown = await app.inject({ method: "GET", url: "/api/definitely-not-a-route" });

    for (const route of adminRoutes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        ...(route.payload ? { payload: route.payload } : {}),
      });
      expect(comparable(response), route.url).toEqual(comparable(unknown));
    }
  });

  it("gives anonymous and signed-in non-admins the same answer", async () => {
    // The two refusals must not differ either: a 401-shaped answer for one
    // and a 404 for the other would map the route just as well.
    const anonymous = await app.inject({ method: "GET", url: "/api/admin/me" });
    const signedIn = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: { cookie: parent.cookie },
    });
    expect(comparable(anonymous)).toEqual(comparable(signedIn));
    expect(anonymous.statusCode).toBe(404);
    expect(anonymous.json()).toEqual({ error: "not_found" });
  });

  it("never rate-limits a non-admin into a different answer", async () => {
    // The per-admin budget sits BEHIND the guard on purpose: a 429 after ten
    // tries would tell a parent there is something here to try.
    const unknown = await app.inject({ method: "GET", url: "/api/admin/nothing" });
    for (let i = 0; i < 14; i += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/collaborators",
        headers: { cookie: parent.cookie },
        payload: { email: OWNER_EMAIL },
      });
      expect(comparable(response), `attempt ${i}`).toEqual(comparable(unknown));
    }
  });

  it("refuses a malformed body the same way at both URLs", async () => {
    // Body parsing happens before any route's preHandler, so a broken
    // payload is answered by Fastify itself. If the two answers differed,
    // a POST with `{` would map the admin routes without ever reaching one.
    const send = (url: string) =>
      app.inject({
        method: "POST",
        url,
        headers: { cookie: parent.cookie, "content-type": "application/json" },
        payload: "{not json",
      });

    expect(comparable(await send("/api/admin/collaborators"))).toEqual(
      comparable(await send("/api/admin/there-is-nothing-here")),
    );

    // And a body in a content type nobody here accepts.
    const plain = (url: string) =>
      app.inject({
        method: "POST",
        url,
        headers: { cookie: parent.cookie, "content-type": "text/plain" },
        payload: "hello",
      });
    expect(comparable(await plain("/api/admin/collaborators"))).toEqual(
      comparable(await plain("/api/admin/there-is-nothing-here")),
    );
  });

  it("answers HEAD identically too", async () => {
    // Fastify exposes a HEAD route for every GET. Only the status line and
    // the headers are compared: Node suppresses the body of a HEAD response
    // on the wire, and light-my-request does not, so the injected `body` is
    // an artifact of the test transport rather than something a caller sees.
    const head = (url: string) =>
      app.inject({ method: "HEAD", url, headers: { cookie: parent.cookie } });

    const admin = comparable(await head("/api/admin/me"));
    const unknown = comparable(await head("/api/admin/there-is-nothing-here"));
    expect(admin.statusCode).toBe(unknown.statusCode);
    expect(admin.headers).toEqual(unknown.headers);
  });

  it("leaves the rest of the API answering normally", async () => {
    // Guards the parity assertions above: the app is not simply 404ing
    // everything.
    const ok = await app.inject({ method: "GET", url: "/api/health" });
    expect(ok.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------------

describe("an admin", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let owner: TestUser;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp({ ADMIN_EMAILS: [OWNER_EMAIL, GHOST_EMAIL] }));
    owner = await signUpAs(app, OWNER_EMAIL);
  });

  afterEach(async () => {
    await close();
  });

  it("is recognised from the environment", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: { cookie: owner.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ admin: true });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("is recognised from the role column alone", async () => {
    const promoted = await signUpUser(app);
    await db.update(user).set({ role: "admin" }).where(eq(user.email, promoted.email));

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: { cookie: promoted.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ admin: true });
  });

  it("reads the role from the database on every request, not from the session", async () => {
    const promoted = await signUpUser(app);
    await db.update(user).set({ role: "admin" }).where(eq(user.email, promoted.email));
    expect(
      (await app.inject({ method: "GET", url: "/api/admin/me", headers: { cookie: promoted.cookie } }))
        .statusCode,
    ).toBe(200);

    // Revoked while their cookie is still perfectly valid.
    await db.update(user).set({ role: "parent" }).where(eq(user.email, promoted.email));
    expect(
      (await app.inject({ method: "GET", url: "/api/admin/me", headers: { cookie: promoted.cookie } }))
        .statusCode,
    ).toBe(404);
  });

  describe("metrics", () => {
    it("returns the whole payload", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/metrics?range=4w",
        headers: { cookie: owner.cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      const payload = adminMetricsResponseSchema.parse(response.json());
      expect(payload.meta.range).toBe("4w");
      expect(payload.meta.weeks).toBe(4);
      // One signup exists — the owner — so the payload is not an empty shell.
      expect(payload.signupsPerWeek.at(-1)?.signups).toBe(1);
    });

    it("defaults to a quarter and refuses a range it does not know", async () => {
      const defaulted = await app.inject({
        method: "GET",
        url: "/api/admin/metrics",
        headers: { cookie: owner.cookie },
      });
      expect(defaulted.statusCode).toBe(200);
      expect(defaulted.json<{ meta: { range: string } }>().meta.range).toBe("12w");

      const bad = await app.inject({
        method: "GET",
        url: "/api/admin/metrics?range=1y",
        headers: { cookie: owner.cookie },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toEqual({ error: "invalid_request" });
    });
  });

  describe("collaborators", () => {
    it("lists both sources of access, including an address with no account yet", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/collaborators",
        headers: { cookie: owner.cookie },
      });

      expect(response.statusCode).toBe(200);
      const { collaborators } = adminCollaboratorsResponseSchema.parse(response.json());
      const byEmail = new Map(collaborators.map((row) => [row.email, row]));

      expect(byEmail.get(OWNER_EMAIL)).toMatchObject({
        source: "env",
        isSelf: true,
        canRevoke: false,
        grantedAt: null,
        grantedBy: null,
      });
      // Trusted by the deployment, has never signed up: shown, with nothing
      // to revoke.
      expect(byEmail.get(GHOST_EMAIL)).toMatchObject({ source: "env", userId: null, canRevoke: false });
    });

    it("grants access, writes an audit row, and lets the new admin in", async () => {
      const friend = await signUpUser(app);

      const granted = await app.inject({
        method: "POST",
        url: "/api/admin/collaborators",
        headers: { cookie: owner.cookie },
        payload: { email: friend.email.toUpperCase() },
      });

      expect(granted.statusCode).toBe(200);
      const { collaborators } = granted.json<AdminCollaboratorsResponse>();
      const entry = collaborators.find((row) => row.email === friend.email);
      expect(entry).toMatchObject({
        source: "database",
        canRevoke: true,
        isSelf: false,
        grantedBy: OWNER_EMAIL,
      });
      expect(entry?.grantedAt).toBeTruthy();

      const audit = await db.select().from(adminAudit);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.action).toBe("grant");
      expect(audit[0]?.actorUserId).toBe(await userIdFor(db, OWNER_EMAIL));

      const asFriend = await app.inject({
        method: "GET",
        url: "/api/admin/me",
        headers: { cookie: friend.cookie },
      });
      expect(asFriend.statusCode).toBe(200);
    });

    it("is idempotent, and writes no second audit row", async () => {
      const friend = await signUpUser(app);
      const grant = () =>
        app.inject({
          method: "POST",
          url: "/api/admin/collaborators",
          headers: { cookie: owner.cookie },
          payload: { email: friend.email },
        });

      expect((await grant()).statusCode).toBe(200);
      expect((await grant()).statusCode).toBe(200);
      expect(await db.select().from(adminAudit)).toHaveLength(1);
    });

    it("tells an admin — and only an admin — that an address has no account", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/collaborators",
        headers: { cookie: owner.cookie },
        payload: { email: "nobody@example.com" },
      });

      expect(response.statusCode).toBe(404);
      // A different body from the guard's 404: this one is a real answer to
      // a real question, and the person reading it is already an admin.
      expect(response.json()).toEqual({ error: "unknown_user" });
      expect(await db.select().from(adminAudit)).toHaveLength(0);
    });

    it("rejects a malformed address before anything else", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/collaborators",
        headers: { cookie: owner.cookie },
        payload: { email: "not-an-address" },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_request" });
    });

    it("needs a fresh session to grant", async () => {
      const friend = await signUpUser(app);
      await staleSession(db, OWNER_EMAIL);

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/collaborators",
        headers: { cookie: owner.cookie },
        payload: { email: friend.email },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "reauth_required" });
      // Nothing happened, which is the point of checking before writing.
      const [row] = await db.select({ role: user.role }).from(user).where(eq(user.email, friend.email));
      expect(row?.role).toBe("parent");
      expect(await db.select().from(adminAudit)).toHaveLength(0);
    });

    it("needs a fresh session to revoke", async () => {
      const friend = await signUpUser(app);
      await app.inject({
        method: "POST",
        url: "/api/admin/collaborators",
        headers: { cookie: owner.cookie },
        payload: { email: friend.email },
      });
      const friendId = await userIdFor(db, friend.email);
      await staleSession(db, OWNER_EMAIL);

      const response = await app.inject({
        method: "DELETE",
        url: `/api/admin/collaborators/${friendId}`,
        headers: { cookie: owner.cookie },
      });

      expect(response.statusCode).toBe(401);
      const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, friendId));
      expect(row?.role).toBe("admin");
    });

    it("revokes, writes an audit row, and closes the door behind them", async () => {
      const friend = await signUpUser(app);
      await app.inject({
        method: "POST",
        url: "/api/admin/collaborators",
        headers: { cookie: owner.cookie },
        payload: { email: friend.email },
      });
      const friendId = await userIdFor(db, friend.email);

      const revoked = await app.inject({
        method: "DELETE",
        url: `/api/admin/collaborators/${friendId}`,
        headers: { cookie: owner.cookie },
      });

      expect(revoked.statusCode).toBe(200);
      expect(
        revoked.json<AdminCollaboratorsResponse>().collaborators.some((row) => row.email === friend.email),
      ).toBe(false);

      const audit = await db.select().from(adminAudit);
      expect(audit.map((row) => row.action).sort()).toEqual(["grant", "revoke"]);

      const afterwards = await app.inject({
        method: "GET",
        url: "/api/admin/me",
        headers: { cookie: friend.cookie },
      });
      expect(afterwards.statusCode).toBe(404);
    });

    it("refuses to demote an env-bootstrapped admin", async () => {
      // Even with a role row to clear: `ADMIN_EMAILS` would let them straight
      // back in, so a button that appeared to work would be a lie.
      await db.update(user).set({ role: "admin" }).where(eq(user.email, OWNER_EMAIL));
      const second = await signUpAs(app, GHOST_EMAIL);
      const secondId = await userIdFor(db, GHOST_EMAIL);
      expect(second.email).toBe(GHOST_EMAIL);

      const response = await app.inject({
        method: "DELETE",
        url: `/api/admin/collaborators/${secondId}`,
        headers: { cookie: owner.cookie },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "env_admin" });
    });

    it("refuses to demote the caller", async () => {
      const ownerId = await userIdFor(db, OWNER_EMAIL);
      const response = await app.inject({
        method: "DELETE",
        url: `/api/admin/collaborators/${ownerId}`,
        headers: { cookie: owner.cookie },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "cannot_demote_self" });
    });

    it("refuses to demote the caller even when the role column is what makes them an admin", async () => {
      const promoted = await signUpUser(app);
      await db.update(user).set({ role: "admin" }).where(eq(user.email, promoted.email));
      const promotedId = await userIdFor(db, promoted.email);

      const response = await app.inject({
        method: "DELETE",
        url: `/api/admin/collaborators/${promotedId}`,
        headers: { cookie: promoted.cookie },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "cannot_demote_self" });
      const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, promotedId));
      expect(row?.role).toBe("admin");
    });

    it("budgets an admin's grant attempts", async () => {
      // The tight window is on the two routes that change who has access.
      // Ten deliberate grants in a quarter of an hour is already generous;
      // anything past it is a script, not a person.
      const attempt = () =>
        app.inject({
          method: "POST",
          url: "/api/admin/collaborators",
          headers: { cookie: owner.cookie },
          payload: { email: "nobody@example.com" },
        });

      for (let i = 0; i < 10; i += 1) {
        expect((await attempt()).statusCode, `attempt ${i}`).toBe(404);
      }
      const limited = await attempt();
      expect(limited.statusCode).toBe(429);
      expect(limited.json<{ error: string }>().error).toBe("rate_limited");
      expect(limited.headers["retry-after"]).toBeTruthy();

      // A read is on the wider budget, so the dashboard still loads.
      expect(
        (await app.inject({ method: "GET", url: "/api/admin/me", headers: { cookie: owner.cookie } }))
          .statusCode,
      ).toBe(200);
    });

    it("reports an unknown target the way it reports an unknown address", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/admin/collaborators/no-such-user-id",
        headers: { cookie: owner.cookie },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "unknown_user" });
    });

    it("keeps the audit trail when an account is deleted, without keeping the id", async () => {
      const friend = await signUpUser(app);
      await app.inject({
        method: "POST",
        url: "/api/admin/collaborators",
        headers: { cookie: owner.cookie },
        payload: { email: friend.email },
      });
      const friendId = await userIdFor(db, friend.email);

      await db.delete(user).where(eq(user.id, friendId));

      const audit = await db.select().from(adminAudit);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.action).toBe("grant");
      // SET NULL, not CASCADE: that access was granted is a fact worth
      // keeping; who it was granted to is not, once they are gone.
      expect(audit[0]?.targetUserId).toBeNull();
      expect(audit[0]?.actorUserId).toBe(await userIdFor(db, OWNER_EMAIL));
    });
  });

  it("carries its role in the account export (v12)", async () => {
    const friend = await signUpUser(app);
    await app.inject({
      method: "POST",
      url: "/api/admin/collaborators",
      headers: { cookie: owner.cookie },
      payload: { email: friend.email },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: friend.cookie },
    });
    expect(response.json<AccountExport>().profile.role).toBe("admin");
  });
});

// ---------------------------------------------------------------------------
// The cache, as the route uses it
// ---------------------------------------------------------------------------

describe("GET /api/admin/metrics caching", () => {
  it("does not run the panels twice inside the window", async () => {
    let queries = 0;
    const { app, close } = await createTestApp(
      { ADMIN_EMAILS: [OWNER_EMAIL] },
      {},
      (database) =>
        new Proxy(database, {
          get(source, property, receiver) {
            const value = Reflect.get(source, property, receiver);
            if ((property === "execute" || property === "select") && typeof value === "function") {
              return (...args: unknown[]) => {
                queries += 1;
                return (value as (...rest: unknown[]) => unknown).apply(source, args);
              };
            }
            return value;
          },
        }) as Database,
    );

    try {
      const owner = await signUpAs(app, OWNER_EMAIL);
      const read = () =>
        app.inject({ method: "GET", url: "/api/admin/metrics?range=4w", headers: { cookie: owner.cookie } });

      queries = 0;
      expect((await read()).statusCode).toBe(200);
      const firstCost = queries;
      // A dozen aggregate scans; the exact number does not matter, that it is
      // expensive does.
      expect(firstCost).toBeGreaterThan(10);

      queries = 0;
      expect((await read()).statusCode).toBe(200);
      // What is left is the per-request identity work every admin route does
      // anyway — better-auth resolving the session, then the guard's own role
      // lookup. The dozen panel scans did not run a second time.
      expect(queries).toBeLessThanOrEqual(4);
      expect(queries).toBeLessThan(firstCost - 10);
    } finally {
      await close();
    }
  });
});
