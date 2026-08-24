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
