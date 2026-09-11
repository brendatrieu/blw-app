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
//     parent actually first saw it.
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { updatePreferencesInputSchema, type UserPreferences } from "@blw/shared";
import type { Database } from "../db/index.js";
import { userPreferences } from "../db/schema.js";

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
      .select({ tourCompletedAt: userPreferences.tourCompletedAt })
      .from(userPreferences)
      .where(eq(userPreferences.userId, currentUserId(request)))
      .limit(1);

    // A missing row and a row with a null timestamp mean the same thing to
    // every caller — "this parent has not seen the tour" — so they answer
    // identically rather than making the client handle two shapes.
    return { tourCompletedAt: row?.tourCompletedAt?.toISOString() ?? null };
  });

  // -----------------------------------------------------------------------
  // PATCH /api/preferences — mark the first-run tour seen, once
  // -----------------------------------------------------------------------
  app.patch("/api/preferences", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = updatePreferencesInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten().fieldErrors });
    }

    const now = new Date();

    // Upsert in one statement so there is no read-then-write window for two
    // tabs to race through. `coalesce(existing, excluded)` is what makes the
    // write idempotent: the proposed timestamp is only taken when the stored
    // one is still null.
    const [row] = await db
      .insert(userPreferences)
      .values({ userId: currentUserId(request), tourCompletedAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          tourCompletedAt: sql`coalesce(${userPreferences.tourCompletedAt}, excluded."tour_completed_at")`,
          updatedAt: now,
        },
      })
      // Whole row: drizzle's field-projection overload of `returning()`
      // does not resolve here once `set` carries a raw `sql` fragment.
      .returning();

    // The upsert always writes a row, and every path through it leaves a
    // non-null timestamp behind.
    const body: UserPreferences = { tourCompletedAt: row?.tourCompletedAt?.toISOString() ?? now.toISOString() };
    return reply.code(200).send(body);
  });
}
