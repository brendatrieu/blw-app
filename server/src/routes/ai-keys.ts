// Bring-your-own Anthropic key: the only place a user's API key enters the
// system, and the only place it is ever accepted.
//
// Invariants this file exists to hold:
//   * the key is validated against Anthropic *before* anything is stored, so
//     a typo never becomes a silently broken AI feature discovered days later;
//   * only the ciphertext and the last four characters ever reach the
//     database, and only the last four ever leave it;
//   * no response, log line, or error message contains key material.
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { saveAiKeyInputSchema, type AiKeyStatus, type SaveAiKeyResponse } from "@blw/shared";
import {
  createPerUserRateLimit,
  getAnthropicForUser,
  perUserRateLimitHook,
  registerAiRateLimit,
  verifyAnthropicKey,
  type ApiKeyVerifier,
} from "../ai/client.js";
import { encryptSecret, lastFour } from "../ai/crypto.js";
import type { Env } from "../config.js";
import type { Database } from "../db/index.js";
import { userAiKeys } from "../db/schema.js";

declare module "fastify" {
  interface FastifyInstance {
    /**
     * An Anthropic client on the given user's own key, or null when they
     * have not configured one. Decorated here so AI feature routes keep the
     * `registerXxxRoutes(app, db)` signature without also threading `env`
     * through for the encryption secret.
     */
    anthropicForUser: (userId: string) => Promise<Anthropic | null>;
  }
}

export interface AiKeyRoutesOptions {
  env: Env;
  /**
   * Injectable so tests can exercise the accept/reject/unreachable branches
   * without touching the network. Production uses the real round trip.
   */
  verifyApiKey?: ApiKeyVerifier;
}

/** Every handler here sits behind requireAuth; this makes that explicit. */
function currentUserId(request: FastifyRequest): string {
  const id = request.user?.id;
  if (!id) {
    throw new Error("currentUserId called on an unauthenticated request");
  }
  return id;
}

/**
 * One error code for every rejected key — a bad shape and a revoked key are
 * the same problem from the parent's point of view ("this key won't work"),
 * and collapsing them means the response never hints at how far into
 * validation a guessed key got.
 */
function invalidKey(reply: FastifyReply, details?: unknown): FastifyReply {
  return reply.code(400).send(details === undefined ? { error: "invalid_key" } : { error: "invalid_key", details });
}

export function registerAiKeyRoutes(app: FastifyInstance, db: Database, options: AiKeyRoutesOptions): void {
  const { env } = options;
  const verifyApiKey = options.verifyApiKey ?? verifyAnthropicKey;

  // Installed from here (rather than app.ts) so the shared /api/ai/* budget
  // and the routes that hand out the key it protects stay in one place.
  registerAiRateLimit(app, env);

  app.decorate("anthropicForUser", (userId: string) =>
    getAnthropicForUser(db, userId, env.KEY_ENCRYPTION_SECRET),
  );

  // Saving costs the user nothing in tokens but does spend a live API call
  // per attempt, so it gets a much tighter budget than the AI routes.
  const saveRateLimit = perUserRateLimitHook(createPerUserRateLimit(env.AI_KEY_RATE_LIMIT_MAX));

  // -------------------------------------------------------------------
  // GET /api/account/ai-key — status only, never key material
  // -------------------------------------------------------------------
  app.get(
    "/api/account/ai-key",
    { preHandler: app.requireAuth },
    async (request): Promise<AiKeyStatus> => {
      const [row] = await db
        .select({ keyLast4: userAiKeys.keyLast4, lastValidatedAt: userAiKeys.lastValidatedAt })
        .from(userAiKeys)
        .where(eq(userAiKeys.userId, currentUserId(request)))
        .limit(1);

      if (!row) return { configured: false };

      return {
        configured: true,
        last4: row.keyLast4,
        lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
      };
    },
  );

  // -------------------------------------------------------------------
  // PUT /api/account/ai-key — validate live, then store encrypted
  // -------------------------------------------------------------------
  app.put(
    "/api/account/ai-key",
    { preHandler: [app.requireAuth, saveRateLimit] },
    async (request, reply) => {
      const parsed = saveAiKeyInputSchema.safeParse(request.body);
      if (!parsed.success) {
        // Shape rejection happens before any network call: a pasted password
        // or an empty field never leaves the process.
        return invalidKey(reply, parsed.error.flatten().fieldErrors);
      }

      const { apiKey } = parsed.data;

      const verification = await verifyApiKey(apiKey);
      if (!verification.ok) {
        if (verification.reason === "unavailable") {
          // The key may be perfectly good — refusing to store an unverified
          // key is safer than half-configuring the account, and 503 tells
          // the UI to say "try again" rather than "your key is wrong".
          return reply.code(503).send({ error: "validation_unavailable" });
        }
        return invalidKey(reply);
      }

      const last4 = lastFour(apiKey);
      const encryptedKey = encryptSecret(apiKey, env.KEY_ENCRYPTION_SECRET);
      const now = new Date();

      await db
        .insert(userAiKeys)
        .values({
          userId: currentUserId(request),
          encryptedKey,
          keyLast4: last4,
          lastValidatedAt: now,
        })
        .onConflictDoUpdate({
          target: userAiKeys.userId,
          set: { encryptedKey, keyLast4: last4, lastValidatedAt: now },
        });

      const body: SaveAiKeyResponse = { last4 };
      return reply.code(200).send(body);
    },
  );

  // -------------------------------------------------------------------
  // DELETE /api/account/ai-key — idempotent removal
  // -------------------------------------------------------------------
  app.delete("/api/account/ai-key", { preHandler: app.requireAuth }, async (request, reply) => {
    // Deleting a key that was never there is a success, not a 404: the
    // caller's intent ("I want no key on file") is satisfied either way, and
    // a 404 would leak whether a key existed.
    await db.delete(userAiKeys).where(eq(userAiKeys.userId, currentUserId(request)));
    return reply.code(204).send();
  });
}
