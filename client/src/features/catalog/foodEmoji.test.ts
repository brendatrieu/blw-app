import { describe, expect, it } from "vitest";
import { isSingleEmoji } from "@blw/shared";
import {
  DEFAULT_FOOD_EMOJI,
  EMOJI_CHOICE_GROUPS,
  FOOD_EMOJI,
  emojiCluster,
  foodPlate,
  getExtraIngredientEmoji,
  getFoodEmoji,
  getFoodTint,
} from "./foodEmoji.js";

describe("getFoodEmoji", () => {
  it("prefers the food's OWN emoji over everything else (item 177)", () => {
    // Even for a slug that IS in the curated map — a parent's pick outranks it.
    expect(getFoodEmoji("banana", "🍞")).toBe("🍞");
    expect(getFoodEmoji("unknown-slug", "🫓")).toBe("🫓");
  });

  it("treats a blank or whitespace-only emoji as 'not set' and falls through", () => {
    expect(getFoodEmoji("banana", "")).toBe("🍌");
    expect(getFoodEmoji("banana", "   ")).toBe("🍌");
    expect(getFoodEmoji("banana", null)).toBe("🍌");
    expect(getFoodEmoji("banana", undefined)).toBe("🍌");
  });

  it("trims a stored emoji rather than rendering the padding", () => {
    expect(getFoodEmoji("custom-x", " 🥯 ")).toBe("🥯");
  });

  it("falls back to the slug map, then the plate with utensils (ledger 879)", () => {
    expect(getFoodEmoji("salmon")).toBe("🐟");
    expect(DEFAULT_FOOD_EMOJI).toBe("\u{1F37D}\u{FE0F}");
    expect(getFoodEmoji("grandmas-banana-bread-k3f9q1")).toBe("🍽️");
    expect(getFoodEmoji("grandmas-banana-bread-k3f9q1", null)).toBe("🍽️");
  });
});

describe("a custom food with no emoji (ledger 879)", () => {
  it("shows 🍽️ on its category's tint, whatever the category", () => {
    for (const category of ["protein", "veg", "fruit", "grain", "dairy", "legume", "spice"] as const) {
      expect(foodPlate({ slug: "papaya-k3f9q1", category, emoji: null })).toEqual({
        emoji: "🍽️",
        tint: getFoodTint("papaya-k3f9q1", category),
      });
    }
    expect(foodPlate({ slug: "papaya-k3f9q1", category: "grain", emoji: null }).tint).toBe("grain");
  });

  it("in a cluster (meal card, storage card), beside a catalog food that keeps its own art", () => {
    const { plates } = emojiCluster([
      { slug: "papaya-k3f9q1", category: "fruit", emoji: null },
      { slug: "banana", category: "fruit", emoji: null },
      { slug: "toast-x1", category: "grain", emoji: "🥯" },
    ]);
    expect(plates.map((plate) => plate.emoji)).toEqual(["🍽️", "🍌", "🥯"]);
  });
});

/**
 * Every slug in `server/db/seeds/data/foods.ts`, pinned here (item 332) so a
 * seed addition that forgets its emoji fails on this side rather than shipping
 * a generic plate onto the Foods grid. Kept in seed order, not alphabetical —
 * it is easier to diff against the seed file that way.
 */
const CATALOG_SLUGS = [
  "beef", "chicken_thigh", "salmon", "sardines", "egg", "lentils", "chickpeas", "black_beans", "kidney_beans", "pinto_beans", "white_beans", "butter_beans", "edamame", "tofu",
  "iron_fortified_oats", "spinach", "quinoa", "broccoli", "cauliflower", "brussels_sprouts", "kale", "onion", "bell_pepper", "strawberry", "orange", "lemon", "kiwi",
  "mango", "tomato", "sweet_potato", "butternut_squash", "pumpkin", "peanut_butter", "almond_butter", "tahini",
  "yogurt", "cheese", "wheat_toast", "wheat_pasta", "shrimp", "avocado", "banana", "apple", "pear",
  "blueberry", "cranberries", "carrot", "potato", "beets", "zucchini", "green_beans", "peas", "rice", "watermelon", "chicken", "turkey",
  "pork", "lamb", "cod", "trout", "tuna", "oats", "sesame_seeds", "chia_seeds", "flax_seeds", "hemp_seeds",
  "pumpkin_seeds", "sunflower_seed_butter", "cashew_butter", "walnuts", "pistachios", "hazelnuts", "pecans",
  "almonds", "cashews",
  "cinnamon", "cumin", "turmeric", "paprika", "curry_powder", "black_pepper", "oregano", "garlic", "ginger",
  "basil", "cilantro", "dill",
  // Ledger 838's ingredient foods.
  "milk", "brown_rice", "wheat_flour", "unsalted_butter", "sesame_oil",
];

