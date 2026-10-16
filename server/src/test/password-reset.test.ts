// Password recovery (ledger 820-824): the owner's one-time reset link, the
// self-serve email flow, and the security rules both have to keep.
import { and, eq, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_REAUTH_MAX_AGE_MS, adminResetLinkResponseSchema } from "@blw/shared";
import { buildApp, redactUrlTokens, serializeRequestForLog } from "../app.js";
import type { AuthLogger } from "../auth.js";
import { isEmailEnabled, loadConfig } from "../config.js";
import type { Database } from "../db/index.js";
import { account, adminAudit, session, user, verification } from "../db/schema.js";
import { cookieHeader, createTestApp, createTestDb, signUpUser, TEST_ORIGIN, testEnv, type TestUser } from "./helpers.js";

const OWNER_EMAIL = "owner@littlemeals.test";
const SILENT: AuthLogger = { info: () => {}, warn: () => {}, error: () => {} };
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
    // Refused before any lookup (826 N3): an unknown address gets the same
    // answer, so a collaborator can't use this route to test who has an account.
    const unknown = await makeLink("nobody-here@example.com", collaborator.cookie);
    expect(unknown.statusCode).toBe(403);
    expect(unknown.json()).toEqual({ error: "owner_only" });
    expect(await db.select().from(verification).where(like(verification.identifier, "reset-password:%"))).toHaveLength(
      0,
    );
  });

  it("sits on the tight admin write budget, like granting: the 11th in the window is refused (826 N4)", async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await makeLink("nobody-here@example.com")).statusCode, `attempt ${i}`).toBe(404);
    }
    const limited = await makeLink(parent.email);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: "rate_limited" });
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
    // The owner has a password, so the panel asks for it (830).
    expect(response.json()).toEqual({ error: "password_required" });
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

describe("Forgot password? by email (822)", () => {
  let app: FastifyInstance;
  let db: Database;
  let closeDb: () => Promise<void>;
  let mail: string[];

  beforeEach(async () => {
    // Built by hand rather than with createTestApp, whose auth logger is
    // silent: outside production the email (link included) goes to this log.
    mail = [];
    const logger: AuthLogger = {
      info: (message) => mail.push(message),
      warn: () => {},
      error: () => {},
    };
    ({ db, close: closeDb } = await createTestDb());
    app = buildApp({ env: testEnv(), db, authLogger: logger, logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await closeDb();
  });

  const request = (email: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      headers: { origin: TEST_ORIGIN },
      payload: { email, redirectTo: "/reset-password" },
    });

  it("is offered only where the email would really arrive", async () => {
    const sender = "Little Meals <no-reply@littlemeals.test>";
    expect(
      isEmailEnabled({ NODE_ENV: "production", RESEND_API_KEY: undefined, EMAIL_FROM: sender }),
    ).toBe(false);
    expect(
      isEmailEnabled({ NODE_ENV: "production", RESEND_API_KEY: "re_test", EMAIL_FROM: sender }),
    ).toBe(true);
    // A key with EMAIL_FROM left unset: the default is Resend's test sender,
    // which only reaches the Resend account's own inbox.
    const { BETTER_AUTH_SECRET, KEY_ENCRYPTION_SECRET } = testEnv();
    const prodWithKey = loadConfig({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET,
      KEY_ENCRYPTION_SECRET,
      RESEND_API_KEY: "re_test",
    });
    expect(isEmailEnabled(prodWithKey)).toBe(false);
    // However the test sender is capitalised (826 N5).
    expect(
      isEmailEnabled({ NODE_ENV: "production", RESEND_API_KEY: "re_test", EMAIL_FROM: "Foo <onboarding@RESEND.DEV>" }),
    ).toBe(false);
    // Development and test deliver to the server log.
    expect(
      isEmailEnabled({ NODE_ENV: "development", RESEND_API_KEY: undefined, EMAIL_FROM: sender }),
    ).toBe(true);
    expect(isEmailEnabled({ NODE_ENV: "test", RESEND_API_KEY: undefined, EMAIL_FROM: sender })).toBe(
      true,
    );

    const probe = await app.inject({ method: "GET", url: "/api/auth-config" });
    expect(probe.json()).toEqual({ googleEnabled: false, emailEnabled: true });
  });

  it("answers a known and an unknown address identically, and mails only the real one", async () => {
    const parent = await signUpUser(app);
    mail = [];

    const known = await request(parent.email);
    const unknown = await request("nobody-here@example.com");
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.body).toBe(known.body);
    expect(unknown.headers["content-type"]).toBe(known.headers["content-type"]);

    const resets = mail.filter((line) => line.includes('subject="Reset your password"'));
    expect(resets).toHaveLength(1);
    expect(resets[0]).toContain(`to=${parent.email}`);
  });

  it("emails a link that lands on the reset page and resets the password", async () => {
    const parent = await signUpUser(app);
    mail = [];
    await request(parent.email);

    const link = /(http\S+\/api\/auth\/reset-password\/\S+)/.exec(mail.join("\n"))?.[1];
    expect(link).toBeDefined();
    expect(link).toContain("callbackURL=%2Freset-password");
    const landing = await openLink(app, link!);
    expect(landing.pathname).toBe("/reset-password");

    expect((await resetWith(app, landing.searchParams.get("token")!)).statusCode).toBe(200);
    expect((await signIn(app, parent.email, NEW_PASSWORD)).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/babies", headers: { cookie: parent.cookie } })).statusCode).toBe(
      401,
    );
  });
});

