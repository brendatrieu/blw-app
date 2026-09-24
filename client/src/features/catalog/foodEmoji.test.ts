import { describe, expect, it } from "vitest";
import { getCategoryEmoji, getExtraIngredientEmoji, getFoodEmoji } from "./foodEmoji.js";

describe("getFoodEmoji", () => {
  it("prefers the food's OWN emoji over everything else (item 177)", () => {
    // Even for a slug that IS in the curated map, and with a category that
    // would also resolve — a parent's pick outranks both.
    expect(getFoodEmoji("banana", "fruit", "🍞")).toBe("🍞");
    expect(getFoodEmoji("unknown-slug", null, "🫓")).toBe("🫓");
  });

  it("treats a blank or whitespace-only emoji as 'not set' and falls through", () => {
    expect(getFoodEmoji("banana", "fruit", "")).toBe("🍌");
    expect(getFoodEmoji("banana", "fruit", "   ")).toBe("🍌");
    expect(getFoodEmoji("banana", "fruit", null)).toBe("🍌");
    expect(getFoodEmoji("banana", "fruit", undefined)).toBe("🍌");
  });

  it("trims a stored emoji rather than rendering the padding", () => {
    expect(getFoodEmoji("custom-x", "fruit", " 🥯 ")).toBe("🥯");
  });

  it("falls back to the slug map, then the category, then a plate", () => {
    expect(getFoodEmoji("salmon")).toBe("🐟");
    expect(getFoodEmoji("grandmas-banana-bread-k3f9q1", "grain")).toBe(getCategoryEmoji("grain"));
    expect(getFoodEmoji("grandmas-banana-bread-k3f9q1")).toBe("🍽️");
    expect(getFoodEmoji("grandmas-banana-bread-k3f9q1", null)).toBe("🍽️");
  });

  it("keeps the pre-existing one- and two-argument call shapes working", () => {
    // Pairings and recipe ingredients carry no emoji field at all; adding the
    // third parameter must not have broken them.
    expect(getFoodEmoji("avocado")).toBe("🥑");
    expect(getFoodEmoji("avocado", "fruit")).toBe("🥑");
  });
});

describe("getCategoryEmoji", () => {
  it("answers one emoji per category, and matches getFoodEmoji's own fallback", () => {
    const categories = ["protein", "veg", "fruit", "grain", "dairy", "legume", "spice"] as const;
    for (const category of categories) {
      const emoji = getCategoryEmoji(category);
      expect(emoji.length).toBeGreaterThan(0);
      expect(getFoodEmoji("not-a-seeded-slug", category)).toBe(emoji);
    }
    expect(new Set(categories.map(getCategoryEmoji)).size).toBe(categories.length);
  });
});

/**
 * Every slug in `server/db/seeds/data/foods.ts`, pinned here (item 332) so a
 * seed addition that forgets its emoji fails on this side rather than shipping
 * a generic plate onto the Foods grid. Kept in seed order, not alphabetical —
 * it is easier to diff against the seed file that way.
 */
const CATALOG_SLUGS = [
  "beef", "chicken_thigh", "salmon", "sardines", "egg", "lentils", "chickpeas", "black_beans", "tofu",
  "iron_fortified_oats", "spinach", "quinoa", "broccoli", "cauliflower", "bell_pepper", "strawberry", "orange", "lemon", "kiwi",
  "mango", "tomato", "sweet_potato", "butternut_squash", "peanut_butter", "almond_butter", "tahini",
  "yogurt", "cheese", "wheat_toast", "wheat_pasta", "shrimp", "avocado", "banana", "apple", "pear",
  "blueberry", "carrot", "potato", "zucchini", "green_beans", "peas", "rice", "watermelon", "chicken", "turkey",
  "pork", "lamb", "cod", "trout", "tuna", "oats", "sesame_seeds", "chia_seeds", "flax_seeds", "hemp_seeds",
  "pumpkin_seeds", "sunflower_seed_butter", "cashew_butter", "walnuts", "pistachios", "hazelnuts", "pecans",
  "almonds", "cashews",
  "cinnamon", "cumin", "turmeric", "paprika", "curry_powder", "black_pepper", "oregano", "garlic", "ginger",
  "basil", "cilantro", "dill",
];

describe("emoji coverage for the seeded catalog", () => {
  it("has an explicit emoji for all 76 catalog slugs", () => {
    expect(CATALOG_SLUGS).toHaveLength(76);
    expect(new Set(CATALOG_SLUGS).size).toBe(CATALOG_SLUGS.length);

    // With no category passed, the only fallback left is the generic plate —
    // so a slug that resolves to anything else came from the curated map.
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
      "breast milk, formula, or water to soak",
      "breast milk, formula, or water to thin",
      "breast milk, formula, or water, to loosen",
      "dried thyme or sage (optional)",
      "grated vegetable, to bind the mince",
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
      "warm water, breast milk, or formula, to thin",
      "warm water, breast milk, or formula, to thin the cashew butter",
      "warm water, breast milk, or formula, to thin the seed butter",
      "warm water, to soak and blend the ground cashew meal",
      "water or milk to moisten the bread",
      "water or no-salt-added stock",
      "water or olive oil, to loosen",
      "water, breast milk, or formula",
      "water, for cooking",
      "water, for cooking and thinning",
      "water, to loosen the mash",
      "water, whole milk, or a thin smooth spread, to moisten",
    ];
    for (const name of seededExtras) {
      expect(getExtraIngredientEmoji(name), name).not.toBe("🥄");
      expect(getExtraIngredientEmoji(name), name).not.toBe("🧂");
    }
  });
});
