import { describe, expect, it } from "vitest";
import type { MealItem } from "@blw/shared";
import { mealsFromStorageItem } from "./mealsFromBatch.js";

function meal(id: string, foods: { id: string; storageItemId: string | null }[]): MealItem {
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
      storageItemId: food.storageItemId,
    })),
  };
}

describe("mealsFromStorageItem", () => {
  it("keeps a meal where a food carries the target storage item id", () => {
    const meals = [meal("m1", [{ id: "f1", storageItemId: "batch-1" }])];
    expect(mealsFromStorageItem(meals, "batch-1")).toEqual(meals);
  });

  it("drops a meal logged by hand (storageItemId null on every food)", () => {
    const meals = [meal("m1", [{ id: "f1", storageItemId: null }])];
    expect(mealsFromStorageItem(meals, "batch-1")).toEqual([]);
  });

  it("drops a meal served from a different storage item", () => {
    const meals = [meal("m1", [{ id: "f1", storageItemId: "batch-2" }])];
    expect(mealsFromStorageItem(meals, "batch-1")).toEqual([]);
  });

  it("keeps a multi-food meal where only one food matches", () => {
    const meals = [
      meal("m1", [
        { id: "f1", storageItemId: null },
        { id: "f2", storageItemId: "batch-1" },
      ]),
    ];
    expect(mealsFromStorageItem(meals, "batch-1")).toEqual(meals);
  });

  it("returns an empty array for an empty meal list", () => {
    expect(mealsFromStorageItem([], "batch-1")).toEqual([]);
  });
});
