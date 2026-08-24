import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance, type preHandlerAsyncHookHandler } from "fastify";
import type { AiKeyStatus } from "@blw/shared";
import { createTestApp, signUpUser, testEnv, type TestUser } from "./helpers.js";
import type { AuthUser } from "../auth.js";
import type { ApiKeyVerifier } from "../ai/client.js";
import { createPerUserRateLimit, registerAiRateLimit } from "../ai/client.js";
import { decryptSecret, encryptSecret, lastFour } from "../ai/crypto.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

/** A syntactically valid key that is never sent anywhere real. */
const FAKE_KEY = "sk-ant-api03-TESTKEYTESTKEYTESTKEYTESTKEYTESTKEY-aBc9";
const OTHER_KEY = "sk-ant-api03-SECONDKEYSECONDKEYSECONDKEYSECONDKEY-xY7z";

const SECRET = "test-key-encryption-secret-0123456789-abcdef";

// ---------------------------------------------------------------------------
// crypto
// ---------------------------------------------------------------------------

describe("ai key encryption", () => {
  it("round-trips a key", () => {
    const blob = encryptSecret(FAKE_KEY, SECRET);
    expect(blob).not.toContain(FAKE_KEY);
    expect(decryptSecret(blob, SECRET)).toBe(FAKE_KEY);
  });

  it("uses a fresh IV so the same key never encrypts to the same blob", () => {
    expect(encryptSecret(FAKE_KEY, SECRET)).not.toBe(encryptSecret(FAKE_KEY, SECRET));
  });

  it("rejects a tampered ciphertext (bad auth tag)", () => {
    const raw = Buffer.from(encryptSecret(FAKE_KEY, SECRET), "base64");
    // Flip a bit in the ciphertext body, past the 12-byte IV and 16-byte tag.
    raw.writeUInt8(raw.readUInt8(raw.length - 1) ^ 0x01, raw.length - 1);
    expect(() => decryptSecret(raw.toString("base64"), SECRET)).toThrow();
  });

  it("rejects a swapped auth tag", () => {
    const raw = Buffer.from(encryptSecret(FAKE_KEY, SECRET), "base64");
    raw.writeUInt8(raw.readUInt8(12) ^ 0xff, 12);
    expect(() => decryptSecret(raw.toString("base64"), SECRET)).toThrow();
  });

  it("rejects decryption under a different secret", () => {
    const blob = encryptSecret(FAKE_KEY, SECRET);
    expect(() => decryptSecret(blob, `${SECRET}-rotated`)).toThrow();
  });

  it("rejects a truncated payload", () => {
    expect(() => decryptSecret(Buffer.alloc(8).toString("base64"), SECRET)).toThrow(/malformed/);
  });

  it("takes the last four characters for display", () => {
    expect(lastFour(FAKE_KEY)).toBe("aBc9");
  });
});

// ---------------------------------------------------------------------------
// per-user rate limit
// ---------------------------------------------------------------------------

