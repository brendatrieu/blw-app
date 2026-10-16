// Ledger 830: an admin whose session is older than the fresh window confirms
// their own password in the panel instead of signing out and back in.
import { and, eq, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ACCOUNT_REAUTH_MAX_AGE_MS, adminResetLinkResponseSchema, type AdminCollaboratorsResponse } from "@blw/shared";
import type { Database } from "../db/index.js";
import { account, adminAudit, session, user, verification } from "../db/schema.js";
import { cookieHeader, createTestApp, signUpUser, TEST_ORIGIN, type TestUser } from "./helpers.js";

const OWNER_EMAIL = "owner-830@littlemeals.test";
const OWNER_PASSWORD = "owner-830-real-password";
const WRONG = "not-the-owner-password";

async function signUpOwner(app: FastifyInstance): Promise<TestUser> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: TEST_ORIGIN },
    payload: { email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "Owner" },
  });
  if (response.statusCode !== 200) throw new Error(`sign-up failed (${response.statusCode})`);
  return {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    cookie: cookieHeader(response.headers["set-cookie"] as string | string[] | undefined),
  };
}

async function userIdFor(db: Database, email: string): Promise<string> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (!row) throw new Error(`no user for ${email}`);
  return row.id;
}

async function makeStale(db: Database, email: string): Promise<void> {
  await db
    .update(session)
    .set({ createdAt: new Date(Date.now() - ACCOUNT_REAUTH_MAX_AGE_MS - 60_000) })
    .where(eq(session.userId, await userIdFor(db, email)));
}

