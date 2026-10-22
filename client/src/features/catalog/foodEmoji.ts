import type { FoodCategory } from "@blw/shared";

/**
 * Explicit emoji per seed food slug — one entry for every food in
 * `server/db/seeds/data/foods.ts` (92 as of writing, pinned slug-by-slug in
 * `foodEmoji.test.ts` so a seed addition cannot quietly fall through to the
 * category fallback). Kept as a plain
 * record rather than derived from the food's name/category so each choice
 * can be a deliberate, recognizable piece of art rather than a guess.
 */
export const FOOD_EMOJI: Record<string, string> = {
  // Iron anchors
  beef: "🥩",
  chicken_thigh: "🍗",
  salmon: "🐟",
  sardines: "🐟",
  egg: "🥚",
  lentils: "🍲",
  chickpeas: "🫘",
  black_beans: "🫘",
  // Ledger 841: the beans share black beans' emoji; edamame takes the pod, like green beans.
  kidney_beans: "🫘",
  pinto_beans: "🫘",
  white_beans: "🫘",
  butter_beans: "🫘",
  edamame: "🫛",
  tofu: "🍢",
  iron_fortified_oats: "🥣",
  spinach: "🥬",
  quinoa: "🌾",

  // Vitamin-C pairing foods
  broccoli: "🥦",
  cauliflower: "🥦",
  // No sprout emoji in Unicode; the leafy green spinach already uses (ledger 835).
  brussels_sprouts: "🥬",
  kale: "🥬",
  onion: "🧅",
  bell_pepper: "🫑",
  strawberry: "🍓",
  orange: "🍊",
  lemon: "🍋",
  kiwi: "🥝",
  mango: "🥭",
  tomato: "🍅",
  sweet_potato: "🍠",
  butternut_squash: "🎃",
  pumpkin: "🎃",

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
  // No cranberry emoji; cherries are the nearest small red berry (ledger 835).
  cranberries: "🍒",
  carrot: "🥕",
  potato: "🥔",
  // No beet emoji that older phones draw (🫜 is Emoji 16); peas set the colored-dot precedent.
  beets: "🟣",
  zucchini: "🥒",
  green_beans: "🫛",
  peas: "🟢",
  rice: "🍚",
  watermelon: "🍉",

  // Plain meats
  chicken: "🍗",
  turkey: "🦃",
  pork: "🍖",
  lamb: "🐑",

  // More fish
  cod: "🐟",
  trout: "🐟",
  tuna: "🥫",

  // Plain oats
  oats: "🥣",

  // Seeds
  sesame_seeds: "🫘",
  chia_seeds: "🌱",
  flax_seeds: "🌾",
  hemp_seeds: "🍃",
  pumpkin_seeds: "🎃",
  sunflower_seed_butter: "🌻",

  // Tree nuts
  cashew_butter: "🌰",
  walnuts: "🌰",
  pistachios: "🌰",
  hazelnuts: "🌰",
  pecans: "🌰",
  almonds: "🌰",
  cashews: "🌰",

  // Spices & herbs
  cinnamon: "🪵",
  cumin: "🟤",
  turmeric: "🟡",
  paprika: "🌶️",
  curry_powder: "🍛",
  black_pepper: "⚫",
  oregano: "🌿",
  garlic: "🧄",
  ginger: "🫚",
  basil: "🌿",
  cilantro: "🌿",
  dill: "🌿",

  // Ingredient foods (ledger 838)
  milk: "🥛",
  brown_rice: "🍚",
  wheat_flour: "🌾",
  unsalted_butter: "🧈",
  // Unicode 14; an older phone may draw a box, same risk as 🫘/🫚 already here.
  sesame_oil: "🫗",
};

