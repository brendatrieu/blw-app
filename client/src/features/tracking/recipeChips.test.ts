import { describe, expect, it } from "vitest";
import type { RecipeIngredient } from "@blw/shared";
import { applyRecipeIngredients, recipeIngredientFoodIds } from "./recipeChips.js";

function ingredient(foodSlug: string): RecipeIngredient {
  return { foodSlug, foodName: foodSlug, quantityNote: "" };
}

describe("recipeIngredientFoodIds", () => {
  it("maps ingredients to food ids via the slug lookup", () => {
    const slugToFoodId = new Map([
      ["avocado", "id-avocado"],
      ["banana", "id-banana"],
    ]);
    expect(recipeIngredientFoodIds([ingredient("avocado"), ingredient("banana")], slugToFoodId)).toEqual([
      "id-avocado",
      "id-banana",
    ]);
  });

  it("skips an ingredient whose slug isn't in the lookup", () => {
    const slugToFoodId = new Map([["avocado", "id-avocado"]]);
    expect(recipeIngredientFoodIds([ingredient("avocado"), ingredient("mystery")], slugToFoodId)).toEqual([
      "id-avocado",
    ]);
  });

  it("returns an empty list for a recipe with no ingredients", () => {
    expect(recipeIngredientFoodIds([], new Map())).toEqual([]);
  });
});

describe("applyRecipeIngredients", () => {
  it("adds a freshly-selected recipe's ingredients to an empty selection", () => {
    expect(applyRecipeIngredients([], [], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("keeps a user-added extra when a recipe is selected alongside it", () => {
    expect(applyRecipeIngredients(["extra"], [], ["a", "b"])).toEqual(["extra", "a", "b"]);
  });

  it("removes only the previous recipe's foods when clearing the recipe, keeping extras", () => {
    expect(applyRecipeIngredients(["a", "b", "extra"], ["a", "b"], [])).toEqual(["extra"]);
  });

  it("switching recipes drops the old recipe's foods and adds the new one's", () => {
    expect(applyRecipeIngredients(["a", "b", "extra"], ["a", "b"], ["b", "c"])).toEqual(["b", "extra", "c"]);
  });

  it("a food shared by both recipes stays selected without re-toggling", () => {
    expect(applyRecipeIngredients(["a", "b"], ["a", "b"], ["b", "c"])).toEqual(["b", "c"]);
  });

  it("a food the user manually unchecked from the old recipe stays removed when nothing new needs it", () => {
    // "a" was a recipe food the user unchecked by hand, so it's already gone
    // from currentFoodIds even though it's still in previousRecipeFoodIds —
    // clearing/switching must not resurrect it.
    expect(applyRecipeIngredients(["b"], ["a", "b"], [])).toEqual([]);
  });

  it("is a no-op when the recipe selection doesn't change", () => {
    expect(applyRecipeIngredients(["a", "b", "extra"], ["a", "b"], ["a", "b"])).toEqual(["a", "b", "extra"]);
  });
});
