import type { AgeStage } from "@blw/shared";

/**
 * Maps a baby's age in months to the recipe age-stage tab it should default
 * to: 6-8mo -> "6", 9-11mo -> "9", 12mo+ -> "12". No age (baby still
 * loading, or none selected) falls back to "6", the earliest and most
 * conservative stage.
 */
export function stageForAge(months: number | null | undefined): AgeStage {
  if (months == null) return "6";
  if (months < 9) return "6";
  if (months < 12) return "9";
  return "12";
}

/** The three stages in age order — the order the tab strip renders them in. */
const STAGE_ORDER: AgeStage[] = ["6", "9", "12"];

/**
 * Clamps a requested stage to one the recipe actually carries.
 *
 * Most catalog recipes carry all three stages, but a food held back on the
 * allergen ladder starts later — shrimp is 9 months up (item 253), so its
 * recipe has no "6" variant at all. Asking for "6" there must resolve to the
 * earliest stage that exists; otherwise the page highlights the 6mo tab over
 * 9-month prep and labels shellfish as 6-month food.
 *
 * A stage above everything available falls back to the latest available, so
 * the answer is always the closest guidance that was actually written.
 * Returns null when the recipe carries no stages at all.
 */
export function clampStageToAvailable(requested: AgeStage, available: readonly AgeStage[]): AgeStage | null {
  const present = STAGE_ORDER.filter((stage) => available.includes(stage));
  if (present.length === 0) return null;
  if (present.includes(requested)) return requested;
  const requestedIndex = STAGE_ORDER.indexOf(requested);
  // Prefer the nearest stage BELOW the request (younger, more conservative
  // prep); with nothing below, take the earliest stage above it.
  const below = present.filter((stage) => STAGE_ORDER.indexOf(stage) < requestedIndex);
  return below.length > 0 ? below[below.length - 1]! : present[0]!;
}
