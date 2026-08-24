import type { FoodCategory } from "@blw/shared";

/**
 * Explicit emoji per seed food slug — one entry for every food in
 * `server/db/seeds/data/foods.ts` (40 as of writing). Kept as a plain
 * record rather than derived from the food's name/category so each choice
 * can be a deliberate, recognizable piece of art rather than a guess.
 */
const FOOD_EMOJI: Record<string, string> = {
  // Iron anchors
  beef: "🥩",
  chicken_thigh: "🍗",
  salmon: "🐟",
  sardines: "🐟",
  egg: "🥚",
  lentils: "🍲",
  chickpeas: "🫘",
  black_beans: "🫘",
  tofu: "🧊",
  iron_fortified_oats: "🥣",
  spinach: "🥬",
  quinoa: "🌾",

  // Vitamin-C pairing foods
  broccoli: "🥦",
  bell_pepper: "🫑",
  strawberry: "🍓",
  orange: "🍊",
  kiwi: "🥝",
  mango: "🥭",
  tomato: "🍅",
  sweet_potato: "🍠",
  butternut_squash: "🎃",

  // Allergen vehicles
  peanut_butter: "🥜",
  almond_butter: "🌰",
  tahini: "🫙",
  yogurt: "🥣",
  cheese: "🧀",
  wheat_toast: "🍞",
  wheat_pasta: "🍝",
  shrimp: "🍤",

  // Staples
  avocado: "🥑",
  banana: "🍌",
  apple: "🍎",
  pear: "🍐",
  blueberry: "🫐",
  carrot: "🥕",
  zucchini: "🥒",
  green_beans: "🫛",
  peas: "🟢",
  rice: "🍚",
  watermelon: "🍉",
};

/** Fallback emoji when a food's slug isn't in `FOOD_EMOJI` (e.g. a future seed addition). */
const CATEGORY_FALLBACK_EMOJI: Record<FoodCategory, string> = {
  protein: "🍗",
  veg: "🥦",
  fruit: "🍎",
  grain: "🌾",
  dairy: "🥛",
  legume: "🫘",
};

/** Emoji shown when neither the slug nor a category is available. */
const DEFAULT_EMOJI = "🍽️";

/**
 * The emoji to show for a food. Looks up the exact slug first, falls back
 * to the food's category, and finally to a generic plate.
 */
export function getFoodEmoji(slug: string, category?: FoodCategory | null): string {
  const bySlug = FOOD_EMOJI[slug];
  if (bySlug) return bySlug;
  if (category) return CATEGORY_FALLBACK_EMOJI[category];
  return DEFAULT_EMOJI;
}
