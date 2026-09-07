import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FoodDetail, FoodListItem, FoodsResponse } from "@blw/shared";
import { ApiError } from "../../lib/api.js";
import { asCustomFoodConflict } from "./api.js";
import {
  catalogKeys,
  removeCustomFoodFromCache,
  removeFoodFromList,
  upsertFoodInList,
  writeCustomFoodToCache,
} from "./hooks.js";

function listItem(overrides: Partial<FoodListItem> = {}): FoodListItem {
  return {
    id: "food-1",
    slug: "banana",
    name: "Banana",
    category: "fruit",
    ironLevel: "low",
    vitaminCLevel: "moderate",
    chokingRisk: "moderate",
    minAgeMonths: 6,
    allergens: [],
    isCustom: false,
    emoji: null,
    ...overrides,
  };
}

function detail(overrides: Partial<FoodDetail> = {}): FoodDetail {
  return {
    ...listItem({ id: "food-9", slug: "banana-bread-k3f9q1", name: "Banana bread", isCustom: true, emoji: "🍞" }),
    prep6m: "",
    prep9m: "",
    prep12m: "",
    chokingNotes: null,
    notes: null,
    imageUrl: null,
    pairings: [],
    recipes: [],
    ...overrides,
  };
}

describe("upsertFoodInList", () => {
  it("appends a food that isn't in the list yet", () => {
    const data: FoodsResponse = { foods: [listItem()] };
    const next = upsertFoodInList(data, detail());
    expect(next.foods.map((f) => f.id)).toEqual(["food-1", "food-9"]);
    // Never mutates the cached array in place.
    expect(data.foods).toHaveLength(1);
  });

  it("replaces the existing entry when the id is already there (an edit)", () => {
    const data: FoodsResponse = { foods: [listItem(), detail()] };
    const next = upsertFoodInList(data, detail({ name: "Banana loaf" }));
    expect(next.foods).toHaveLength(2);
    expect(next.foods[1]!.name).toBe("Banana loaf");
  });
});

describe("removeFoodFromList", () => {
  it("drops the food of that id", () => {
    const data: FoodsResponse = { foods: [listItem(), detail()] };
    expect(removeFoodFromList(data, "food-9").foods.map((f) => f.id)).toEqual(["food-1"]);
  });

  it("returns the same object when there's nothing to remove", () => {
    const data: FoodsResponse = { foods: [listItem()] };
    expect(removeFoodFromList(data, "food-9")).toBe(data);
  });
});

describe("writeCustomFoodToCache", () => {
  it("inserts the created food into EVERY cached filter variant, so the picker can select it at once", () => {
    // Item 180: the picker reads `["foods", {}]`; the Foods grid may hold
    // several filtered variants at the same time. A prefix write covers all.
    const queryClient = new QueryClient();
    queryClient.setQueryData(catalogKeys.foodsList({}), { foods: [listItem()] });
    queryClient.setQueryData(catalogKeys.foodsList({ category: "grain" }), { foods: [] });

    const created = detail();
    writeCustomFoodToCache(queryClient, created);

    expect(queryClient.getQueryData<FoodsResponse>(catalogKeys.foodsList({}))!.foods.map((f) => f.id)).toEqual([
      "food-1",
      "food-9",
    ]);
    expect(
      queryClient.getQueryData<FoodsResponse>(catalogKeys.foodsList({ category: "grain" }))!.foods.map((f) => f.id),
    ).toEqual(["food-9"]);
    // …and its own detail entry, so /foods/<slug> renders without a fetch.
    expect(queryClient.getQueryData(catalogKeys.food(created.slug))).toEqual(created);
  });

  it("leaves a variant that has never been fetched alone (no empty list conjured)", () => {
    const queryClient = new QueryClient();
    writeCustomFoodToCache(queryClient, detail());
    expect(queryClient.getQueryData(catalogKeys.foodsList({}))).toBeUndefined();
  });
});

describe("removeCustomFoodFromCache", () => {
  it("drops the food from every list variant and forgets its detail entry", () => {
    const queryClient = new QueryClient();
    const food = detail();
    queryClient.setQueryData(catalogKeys.foodsList({}), { foods: [listItem(), food] });
    queryClient.setQueryData(catalogKeys.food(food.slug), food);

    removeCustomFoodFromCache(queryClient, food);

    expect(queryClient.getQueryData<FoodsResponse>(catalogKeys.foodsList({}))!.foods.map((f) => f.id)).toEqual([
      "food-1",
    ]);
    expect(queryClient.getQueryData(catalogKeys.food(food.slug))).toBeUndefined();
  });
});

describe("asCustomFoodConflict", () => {
  it("reads the counts out of a 409 body", () => {
    const error = new ApiError(409, "conflict", { error: "conflict", mealCount: 3, pantryCount: 1 });
    expect(asCustomFoodConflict(error)).toEqual({ error: "conflict", mealCount: 3, pantryCount: 1 });
  });

  it("is null for every other failure — a 500, a 404, a plain Error, or a 409 with no counts", () => {
    expect(asCustomFoodConflict(new ApiError(500, "boom"))).toBeNull();
    expect(asCustomFoodConflict(new ApiError(404, "not_found", { error: "not_found" }))).toBeNull();
    expect(asCustomFoodConflict(new ApiError(409, "conflict", { error: "conflict" }))).toBeNull();
    expect(asCustomFoodConflict(new Error("offline"))).toBeNull();
    expect(asCustomFoodConflict(undefined)).toBeNull();
  });
});