describe("emoji coverage for the seeded catalog", () => {
  it("has an explicit emoji for all 92 catalog slugs", () => {
    expect(CATALOG_SLUGS).toHaveLength(92);
    expect(new Set(CATALOG_SLUGS).size).toBe(CATALOG_SLUGS.length);

    // The only fallback is the generic plate — so a slug that resolves to
    // anything else came from the curated map (catalog foods never show 🍽️).
    const missing = CATALOG_SLUGS.filter((slug) => getFoodEmoji(slug) === getFoodEmoji("not-a-seeded-slug"));
    expect(missing).toEqual([]);
  });

  it("gives the spices and the meats the emoji the Foods grid shows", () => {
    // Spot checks across the three new groups, so a wholesale re-shuffle of the
    // map is visible in the diff rather than silently green.
    expect(getFoodEmoji("cinnamon")).toBe("🪵");
    expect(getFoodEmoji("garlic")).toBe("🧄");
    expect(getFoodEmoji("turkey")).toBe("🦃");
    expect(getFoodEmoji("tuna")).toBe("🥫");
    expect(getFoodEmoji("pumpkin_seeds")).toBe("🎃");
  });
});

describe("getExtraIngredientEmoji", () => {
  it("picks the keyword that appears EARLIEST in the name, case-insensitively", () => {
    expect(getExtraIngredientEmoji("water or olive oil")).toBe("💧");
    expect(getExtraIngredientEmoji("breast milk, formula, or water")).toBe("🍼");
    expect(getExtraIngredientEmoji("Olive Oil for the pan")).toBe("🫒");
  });

  it("lets the longer keyword win where two overlap", () => {
    expect(getExtraIngredientEmoji("unsweetened coconut milk")).toBe("🥥");
    expect(getExtraIngredientEmoji("olive oil")).toBe("🫒");
    expect(getExtraIngredientEmoji("plain whole-milk yogurt, mashed avocado, or olive oil, to moisten")).toBe("🥛");
  });

  it("matches whole words only", () => {
    // "oil" inside "boil", "sage" inside "sausage" must not count.
    expect(getExtraIngredientEmoji("sausage to boil")).toBe("🥄");
  });

  it("falls back to a spoon, and never shows salt", () => {
    expect(getExtraIngredientEmoji("mashed fruit")).toBe("🥄");
    expect(getExtraIngredientEmoji("salt")).not.toBe("🧂");
  });

  it("gives every seeded extra a real emoji, not the spoon", () => {
    // Every distinct `extraIngredients[].name` in server/db/seeds/data/*.ts as
    // of writing — hardcoded because a client test cannot import server seeds.
    const seededExtras = [
      "breast milk, formula, or water",
      "breast milk, formula, or water to thin",
      "breast milk, formula, or water, to loosen",
      "breast milk, formula, whole milk (once baby has had yogurt or cheese), or water",
      "breast milk, formula, whole milk (once baby has had yogurt or cheese), or water to soak",
      "breast milk, formula, whole milk (once baby has had yogurt or cheese), or water to thin",
      "breast milk, formula, whole milk (once baby has had yogurt or cheese), or water, to loosen",
      "breast milk, formula, whole milk, or water to thin",
      "breast milk, formula, whole milk, or water, to loosen",
      "dried thyme or sage (optional)",
      "grated vegetable, to bind the ground turkey",
      "ground coriander",
      "milk, water, or mashed fruit, to soak",
      "oat flour for grip (optional)",
      "oil for the pan",
      "olive oil",
      "olive oil for the pan",
      "olive oil or a spoonful of the cooking liquid, to moisten",
      "plain whole-milk yogurt, mashed avocado, or olive oil, to moisten",
      "unsweetened coconut milk",
      "warm water to thin the peanut butter",
      "warm water, breast milk, formula, or whole milk (once baby has had yogurt or cheese), to thin",
      "warm water, breast milk, formula, or whole milk (once baby has had yogurt or cheese), to thin the seed butter",
      "warm water, breast milk, formula, or whole milk, to thin the cashew butter",
      "warm water, breast milk, or formula, to thin",
      "warm water, to soak and blend the ground cashew meal",
      "water",
      "water or no-salt-added stock",
      "water or olive oil, to loosen",
      "water, breast milk, formula, or whole milk (once baby has had yogurt or cheese)",
      "water, breast milk, formula, or whole milk (once baby has had yogurt or cheese) to moisten the bread",
      "water, for cooking",
      "water, for cooking and thinning",
      "water, to loosen",
      "water, to loosen the mash",
      "water, to thin",
      "water, whole milk, or a thin smooth spread, to moisten",
    ];
    for (const name of seededExtras) {
      expect(getExtraIngredientEmoji(name), name).not.toBe("🥄");
      expect(getExtraIngredientEmoji(name), name).not.toBe("🧂");
    }
  });
});

