// Per-user app preferences. One row per account, created lazily — an
// account that has never written a preference has no row, and GET answers
// with the defaults it would have had.
//
// Invariants this file exists to hold:
//   * every read and write is scoped to the caller; there is no id in any
//     path here, so a user can only ever address their own row;
//   * `tour_completed_at` only ever moves from null to a timestamp. A second
//     PATCH is a no-op on the value, so replaying the tour (or a retried
//     request, or two tabs finishing at once) never rewrites the date the
//     parent actually first saw it;
//   * PATCH is a PARTIAL update. Only the keys in the body are written, so
//     the Privacy switch can never blank the tour stamp and finishing the
//     tour can never turn sharing back on for somebody who switched it off;
//   * turning sharing off DELETES that account's usage events in the same
//     transaction as the flag. The parent is promised "this also deletes what
//     was already collected", and two statements that can half-succeed would
//     make that promise conditional on the process staying up.
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  DEFAULT_SHARE_USAGE_DATA,
  updatePreferencesInputSchema,
  type UserPreferences,
} from "@blw/shared";
import type { Database } from "../db/index.js";
import { usageEvents, userPreferences } from "../db/schema.js";

/** Every handler here sits behind requireAuth; this makes that explicit. */
function currentUserId(request: FastifyRequest): string {
  const id = request.user?.id;
  if (!id) {
    throw new Error("currentUserId called on an unauthenticated request");
  }
  return id;
}

export function registerPreferenceRoutes(app: FastifyInstance, db: Database): void {
  // -----------------------------------------------------------------------
  // GET /api/preferences — the row, or the defaults for an account with none
  // -----------------------------------------------------------------------
  app.get("/api/preferences", { preHandler: app.requireAuth }, async (request): Promise<UserPreferences> => {
    const [row] = await db
      .select({
        tourCompletedAt: userPreferences.tourCompletedAt,
        shareUsageData: userPreferences.shareUsageData,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, currentUserId(request)))
      .limit(1);

    // A missing row and a row with a null timestamp mean the same thing to
    // every caller — "this parent has not seen the tour" — so they answer
    // identically rather than making the client handle two shapes. The same
    // reasoning gives a row-less account the sharing DEFAULT rather than a
    // third state the Privacy switch would have to render.
    return {
      tourCompletedAt: row?.tourCompletedAt?.toISOString() ?? null,
      shareUsageData: row?.shareUsageData ?? DEFAULT_SHARE_USAGE_DATA,
    };
  });

  // -----------------------------------------------------------------------
  // PATCH /api/preferences — partial update; turning sharing off also wipes
  // -----------------------------------------------------------------------
  app.patch("/api/preferences", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = updatePreferencesInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten().fieldErrors });
    }

    const userId = currentUserId(request);
    const { tourCompleted, shareUsageData } = parsed.data;
    const now = new Date();

    // Only the keys that were actually sent end up in `set`, which is what
    // makes this a partial update at the SQL level rather than a read-modify-
    // write the next request could race with.
    const set: Record<string, unknown> = { updatedAt: now };
    if (tourCompleted !== undefined) {
      // `coalesce(existing, excluded)` is what makes the write idempotent:
      // the proposed timestamp is only taken when the stored one is null.
      set.tourCompletedAt = sql`coalesce(${userPreferences.tourCompletedAt}, excluded."tour_completed_at")`;
    }
    if (shareUsageData !== undefined) {
      set.shareUsageData = shareUsageData;
    }

    const row = await db.transaction(async (tx) => {
      // Upsert in one statement so there is no read-then-write window for two
      // tabs to race through.
      const [upserted] = await tx
        .insert(userPreferences)
        .values({
          userId,
          tourCompletedAt: tourCompleted ? now : null,
          shareUsageData: shareUsageData ?? DEFAULT_SHARE_USAGE_DATA,
          updatedAt: now,
        })
        .onConflictDoUpdate({ target: userPreferences.userId, set })
        // Whole row: drizzle's field-projection overload of `returning()`
        // does not resolve here once `set` carries a raw `sql` fragment.
        .returning();

      // The wipe rides with the flag. Same transaction, so there is no state
      // in which sharing reads "off" while the collected rows are still
      // there — including the case where the process dies between the two.
      if (shareUsageData === false) {
        await tx.delete(usageEvents).where(eq(usageEvents.userId, userId));
      }

      return upserted;
    });

    const body: UserPreferences = {
      tourCompletedAt: row?.tourCompletedAt?.toISOString() ?? (tourCompleted ? now.toISOString() : null),
      shareUsageData: row?.shareUsageData ?? shareUsageData ?? DEFAULT_SHARE_USAGE_DATA,
    };
    return reply.code(200).send(body);
  });
}
