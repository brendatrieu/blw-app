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
  /**
   * Whether this account shares anonymous usage data (see shared/src/usage.ts).
   * On by default — the events are buckets and enums with no way to carry
   * anything about a child — and turned off from Settings, which also deletes
   * everything already collected for the account in the same transaction.
   */
  shareUsageData: z.boolean(),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

/**
 * What an account with no row gets, on both sides of the wire. Exported so
 * the client's Privacy switch and the server's GET cannot disagree about
 * what "never written a preference" means.
 */
export const DEFAULT_SHARE_USAGE_DATA = true;

// ---------------------------------------------------------------------------
// PATCH /api/preferences
// ---------------------------------------------------------------------------

/**
 * A PARTIAL update: only the keys present are written, so the Privacy switch
 * can never blank the tour flag and finishing the tour can never re-enable
 * sharing somebody turned off.
 *
 * `tourCompleted` is `true` only: there is no "un-see the tour" — replaying it
 * from More deliberately does not clear the flag (see `resolveTourExit` on the
 * client), so `false` would be a request the server has no meaning for and is
 * rejected rather than silently ignored. `shareUsageData` takes both, because
 * both directions are real: off deletes, on resumes.
 *
 * An empty body is rejected rather than treated as a no-op — a PATCH that
 * changes nothing is a caller bug, and answering 200 to it hides the bug.
 */
export const updatePreferencesInputSchema = z
  .object({
    tourCompleted: z.literal(true).optional(),
    shareUsageData: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.tourCompleted !== undefined || value.shareUsageData !== undefined,
    { message: "at least one preference must be given" },
  );
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesInputSchema>;
