// Anthropic client construction and the per-user guard rails around it.
//
// Every AI call in this app runs on the requesting user's own key: it is
// decrypted per request, handed to a short-lived client, and never logged,
// cached across users, or echoed back. A user with no key on file is not an
// error condition — the AI features are optional, so their routes answer
// 403 `ai_unavailable` and the UI falls back to its non-AI path.
import Anthropic, { AuthenticationError, NotFoundError, PermissionDeniedError } from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, preHandlerAsyncHookHandler } from "fastify";
import type { Env } from "../config.js";
import type { Database } from "../db/index.js";
import { userAiKeys } from "../db/schema.js";
import { decryptSecret } from "./crypto.js";

/**
 * Model asked for during key validation. `models.retrieve` is the cheapest
 * authenticated call the API offers — it costs the user nothing in tokens
 * while still proving the key is live and not revoked.
 */
export const AI_VALIDATION_MODEL = "claude-sonnet-5";

const HOUR_MS = 60 * 60 * 1000;

/** Ten seconds is generous for a metadata lookup and keeps PUT responsive. */
const VALIDATION_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Live key validation
// ---------------------------------------------------------------------------

export type ApiKeyVerification =
  | { ok: true }
  /** The key itself was rejected — do not store it. */
  | { ok: false; reason: "invalid_key" }
  /** Anthropic could not be reached; the key may well be fine. */
  | { ok: false; reason: "unavailable" };

export type ApiKeyVerifier = (apiKey: string) => Promise<ApiKeyVerification>;

/**
 * Default verifier: one authenticated round trip to Anthropic with the
 * submitted key.
 *
 * `maxRetries: 0` matters — the SDK retries 429s and 5xxs by default, which
 * would turn a save into a multi-second stall on a form the parent is
 * watching. A transient failure surfaces as `unavailable` and they can retry
 * by pressing the button again.
 */
export const verifyAnthropicKey: ApiKeyVerifier = async (apiKey) => {
  const client = new Anthropic({
    apiKey,
    maxRetries: 0,
    timeout: VALIDATION_TIMEOUT_MS,
  });

  try {
    await client.models.retrieve(AI_VALIDATION_MODEL);
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
      return { ok: false, reason: "invalid_key" };
    }
    // A 404 means the request authenticated and the account simply cannot see
    // that model id (older org, restricted workspace). The key is real, which
    // is all this check is for — accept it rather than locking the user out
    // over a model name this file happens to hardcode.
    if (error instanceof NotFoundError) {
      return { ok: true };
    }
    return { ok: false, reason: "unavailable" };
  }
};

// ---------------------------------------------------------------------------
// Per-request client for a stored key
// ---------------------------------------------------------------------------

/**
 * Builds an Anthropic client from the caller's stored key, or returns null
 * when they have none on file (or when the stored blob no longer decrypts,
 * e.g. after a KEY_ENCRYPTION_SECRET rotation — indistinguishable from "no
 * key" as far as the caller is concerned, and handled the same way).
 *
 * The returned client holds the plaintext key in memory for the life of the
 * request only; never hoist it into a module-level cache.
 */
export async function getAnthropicForUser(
  db: Database,
  userId: string,
  secret: string,
): Promise<Anthropic | null> {
  const [row] = await db
    .select({ encryptedKey: userAiKeys.encryptedKey })
    .from(userAiKeys)
    .where(eq(userAiKeys.userId, userId))
    .limit(1);

  if (!row) return null;

  let apiKey: string;
  try {
    apiKey = decryptSecret(row.encryptedKey, secret);
  } catch {
    // Deliberately swallowed without the payload: anything derived from the
    // ciphertext is key material and must not reach the log.
    return null;
  }

  return new Anthropic({ apiKey });
}

/**
 * The single response every AI route gives a user without a key on file.
 * 403 (not 402/404) because the request is well-formed and the resource
 * exists — the caller just has not granted the app the credential it needs.
 */
export function aiUnavailable(reply: FastifyReply): FastifyReply {
  return reply.code(403).send({ error: "ai_unavailable" });
}

// ---------------------------------------------------------------------------
// Per-user rate limiting
// ---------------------------------------------------------------------------

interface Window {
  count: number;
  resetAt: number;
}

export interface PerUserRateLimit {
  /**
   * Records one request against `userId`. Returns null when it is allowed,
   * or the number of seconds until the window resets when it is not.
   */
  consume(userId: string): number | null;
}

/**
 * Fixed-window counter keyed by user id.
 *
 * `@fastify/rate-limit` cannot do this job: its key generator runs in the
 * onRequest phase, before `requireAuth` has resolved a session, so the only
 * identity available to it is the IP — which would punish a whole household
 * behind one NAT and would not protect an individual user's API bill at all.
 * The app is single-process, so an in-memory map is the same storage the
 * plugin's own default store uses.
 */
export function createPerUserRateLimit(max: number, windowMs: number = HOUR_MS): PerUserRateLimit {
  const windows = new Map<string, Window>();

  return {
    consume(userId: string): number | null {
      const now = Date.now();

      // Bounded sweep: keeps the map from growing with every user who ever
      // signed in, without a timer that would hold the process open.
      if (windows.size > 1000) {
        for (const [key, window] of windows) {
          if (window.resetAt <= now) windows.delete(key);
        }
      }

      const existing = windows.get(userId);
      if (!existing || existing.resetAt <= now) {
        windows.set(userId, { count: 1, resetAt: now + windowMs });
        return null;
      }

      if (existing.count >= max) {
        return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      }

      existing.count += 1;
      return null;
    },
  };
}

/** 429 in the app's snake_case error shape, with a standard retry-after. */
export function rateLimited(reply: FastifyReply, retryAfterSeconds: number): FastifyReply {
  return reply
    .code(429)
    .header("retry-after", String(retryAfterSeconds))
    .send({ error: "rate_limited", retryAfterSeconds });
}

/**
 * Builds a preHandler enforcing a per-user hourly budget. Must run *after*
 * `app.requireAuth` in a route's preHandler chain so `request.user` is set;
 * an anonymous request is left alone (requireAuth already rejected it).
 */
export function perUserRateLimitHook(limit: PerUserRateLimit): preHandlerAsyncHookHandler {
  return async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) return undefined;

    const retryAfter = limit.consume(userId);
    if (retryAfter !== null) {
      return rateLimited(reply, retryAfter);
    }
    return undefined;
  };
}

/**
 * Installs the shared `/api/ai/*` budget (default 20/hour/user) across every
 * AI route, whichever module declares it.
 *
 * An `onRoute` hook is the only place this can be attached generically: it
 * appends the limiter to each matching route's preHandler chain, which puts
 * it after `requireAuth` (routes list that first) and therefore after
 * `request.user` exists. Routes registered *before* this call are not
 * covered, so it runs first inside `app.after()` in app.ts.
 */
export function registerAiRateLimit(app: FastifyInstance, env: Env): void {
  const limit = createPerUserRateLimit(env.AI_RATE_LIMIT_MAX);
  const hook = perUserRateLimitHook(limit);

  app.addHook("onRoute", (routeOptions) => {
    if (!routeOptions.url.startsWith("/api/ai/")) return;

    const existing = routeOptions.preHandler;
    routeOptions.preHandler = Array.isArray(existing)
      ? [...existing, hook]
      : existing
        ? [existing, hook]
        : [hook];
  });
}
