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
