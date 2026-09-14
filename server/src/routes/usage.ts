// Anonymous usage ingest. One endpoint, and every rule it holds is about
// what it REFUSES to learn:
//
//   * the row's `user_id` comes from the caller's session and from nowhere
//     else — the body has no place to put one (the shared schema is
//     `.strict()`), so a client cannot attribute events to another account
//     even by trying;
//   * a caller who has switched sharing off gets a 204 and nothing is
//     written. Not a 403 that tells a script the account exists, and not a
//     silent write "just for now";
//   * the client's clock is clamped, so a wrong device date cannot bend a
//     cohort chart;
//   * the primary key is the client's own uuid, so a replayed batch — a
//     flush whose response the browser never saw — inserts nothing twice.
//
// The path is `/api/usage` on purpose: EasyPrivacy and friends block
// `/api/event`, `/api/collect` and `/track`, and an endpoint that silently
// fails for a third of parents produces data that is worse than none.
import { eq } from "drizzle-orm";
import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { DEFAULT_SHARE_USAGE_DATA, clampOccurredAt, ingestUsageInputSchema } from "@blw/shared";
import { createPerUserRateLimit, rateLimited } from "../ai/client.js";
import type { Env } from "../config.js";
import type { Database } from "../db/index.js";
import { usageEvents, userPreferences } from "../db/schema.js";

/**
 * 32 KB. A full 50-event batch of this shape is a few KB, so the limit is
 * roughly an order of magnitude of headroom — and a hard stop long before
 * anything large enough to be a document could arrive.
 */
export const USAGE_BODY_LIMIT_BYTES = 32 * 1024;

/**
 * Drops repeats inside one batch, keeping the first.
 *
 * `ON CONFLICT DO NOTHING` dedupes against rows already in the table; two
 * copies of the same id inside a single INSERT are a different case, and
 * rather than depend on how the driver resolves it, the batch is made unique
 * before it is sent.
 */
export function dedupeById<T extends { id: string }>(events: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    unique.push(event);
  }
  return unique;
}

export function registerUsageRoutes(app: FastifyInstance, db: Database, env: Env): void {
  /**
   * Per-caller hourly budget, keyed by user id when there is a session and by
   * IP when there is not.
   *
   * The anonymous key matters: `/login` and `/signup` are measured too, so
   * the endpoint has to accept requests with no session — and an endpoint
   * that accepts anonymous writes and only rate-limits the signed-in ones is
   * an open funnel into the disk of a 50 GB VM.
   */
  const limit = createPerUserRateLimit(env.USAGE_RATE_LIMIT_MAX);
  const usageBudget: preHandlerAsyncHookHandler = async (request, reply) => {
    const key = request.user?.id ?? `ip:${request.ip}`;
    const retryAfter = limit.consume(key);
    if (retryAfter !== null) {
      return rateLimited(reply, retryAfter);
    }
    return undefined;
  };

  app.post(
    "/api/usage",
    {
      bodyLimit: USAGE_BODY_LIMIT_BYTES,
      preHandler: [app.resolveOptionalUser, usageBudget],
    },
    async (request, reply) => {
      const parsed = ingestUsageInputSchema.safeParse(request.body);
      if (!parsed.success) {
        // Deliberately no `details`: nothing on the client renders them, and
        // echoing a rejected payload back is the one way this endpoint could
        // become a mirror for whatever was mistakenly put in it.
        return reply.code(400).send({ error: "invalid_request" });
      }

      const userId = request.user?.id ?? null;

      if (userId) {
        const [row] = await db
          .select({ shareUsageData: userPreferences.shareUsageData })
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);

        // No row is the lazy-creation state, which means the default — the
        // same answer GET /api/preferences gives.
        const sharing = row?.shareUsageData ?? DEFAULT_SHARE_USAGE_DATA;
        if (!sharing) {
          // 204, exactly like a stored batch. A distinguishable response
          // would let a caller probe another account's setting, and the
          // client has nothing to do differently either way.
          return reply.code(204).send();
        }
      }

      const receivedAt = new Date();
      const rows = dedupeById(parsed.data.events).map((event) => ({
        id: event.id,
        userId,
        name: event.name,
        props: event.props,
        route: event.route,
        appVersion: event.appVersion,
        context: event.context,
        occurredAt: clampOccurredAt(new Date(event.occurredAt), receivedAt),
        receivedAt,
      }));

      await db.insert(usageEvents).values(rows).onConflictDoNothing({ target: usageEvents.id });

      return reply.code(204).send();
    },
  );
}