describe("getFoodTint (item 657)", () => {
  it("gives every seeded slug a food-group tint, never the neutral fallback", () => {
    // No category passed: storage foods, recipe ingredients and pairings carry
    // none, so the slug map alone has to cover the seed.
    expect(CATALOG_SLUGS.filter((slug) => getFoodTint(slug) === "neutral")).toEqual([]);
  });

  it("follows the mockups where they differ from the seed category", () => {
    expect(getFoodTint("salmon", "protein")).toBe("protein");
    expect(getFoodTint("egg", "protein")).toBe("dairy");
    expect(getFoodTint("peanut_butter", "protein")).toBe("legume");
    expect(getFoodTint("sweet_potato", "veg")).toBe("veg");
    expect(getFoodTint("broccoli")).toBe("veg");
  });

  it("falls back to the category for a custom food, then to neutral", () => {
    expect(getFoodTint("custom-mash", "fruit")).toBe("fruit");
    expect(getFoodTint("custom-mash", "spice")).toBe("veg");
    expect(getFoodTint("custom-mash", null)).toBe("neutral");
    expect(getFoodTint("custom-mash")).toBe("neutral");
  });
});

describe("plate pins the verifier asked for (items 657, 658)", () => {
  it("pins the whole slug -> tint table, so one food can't drift to the wrong group", () => {
    expect(Object.fromEntries(CATALOG_SLUGS.map((slug) => [slug, getFoodTint(slug)]))).toMatchInlineSnapshot(`
      {
        "almond_butter": "legume",
        "almonds": "legume",
        "apple": "fruit",
        "avocado": "fruit",
        "banana": "fruit",
        "basil": "veg",
        "beef": "protein",
        "beets": "veg",
        "bell_pepper": "veg",
        "black_beans": "legume",
        "black_pepper": "grain",
        "blueberry": "fruit",
        "broccoli": "veg",
        "brown_rice": "grain",
        "brussels_sprouts": "veg",
        "butter_beans": "legume",
        "butternut_squash": "veg",
        "carrot": "veg",
        "cashew_butter": "legume",
        "cashews": "legume",
        "cauliflower": "veg",
        "cheese": "dairy",
        "chia_seeds": "legume",
        "chicken": "protein",
        "chicken_thigh": "protein",
        "chickpeas": "legume",
        "cilantro": "veg",
        "cinnamon": "grain",
        "cod": "protein",
        "cranberries": "fruit",
        "cumin": "grain",
        "curry_powder": "grain",
        "dill": "veg",
        "edamame": "legume",
        "egg": "dairy",
        "flax_seeds": "legume",
        "garlic": "veg",
        "ginger": "veg",
        "green_beans": "veg",
        "hazelnuts": "legume",
        "hemp_seeds": "legume",
        "iron_fortified_oats": "grain",
        "kale": "veg",
        "kidney_beans": "legume",
        "kiwi": "fruit",
        "lamb": "protein",
        "lemon": "fruit",
        "lentils": "legume",
        "mango": "fruit",
        "milk": "dairy",
        "oats": "grain",
        "onion": "veg",
        "orange": "fruit",
        "oregano": "veg",
        "paprika": "grain",
        "peanut_butter": "legume",
        "pear": "fruit",
        "peas": "veg",
        "pecans": "legume",
        "pinto_beans": "legume",
        "pistachios": "legume",
        "pork": "protein",
        "potato": "veg",
        "pumpkin": "veg",
        "pumpkin_seeds": "legume",
        "quinoa": "grain",
        "rice": "grain",
        "salmon": "protein",
        "sardines": "protein",
        "sesame_oil": "legume",
        "sesame_seeds": "legume",
        "shrimp": "protein",
        "spinach": "veg",
        "strawberry": "fruit",
        "sunflower_seed_butter": "legume",
        "sweet_potato": "veg",
        "tahini": "legume",
        "tofu": "legume",
        "tomato": "veg",
        "trout": "protein",
        "tuna": "protein",
        "turkey": "protein",
        "turmeric": "grain",
        "unsalted_butter": "dairy",
        "walnuts": "legume",
        "watermelon": "fruit",
        "wheat_flour": "grain",
        "wheat_pasta": "grain",
        "wheat_toast": "grain",
        "white_beans": "legume",
        "yogurt": "dairy",
        "zucchini": "veg",
      }
    `);
  });

  it("shows the FIRST two foods and +N for four or more", () => {
    const foods = ["apple", "banana", "broccoli", "salmon", "egg"].map((slug) => ({ slug }));
    const { plates, overflow } = emojiCluster(foods);
    expect(plates.map((p) => p.emoji)).toEqual([getFoodEmoji("apple"), getFoodEmoji("banana")]);
    expect(overflow).toBe(3);
  });
});

describe("EMOJI_CHOICE_GROUPS (ledger 862)", () => {
  const choices = EMOJI_CHOICE_GROUPS.flatMap((group) => group.choices);

  it("offers ~40 single, distinct emojis the server will accept", () => {
    expect(choices.length).toBeGreaterThanOrEqual(36);
    expect(choices.length).toBeLessThanOrEqual(50);
    for (const { emoji } of choices) expect(isSingleEmoji(emoji), emoji).toBe(true);
    expect(new Set(choices.map((choice) => choice.emoji)).size).toBe(choices.length);
  });

  it("reuses the catalog's own art, bar four named extras", () => {
    const catalog = new Set(Object.values(FOOD_EMOJI));
    const extras = choices.filter(({ emoji }) => !catalog.has(emoji)).map(({ emoji }) => emoji);
    expect(extras.sort()).toEqual(["🍄", "🍇", "🍑", "🌽"].sort());
  });
});
