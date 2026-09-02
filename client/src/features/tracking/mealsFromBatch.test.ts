import { describe, expect, it } from "vitest";
import type { MealItem } from "@blw/shared";
import { mealsFromPantryItem } from "./mealsFromBatch.js";

function meal(id: string, foods: { id: string; pantryItemId: string | null }[]): MealItem {
  return {
    id,
    babyId: "baby-1",
    servedAt: "2026-08-20T10:00:00.000Z",
    reactionNote: null,
    notes: null,
    recipeId: null,
    recipeTitle: null,
    foods: foods.map((food) => ({
      id: food.id,
      slug: "avocado",
      name: "Avocado",
      category: "fruit",
      pantryItemId: food.pantryItemId,
    })),
  };
}

describe("mealsFromPantryItem", () => {
  it("keeps a meal where a food carries the target pantry item id", () => {
    const meals = [meal("m1", [{ id: "f1", pantryItemId: "batch-1" }])];
    expect(mealsFromPantryItem(meals, "batch-1")).toEqual(meals);
  });

  it("drops a meal logged by hand (pantryItemId null on every food)", () => {
    const meals = [meal("m1", [{ id: "f1", pantryItemId: null }])];
    expect(mealsFromPantryItem(meals, "batch-1")).toEqual([]);
  });

  it("drops a meal served from a different pantry item", () => {
    const meals = [meal("m1", [{ id: "f1", pantryItemId: "batch-2" }])];
    expect(mealsFromPantryItem(meals, "batch-1")).toEqual([]);
  });

  it("keeps a multi-food meal where only one food matches", () => {
    const meals = [
      meal("m1", [
        { id: "f1", pantryItemId: null },
        { id: "f2", pantryItemId: "batch-1" },
      ]),
    ];
    expect(mealsFromPantryItem(meals, "batch-1")).toEqual(meals);
  });

  it("returns an empty array for an empty meal list", () => {
    expect(mealsFromPantryItem([], "batch-1")).toEqual([]);
  });
});
