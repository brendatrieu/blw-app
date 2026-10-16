import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { rateLimitKey, trustCaddyHop } from "../plugins/rate-limit.js";
import { session, user } from "../db/schema.js";
import { TEST_ORIGIN, createTestApp } from "./helpers.js";

/**
 * Ledger 839. Production is Caddy -> app on the compose network: every socket
 * the app sees is Caddy's, and Caddy puts the client it saw in
 * X-Forwarded-For. These requests are shaped the same way: `remoteAddress` is
 * the proxy, the header is the parent.
 */
const CADDY = "172.18.0.2";

function viaCaddy(forwardedFor: string) {
  return {
    remoteAddress: CADDY,
    headers: { origin: TEST_ORIGIN, "x-forwarded-for": forwardedFor },
  };
}

function signIn(
  app: FastifyInstance,
  from: { remoteAddress: string; headers: Record<string, string> },
) {
  return app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    ...from,
    payload: { email: "nobody@example.test", password: "wrong-password-here" },
  });
}

/** Spends `count` strict-budget requests from one client; returns their statuses. */
async function spend(
  app: FastifyInstance,
  count: number,
  from: () => { remoteAddress: string; headers: Record<string, string> },
) {
  const statuses: number[] = [];
  for (let i = 0; i < count; i += 1) statuses.push((await signIn(app, from())).statusCode);
  return statuses;
}

describe("which hop is trusted (839)", () => {
  it("trusts the socket peer only when it is on a private network, and never a second hop", () => {
    for (const proxy of ["172.18.0.2", "::ffff:172.18.0.2", "10.0.0.3", "192.168.1.4", "fd00::2"]) {
      expect(trustCaddyHop(proxy, 0)).toBe(true);
      expect(trustCaddyHop(proxy, 1)).toBe(false);
    }
    for (const direct of [
      "127.0.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "203.0.113.9",
      "172.32.0.1",
      "2001:db8::1",
      "",
      "junk",
    ]) {
      expect(trustCaddyHop(direct, 0)).toBe(false);
    }
    // A socket that has gone away has no address.
    expect(trustCaddyHop(undefined as unknown as string, 0)).toBe(false);
  });

  it("keys IPv4 by address and IPv6 by its /64", () => {
    expect(rateLimitKey("198.51.100.7")).toBe("198.51.100.7");
    expect(rateLimitKey("::ffff:198.51.100.7")).toBe("198.51.100.7");
    expect(rateLimitKey("2001:db8:1:2:aaaa::1")).toBe("2001:0db8:0001:0002::/64");
    expect(rateLimitKey("2001:DB8:1:2:ffff:ffff:ffff:fffe")).toBe("2001:0db8:0001:0002::/64");
    expect(rateLimitKey("2001:db8:1:3::1")).toBe("2001:0db8:0001:0003::/64");
    expect(rateLimitKey("2001:db8::1")).toBe("2001:0db8:0000:0000::/64");
    expect(rateLimitKey("::1")).toBe("0000:0000:0000:0000::/64");
  });
});

