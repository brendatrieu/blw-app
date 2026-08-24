import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Baby } from "@blw/shared";
import { TEST_ORIGIN, createTestApp, signUpUser, type TestUser } from "./helpers.js";

describe("auth and baby ownership", () => {
  let app: FastifyInstance;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ app, close } = await createTestApp());
  });

  afterEach(async () => {
    await close();
  });

  describe("session lifecycle", () => {
    it("signs a user up, issues a session cookie, and scopes their babies", async () => {
      const user = await signUpUser(app);

      const session = await app.inject({
        method: "GET",
        url: "/api/auth/get-session",
        headers: { cookie: user.cookie, origin: TEST_ORIGIN },
      });
      expect(session.statusCode).toBe(200);
      expect(session.json<{ user: { email: string } }>().user.email).toBe(user.email);

      const empty = await app.inject({
        method: "GET",
        url: "/api/babies",
        headers: { cookie: user.cookie },
      });
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual([]);

      const created = await app.inject({
        method: "POST",
        url: "/api/babies",
        headers: { cookie: user.cookie },
        payload: { name: "Pip", birthDate: "2025-03-04", notes: "Loves avocado" },
      });
      expect(created.statusCode).toBe(201);
      const baby = created.json<Baby>();
      expect(baby).toMatchObject({
        name: "Pip",
        birthDate: "2025-03-04",
        notes: "Loves avocado",
        archived: false,
      });

      const listed = await app.inject({
        method: "GET",
        url: "/api/babies",
        headers: { cookie: user.cookie },
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json<Baby[]>().map((row) => row.id)).toEqual([baby.id]);
    });

    it("signs back in with the same credentials", async () => {
      const user = await signUpUser(app);

      const signIn = await app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        headers: { origin: TEST_ORIGIN },
        payload: { email: user.email, password: user.password },
      });

      expect(signIn.statusCode).toBe(200);
      expect(signIn.headers["set-cookie"]).toBeDefined();
    });

    it("rejects a wrong password", async () => {
      const user = await signUpUser(app);

      const signIn = await app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        headers: { origin: TEST_ORIGIN },
        payload: { email: user.email, password: "not-the-password" },
      });

      expect(signIn.statusCode).toBe(401);
    });
  });

  describe("unauthenticated access", () => {
    it.each([
      ["GET", "/api/babies"],
      ["POST", "/api/babies"],
      ["PATCH", "/api/babies/2a2f9f6a-0b6c-4a3f-9f61-2f0a5e1c8f10"],
      ["DELETE", "/api/babies/2a2f9f6a-0b6c-4a3f-9f61-2f0a5e1c8f10"],
    ])("%s %s returns 401", async (method, url) => {
      const response = await app.inject({
        method: method as "GET",
        url,
        payload: method === "GET" || method === "DELETE" ? undefined : {},
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    });

    it("rejects a forged session cookie", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/babies",
        headers: { cookie: "better-auth.session_token=forged.signature" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("cross-user isolation", () => {
    let owner: TestUser;
    let intruder: TestUser;
    let babyId: string;

    beforeEach(async () => {
      owner = await signUpUser(app, "Owner");
      intruder = await signUpUser(app, "Intruder");

      const created = await app.inject({
        method: "POST",
        url: "/api/babies",
        headers: { cookie: owner.cookie },
        payload: { name: "Robin", birthDate: "2025-01-15" },
      });
      babyId = created.json<Baby>().id;
    });

    it("hides another account's baby from the list", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/babies",
        headers: { cookie: intruder.cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it("returns 404 — never 403 — when patching another account's baby", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/babies/${babyId}`,
        headers: { cookie: intruder.cookie },
        payload: { name: "Hijacked" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "not_found" });
    });

    it("returns 404 when deleting another account's baby, and leaves it intact", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: `/api/babies/${babyId}`,
        headers: { cookie: intruder.cookie },
      });
      expect(response.statusCode).toBe(404);

      const stillThere = await app.inject({
        method: "GET",
        url: "/api/babies",
        headers: { cookie: owner.cookie },
      });
      expect(stillThere.json<Baby[]>().map((row) => row.id)).toEqual([babyId]);
    });

    it("reports an unknown id the same way as somebody else's id", async () => {
      const unknown = await app.inject({
        method: "PATCH",
        url: "/api/babies/00000000-0000-4000-8000-000000000000",
        headers: { cookie: intruder.cookie },
        payload: { name: "Ghost" },
      });
      const foreign = await app.inject({
        method: "PATCH",
        url: `/api/babies/${babyId}`,
        headers: { cookie: intruder.cookie },
        payload: { name: "Ghost" },
      });

      expect(unknown.statusCode).toBe(foreign.statusCode);
      expect(unknown.json()).toEqual(foreign.json());
    });
  });

  describe("baby validation and archiving", () => {
    it("rejects an empty name, an over-long name, and a future birth date", async () => {
      const user = await signUpUser(app);
      const cases = [
        { name: "", birthDate: "2025-01-01" },
        { name: "x".repeat(61), birthDate: "2025-01-01" },
        { name: "Pip", birthDate: "3000-01-01" },
        { name: "Pip", birthDate: "not-a-date" },
        { name: "Pip", birthDate: "2025-02-30" },
        { name: "Pip", birthDate: "2025-01-01", notes: "n".repeat(501) },
      ];

      for (const payload of cases) {
        const response = await app.inject({
          method: "POST",
          url: "/api/babies",
          headers: { cookie: user.cookie },
          payload,
        });
        expect(response.statusCode, JSON.stringify(payload)).toBe(400);
        expect(response.json<{ error: string }>().error).toBe("invalid_request");
      }
    });

    it("archives and restores a baby, hiding it from the default list", async () => {
      const user = await signUpUser(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/babies",
        headers: { cookie: user.cookie },
        payload: { name: "Sam", birthDate: "2024-11-02" },
      });
      const babyId = created.json<Baby>().id;

      const archived = await app.inject({
        method: "PATCH",
        url: `/api/babies/${babyId}`,
        headers: { cookie: user.cookie },
        payload: { archived: true },
      });
      expect(archived.statusCode).toBe(200);
      expect(archived.json<Baby>().archived).toBe(true);

      const defaultList = await app.inject({
        method: "GET",
        url: "/api/babies",
        headers: { cookie: user.cookie },
      });
      expect(defaultList.json()).toEqual([]);

      const withArchived = await app.inject({
        method: "GET",
        url: "/api/babies?includeArchived=true",
        headers: { cookie: user.cookie },
      });
      expect(withArchived.json<Baby[]>()).toHaveLength(1);

      const restored = await app.inject({
        method: "PATCH",
        url: `/api/babies/${babyId}`,
        headers: { cookie: user.cookie },
        payload: { archived: false },
      });
      expect(restored.json<Baby>().archived).toBe(false);
    });

    it("deletes the caller's own baby", async () => {
      const user = await signUpUser(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/babies",
        headers: { cookie: user.cookie },
        payload: { name: "Ada", birthDate: "2024-06-01" },
      });
      const babyId = created.json<Baby>().id;

      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/babies/${babyId}`,
        headers: { cookie: user.cookie },
      });
      expect(deleted.statusCode).toBe(204);

      const list = await app.inject({
        method: "GET",
        url: "/api/babies",
        headers: { cookie: user.cookie },
      });
      expect(list.json()).toEqual([]);
    });
  });

  describe("auth capability probe", () => {
    it("reports Google as unavailable when no credentials are configured", async () => {
      const response = await app.inject({ method: "GET", url: "/api/auth-config" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ googleEnabled: false });
    });
  });
});

describe("auth capability probe with Google configured", () => {
  it("reports Google as available", async () => {
    const { app, close } = await createTestApp({
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
    });

    const response = await app.inject({ method: "GET", url: "/api/auth-config" });
    expect(response.json()).toEqual({ googleEnabled: true });

    await close();
  });
});

describe("auth rate limiting", () => {
  it("returns 429 once the per-minute sign-in budget is spent", async () => {
    const { app, close } = await createTestApp({ AUTH_RATE_LIMIT_MAX: 5 });

    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        headers: { origin: TEST_ORIGIN },
        payload: { email: "nobody@example.com", password: "wrong-password-here" },
      });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await attempt()).statusCode);
    }

    expect(statuses.slice(0, 5).every((status) => status !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);

    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });
    expect(blocked.headers["retry-after"]).toBeDefined();

    // The global limit is separate and much looser, so ordinary API traffic
    // is unaffected by a burst of failed sign-ins.
    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);

    await close();
  });
});
