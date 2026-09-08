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
