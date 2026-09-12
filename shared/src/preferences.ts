import { z } from "zod";

/**
 * Per-user app preferences.
 *
 * One row per account, created lazily: an account that has never written a
 * preference has no row at all, and `GET /api/preferences` answers with the
 * same defaults it would have had. Everything here is a *fact about this
 * user's app state*, never content — the tour's "seen" flag lives server-side
 * so it follows the parent across devices and a reinstalled PWA, which a
 * localStorage flag would not.
 */

// ---------------------------------------------------------------------------
// GET /api/preferences
// ---------------------------------------------------------------------------

/**
 * `tourCompletedAt` is the first time the first-run tour was finished OR
 * skipped — both are "this parent has seen it". Null means they have not,
 * which is what opens the tour dialog over their first authenticated screen.
 * It is a timestamp rather than a boolean so a future "what's new since"
 * tour has a date to compare against.
 */
export const userPreferencesSchema = z.object({
  tourCompletedAt: z.string().datetime().nullable(),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

// ---------------------------------------------------------------------------
// PATCH /api/preferences
// ---------------------------------------------------------------------------

/**
 * `true` only: there is no "un-see the tour" — replaying it from More
 * deliberately does not clear the flag (see `resolveTourExit` on the client),
 * so `false` would be a request the server has no meaning for and is rejected
 * rather than silently ignored.
 */
export const updatePreferencesInputSchema = z.object({
  tourCompleted: z.literal(true),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesInputSchema>;
