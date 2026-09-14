import type { UpdatePreferencesInput, UserPreferences } from "@blw/shared";
import { apiGet, apiPatch } from "../../lib/api.js";

export function fetchPreferences(): Promise<UserPreferences> {
  return apiGet<UserPreferences>("/api/preferences");
}

/**
 * Marks the first-run tour seen. Idempotent on the server — a second call
 * never moves the stored timestamp — so a retry, or two tabs finishing the
 * tour at once, cannot rewrite the date the parent first saw it.
 */
export function completeTour(): Promise<UserPreferences> {
  return apiPatch<UserPreferences>("/api/preferences", { tourCompleted: true });
}

/**
 * The general form of the same PATCH. The server writes only the keys that
 * are present, so `{ shareUsageData }` can never blank the tour stamp and
 * `{ tourCompleted }` can never re-enable sharing somebody switched off —
 * which is exactly why the Privacy switch uses this rather than a whole-row
 * PUT.
 */
export function updatePreferences(input: UpdatePreferencesInput): Promise<UserPreferences> {
  return apiPatch<UserPreferences>("/api/preferences", input);
}
