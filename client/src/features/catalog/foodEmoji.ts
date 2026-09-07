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
  tofu: "🍢",
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
 * The emoji this app would suggest for a whole category — the default the
 * custom-food form seeds its emoji field with, and the second-to-last
 * fallback in `getFoodEmoji`. Exported so the form and the resolver can
 * never drift apart on what "the fruit emoji" is.
 */
export function getCategoryEmoji(category: FoodCategory): string {
  return CATEGORY_FALLBACK_EMOJI[category];
}

/**
 * The emoji to show for a food, in priority order (item 177):
 *  1. `emoji` — the food's OWN emoji. Only custom foods ever carry one (a
 *     parent picked it), and when they do it beats every guess below,
 *     including a slug that happens to collide with a seeded one.
 *  2. the curated per-slug map, for seeded catalog foods;
 *  3. the food's category;
 *  4. a generic plate.
 *
 * `emoji` is last in the parameter list, not first, so the pre-existing
 * `getFoodEmoji(slug)` / `getFoodEmoji(slug, category)` calls (pairings,
 * recipe ingredients — shapes that carry no emoji at all) keep compiling
 * unchanged. Blank/whitespace-only and null are treated as "not set", so a
 * cleared emoji field falls through to the map rather than rendering an
 * empty span.
 */
export function getFoodEmoji(slug: string, category?: FoodCategory | null, emoji?: string | null): string {
  const own = emoji?.trim();
  if (own) return own;
  const bySlug = FOOD_EMOJI[slug];
  if (bySlug) return bySlug;
  if (category) return CATEGORY_FALLBACK_EMOJI[category];
  return DEFAULT_EMOJI;
}
