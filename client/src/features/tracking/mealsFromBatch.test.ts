import { describe, expect, it } from "vitest";
import type { MealItem } from "@blw/shared";
import { mealsFromFridgeItem } from "./mealsFromBatch.js";

function meal(id: string, foods: { id: string; fridgeItemId: string | null }[]): MealItem {
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
      fridgeItemId: food.fridgeItemId,
    })),
  };
}

describe("mealsFromFridgeItem", () => {
  it("keeps a meal where a food carries the target fridge item id", () => {
    const meals = [meal("m1", [{ id: "f1", fridgeItemId: "batch-1" }])];
    expect(mealsFromFridgeItem(meals, "batch-1")).toEqual(meals);
  });

  it("drops a meal logged by hand (fridgeItemId null on every food)", () => {
    const meals = [meal("m1", [{ id: "f1", fridgeItemId: null }])];
    expect(mealsFromFridgeItem(meals, "batch-1")).toEqual([]);
  });

  it("drops a meal served from a different fridge item", () => {
    const meals = [meal("m1", [{ id: "f1", fridgeItemId: "batch-2" }])];
    expect(mealsFromFridgeItem(meals, "batch-1")).toEqual([]);
  });

  it("keeps a multi-food meal where only one food matches", () => {
    const meals = [
      meal("m1", [
        { id: "f1", fridgeItemId: null },
        { id: "f2", fridgeItemId: "batch-1" },
      ]),
    ];
    expect(mealsFromFridgeItem(meals, "batch-1")).toEqual(meals);
  });

  it("returns an empty array for an empty meal list", () => {
    expect(mealsFromFridgeItem([], "batch-1")).toEqual([]);
  });
});
