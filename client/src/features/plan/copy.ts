// Plan wording for a container marked gone in Storage and a deleted custom
// food (chair 2026-10-27, VERIFY-p3-c1 #4 and #6; BUILD-3.2's drafts, which
// the owner reviews in the doc). Plain TS so the plan screens (Phase 4) and a
// native shell say the same thing. A gone container shows ONLY its gone line:
// `planFlags` gives it no other flag, so neither does a Copy warning.
import type { PlanFlag, StorageStatus } from "@blw/shared";

type Gone = Exclude<StorageStatus, "active">;

/** The flag line under a planned container. */
export const CONTAINER_GONE_FLAG: Record<Gone, string> = {
  finished: "Marked finished in Storage.",
  discarded: "Marked discarded in Storage.",
};

/** The Copy sheet's note for a gone container it copies. */
export function containerGoneCopyWarning(item: string, status: Gone): string {
  return status === "finished"
    ? `${item} is marked finished in Storage. You can still copy.`
    : `${item} was discarded. You can still copy, then swap it out.`;
}

/** The Copy sheet's note for a deleted custom food it copies (`food_deleted`). */
export function foodDeletedCopyWarning(food: string): string {
  return `${food} was deleted. You can still copy, then swap it out.`;
}

/** Today's one-tap Serve, blocked by a gone container (CD-Serve-Ran-Out's shape). */
export function containerGoneBlocked(item: string, meal: string, status: Gone): string {
  return status === "finished" ? `${item} has run out, so ${meal} isn't served yet.` : `${item} was discarded, so ${meal} isn't served yet.`;
}

/** A planned container's flag line, under its name (PP-COPY rounds 4-5;
 * a gone container's from above). */
export function planFlagLine(flag: PlanFlag): string {
  switch (flag.kind) {
    case "may_run_out":
      return "May run out before this day.";
    case "past_best_by":
      return "Past the Best by date on this day.";
    case "past_use_within":
      return "May not keep until this day.";
    case "container_gone":
      return CONTAINER_GONE_FLAG[flag.status];
  }
}

// ---------------------------------------------------------------------------
// Copy to… (PP-COPY rounds 2-5)
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A clash inside its day's row: "Thu 15 already has a Dinner planned." */
export function clashLine(day: string, meal: string): string {
  return `${day} already has a ${meal} planned.`;
}

/** The pinned footer, with two or more clashes. */
export function clashCountLine(n: number): string {
  return `${n} of the selected meals are already planned.`;
}

/** The row that answers every clash at once: "All {n} days", or "All {n}
 * meals" when a day has two of them, where "days" would miscount (PP-COPY
 * round 4, PP-NOTES round 4 question 3). */
export function allClashesLabel(clashes: readonly { date: string }[]): string {
  const days = new Set(clashes.map((clash) => clash.date)).size;
  return days === clashes.length ? `All ${days} days` : `All ${clashes.length} meals`;
}

/** The light confirmation under the week: how many meals got the copy. */
export function copiedLabel(n: number): string {
  return `Copied to ${plural(n, "meal", "meals")}`;
}

/** The may-run-out note's heading: "2 servings left, planned 3 times". */
export function servingsLeftHeading(left: number, times: number): string {
  return `${plural(left, "serving", "servings")} left, planned ${plural(times, "time", "times")}`;
}

export const mayRunOutCopyWarning = (item: string, day: string): string => `${item} may run out before ${day}. You can still copy.`;
export const pastBestByCopyWarning = (item: string, day: string): string =>
  `${item} will be past the Best by date on ${day}. You can still copy.`;
export const pastUseWithinCopyWarning = (item: string, day: string): string => `${item} may not keep until ${day}. You can still copy.`;

/** A real Copy that failed (the app's "Couldn't … — try again." shape). */
export const COPY_FAILED = "Couldn't copy that — try again.";
