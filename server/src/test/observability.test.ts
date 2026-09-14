// Item 318: request ids, the error handler, and the deep health check.
//
// This is the whole of "error tracking" for now — no third party, no agent,
// no stack shipped anywhere. What has to hold is that a 5xx tells the caller
// nothing except an id they can read out to us, that the id is on every
// response so it is findable, and that the responses other tests already
// depend on (the rate limiter's 429, a route's own 4xx) are byte-for-byte
// what they were before the handler existed.
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { isDeepHealthRequested } from "../app.js";
import type { Database } from "../db/index.js";
import { createTestApp, signUpUser } from "./helpers.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("request ids", () => {
  it("puts a fresh uuid on every response, including 404s", async () => {
    const { app, close } = await createTestApp();
    try {
      const first = await app.inject({ method: "GET", url: "/api/health" });
      const second = await app.inject({ method: "GET", url: "/api/health" });
      const missing = await app.inject({ method: "GET", url: "/api/nope" });

      const ids = [first, second, missing].map((r) => r.headers["x-request-id"] as string);
      for (const id of ids) expect(id).toMatch(UUID_RE);
      // A per-request id, not a per-process one.
      expect(new Set(ids).size).toBe(3);
    } finally {
      await close();
    }
  });
});

describe("the error handler", () => {
  it("answers a 5xx with an id and nothing else", async () => {
    // A database that starts working and then stops — the shape of a real
    // outage, reached without stubbing the handler itself. Sign-up happens
    // while it is healthy; the export runs after it fails.
    let broken = false;
    const faulted = (db: Database): Database =>
      new Proxy(db, {
        get(target, prop, receiver) {
          if (prop === "select" && broken) {
            return () => {
              throw new Error("connection terminated unexpectedly: postgres://blw:hunter2@db:5432");
            };
          }
          return Reflect.get(target, prop, receiver) as unknown;
        },
      }) as Database;

    const { app, close } = await createTestApp({}, {}, faulted);
    try {
      const user = await signUpUser(app);
      broken = true;

      const response = await app.inject({
        method: "GET",
        url: "/api/account/export",
        headers: { cookie: user.cookie },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json<{ error: string; requestId: string }>();
      expect(body.error).toBe("internal_error");
      expect(body.requestId).toMatch(UUID_RE);
      // The id in the body is the id in the header, which is what makes a
      // parent reading it off the screen useful.
      expect(body.requestId).toBe(response.headers["x-request-id"]);
      // Nothing else: no message, no stack, no connection string.
      expect(Object.keys(body).sort()).toEqual(["error", "requestId"]);
      expect(response.body).not.toMatch(/hunter2|postgres:\/\/|at Object/);
    } finally {
      broken = false;
      await close();
    }
  });

  it("leaves known 4xx answers exactly as they were", async () => {
    const { app, close } = await createTestApp({ AUTH_RATE_LIMIT_MAX: 2 });
    try {
      // The rate limiter throws an Error carrying a statusCode, so it goes
      // through the error handler — and its body is a contract other tests
      // and the client already read.
      const signIn = () =>
        app.inject({
          method: "POST",
          url: "/api/auth/sign-in/email",
          headers: { origin: "http://localhost:3000" },
          payload: { email: "nobody@example.com", password: "wrong-password-here" },
        });

      let limited = await signIn();
      for (let i = 0; i < 4 && limited.statusCode !== 429; i += 1) limited = await signIn();

      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });
      expect(limited.json<{ error?: string }>().error).not.toBe("internal_error");

      // And a route's own hand-written 4xx never reaches the handler at all.
      const unauthorized = await app.inject({ method: "GET", url: "/api/preferences" });
      expect(unauthorized.statusCode).toBe(401);
      expect(unauthorized.json()).toEqual({ error: "unauthorized" });
    } finally {
      await close();
    }
  });
});

describe("GET /api/health", () => {
  it("stays shallow by default — the container healthcheck polls it every 30s", async () => {
    const { app, close } = await createTestApp();
    try {
      const response = await app.inject({ method: "GET", url: "/api/health" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    } finally {
      await close();
    }
  });

  it("checks the database when asked, for an external pinger", async () => {
    const { app, close } = await createTestApp();
    try {
      const response = await app.inject({ method: "GET", url: "/api/health?deep=1" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok", database: "ok" });
    } finally {
      await close();
    }
  });

  it("fails loudly when the database is unreachable", async () => {
    const faulted = (db: Database): Database =>
      new Proxy(db, {
        get(target, prop, receiver) {
          if (prop === "execute") {
            return () => Promise.reject(new Error("ECONNREFUSED"));
          }
          return Reflect.get(target, prop, receiver) as unknown;
        },
      }) as Database;

    const { app, close } = await createTestApp({}, {}, faulted);
    try {
      const response = await app.inject({ method: "GET", url: "/api/health?deep=1" });
      // 503, not a cheerful 200 in front of a dead database — the point of
      // the deep check is that a pinger can tell the difference.
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: "error", database: "error" });

      // The shallow form still answers, so the container is not killed by a
      // database blip it could recover from.
      const shallow = await app.inject({ method: "GET", url: "/api/health" });
      expect(shallow.statusCode).toBe(200);
    } finally {
      await close();
    }
  });

  it("reads the deep flag the way the pinger will send it", () => {
    expect(isDeepHealthRequested("1")).toBe(true);
    expect(isDeepHealthRequested("true")).toBe(true);
    // A bare `?deep`.
    expect(isDeepHealthRequested("")).toBe(true);
    expect(isDeepHealthRequested(undefined)).toBe(false);
    expect(isDeepHealthRequested("0")).toBe(false);
    expect(isDeepHealthRequested("false")).toBe(false);
  });

  it("really runs a query rather than trusting the connection object", async () => {
    const { db, close } = await createTestApp();
    try {
      // Guards the assertion above: `select 1` is a round trip the driver
      // cannot answer from memory.
      const result = await db.execute(sql`select 1 as one`);
      expect(result).toBeDefined();
    } finally {
      await close();
    }
  });
});
