import { describe, expect, it } from "vitest";
import type { RecipeIngredient } from "@blw/shared";
import { addRecipeChips, adoptRecipeChips, recipeIngredientFoodIds, removeRecipeChips } from "./recipeChips.js";

function ingredient(foodSlug: string): RecipeIngredient {
  return {
    foodId: `uuid-${foodSlug}`,
    foodSlug,
    foodName: foodSlug,
    isCustom: false,
    foodEmoji: null,
    quantityNote: "",
    allergens: [],
  };
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

// Ledger 759: several recipes per meal. "Removing a recipe removes only foods
// it alone added."
describe("recipe chips with several recipes (ledger 759)", () => {
  it("a pick appends only the ingredients not already on the meal, and owns just those", () => {
    expect(addRecipeChips(["egg", "extra"], {}, "A", ["oats", "egg", "oats"])).toEqual({
      foodIds: ["egg", "extra", "oats"],
      owners: { A: ["oats"] },
    });
  });

  it("removing a recipe drops the foods it added and nothing the parent picked by hand", () => {
    const one = addRecipeChips(["egg"], {}, "A", ["egg", "oats"]);
    expect(removeRecipeChips(one.foodIds, one.owners, "A", new Map())).toEqual({ foodIds: ["egg"], owners: {} });
  });

  it("a food two recipes share stays while either is picked, then goes with the last", () => {
    let state = addRecipeChips([], {}, "A", ["egg", "oats"]);
    state = addRecipeChips(state.foodIds, state.owners, "B", ["egg", "salmon"]);
    expect(state.foodIds).toEqual(["egg", "oats", "salmon"]);

    state = removeRecipeChips(state.foodIds, state.owners, "A", new Map([["B", ["egg", "salmon"]]]));
    expect(state.foodIds).toEqual(["egg", "salmon"]);
    expect(state.owners).toEqual({ B: ["salmon", "egg"] });

    state = removeRecipeChips(state.foodIds, state.owners, "B", new Map());
    expect(state.foodIds).toEqual([]);
  });

  it("removing the second recipe leaves the first recipe's foods alone", () => {
    let state = addRecipeChips([], {}, "A", ["egg", "oats"]);
    state = addRecipeChips(state.foodIds, state.owners, "B", ["egg", "salmon"]);
    state = removeRecipeChips(state.foodIds, state.owners, "B", new Map([["A", ["egg", "oats"]]]));
    expect(state).toEqual({ foodIds: ["egg", "oats"], owners: { A: ["egg", "oats"] } });
  });

  it("a recipe still loading inherits nothing (it adds what it needs when it lands)", () => {
    const state = addRecipeChips([], {}, "A", ["egg"]);
    expect(removeRecipeChips(state.foodIds, state.owners, "A", new Map([["B", ["egg"]]])).foodIds).toEqual([]);
  });

  it("edit mode adopts the saved meal's ingredients without adding the ones the parent removed", () => {
    // Saved meal: Egg + Banana; the recipe also calls for Oats, removed back then.
    const state = adoptRecipeChips(["egg", "banana"], {}, "A", ["egg", "oats"]);
    expect(state).toEqual({ foodIds: ["egg", "banana"], owners: { A: ["egg"] } });
    expect(removeRecipeChips(state.foodIds, state.owners, "A", new Map()).foodIds).toEqual(["banana"]);
  });

  it("two saved recipes sharing a food: the first adopts it, and it stays until both are gone", () => {
    let state = adoptRecipeChips(["egg", "oats", "salmon"], {}, "A", ["egg", "oats"]);
    state = adoptRecipeChips(state.foodIds, state.owners, "B", ["egg", "salmon"]);
    expect(state.owners).toEqual({ A: ["egg", "oats"], B: ["salmon"] });
    state = removeRecipeChips(state.foodIds, state.owners, "A", new Map([["B", ["egg", "salmon"]]]));
    expect(state.foodIds).toEqual(["egg", "salmon"]);
  });
});
