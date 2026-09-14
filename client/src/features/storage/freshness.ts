import type { StorageItem } from "@blw/shared";
import { formatYmd } from "../../components/ui/DateField.js";

/**
 * One place decides how fresh a storage item is (item 333).
 *
 * The server derives `expiresAt`/`useSoon`/`expired` from `preparedAt` + the
 * food's storage window, and it has to: it never learns the parent's
 * timezone, so it cannot say which local calendar day a `YYYY-MM-DD` best-by
 * date is. The parent's own best-by date is the better answer whenever there
 * IS one — two containers with the same date used to disagree because their
 * foods carried different windows — so the resolution happens HERE, on the
 * client, where "today" is a real thing.
 *
 * Deliberately a leaf module: it imports one pure date helper and the shared
 * types, nothing from the storage feature's own hooks/components, so
 * `lib/usage/properties.ts` can read the same rule without closing a cycle.
 */

/** How an item reads right now — the same three words the
 * `storage_item_closed` event's `freshness_at_change` property uses. */
export type FreshnessState = "fresh" | "use_soon" | "expired";

/** Which rule decided it: the parent's own best-by date, or the category
 * storage window the server's flags come from. */
export type FreshnessSource = "best_by" | "window";

export interface Freshness {
  state: FreshnessState;
  source: FreshnessSource;
  /** The instant the item stops being good: local midnight AFTER the best-by
   * day, or the server's `expiresAt`. Ordering the active list by it puts the
   * thing to eat next at the top regardless of which rule set it. */
  endsAt: Date;
}

/** Everything a freshness decision reads off a storage item, and nothing
 * else — so a test (or `freshnessAtChange`) can hand it a bare object. */
export type FreshnessInput = Pick<StorageItem, "bestBy" | "expiresAt" | "useSoon" | "expired">;

/** A `Date`'s own local calendar day as `YYYY-MM-DD`, in the same spelling a
 * best-by date arrives in — zero-padded, so `<`/`>` on the strings sort
 * chronologically without parsing either side back into a Date. */
function localYmd(date: Date): string {
  return formatYmd({ year: date.getFullYear(), month: date.getMonth(), day: date.getDate() });
}

/**
 * The freshness of one storage item at `now`.
 *
 * With a best-by date the window is ignored entirely: the item is good until
 * local midnight after the named day ("best by the 14th" means the 14th is
 * still fine), Use soon on the day itself and the day before it, and Expired
 * once that midnight has passed — even when the server still calls it fresh,
 * and fresh even when the server calls it expired. Without one, the server's
 * flags pass straight through unchanged.
 */
export function resolveFreshness(item: FreshnessInput, now: Date = new Date()): Freshness {
  if (item.bestBy) {
    const [year, month, day] = item.bestBy.split("-").map(Number);
    // Local calendar fields, NOT `new Date(item.bestBy)` — that would parse
    // the string as a UTC instant and land on the wrong day west of UTC.
    const endsAt = new Date(year!, month! - 1, day! + 1);
    if (now.getTime() >= endsAt.getTime()) return { state: "expired", source: "best_by", endsAt };
    const today = localYmd(now);
    const tomorrow = localYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const state: FreshnessState = item.bestBy === today || item.bestBy === tomorrow ? "use_soon" : "fresh";
    return { state, source: "best_by", endsAt };
  }

  return {
    state: item.expired ? "expired" : item.useSoon ? "use_soon" : "fresh",
    source: "window",
    endsAt: new Date(item.expiresAt),
  };
}

/**
 * The active storage list in "eat this next" order — soonest `endsAt` first,
 * best-by and window items interleaved on the one scale.
 *
 * Stable: items that end at the same instant keep the server's order (which
 * is itself deterministic), pinned by the explicit index tie-break rather
 * than trusting the engine's sort. Returns a new array; the input is never
 * mutated, because it is a react-query cache value.
 */
export function sortActiveByFreshness<T extends FreshnessInput>(items: readonly T[], now: Date = new Date()): T[] {
  return items
    .map((item, index) => ({ item, index, endsAt: resolveFreshness(item, now).endsAt.getTime() }))
    .sort((a, b) => a.endsAt - b.endsAt || a.index - b.index)
    .map((entry) => entry.item);
}

/**
 * Whether a best-by date names a calendar day BEFORE the day the food was
 * prepared — the one combination no parent means ("best by yesterday" on
 * something cooked today is a mis-tap on the wheel, not a fact).
 *
 * Both sides are compared as LOCAL calendar days: the parent picked the
 * best-by day on a local wheel and prepared the food at a local moment, so
 * anything else would reject a legitimate same-day entry near midnight. An
 * unset best-by (`""`/null) is never an error — the field is optional.
 */
export function isBestByBeforePrepared(
  bestBy: string | null | undefined,
  preparedAt: Date | string | null | undefined,
): boolean {
  if (!bestBy || !preparedAt) return false;
  const prepared = preparedAt instanceof Date ? preparedAt : new Date(preparedAt);
  if (Number.isNaN(prepared.getTime())) return false;
  return bestBy < localYmd(prepared);
}

/** The one sentence every best-by field shows for that mistake, so the add,
 * edit and leftovers forms cannot word it three ways. */
export const BEST_BY_BEFORE_PREPARED_MESSAGE = "Best by can't be before the prepared date";