describe("confirming the admin's password instead of signing in again (830)", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let owner: TestUser;
  let parent: TestUser;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp({ ADMIN_EMAILS: [OWNER_EMAIL] }));
    owner = await signUpOwner(app);
    parent = await signUpUser(app);
    await makeStale(db, OWNER_EMAIL);
  });

  afterEach(async () => {
    await close();
  });

  const makeLink = (body: Record<string, unknown>, cookie = owner.cookie) =>
    app.inject({ method: "POST", url: "/api/admin/password-reset-link", headers: { cookie }, payload: body });
  const grant = (body: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/api/admin/collaborators", headers: { cookie: owner.cookie }, payload: body });
  const links = () => db.select().from(verification).where(like(verification.identifier, "reset-password:%"));
  const auditActions = async () => (await db.select().from(adminAudit)).map((row) => row.action).sort();

  it("asks for the password, refuses a wrong one, and makes the link with the right one", async () => {
    const asked = await makeLink({ email: parent.email });
    expect(asked.statusCode).toBe(401);
    expect(asked.json()).toEqual({ error: "password_required" });

    const wrong = await makeLink({ email: parent.email, password: WRONG });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: "invalid_password" });
    expect(await links()).toHaveLength(0);

    const right = await makeLink({ email: parent.email, password: OWNER_PASSWORD });
    expect(right.statusCode).toBe(200);
    adminResetLinkResponseSchema.parse(right.json());
    expect(await links()).toHaveLength(1);

    // Every check is audited, never with the password in it.
    expect(await auditActions()).toEqual(["password_confirmed", "password_rejected", "password_reset_link"]);
    const audit = JSON.stringify(await db.select().from(adminAudit));
    expect(audit).not.toContain(OWNER_PASSWORD);
    expect(audit).not.toContain(WRONG);
    expect(right.body).not.toContain(OWNER_PASSWORD);
  });

  it("vouches for that one request only: the next action asks again", async () => {
    expect((await makeLink({ email: parent.email, password: OWNER_PASSWORD })).statusCode).toBe(200);
    const next = await makeLink({ email: parent.email });
    expect(next.statusCode).toBe(401);
    expect(next.json()).toEqual({ error: "password_required" });
  });

  it("checks the SIGNED-IN admin's password, never another account's", async () => {
    // The parent's password is right for the parent, and worthless here.
    const response = await makeLink({ email: parent.email, password: parent.password });
    expect(response.json()).toEqual({ error: "invalid_password" });
    expect(await links()).toHaveLength(0);
  });

  it("throttles password checks: the sixth in the window is refused before the hash is compared", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await makeLink({ email: parent.email, password: WRONG })).statusCode, `attempt ${i}`).toBe(401);
    }
    const limited = await makeLink({ email: parent.email, password: OWNER_PASSWORD });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: "rate_limited" });
    expect(await links()).toHaveLength(0);
    // The throttled attempt was never checked, so it is not in the audit.
    expect(await auditActions()).toEqual(Array(5).fill("password_rejected"));
  });

  it("keeps one budget per admin: another session, address or X-Forwarded-For does not reset it (840)", async () => {
    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin: TEST_ORIGIN },
      payload: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
    });
    const second = cookieHeader(signIn.headers["set-cookie"] as string | string[] | undefined);
    expect(second).not.toBe(owner.cookie);
    await makeStale(db, OWNER_EMAIL);

    // Wrong guesses spread over both sessions, direct and through a proxy hop
    // (172.18.0.2, the shape of Caddy's address) for different clients.
    const from = (cookie: string, remoteAddress: string, forwardedFor?: string) => ({
      remoteAddress,
      headers: { cookie, ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}) },
    });
    const tries = [
      from(owner.cookie, "203.0.113.1"),
      from(second, "203.0.113.2"),
      from(owner.cookie, "172.18.0.2", "198.51.100.3"),
      from(second, "172.18.0.2", "198.51.100.4"),
      from(owner.cookie, "127.0.0.1", "198.51.100.5"),
    ];
    for (const [i, request] of tries.entries()) {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/password-reset-link",
        ...request,
        payload: { email: parent.email, password: WRONG },
      });
      expect(response.json(), `attempt ${i}`).toEqual({ error: "invalid_password" });
    }

    // The right password, from the other session, a new address and a forged header.
    const limited = await app.inject({
      method: "POST",
      url: "/api/admin/password-reset-link",
      ...from(second, "172.18.0.2", "198.51.100.99"),
      payload: { email: parent.email, password: OWNER_PASSWORD },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: "rate_limited" });
    expect(await links()).toHaveLength(0);
  });

  it("grants and revokes with the password, the same way", async () => {
    const friend = await signUpUser(app);
    expect((await grant({ email: friend.email })).json()).toEqual({ error: "password_required" });
    expect((await grant({ email: friend.email, password: WRONG })).json()).toEqual({ error: "invalid_password" });

    const granted = await grant({ email: friend.email, password: OWNER_PASSWORD });
    expect(granted.statusCode).toBe(200);
    expect(
      granted.json<AdminCollaboratorsResponse>().collaborators.some((row) => row.email === friend.email),
    ).toBe(true);

    const friendId = await userIdFor(db, friend.email);
    const revoke = (payload?: Record<string, unknown>) =>
      app.inject({
        method: "DELETE",
        url: `/api/admin/collaborators/${friendId}`,
        headers: { cookie: owner.cookie },
        ...(payload ? { payload } : {}),
      });
    expect((await revoke()).json()).toEqual({ error: "password_required" });
    expect((await revoke({ password: WRONG })).json()).toEqual({ error: "invalid_password" });
    expect((await revoke({ password: OWNER_PASSWORD })).statusCode).toBe(200);
    const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, friendId));
    expect(row?.role).toBe("parent");
    // Anything else in revoke's body is refused rather than ignored.
    expect((await revoke({ password: OWNER_PASSWORD, userId: "x" })).statusCode).toBe(400);
  });

  it("refuses a malformed password field before checking anything", async () => {
    expect((await makeLink({ email: parent.email, password: "" })).statusCode).toBe(400);
    expect((await makeLink({ email: parent.email, password: "x".repeat(129) })).statusCode).toBe(400);
    expect((await makeLink({ email: parent.email, password: 12345678 })).statusCode).toBe(400);
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });

  it("keeps the sign-out-and-back-in answer for an admin with no password", async () => {
    await db
      .update(account)
      .set({ providerId: "google", password: null })
      .where(and(eq(account.userId, await userIdFor(db, OWNER_EMAIL)), eq(account.providerId, "credential")));

    const response = await makeLink({ email: parent.email, password: OWNER_PASSWORD });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "reauth_required" });
    expect(await links()).toHaveLength(0);
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });

  it("never asks a fresh session", async () => {
    await db
      .update(session)
      .set({ createdAt: new Date() })
      .where(eq(session.userId, await userIdFor(db, OWNER_EMAIL)));
    expect((await makeLink({ email: parent.email })).statusCode).toBe(200);
    expect(await auditActions()).toEqual(["password_reset_link"]);
  });

  it("still refuses a collaborator (owner only) and a parent (not found), password or not", async () => {
    const collaborator = await signUpUser(app);
    await db.update(user).set({ role: "admin" }).where(eq(user.email, collaborator.email));
    await makeStale(db, collaborator.email);
    const byCollaborator = await makeLink({ email: parent.email, password: collaborator.password }, collaborator.cookie);
    expect(byCollaborator.statusCode).toBe(403);
    expect(byCollaborator.json()).toEqual({ error: "owner_only" });

    const byParent = await makeLink({ email: parent.email, password: parent.password }, parent.cookie);
    expect(byParent.statusCode).toBe(404);
    expect(await links()).toHaveLength(0);
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });
});
