import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type {
  FoodDetail,
  FoodListItem,
  FoodsResponse,
  RecipeDetail,
  RecipeListItem,
  RecipesResponse,
} from "@blw/shared";
import { ApiError } from "../../lib/api.js";
import { asCustomFoodConflict, asCustomRecipeConflict, buildRecipesQueryString } from "./api.js";
import {
  catalogKeys,
  isUnfilteredRecipeVariant,
  recipeListItemFromDetail,
  removeCustomFoodFromCache,
  removeCustomRecipeFromCache,
  removeFoodFromList,
  removeRecipeFromList,
  upsertFoodInList,
  upsertRecipeInList,
  writeCustomFoodToCache,
  writeCustomRecipeToCache,
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

// ---------------------------------------------------------------------------
// Custom recipes (ledger 211-212)
// ---------------------------------------------------------------------------

function recipeRow(overrides: Partial<RecipeListItem> = {}): RecipeListItem {
  return {
    id: "recipe-1",
    slug: "banana-porridge",
    title: "Banana porridge",
    minAgeMonths: 6,
    ironFocus: false,
    allergens: [],
    isCustom: false,
    isFavorite: false,
    ingredientNames: ["Banana", "Oats"],
    ...overrides,
  };
}

function recipeDetail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: "recipe-9",
    slug: "lentil-mash-k3f9q1",
    title: "Lentil mash",
    minAgeMonths: 6,
    prepMinutes: 0,
    ironFocus: false,
    imageUrl: null,
    fridgeHoursOverride: null,
    freezerDaysOverride: null,
    allergens: [],
    ingredients: [
      { foodId: "food-1", foodSlug: "lentil", foodName: "Lentils", isCustom: false, foodEmoji: null, quantityNote: "" },
    ],
    extraIngredients: [],
    variants: [{ ageStage: "6", textureNote: "", steps: ["Cook", "Mash"] }],
    isCustom: true,
    notes: null,
    ...overrides,
  };
}

describe("recipeListItemFromDetail", () => {
  it("projects a saved recipe into a list row, carrying the favorite flag in from the cache", () => {
    expect(recipeListItemFromDetail(recipeDetail(), true)).toEqual({
      id: "recipe-9",
      slug: "lentil-mash-k3f9q1",
      title: "Lentil mash",
      minAgeMonths: 6,
      ironFocus: false,
      allergens: [],
      isCustom: true,
      isFavorite: true,
      ingredientNames: ["Lentils"],
    });
  });

  it("never assumes favorited (a rename must not silently favorite a row)", () => {
    expect(recipeListItemFromDetail(recipeDetail(), false).isFavorite).toBe(false);
  });
});

describe("isUnfilteredRecipeVariant", () => {
  it("is true for the empty filter object and for an explicit scope of 'all'", () => {
    expect(isUnfilteredRecipeVariant({})).toBe(true);
    expect(isUnfilteredRecipeVariant({ scope: "all", q: undefined })).toBe(true);
  });

  it("is false as soon as any real filter is set", () => {
    expect(isUnfilteredRecipeVariant({ scope: "favorites" })).toBe(false);
    expect(isUnfilteredRecipeVariant({ q: "mash" })).toBe(false);
    expect(isUnfilteredRecipeVariant({ ironFocus: true })).toBe(false);
    expect(isUnfilteredRecipeVariant({ maxAgeMonths: 9 })).toBe(false);
  });

  it("is false for a non-object key part", () => {
    expect(isUnfilteredRecipeVariant(undefined)).toBe(false);
  });
});

describe("upsertRecipeInList", () => {
  it("inserts a new recipe at its title-sorted position, matching the server's ordering", () => {
    const data: RecipesResponse = { recipes: [recipeRow(), recipeRow({ id: "recipe-2", title: "Zucchini sticks" })] };
    const next = upsertRecipeInList(data, recipeRow({ id: "recipe-9", title: "Lentil mash" }));
    expect(next.recipes.map((r) => r.title)).toEqual(["Banana porridge", "Lentil mash", "Zucchini sticks"]);
    // Never mutates the cached array in place.
    expect(data.recipes).toHaveLength(2);
  });

  it("appends when the new title sorts last", () => {
    const data: RecipesResponse = { recipes: [recipeRow()] };
    expect(upsertRecipeInList(data, recipeRow({ id: "recipe-9", title: "Zucchini" })).recipes.map((r) => r.id)).toEqual([
      "recipe-1",
      "recipe-9",
    ]);
  });

  it("replaces an existing row where it stands (an edit keeps its position)", () => {
    const data: RecipesResponse = { recipes: [recipeRow(), recipeRow({ id: "recipe-2", title: "Zucchini sticks" })] };
    const next = upsertRecipeInList(data, recipeRow({ title: "Banana porridge, better" }));
    expect(next.recipes.map((r) => r.title)).toEqual(["Banana porridge, better", "Zucchini sticks"]);
  });

  it("refuses to insert into a variant that may not gain rows, and returns the SAME object", () => {
    const data: RecipesResponse = { recipes: [recipeRow()] };
    expect(upsertRecipeInList(data, recipeRow({ id: "recipe-9", title: "Lentil mash" }), false)).toBe(data);
  });

  it("still REPLACES inside a filtered variant — an updated row it already holds is never left stale", () => {
    const data: RecipesResponse = { recipes: [recipeRow()] };
    const next = upsertRecipeInList(data, recipeRow({ title: "Renamed" }), false);
    expect(next.recipes.map((r) => r.title)).toEqual(["Renamed"]);
  });
});

