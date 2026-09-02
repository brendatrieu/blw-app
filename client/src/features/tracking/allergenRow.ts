import type { AllergenProgressItem } from "@blw/shared";

export type AllergenRowAction = "mark" | "undo" | "none";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Conservative threshold (item 144): a gap this long or longer since the
 * last serve of an already-started/established allergen earns a muted
 * "keep it up" hint — well past the days-apart cadence the intro guidance
 * recommends between allergens, so it never nags mid-ladder. */
export const RECENCY_HINT_THRESHOLD_DAYS = 14;

export const RECENCY_HINT_COPY = "Consider serving again soon to maintain tolerance.";

/**
 * Whole calendar days between an ISO instant and `now`, counting by local
 * midnight boundaries — the same "Today"/"Yesterday" idiom `ServeLogList`'s
 * `dayLabel` uses, so "1d ago" always means "yesterday", not "somewhere in
 * the last 24-48 hours" depending on time of day.
 */
function daysSince(iso: string, now: Date): number {
  const then = new Date(iso);
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startOfNow.getTime() - startOfThen.getTime()) / MS_PER_DAY);
}

/**
 * Neutral, judgment-free recency fact for an allergen row (item 143):
 * "last served today/yesterday/Xd ago", or "no serves logged yet" for a row
 * established purely by a parent override (no exposure behind it at all —
 * see `unionAllergenStatus`). Never colored; plain muted text only.
 */
export function lastServedLabel(lastServedAt: string | null, now: Date = new Date()): string {
  if (!lastServedAt) return "no serves logged yet";
  const days = daysSince(lastServedAt, now);
  if (days <= 0) return "last served today";
  if (days === 1) return "last served yesterday";
  return `last served ${days}d ago`;
}

/**
 * Whether the past-threshold "consider serving again" hint (item 144) should
 * appear. `null` (never served, e.g. an override-only row) never qualifies —
 * there's no gap to measure, and "no serves logged yet" already says enough.
 */
export function shouldShowRecencyHint(lastServedAt: string | null, now: Date = new Date()): boolean {
  if (!lastServedAt) return false;
  return daysSince(lastServedAt, now) >= RECENCY_HINT_THRESHOLD_DAYS;
}

export interface AllergenRecency {
  /** Muted fact line, or null to render nothing (a not-yet-started row has
   * no recency worth stating — "0 exposures" already covers it). */
  fact: string | null;
  /** Muted inline hint, or null. Allergens-page rows only (item 144) —
   * callers on other surfaces (e.g. Home) simply never call this. */
  hint: string | null;
}

/**
 * Combines the fact + hint for one allergen row. Pure and unit-tested so the
 * gating (not_started rows get neither) can't silently drift from the two
 * helpers above.
 */
export function resolveAllergenRecency(
  item: Pick<AllergenProgressItem, "status" | "lastServedAt">,
  now: Date = new Date(),
): AllergenRecency {
  if (item.status === "not_started") return { fact: null, hint: null };
  return {
    fact: lastServedLabel(item.lastServedAt, now),
    hint: shouldShowRecencyHint(item.lastServedAt, now) ? RECENCY_HINT_COPY : null,
  };
}

/**
 * Which manual-override action an allergen ladder row should offer, mirroring
 * the precedence `unionAllergenStatus` (shared/src/tracking.ts) already
 * pinned server-side:
 *  - A derived-established row (`overridden: false`) needs no action — the
 *    meal log already proves it, so there's nothing to mark or undo.
 *  - An override-established row (`overridden: true`) offers "Undo".
 *  - Anything else (`not_started`/`started`) offers "Mark as established".
 * Pure so the row-state -> action mapping is unit-testable without rendering.
 */
export function resolveAllergenRowAction(
  item: Pick<AllergenProgressItem, "status" | "overridden">,
): AllergenRowAction {
  if (item.status === "established") {
    return item.overridden ? "undo" : "none";
  }
  return "mark";
}