/** Fallback emoji when a food's slug isn't in `FOOD_EMOJI` (e.g. a future seed addition). */
const CATEGORY_FALLBACK_EMOJI: Record<FoodCategory, string> = {
  protein: "🍗",
  veg: "🥦",
  fruit: "🍎",
  grain: "🌾",
  dairy: "🥛",
  legume: "🫘",
  spice: "🌿",
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

/**
 * Emoji per keyword for a recipe's free-text extras ("water, breast milk, or
 * formula", "olive oil for the pan"). Never 🧂 — this is a no-added-salt app,
 * and salt was the old hardcoded glyph for every extra.
 */
const EXTRA_INGREDIENT_EMOJI: Record<string, string> = {
  water: "💧",
  "coconut milk": "🥥",
  "breast milk": "🍼",
  formula: "🍼",
  milk: "🍼",
  // Its own keyword so the "milk" inside it can't claim the extra as 🍼.
  "whole-milk yogurt": "🥛",
  yogurt: "🥛",
  "olive oil": "🫒",
  oil: "🫒",
  flour: "🌾",
  thyme: "🌿",
  sage: "🌿",
  coriander: "🌿",
  vegetable: "🥕",
};

// Longest keyword first, so at one start index "coconut milk" beats "milk";
// the regex's leftmost match then makes the EARLIEST keyword in the name win.
// Word boundaries keep "oil" out of "boil" and "sage" out of "sausage".
const EXTRA_INGREDIENT_PATTERN = new RegExp(
  `\\b(${Object.keys(EXTRA_INGREDIENT_EMOJI)
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "i",
);

/** The emoji for a recipe extra, by the first keyword its name mentions; a spoon otherwise. */
export function getExtraIngredientEmoji(name: string): string {
  const keyword = EXTRA_INGREDIENT_PATTERN.exec(name)?.[1]?.toLowerCase();
  return (keyword && EXTRA_INGREDIENT_EMOJI[keyword]) || "🥄";
}

/** The food-group tint behind a food's plate (item 657); `--color-plate-<tint>` in index.css. */
export type PlateTint = "veg" | "protein" | "legume" | "dairy" | "fruit" | "grain" | "neutral";

/**
 * Plate tint per seed slug, written tint-first. Covers every seed food
 * (pinned in `foodEmoji.test.ts`) because storage foods, recipe ingredients
 * and pairings carry no category to fall back on. Deliberately NOT always the
 * seed category: the mockups tint egg like dairy and nuts/seeds/tofu like
 * legumes, while the seed files them all under `protein`.
 */
const TINT_SLUGS: Record<Exclude<PlateTint, "neutral">, readonly string[]> = {
  protein: [
    "beef",
    "chicken_thigh",
    "salmon",
    "sardines",
    "shrimp",
    "chicken",
    "turkey",
    "pork",
    "lamb",
    "cod",
    "trout",
    "tuna",
  ],
  legume: [
    "lentils",
    "chickpeas",
    "black_beans",
    "kidney_beans",
    "pinto_beans",
    "white_beans",
    "butter_beans",
    "edamame",
    "tofu",
    "peanut_butter",
    "almond_butter",
    "tahini",
    "cashew_butter",
    "sunflower_seed_butter",
    "sesame_seeds",
    "chia_seeds",
    "flax_seeds",
    "hemp_seeds",
    "pumpkin_seeds",
    "walnuts",
    "pistachios",
    "hazelnuts",
    "pecans",
    "almonds",
    "cashews",
    // Beside tahini and the seeds (ledger 838).
    "sesame_oil",
  ],
  dairy: ["egg", "yogurt", "cheese", "milk", "unsalted_butter"],
  grain: [
    "iron_fortified_oats",
    "quinoa",
    "wheat_toast",
    "wheat_pasta",
    "rice",
    "oats",
    "brown_rice",
    "wheat_flour",
    // Ground spices read warm/brown; leafy herbs (below) read green.
    "cinnamon",
    "cumin",
    "turmeric",
    "paprika",
    "curry_powder",
    "black_pepper",
  ],
  veg: [
    "spinach",
    "broccoli",
    "cauliflower",
    "brussels_sprouts",
    "kale",
    "onion",
    "bell_pepper",
    "tomato",
    "sweet_potato",
    "butternut_squash",
    "pumpkin",
    "carrot",
    "potato",
    "beets",
    "zucchini",
    "green_beans",
    "peas",
    "oregano",
    "garlic",
    "ginger",
    "basil",
    "cilantro",
    "dill",
  ],
  fruit: [
    "strawberry",
    "orange",
    "lemon",
    "kiwi",
    "mango",
    "avocado",
    "banana",
    "apple",
    "pear",
    "blueberry",
    "cranberries",
    "watermelon",
  ],
};

const SLUG_TINT: Record<string, PlateTint> = Object.fromEntries(
  Object.entries(TINT_SLUGS).flatMap(([tint, slugs]) =>
    slugs.map((slug) => [slug, tint as PlateTint]),
  ),
);

const CATEGORY_TINT: Record<FoodCategory, PlateTint> = {
  protein: "protein",
  veg: "veg",
  fruit: "fruit",
  grain: "grain",
  dairy: "dairy",
  legume: "legume",
  spice: "veg",
};

/** A food's plate tint: the seed slug map, then its category (custom foods), then neutral. */
export function getFoodTint(slug: string, category?: FoodCategory | null): PlateTint {
  return SLUG_TINT[slug] ?? (category ? CATEGORY_TINT[category] : "neutral");
}

/**
 * The shape `emojiCluster` needs from one food: a slug, and optionally the
 * two things that can beat it (its own emoji, its category). Structural
 * rather than `MealFood`, because a storage container's `foods` carry no
 * category at all (item 347) and a meal's do — one cluster renderer, two
 * callers, neither importing the other's response type.
 */
export interface EmojiClusterFood {
  slug: string;
  category?: FoodCategory | null;
  emoji?: string | null;
}

export interface Plate {
  emoji: string;
  tint: PlateTint;
}

export interface EmojiCluster {
  /** The plates to draw: every food when there are 3 or fewer, else the first 2. */
  plates: Plate[];
  /** How many foods the "+N" plate stands for (0 when nothing is hidden). */
  overflow: number;
}

/** A food as a plate: its emoji (own > slug > category) on its group tint. */
export function foodPlate(food: EmojiClusterFood): Plate {
  return {
    emoji: getFoodEmoji(food.slug, food.category, food.emoji),
    tint: getFoodTint(food.slug, food.category),
  };
}

/**
 * The plates a row of several foods gets in its fixed 48x44 slot (item 658):
 * up to three foods show every plate; four or more show the first two and a
 * "+N" plate for the rest, so the slot never holds more than three discs.
 *
 * Lived in `tracking/components/ServeLogList.tsx` until item 347 gave a
 * storage container its own food list; it moved here (and is still
 * re-exported there) so the meal card and the storage card cannot drift.
 */
export function emojiCluster(foods: readonly EmojiClusterFood[]): EmojiCluster {
  const shown = foods.length <= 3 ? foods : foods.slice(0, 2);
  return { plates: shown.map(foodPlate), overflow: foods.length - shown.length };
}

export interface EmojiChoice {
  emoji: string;
  /** Spoken in the pick button's label ("Pick 🥕 carrot"). */
  label: string;
}

export interface EmojiChoiceGroup {
  label: string;
  choices: readonly EmojiChoice[];
}

/**
 * The custom-food emoji chooser's grid (ledger 862): mostly the art the
 * catalog above already uses, so a parent's pick sits naturally beside the
 * built-in foods. 🍑 🍇 🌽 🍄 are the only extras — common first foods the
 * catalog doesn't carry yet. Typing any other emoji in the field still works.
 */
export const EMOJI_CHOICE_GROUPS: readonly EmojiChoiceGroup[] = [
  {
    label: "Fruit",
    choices: [
      { emoji: "🍎", label: "apple" },
      { emoji: "🍐", label: "pear" },
      { emoji: "🍌", label: "banana" },
      { emoji: "🍓", label: "strawberry" },
      { emoji: "🫐", label: "blueberries" },
      { emoji: "🍊", label: "orange" },
      { emoji: "🥭", label: "mango" },
      { emoji: "🍉", label: "watermelon" },
      { emoji: "🥝", label: "kiwi" },
      { emoji: "🍑", label: "peach" },
      { emoji: "🍇", label: "grapes" },
      { emoji: "🍒", label: "cherries" },
    ],
  },
  {
    label: "Vegetables",
    choices: [
      { emoji: "🥕", label: "carrot" },
      { emoji: "🥦", label: "broccoli" },
      { emoji: "🥬", label: "leafy greens" },
      { emoji: "🥒", label: "cucumber" },
      { emoji: "🫑", label: "pepper" },
      { emoji: "🍅", label: "tomato" },
      { emoji: "🍠", label: "sweet potato" },
      { emoji: "🥔", label: "potato" },
      { emoji: "🎃", label: "squash" },
      { emoji: "🫛", label: "pea pod" },
      { emoji: "🌽", label: "corn" },
      { emoji: "🍄", label: "mushroom" },
      { emoji: "🥑", label: "avocado" },
    ],
  },
  {
    label: "Grains",
    choices: [
      { emoji: "🍞", label: "bread" },
      { emoji: "🍝", label: "pasta" },
      { emoji: "🍚", label: "rice" },
      { emoji: "🥣", label: "bowl" },
      { emoji: "🌾", label: "grain" },
    ],
  },
  {
    label: "Protein",
    choices: [
      { emoji: "🍗", label: "chicken" },
      { emoji: "🥩", label: "meat" },
      { emoji: "🐟", label: "fish" },
      { emoji: "🍤", label: "shrimp" },
      { emoji: "🫘", label: "beans" },
      { emoji: "🥜", label: "peanut" },
      { emoji: "🌰", label: "nut" },
    ],
  },
  {
    label: "Dairy & eggs",
    choices: [
      { emoji: "🥚", label: "egg" },
      { emoji: "🧀", label: "cheese" },
      { emoji: "🥛", label: "milk" },
      { emoji: "🧈", label: "butter" },
    ],
  },
  {
    label: "Other",
    choices: [
      { emoji: "🍲", label: "stew" },
      { emoji: "🍛", label: "curry" },
      { emoji: "🌿", label: "herbs" },
      { emoji: "🧄", label: "garlic" },
      { emoji: "🧅", label: "onion" },
      { emoji: "🫙", label: "jar" },
    ],
  },
];
