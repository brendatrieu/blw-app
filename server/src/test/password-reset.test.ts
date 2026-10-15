// Password recovery (ledger 820-824): the owner's one-time reset link, the
// self-serve email flow, and the security rules both have to keep.
import { and, eq, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ACCOUNT_REAUTH_MAX_AGE_MS, adminResetLinkResponseSchema } from "@blw/shared";
import type { Database } from "../db/index.js";
import { account, adminAudit, session, user, verification } from "../db/schema.js";
import { cookieHeader, createTestApp, signUpUser, TEST_ORIGIN, type TestUser } from "./helpers.js";

const OWNER_EMAIL = "owner@littlemeals.test";
const NEW_PASSWORD = "a-brand-new-password";

async function signUpAs(app: FastifyInstance, email: string): Promise<TestUser> {
  const password = "correct-horse-battery-staple";
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: TEST_ORIGIN },
    payload: { email, password, name: "Someone" },
  });
  if (response.statusCode !== 200) throw new Error(`sign-up failed (${response.statusCode})`);
  return { email, password, cookie: cookieHeader(response.headers["set-cookie"] as string | string[] | undefined) };
}

async function userIdFor(db: Database, email: string): Promise<string> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (!row) throw new Error(`no user for ${email}`);
  return row.id;
}

function signIn(app: FastifyInstance, email: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    headers: { origin: TEST_ORIGIN },
    payload: { email, password },
  });
}

/** Follows a reset link the way a browser's first hop does: better-auth's GET check. */
async function openLink(app: FastifyInstance, url: string): Promise<URL> {
  const target = new URL(url);
  const response = await app.inject({ method: "GET", url: target.pathname + target.search });
  expect(response.statusCode).toBe(302);
  return new URL(String(response.headers.location), TEST_ORIGIN);
}

function tokenOf(url: string): string {
  const match = /\/api\/auth\/reset-password\/([^/?]+)\?/.exec(url);
  if (!match?.[1]) throw new Error("no token in link");
  return match[1];
}

function resetWith(app: FastifyInstance, token: string, newPassword = NEW_PASSWORD) {
  return app.inject({
    method: "POST",
    url: "/api/auth/reset-password",
    headers: { origin: TEST_ORIGIN },
    payload: { token, newPassword },
  });
}

describe("the owner's one-time reset link (821)", () => {
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

  const makeLink = (email: string, cookie = owner.cookie) =>
    app.inject({
      method: "POST",
      url: "/api/admin/password-reset-link",
      headers: { cookie },
      payload: { email },
    });

  it("gives the owner better-auth's own reset link, once, uncached, for one hour", async () => {
    const before = Date.now();
    const response = await makeLink(`  ${parent.email.toUpperCase()} `);
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");

    const body = adminResetLinkResponseSchema.parse(response.json());
    expect(body.url).toMatch(
      new RegExp(`^${TEST_ORIGIN}/api/auth/reset-password/[A-Za-z0-9]{24}\\?callbackURL=%2Freset-password$`),
    );
    const ttl = new Date(body.expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThan(59 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000 + 5_000);

    // Stored exactly where better-auth's own request stores one.
    const rows = await db.select().from(verification).where(like(verification.identifier, "reset-password:%"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.identifier).toBe(`reset-password:${tokenOf(body.url)}`);
    expect(rows[0]!.value).toBe(await userIdFor(db, parent.email));
  });

  it("audits who made a link for whom, and never the token", async () => {
    const response = await makeLink(parent.email);
    const token = tokenOf(adminResetLinkResponseSchema.parse(response.json()).url);

    const audit = await db.select().from(adminAudit);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorUserId: await userIdFor(db, OWNER_EMAIL),
      action: "password_reset_link",
      targetUserId: await userIdFor(db, parent.email),
      targetRef: null,
    });
    expect(JSON.stringify(audit)).not.toContain(token);
  });

  it("resets the password end to end: new password works, old one and old sessions do not", async () => {
    const before = await app.inject({ method: "GET", url: "/api/babies", headers: { cookie: parent.cookie } });
    expect(before.statusCode).toBe(200);

    const { url } = adminResetLinkResponseSchema.parse((await makeLink(parent.email)).json());
    const landing = await openLink(app, url);
    expect(landing.pathname).toBe("/reset-password");
    const token = landing.searchParams.get("token");
    expect(token).toBe(tokenOf(url));

    const reset = await resetWith(app, token!);
    expect(reset.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: "/api/babies", headers: { cookie: parent.cookie } });
    expect(after.statusCode).toBe(401);
    expect(await db.select().from(session).where(eq(session.userId, await userIdFor(db, parent.email)))).toHaveLength(
      0,
    );

    expect((await signIn(app, parent.email, parent.password)).statusCode).toBe(401);
    expect((await signIn(app, parent.email, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it("works once: the same link fails the second time, at the check and at the reset", async () => {
    const { url } = adminResetLinkResponseSchema.parse((await makeLink(parent.email)).json());
    const token = tokenOf(url);
    expect((await resetWith(app, token)).statusCode).toBe(200);

    const again = await resetWith(app, token, "yet-another-password");
    expect(again.statusCode).toBe(400);
    expect(again.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect((await openLink(app, url)).searchParams.get("error")).toBe("INVALID_TOKEN");
    expect((await signIn(app, parent.email, "yet-another-password")).statusCode).toBe(401);
  });

  it("stops working after an hour", async () => {
    const { url } = adminResetLinkResponseSchema.parse((await makeLink(parent.email)).json());
    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verification.identifier, `reset-password:${tokenOf(url)}`));

    const landing = await openLink(app, url);
    expect(landing.pathname).toBe("/reset-password");
    expect(landing.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(landing.searchParams.has("token")).toBe(false);
    expect((await resetWith(app, tokenOf(url))).statusCode).toBe(400);
    expect((await signIn(app, parent.email, parent.password)).statusCode).toBe(200);
  });

  it("is the owner's alone: a collaborator granted from the page cannot mint one", async () => {
    const collaborator = await signUpUser(app);
    await db.update(user).set({ role: "admin" }).where(eq(user.email, collaborator.email));

    const response = await makeLink(OWNER_EMAIL, collaborator.cookie);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "owner_only" });
    expect(await db.select().from(verification).where(like(verification.identifier, "reset-password:%"))).toHaveLength(
      0,
    );
  });

  it("needs a fresh sign-in, like granting access", async () => {
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - ACCOUNT_REAUTH_MAX_AGE_MS - 60_000) })
      .where(eq(session.userId, await userIdFor(db, OWNER_EMAIL)));

    const response = await makeLink(parent.email);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "reauth_required" });
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });

  it("tells the owner plainly about a typo, a malformed address, and a Google-only account", async () => {
    const unknown = await makeLink("nobody-here@example.com");
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "unknown_user" });

    const malformed = await makeLink("not-an-email");
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ error: "invalid_request" });

    // A Google-only account has no credential row; better-auth's reset would
    // quietly create one.
    const googleOnly = await signUpUser(app);
    const googleId = await userIdFor(db, googleOnly.email);
    await db
      .update(account)
      .set({ providerId: "google", password: null })
      .where(and(eq(account.userId, googleId), eq(account.providerId, "credential")));

    const refused = await makeLink(googleOnly.email);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: "no_password" });
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });
});