describe("per-user rate limit", () => {
  it("allows up to max then reports seconds remaining, per user", () => {
    const limit = createPerUserRateLimit(2, 60_000);
    expect(limit.consume("a")).toBeNull();
    expect(limit.consume("a")).toBeNull();

    const retryAfter = limit.consume("a");
    expect(retryAfter).not.toBeNull();
    expect(retryAfter).toBeGreaterThan(0);

    // A second user has their own budget.
    expect(limit.consume("b")).toBeNull();
  });

  it("resets once the window elapses", () => {
    vi.useFakeTimers();
    try {
      const limit = createPerUserRateLimit(1, 60_000);
      expect(limit.consume("a")).toBeNull();
      expect(limit.consume("a")).not.toBeNull();
      vi.advanceTimersByTime(60_001);
      expect(limit.consume("a")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// shared /api/ai/* budget
// ---------------------------------------------------------------------------

describe("/api/ai/* budget", () => {
  /**
   * The AI feature routes do not exist yet — they are declared by later
   * agents. This proves the onRoute mechanism they will rely on: any route
   * under /api/ai/ declared after registerAiRateLimit picks the budget up
   * automatically, keyed by the user requireAuth resolved, while routes
   * outside that prefix are untouched.
   */
  it("attaches a per-user hourly budget to /api/ai/* routes only", async () => {
    const app = Fastify({ logger: false });
    app.decorateRequest("user", null);

    registerAiRateLimit(app, testEnv({ AI_RATE_LIMIT_MAX: 2 }));

    // Stands in for app.requireAuth: routes list it first, so the budget
    // hook (appended after it) sees a resolved user.
    const asUser =
      (id: string): preHandlerAsyncHookHandler =>
      async (request) => {
        request.user = { id } as unknown as AuthUser;
      };

    app.get("/api/ai/ping", { preHandler: asUser("user-a") }, async () => ({ ok: true }));
    app.get("/api/ai/other-user", { preHandler: asUser("user-b") }, async () => ({ ok: true }));
    app.get("/api/pantry/ping", { preHandler: asUser("user-a") }, async () => ({ ok: true }));
    await app.ready();

    expect((await app.inject({ method: "GET", url: "/api/ai/ping" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/ai/ping" })).statusCode).toBe(200);

    const blocked = await app.inject({ method: "GET", url: "/api/ai/ping" });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json<{ error: string }>().error).toBe("rate_limited");

    // Budget is per user, and non-AI routes never see the hook at all.
    expect((await app.inject({ method: "GET", url: "/api/ai/other-user" })).statusCode).toBe(200);
    for (let i = 0; i < 5; i += 1) {
      expect((await app.inject({ method: "GET", url: "/api/pantry/ping" })).statusCode).toBe(200);
    }

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

describe("/api/account/ai-key", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let user: TestUser;
  let verify: ApiKeyVerifier;
  let verifyCalls: number;

  /** Swappable per test; defaults to "the key is good". */
  let verdict: Awaited<ReturnType<ApiKeyVerifier>>;

  beforeEach(async () => {
    verifyCalls = 0;
    verdict = { ok: true };
    verify = async () => {
      verifyCalls += 1;
      return verdict;
    };

    ({ app, db, close } = await createTestApp({}, { verifyApiKey: verify }));
    user = await signUpUser(app);
  });

  afterEach(async () => {
    await close();
  });

  function put(apiKey: unknown, cookie = user.cookie) {
    return app.inject({
      method: "PUT",
      url: "/api/account/ai-key",
      headers: { cookie },
      payload: { apiKey },
    });
  }

  function get(cookie = user.cookie) {
    return app.inject({ method: "GET", url: "/api/account/ai-key", headers: { cookie } });
  }

  it("requires authentication on every verb", async () => {
    for (const method of ["GET", "PUT", "DELETE"] as const) {
      const response = await app.inject({
        method,
        url: "/api/account/ai-key",
        payload: method === "PUT" ? { apiKey: FAKE_KEY } : undefined,
      });
      expect(response.statusCode).toBe(401);
    }
    expect(verifyCalls).toBe(0);
  });

  it("reports no key for a fresh account", async () => {
    const response = await get();
    expect(response.statusCode).toBe(200);
    expect(response.json<AiKeyStatus>()).toEqual({ configured: false });
  });

  it("rejects a malformed key without calling Anthropic", async () => {
    for (const bad of ["", "hunter2", "sk-live-not-anthropic-but-long-enough-to-pass", 42, null]) {
      const response = await put(bad);
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toBe("invalid_key");
    }
    expect(verifyCalls).toBe(0);
  });

  it("rejects a well-formed key that Anthropic refuses, and stores nothing", async () => {
    verdict = { ok: false, reason: "invalid_key" };

    const response = await put(FAKE_KEY);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe("invalid_key");
    expect(verifyCalls).toBe(1);

    const rows = await db.select().from(schema.userAiKeys);
    expect(rows).toHaveLength(0);
    expect((await get()).json<AiKeyStatus>()).toEqual({ configured: false });
  });

  it("returns 503 without storing when Anthropic is unreachable", async () => {
    verdict = { ok: false, reason: "unavailable" };

    const response = await put(FAKE_KEY);
    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: string }>().error).toBe("validation_unavailable");
    expect(await db.select().from(schema.userAiKeys)).toHaveLength(0);
  });

  it("stores a validated key as ciphertext, never plaintext", async () => {
    const response = await put(FAKE_KEY);
    expect(response.statusCode).toBe(200);
    expect(response.json<{ last4: string }>()).toEqual({ last4: "aBc9" });

    const [row] = await db.select().from(schema.userAiKeys);
    expect(row).toBeDefined();
    expect(row?.keyLast4).toBe("aBc9");
    expect(row?.lastValidatedAt).toBeInstanceOf(Date);

    // The raw column must not contain the submitted key in any form.
    const stored = row?.encryptedKey ?? "";
    expect(stored).not.toContain(FAKE_KEY);
    expect(stored).not.toContain(FAKE_KEY.slice(7, 30));
    expect(Buffer.from(stored, "base64").toString("utf8")).not.toContain("sk-ant-");
    // ...but the server can still get it back.
    expect(decryptSecret(stored, SECRET)).toBe(FAKE_KEY);
  });

  it("never returns key material from GET", async () => {
    await put(FAKE_KEY);

    const response = await get();
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(FAKE_KEY);
    expect(response.body).not.toContain("sk-ant-");
    expect(response.body).not.toContain((await db.select().from(schema.userAiKeys))[0]?.encryptedKey ?? "@@");

    const status = response.json<AiKeyStatus>();
    expect(status.configured).toBe(true);
    expect(status.last4).toBe("aBc9");
    expect(typeof status.lastValidatedAt).toBe("string");
    expect(Object.keys(status).sort()).toEqual(["configured", "last4", "lastValidatedAt"]);
  });

  it("replaces an existing key rather than adding a second row", async () => {
    await put(FAKE_KEY);
    const first = (await db.select().from(schema.userAiKeys))[0]?.encryptedKey;

    const response = await put(OTHER_KEY);
    expect(response.statusCode).toBe(200);
    expect(response.json<{ last4: string }>().last4).toBe("xY7z");

    const rows = await db.select().from(schema.userAiKeys);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.encryptedKey).not.toBe(first);
    expect(decryptSecret(rows[0]?.encryptedKey ?? "", SECRET)).toBe(OTHER_KEY);
  });

  it("keeps each account's key to itself", async () => {
    await put(FAKE_KEY);

    const other = await signUpUser(app);
    expect((await get(other.cookie)).json<AiKeyStatus>()).toEqual({ configured: false });

    // Deleting on the other account must not touch the first one's key.
    await app.inject({ method: "DELETE", url: "/api/account/ai-key", headers: { cookie: other.cookie } });
    expect((await get()).json<AiKeyStatus>().configured).toBe(true);
  });

  it("deletes the row and is idempotent", async () => {
    await put(FAKE_KEY);

    const first = await app.inject({
      method: "DELETE",
      url: "/api/account/ai-key",
      headers: { cookie: user.cookie },
    });
    expect(first.statusCode).toBe(204);
    expect(await db.select().from(schema.userAiKeys)).toHaveLength(0);
    expect((await get()).json<AiKeyStatus>()).toEqual({ configured: false });

    const second = await app.inject({
      method: "DELETE",
      url: "/api/account/ai-key",
      headers: { cookie: user.cookie },
    });
    expect(second.statusCode).toBe(204);
  });

  it("rate limits saves to 5 per hour per user", async () => {
    verdict = { ok: false, reason: "invalid_key" };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await put(FAKE_KEY)).statusCode).toBe(400);
    }

    const blocked = await put(FAKE_KEY);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json<{ error: string }>().error).toBe("rate_limited");
    expect(blocked.headers["retry-after"]).toBeDefined();
    // The limiter short-circuits before validation, so no extra API call.
    expect(verifyCalls).toBe(5);

    // A different account is unaffected.
    const other = await signUpUser(app);
    expect((await put(FAKE_KEY, other.cookie)).statusCode).toBe(400);
  });

  it("is wiped by the account cascade", async () => {
    await put(FAKE_KEY);
    const [row] = await db.select().from(schema.userAiKeys);
    const userId = row?.userId ?? "";
    expect(userId).not.toBe("");

    await db.delete(schema.user).where(eq(schema.user.id, userId));

    expect(await db.select().from(schema.userAiKeys)).toHaveLength(0);
  });

  it("hands AI routes a client only when a key is on file", async () => {
    const [account] = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
    const userId = account?.id ?? "";
    expect(userId).not.toBe("");

    expect(await app.anthropicForUser(userId)).toBeNull();
    await put(FAKE_KEY);
    expect(await app.anthropicForUser(userId)).not.toBeNull();

    // A stored blob that no longer decrypts (rotated secret, corruption)
    // reads as "no key", never as a crash inside a feature route.
    await db
      .update(schema.userAiKeys)
      .set({ encryptedKey: encryptSecret(FAKE_KEY, "a-completely-different-master-secret") })
      .where(eq(schema.userAiKeys.userId, userId));
    expect(await app.anthropicForUser(userId)).toBeNull();
  });
});
