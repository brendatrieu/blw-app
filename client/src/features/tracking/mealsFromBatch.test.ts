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

  // VERIFY-p2-c1 #2: a meal's items are exact; its foods link each food to one container only.
  describe("from the meal's items (ledger 902)", () => {
    const container = (storageItemId: string) => ({
      kind: "storage" as const,
      storageItemId,
      label: null,
      location: "fridge" as const,
      servings: 1,
      parts: [],
    });

    it("finds a meal through every container on its plate, though its foods link only the first", () => {
      const plate = {
        ...meal("m1", [{ id: "f1", storageItemId: "batch-1" }]),
        items: [container("batch-1"), container("batch-2")],
      };
      expect(mealsFromStorageItem([plate], "batch-1")).toEqual([plate]);
      expect(mealsFromStorageItem([plate], "batch-2")).toEqual([plate]);
    });

    it("decides by the items when present: a food's stale storageItemId does not count", () => {
      const plate = { ...meal("m1", [{ id: "f1", storageItemId: "batch-1" }]), items: [] };
      expect(mealsFromStorageItem([plate], "batch-1")).toEqual([]);
    });

    // VERIFY-p3-c1 pin (mutant c5): a meal that served container A is not one of B's.
    it("lists only the meals that took from THIS container", () => {
      const a = { ...meal("m1", [{ id: "f1", storageItemId: "batch-1" }]), items: [container("batch-1")] };
      const b = { ...meal("m2", [{ id: "f1", storageItemId: "batch-2" }]), items: [container("batch-2")] };
      expect(mealsFromStorageItem([a, b], "batch-1")).toEqual([a]);
      expect(mealsFromStorageItem([a, b], "batch-2")).toEqual([b]);
    });
  });
});
