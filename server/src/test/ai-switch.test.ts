// Item 589: with AI features switched off, the chat and AI-key routes are
// gone (404, like any unknown URL) and the symptom check never asks for a
// model client — not even for a user with a key on file.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AI_FEATURES_ENABLED, type SymptomCheckResponse } from "@blw/shared";
import { createTestApp, signUpUser, testEnv, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { encryptSecret, lastFour } from "../ai/crypto.js";

const FAKE_KEY = "sk-ant-api03-switched-off-but-still-stored-0000";

describe("AI features switched off (item 589)", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let user: TestUser;
  let clientRequests: string[];

  beforeEach(async () => {
    clientRequests = [];
    ({ app, db, close } = await createTestApp(
      {},
      {
        aiFeaturesEnabled: false,
        // Would hand back a client if the route ever asked; it must not ask.
        symptom: {
          anthropicForUser: (userId: string) => {
            clientRequests.push(userId);
            return Promise.reject(new Error("the model must not be reached with AI switched off"));
          },
        },
      },
    ));
    user = await signUpUser(app);
  });

  afterEach(async () => {
    await close();
  });

  it("ships switched off", () => {
    // Flip this together with the switch in shared/src/ai-keys.ts.
    expect(AI_FEATURES_ENABLED).toBe(false);
  });

  it("answers every chat and AI-key route exactly like an unknown URL", async () => {
    const unknown = await app.inject({
      method: "GET",
      url: "/api/ai/no-such-route",
      headers: { cookie: user.cookie },
    });
    expect(unknown.statusCode).toBe(404);

    const calls = [
      { method: "GET", url: "/api/account/ai-key" },
      { method: "PUT", url: "/api/account/ai-key", payload: { apiKey: FAKE_KEY } },
      { method: "DELETE", url: "/api/account/ai-key" },
      { method: "GET", url: "/api/ai/threads" },
      { method: "POST", url: "/api/ai/threads", payload: { kind: "blw" } },
      { method: "DELETE", url: "/api/ai/threads/00000000-0000-4000-8000-000000000000" },
      { method: "GET", url: "/api/ai/threads/00000000-0000-4000-8000-000000000000/messages" },
      {
        method: "POST",
        url: "/api/ai/threads/00000000-0000-4000-8000-000000000000/messages",
        payload: { text: "hi" },
      },
    ] as const;
    for (const call of calls) {
      const response = await app.inject({ ...call, headers: { cookie: user.cookie } });
      expect(response.statusCode, `${call.method} ${call.url}`).toBe(404);
      expect(response.json()).toEqual(unknown.json());
    }
  });

  it("gives a user with a stored key the base result, without asking for a client", async () => {
    const [row] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, user.email));
    await db.insert(schema.userAiKeys).values({
      userId: row!.id,
      encryptedKey: encryptSecret(FAKE_KEY, testEnv().KEY_ENCRYPTION_SECRET),
      keyLast4: lastFour(FAKE_KEY),
      lastValidatedAt: new Date(),
    });
    const baby = await app.inject({
      method: "POST",
      url: "/api/babies",
      headers: { cookie: user.cookie },
      payload: { name: "Switch Testbaby", birthDate: "2025-11-24" },
    });
    const babyId = (baby.json() as { id: string }).id;

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/symptom-check",
      headers: { cookie: user.cookie },
      payload: {
        babyId,
        survey: {
          symptoms: ["hives_localized"],
          severity: "mild",
          onsetAt: new Date(Date.now() - 30 * 60_000).toISOString(),
          mealTiming: "under_1h",
          bodyAreas: ["face"],
          notes: null,
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(clientRequests).toEqual([]);
    const { result } = response.json() as SymptomCheckResponse;
    expect(result.kind).toBe("fallback");
    expect(result).not.toHaveProperty("narrative");
    // Every sentence the parent reads: nothing about keys, Anthropic or AI.
    if (result.kind !== "fallback") throw new Error("expected the base result");
    const prose = [...result.nextSteps, ...result.whenToSeekHelp, result.disclaimer].join(" ");
    expect(prose).not.toMatch(/\bkey\b|anthropic|\bAI\b/i);
  });
});

describe("AI features switched off — the app as production builds it (item 589)", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (closers.length) await closers.pop()!();
  });

  async function symptomCheck(app: FastifyInstance, cookie: string, babyId: string) {
    return app.inject({
      method: "POST",
      url: "/api/ai/symptom-check",
      headers: { cookie },
      payload: {
        babyId,
        survey: {
          symptoms: ["hives_localized"],
          severity: "mild",
          onsetAt: new Date(Date.now() - 30 * 60_000).toISOString(),
          mealTiming: "under_1h",
          bodyAreas: ["face"],
          notes: null,
        },
      },
    });
  }

  it("keeps the key and chat routes off when buildApp is given no option, as index.ts calls it", async () => {
    const { app, close } = await createTestApp();
    closers.push(close);
    const user = await signUpUser(app);
    for (const url of ["/api/account/ai-key", "/api/ai/threads"]) {
      const response = await app.inject({ method: "GET", url, headers: { cookie: user.cookie } });
      expect(response.statusCode, url).toBe(404);
    }
  });

  it("still holds the symptom check to the per-user /api/ai/* budget", async () => {
    const { app, close } = await createTestApp({ AI_RATE_LIMIT_MAX: 2 }, { aiFeaturesEnabled: false });
    closers.push(close);
    const user = await signUpUser(app);
    const baby = await app.inject({
      method: "POST",
      url: "/api/babies",
      headers: { cookie: user.cookie },
      payload: { name: "Budget Testbaby", birthDate: "2025-11-24" },
    });
    const babyId = (baby.json() as { id: string }).id;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect((await symptomCheck(app, user.cookie, babyId)).statusCode).toBe(201);
    }
    const limited = await symptomCheck(app, user.cookie, babyId);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
  });
});