describe("per-client rate limits behind Caddy (839)", () => {
  it("gives every parent their own bucket, and keeps get-session and sign-out off the strict budget", async () => {
    const { app, close } = await createTestApp({
      AUTH_RATE_LIMIT_MAX: 10,
      GLOBAL_RATE_LIMIT_MAX: 300,
    });
    try {
      // The production bug: eleven parents opening the app through one Caddy
      // used to share one 10-a-minute bucket, and the eleventh got a 429.
      for (let i = 1; i <= 11; i += 1) {
        const res = await app.inject({
          method: "GET",
          url: "/api/auth/get-session",
          ...viaCaddy(`198.51.100.${i}`),
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers["x-ratelimit-limit"]).toBe("300");
        expect(res.headers["x-ratelimit-remaining"]).toBe("299");
      }
      // One parent opening and refocusing the app far more than 10 times.
      for (let i = 0; i < 25; i += 1) {
        const res = await app.inject({
          method: "GET",
          url: "/api/auth/get-session",
          ...viaCaddy("198.51.100.50"),
        });
        expect(res.statusCode).toBe(200);
      }
      const signOut = await app.inject({
        method: "POST",
        url: "/api/auth/sign-out",
        ...viaCaddy("198.51.100.50"),
      });
      expect(signOut.statusCode).not.toBe(429);
      expect(signOut.headers["x-ratelimit-limit"]).toBe("300");
      // Same bucket as the rest of the API: 25 + 1 + this one.
      const health = await app.inject({
        method: "GET",
        url: "/api/health",
        ...viaCaddy("198.51.100.50"),
      });
      expect(health.headers["x-ratelimit-remaining"]).toBe(String(300 - 27));
    } finally {
      await close();
    }
  });

  it("keeps one strict budget per parent across every credential endpoint", async () => {
    const { app, close } = await createTestApp({ AUTH_RATE_LIMIT_MAX: 10 });
    try {
      const parent = viaCaddy("198.51.100.7");
      const credential = [
        {
          method: "POST",
          url: "/api/auth/sign-in/email",
          payload: { email: "a@example.test", password: "x".repeat(10) },
        },
        { method: "POST", url: "/api/auth/sign-up/email", payload: {} },
        {
          method: "POST",
          url: "/api/auth/request-password-reset",
          payload: { email: "a@example.test" },
        },
        {
          method: "POST",
          url: "/api/auth/reset-password",
          payload: { newPassword: "x".repeat(10), token: "nope" },
        },
        { method: "GET", url: "/api/auth/reset-password/nope?callbackURL=%2Freset-password" },
        {
          method: "POST",
          url: "/api/auth/change-password",
          payload: { currentPassword: "a", newPassword: "b" },
        },
        { method: "POST", url: "/api/auth/verify-password", payload: { password: "x".repeat(10) } },
        {
          method: "POST",
          url: "/api/auth/send-verification-email",
          payload: { email: "a@example.test" },
        },
        { method: "POST", url: "/api/auth/change-email", payload: { newEmail: "b@example.test" } },
        // Only looks like the session route: better-auth resolves the dots
        // and runs sign-in, so it must pay the strict price too.
        {
          method: "POST",
          url: "/api/auth/get-session/../sign-in/email",
          payload: { email: "a@example.test", password: "x".repeat(10) },
        },
      ] as const;
      for (const call of credential) {
        const res = await app.inject({ ...call, ...parent });
        expect(res.statusCode, call.url).not.toBe(429);
        expect(res.headers["x-ratelimit-limit"], call.url).toBe("10");
      }
      const blocked = await signIn(app, parent);
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });

      // Another parent behind the same Caddy is untouched, and the blocked
      // parent can still open the app.
      expect((await signIn(app, viaCaddy("198.51.100.8"))).statusCode).not.toBe(429);
      expect(
        (await app.inject({ method: "GET", url: "/api/auth/get-session", ...parent })).statusCode,
      ).toBe(200);
    } finally {
      await close();
    }
  });

  it("does not let a client that reaches the app directly choose its key with X-Forwarded-For", async () => {
    for (const direct of ["203.0.113.9", "127.0.0.1"]) {
      const { app, close } = await createTestApp({ AUTH_RATE_LIMIT_MAX: 10 });
      try {
        let n = 0;
        const statuses = await spend(app, 11, () => ({
          remoteAddress: direct,
          headers: { origin: TEST_ORIGIN, "x-forwarded-for": `198.51.100.${(n += 1)}` },
        }));
        expect(statuses.slice(0, 10), direct).not.toContain(429);
        expect(statuses[10], direct).toBe(429);
      } finally {
        await close();
      }
    }
  });

  it("believes only the address Caddy wrote, even if a client-supplied chain got through", async () => {
    const { app, close } = await createTestApp({ AUTH_RATE_LIMIT_MAX: 10 });
    try {
      let n = 0;
      const statuses = await spend(app, 11, () =>
        viaCaddy(`192.0.2.${(n += 1)}, 10.0.0.${n}, 198.51.100.7`),
      );
      expect(statuses.slice(0, 10)).not.toContain(429);
      expect(statuses[10]).toBe(429);
      expect((await signIn(app, viaCaddy("192.0.2.1, 198.51.100.8"))).statusCode).not.toBe(429);
    } finally {
      await close();
    }
  });

  it("keys an IPv6 parent by their /64", async () => {
    const { app, close } = await createTestApp({ AUTH_RATE_LIMIT_MAX: 10 });
    try {
      let n = 0;
      const statuses = await spend(app, 11, () =>
        viaCaddy(`2001:db8:1:2::${(n += 1).toString(16)}`),
      );
      expect(statuses.slice(0, 10)).not.toContain(429);
      expect(statuses[10]).toBe(429);
      expect((await signIn(app, viaCaddy("2001:db8:1:3::1"))).statusCode).not.toBe(429);
    } finally {
      await close();
    }
  });

  it("hands better-auth the same client address (its own limiter and the session record use it)", async () => {
    const { app, db, close } = await createTestApp();
    try {
      const signUp = async (
        email: string,
        from: { remoteAddress: string; headers: Record<string, string> },
      ) => {
        const res = await app.inject({
          method: "POST",
          url: "/api/auth/sign-up/email",
          ...from,
          payload: { email, password: "made-up-password-839", name: "Made Up" },
        });
        expect(res.statusCode).toBe(200);
        const [row] = await db
          .select({ ip: session.ipAddress })
          .from(session)
          .innerJoin(user, eq(user.id, session.userId))
          .where(eq(user.email, email));
        return row?.ip;
      };
      expect(await signUp("a-839@example.test", viaCaddy("203.0.113.50, 198.51.100.77"))).toBe(
        "198.51.100.77",
      );
      expect(
        await signUp("b-839@example.test", {
          remoteAddress: "203.0.113.9",
          headers: { origin: TEST_ORIGIN, "x-forwarded-for": "198.51.100.1" },
        }),
      ).toBe("203.0.113.9");
    } finally {
      await close();
    }
  });
});