describe("removeRecipeFromList", () => {
  it("drops the recipe of that id", () => {
    const data: RecipesResponse = { recipes: [recipeRow(), recipeRow({ id: "recipe-2" })] };
    expect(removeRecipeFromList(data, "recipe-1").recipes.map((r) => r.id)).toEqual(["recipe-2"]);
  });

  it("returns the same object when the recipe isn't there", () => {
    const data: RecipesResponse = { recipes: [recipeRow()] };
    expect(removeRecipeFromList(data, "recipe-404")).toBe(data);
  });
});

describe("writeCustomRecipeToCache", () => {
  it("adds the created recipe to the unfiltered list and writes its detail entry", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(catalogKeys.recipesList({}), { recipes: [recipeRow()] });

    const created = recipeDetail();
    writeCustomRecipeToCache(queryClient, created);

    expect(
      queryClient.getQueryData<RecipesResponse>(catalogKeys.recipesList({}))!.recipes.map((r) => r.id),
    ).toEqual(["recipe-1", "recipe-9"]);
    expect(queryClient.getQueryData(catalogKeys.recipe(created.id))).toEqual(created);
  });

  it("does NOT push a new recipe into a filtered variant it may not match", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(catalogKeys.recipesList({ scope: "favorites" }), { recipes: [] });
    writeCustomRecipeToCache(queryClient, recipeDetail());
    expect(queryClient.getQueryData<RecipesResponse>(catalogKeys.recipesList({ scope: "favorites" }))!.recipes).toEqual(
      [],
    );
  });

  it("keeps a row's favorite flag across an edit", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(catalogKeys.recipesList({}), {
      recipes: [recipeRow({ id: "recipe-9", title: "Lentil mash", isFavorite: true })],
    });
    writeCustomRecipeToCache(queryClient, recipeDetail({ title: "Lentil mash v2" }));
    const row = queryClient.getQueryData<RecipesResponse>(catalogKeys.recipesList({}))!.recipes[0]!;
    expect(row.title).toBe("Lentil mash v2");
    expect(row.isFavorite).toBe(true);
  });

  it("leaves a variant that has never been fetched alone", () => {
    const queryClient = new QueryClient();
    writeCustomRecipeToCache(queryClient, recipeDetail());
    expect(queryClient.getQueryData(catalogKeys.recipesList({}))).toBeUndefined();
  });
});

describe("removeCustomRecipeFromCache", () => {
  it("drops the recipe from every list variant and forgets its detail entry", () => {
    const queryClient = new QueryClient();
    const recipe = recipeDetail();
    queryClient.setQueryData(catalogKeys.recipesList({}), {
      recipes: [recipeRow(), recipeRow({ id: recipe.id, title: recipe.title })],
    });
    queryClient.setQueryData(catalogKeys.recipesList({ scope: "custom" }), {
      recipes: [recipeRow({ id: recipe.id, title: recipe.title })],
    });
    queryClient.setQueryData(catalogKeys.recipe(recipe.id), recipe);

    removeCustomRecipeFromCache(queryClient, recipe.id);

    expect(queryClient.getQueryData<RecipesResponse>(catalogKeys.recipesList({}))!.recipes.map((r) => r.id)).toEqual([
      "recipe-1",
    ]);
    expect(
      queryClient.getQueryData<RecipesResponse>(catalogKeys.recipesList({ scope: "custom" }))!.recipes,
    ).toEqual([]);
    expect(queryClient.getQueryData(catalogKeys.recipe(recipe.id))).toBeUndefined();
  });
});

describe("buildRecipesQueryString", () => {
  it("is empty for no filters at all", () => {
    expect(buildRecipesQueryString({})).toBe("");
  });

  it("omits the default scope and trims the query", () => {
    expect(buildRecipesQueryString({ scope: "all", q: "  mash  " })).toBe("?q=mash");
  });

  it("carries every set filter", () => {
    expect(
      buildRecipesQueryString({
        scope: "custom",
        maxAgeMonths: 9,
        allergen: "peanut",
        ironFocus: true,
        ingredientFoodId: "food-1",
      }),
    ).toBe("?scope=custom&maxAgeMonths=9&allergen=peanut&ironFocus=true&ingredientFoodId=food-1");
  });

  // The server treats a PRESENT ironFocus as an exact match, so sending
  // `false` would hide every iron-focus recipe instead of filtering nothing.
  it("OMITS ironFocus entirely when the toggle is off", () => {
    expect(buildRecipesQueryString({ ironFocus: false })).toBe("");
    expect(buildRecipesQueryString({ ironFocus: undefined })).toBe("");
  });

  it("drops a blank query rather than sending q=", () => {
    expect(buildRecipesQueryString({ q: "   " })).toBe("");
  });
});

describe("asCustomRecipeConflict", () => {
  it("reads the counts out of a 409 body", () => {
    const error = new ApiError(409, "conflict", { error: "conflict", mealCount: 2, pantryCount: 0 });
    expect(asCustomRecipeConflict(error)).toEqual({ error: "conflict", mealCount: 2, pantryCount: 0 });
  });

  it("is null for every other failure", () => {
    expect(asCustomRecipeConflict(new ApiError(404, "not_found", { error: "not_found" }))).toBeNull();
    expect(asCustomRecipeConflict(new ApiError(409, "conflict", { error: "conflict" }))).toBeNull();
    expect(asCustomRecipeConflict(new Error("offline"))).toBeNull();
  });
});