describe("security rules (824)", () => {
  it("keeps tokens out of the request log", () => {
    const token = "AbCdEfGhIjKlMnOpQrStUvWx";
    const cases = [
      `/api/auth/reset-password/${token}?callbackURL=%2Freset-password`,
      `/reset-password?token=${token}`,
      `/reset-password?error=INVALID_TOKEN&token=${token}`,
      `/api/auth/verify-email?token=${token}&callbackURL=%2F`,
    ];
    for (const url of cases) {
      expect(redactUrlTokens(url)).not.toContain(token);
      expect(redactUrlTokens(url)).toContain("[redacted]");
    }
    expect(redactUrlTokens(cases[0]!)).toBe("/api/auth/reset-password/[redacted]?callbackURL=%2Freset-password");
    // Everything else is logged as it was.
    expect(redactUrlTokens("/api/meals?babyId=b1&tokens=2")).toBe("/api/meals?babyId=b1&tokens=2");
    expect(redactUrlTokens("/api/auth/reset-password")).toBe("/api/auth/reset-password");

    const logged = serializeRequestForLog({
      method: "GET",
      url: cases[0]!,
      host: "littlemeals.test",
      ip: "203.0.113.7",
      socket: { remotePort: 51234 },
    } as unknown as Parameters<typeof serializeRequestForLog>[0]);
    expect(logged).toEqual({
      method: "GET",
      url: "/api/auth/reset-password/[redacted]?callbackURL=%2Freset-password",
      host: "littlemeals.test",
      remoteAddress: "203.0.113.7",
      remotePort: 51234,
    });
  });

  it("wires that redaction into the real request log (826 N1)", async () => {
    const token = "ZyXwVuTsRqPoNmLkJiHgFeDc";
    const { db, close } = await createTestDb();
    const app = buildApp({ env: testEnv(), db, authLogger: SILENT, logger: true });
    await app.ready();
    // Fastify's logger is pino; catch what it would print at its destination.
    const streamKey = Object.getOwnPropertySymbols(app.log).find((key) => key.description === "pino.stream");
    const stream = (app.log as unknown as Record<symbol, { write: (line: string) => boolean }>)[streamKey!]!;
    const lines: string[] = [];
    const capture = vi.spyOn(stream, "write").mockImplementation((line: string) => {
      lines.push(String(line));
      return true;
    });
    try {
      await app.inject({ method: "GET", url: `/api/auth/reset-password/${token}?callbackURL=%2Freset-password` });
      await app.inject({ method: "GET", url: `/reset-password?token=${token}` });
      const requestLines = lines.filter((line) => line.includes('"req"'));
      expect(requestLines).toHaveLength(2);
      for (const line of requestLines) expect(line).toContain("[redacted]");
      for (const line of lines) expect(line).not.toContain(token);
    } finally {
      capture.mockRestore();
      await app.close();
      await close();
    }
  });

  it("answers a known address at once even when Resend never answers (826 N2)", async () => {
    const { db, close } = await createTestDb();
    const app = buildApp({
      env: testEnv({
        NODE_ENV: "production",
        RESEND_API_KEY: "re_made_up_for_tests",
        EMAIL_FROM: "Little Meals <no-reply@littlemeals.test>",
      }),
      db,
      authLogger: SILENT,
      logger: false,
    });
    await app.ready();
    const send = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", send);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const signUp = await app.inject({
        method: "POST",
        url: "/api/auth/sign-up/email",
        headers: { origin: TEST_ORIGIN },
        payload: { email: "slow-mail-parent@example.com", password: "correct-horse-battery-staple", name: "P" },
      });
      expect(signUp.statusCode).toBe(200);

      // From here Resend hangs forever: awaiting it would hang the answer too.
      send.mockImplementation(() => new Promise<Response>(() => {}));
      const answer = await Promise.race([
        app.inject({
          method: "POST",
          url: "/api/auth/request-password-reset",
          headers: { origin: TEST_ORIGIN },
          payload: { email: "slow-mail-parent@example.com", redirectTo: "/reset-password" },
        }),
        new Promise<"hung">((resolve) => {
          timer = setTimeout(() => resolve("hung"), 5_000);
        }),
      ]);
      expect(answer).not.toBe("hung");
      expect(answer !== "hung" && answer.statusCode).toBe(200);
      // The mail really was handed to Resend; only the wait was skipped.
      expect(send.mock.calls.some(([, init]) => String(init?.body).includes("Reset your password"))).toBe(true);
    } finally {
      clearTimeout(timer);
      vi.unstubAllGlobals();
      await app.close();
      await close();
    }
  });

  it("puts asking for and using a reset under the auth rate limit, one shared budget", async () => {
    const { app, close } = await createTestApp({ AUTH_RATE_LIMIT_MAX: 3 });
    try {
      const ask = () =>
        app.inject({
          method: "POST",
          url: "/api/auth/request-password-reset",
          headers: { origin: TEST_ORIGIN },
          payload: { email: "nobody@example.com", redirectTo: "/reset-password" },
        });
      const use = () => resetWith(app, "not-a-real-token");

      const allowed = [(await ask()).statusCode, (await use()).statusCode, (await ask()).statusCode];
      expect(allowed).not.toContain(429);
      // Spent across both: neither door opens again inside the minute.
      expect((await ask()).statusCode).toBe(429);
      expect((await use()).statusCode).toBe(429);
    } finally {
      await close();
    }
  });

  it("never writes a reset link to the production log, even with no email key", async () => {
    const lines: string[] = [];
    const logger: AuthLogger = {
      info: (message) => lines.push(message),
      warn: (message) => lines.push(message),
      error: (message) => lines.push(message),
    };
    const { db, close } = await createTestDb();
    const app = buildApp({ env: testEnv({ NODE_ENV: "production" }), db, authLogger: logger, logger: false });
    await app.ready();
    try {
      const signUp = await app.inject({
        method: "POST",
        url: "/api/auth/sign-up/email",
        headers: { origin: TEST_ORIGIN },
        payload: { email: "prod-parent@example.com", password: "correct-horse-battery-staple", name: "P" },
      });
      expect(signUp.statusCode).toBe(200);
      lines.length = 0;

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/request-password-reset",
        headers: { origin: TEST_ORIGIN },
        payload: { email: "prod-parent@example.com", redirectTo: "/reset-password" },
      });
      expect(response.statusCode).toBe(200);
      // The drop is reported by subject only: no address, no link, no token.
      expect(lines.some((line) => line.includes('Cannot send "Reset your password"'))).toBe(true);
      const [row] = await db.select().from(verification).where(like(verification.identifier, "reset-password:%"));
      const token = row!.identifier.slice("reset-password:".length);
      for (const line of lines) {
        expect(line).not.toContain(token);
        expect(line).not.toContain("prod-parent@example.com");
        expect(line).not.toContain("/reset-password/");
      }
      expect((await app.inject({ method: "GET", url: "/api/auth-config" })).json()).toEqual({
        googleEnabled: false,
        emailEnabled: false,
      });
    } finally {
      await app.close();
      await close();
    }
  });
});
