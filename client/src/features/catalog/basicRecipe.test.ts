import { describe, expect, it } from "vitest";
import { BASIC_RECIPE_LABEL, isBasicRecipe, sortBasicRecipesFirst } from "./basicRecipe.js";

describe("isBasicRecipe", () => {
  it("is true for exactly one ingredient", () => {
    expect(isBasicRecipe(1)).toBe(true);
  });

  it("is false for zero, two, or many ingredients", () => {
    expect(isBasicRecipe(0)).toBe(false);
    expect(isBasicRecipe(2)).toBe(false);
    expect(isBasicRecipe(7)).toBe(false);
  });

  it("is false when the count is unknown — an absent count is not a claim", () => {
    expect(isBasicRecipe(undefined)).toBe(false);
  });
});

describe("sortBasicRecipesFirst", () => {
  const simpleCarrot = { id: "a", ingredientCount: 1 };
  const simplePear = { id: "b", ingredientCount: 1 };
  const carrotStew = { id: "c", ingredientCount: 4 };
  const oldBody: { id: string; ingredientCount?: number } = { id: "d" };

  it("puts single-ingredient recipes ahead of the rest", () => {
    const sorted = sortBasicRecipesFirst([carrotStew, simpleCarrot]);
    expect(sorted.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("keeps the incoming (title) order inside each group", () => {
    const sorted = sortBasicRecipesFirst([carrotStew, simplePear, oldBody, simpleCarrot]);
    expect(sorted.map((r) => r.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("leaves the caller's array untouched", () => {
    const input = [carrotStew, simpleCarrot];
    sortBasicRecipesFirst(input);
    expect(input.map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("handles an empty list", () => {
    expect(sortBasicRecipesFirst([])).toEqual([]);
  });
});

describe("BASIC_RECIPE_LABEL", () => {
  it("is the neutral copy every call site shares", () => {
    expect(BASIC_RECIPE_LABEL).toBe("Basic");
  });
});
