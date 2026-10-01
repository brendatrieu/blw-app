import type { PlateTint } from "../catalog/foodEmoji.js";

/**
 * One emoji per top-9 allergen slug (see `ALLERGEN_SLUGS` in
 * catalog/constants.ts). Lives here rather than inside the ladder page so the
 * ladder row and the allergen detail page render the exact same glyph —
 * mirrors `catalog/foodEmoji.ts` for foods.
 */
export const ALLERGEN_EMOJI: Record<string, string> = {
  milk: "🥛",
  egg: "🥚",
  peanut: "🥜",
  tree_nut: "🌰",
  fish: "🐟",
  shellfish: "🍤",
  wheat: "🌾",
  soy: "🫘",
  sesame: "🫙",
};

/** Emoji for an allergen slug, falling back to a neutral plate glyph. */
export function allergenEmoji(slug: string): string {
  return ALLERGEN_EMOJI[slug] ?? "🍽️";
}

/** Plate tint per allergen slug (item 657), grouped the way the food tints are. */
const ALLERGEN_TINT: Record<string, PlateTint> = {
  milk: "dairy",
  egg: "dairy",
  peanut: "legume",
  tree_nut: "legume",
  sesame: "legume",
  soy: "legume",
  fish: "protein",
  shellfish: "protein",
  wheat: "grain",
};

/** Plate tint for an allergen slug, neutral when unknown. */
export function allergenTint(slug: string): PlateTint {
  return ALLERGEN_TINT[slug] ?? "neutral";
}
