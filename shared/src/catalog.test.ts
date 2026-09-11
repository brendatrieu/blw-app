import { describe, expect, it } from "vitest";
import {
  createCustomFoodSchema,
  createCustomRecipeSchema,
  formatExtraIngredient,
  isSingleEmoji,
  normalizeExtraIngredients,
  updateCustomFoodSchema,
  updateCustomRecipeSchema,
  ageStageForMonths,
} from "./catalog.js";

describe("isSingleEmoji", () => {
  it("accepts one emoji, including multi-codepoint ones", () => {
    for (const value of ["🥑", "🍞", "👩🏽‍🍳", "🇳🇿", "❤️"]) {
      expect(isSingleEmoji(value), value).toBe(true);
    }
  });

  it("rejects letters, digits, empty strings and two emoji", () => {
    for (const value of ["", " ", "a", "ab", "7", "🥑🍞", "🥑 "]) {
      expect(isSingleEmoji(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("createCustomFoodSchema", () => {
  it("trims the name and collapses an empty emoji/notes to null", () => {
    const parsed = createCustomFoodSchema.parse({
      name: "  Banana bread  ",
      category: "grain",
      emoji: "",
      notes: "   ",
    });

    expect(parsed).toEqual({
      name: "Banana bread",
      category: "grain",
      emoji: null,
      notes: null,
      // An untouched checklist is a real answer, not a missing one.
      allergenSlugs: [],
    });
  });

  it("rejects a blank name, an over-long name and a non-emoji emoji", () => {
    expect(createCustomFoodSchema.safeParse({ name: "   ", category: "grain" }).success).toBe(false);
    expect(createCustomFoodSchema.safeParse({ name: "x".repeat(61), category: "grain" }).success).toBe(false);
    expect(createCustomFoodSchema.safeParse({ name: "Fine", category: "grain", emoji: "no" }).success).toBe(false);
    expect(createCustomFoodSchema.safeParse({ name: "Fine", category: "snack" }).success).toBe(false);
  });
});

describe("updateCustomFoodSchema", () => {
  it("leaves absent keys absent so a PATCH touches nothing else", () => {
    const parsed = updateCustomFoodSchema.parse({ name: "Banana loaf" });
    expect(parsed).toEqual({ name: "Banana loaf" });
    expect("emoji" in parsed).toBe(false);
    expect("allergenSlugs" in parsed).toBe(false);
  });

  it("distinguishes clearing a field from leaving it alone", () => {
    expect(updateCustomFoodSchema.parse({ emoji: null })).toEqual({ emoji: null });
    expect(updateCustomFoodSchema.parse({ notes: "" })).toEqual({ notes: null });
  });

  it("rejects an empty patch", () => {
    expect(updateCustomFoodSchema.safeParse({}).success).toBe(false);
  });
});

describe("ageStageForMonths", () => {
  it("files a custom recipe's single variant at the 6 / 9 / 12 stage", () => {
    expect(ageStageForMonths(6)).toBe("6");
    expect(ageStageForMonths(8)).toBe("6");
    expect(ageStageForMonths(9)).toBe("9");
    expect(ageStageForMonths(10)).toBe("9");
    expect(ageStageForMonths(11)).toBe("9");
    expect(ageStageForMonths(12)).toBe("12");
    expect(ageStageForMonths(36)).toBe("12");
  });
});

// Item 298: an extra ingredient is `{ name, quantityNote }`, where "" means
// "no quantity given" rather than a missing field.
describe("extra ingredients", () => {
  const baseRecipe = {
    title: "Banana oat fingers",
    minAgeMonths: 6,
    ingredients: [{ foodId: "11111111-1111-4111-8111-111111111111" }],
  };

  it("formats one as \"quantity name\", or the bare name when there is no quantity", () => {
    expect(formatExtraIngredient({ name: "chia seeds", quantityNote: "1 tsp" })).toBe("1 tsp chia seeds");
    expect(formatExtraIngredient({ name: "olive oil", quantityNote: "" })).toBe("olive oil");
  });

  it("trims, drops blank names and keeps the FIRST of a case-insensitive repeat", () => {
    expect(
      normalizeExtraIngredients([
        { name: "  Olive oil  ", quantityNote: "  1 tbsp  " },
        { name: "   ", quantityNote: "2 tbsp" },
        { name: "OLIVE OIL", quantityNote: "2 tbsp" },
        { name: "chia seeds", quantityNote: "" },
      ]),
    ).toEqual([
      { name: "Olive oil", quantityNote: "1 tbsp" },
      { name: "chia seeds", quantityNote: "" },
    ]);
  });

  it("parses the object form, defaulting an absent quantity to \"\"", () => {
    const parsed = createCustomRecipeSchema.parse({
      ...baseRecipe,
      extraIngredients: [{ name: "chia seeds", quantityNote: "1 tsp" }, { name: "olive oil" }, { name: "  " }],
    });
    expect(parsed.extraIngredients).toEqual([
      { name: "chia seeds", quantityNote: "1 tsp" },
      { name: "olive oil", quantityNote: "" },
    ]);
  });

  it("still accepts a plain string, reading it as a name with no quantity", () => {
    const parsed = createCustomRecipeSchema.parse({
      ...baseRecipe,
      extraIngredients: ["olive oil", { name: "chia seeds", quantityNote: "1 tsp" }],
    });
    expect(parsed.extraIngredients).toEqual([
      { name: "olive oil", quantityNote: "" },
      { name: "chia seeds", quantityNote: "1 tsp" },
    ]);
  });

  it("defaults to an empty list, and PATCH leaves an absent key alone", () => {
    expect(createCustomRecipeSchema.parse(baseRecipe).extraIngredients).toEqual([]);
    expect(updateCustomRecipeSchema.parse({ title: "Renamed" }).extraIngredients).toBeUndefined();
    expect(updateCustomRecipeSchema.parse({ extraIngredients: [{ name: "salt-free stock" }] }).extraIngredients).toEqual(
      [{ name: "salt-free stock", quantityNote: "" }],
    );
  });

  it("rejects a name over 60, a quantity over 80, and more than 20 entries", () => {
    for (const extraIngredients of [
      [{ name: "x".repeat(61) }],
      ["x".repeat(61)],
      [{ name: "olive oil", quantityNote: "q".repeat(81) }],
      Array.from({ length: 21 }, (_unused, index) => ({ name: `extra ${index}` })),
    ]) {
      expect(createCustomRecipeSchema.safeParse({ ...baseRecipe, extraIngredients }).success).toBe(false);
    }
    // The caps are the boundary, not one short of it.
    expect(
      createCustomRecipeSchema.safeParse({
        ...baseRecipe,
        extraIngredients: [{ name: "x".repeat(60), quantityNote: "q".repeat(80) }],
      }).success,
    ).toBe(true);
  });

  it("applies the 20 cap to what was SENT, before blanks are dropped", () => {
    const twentyOne = Array.from({ length: 21 }, (_unused, index) => ({ name: index === 0 ? "" : `extra ${index}` }));
    expect(createCustomRecipeSchema.safeParse({ ...baseRecipe, extraIngredients: twentyOne }).success).toBe(false);
  });
});
