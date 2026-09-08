import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CreateCustomFoodInput,
  CreateCustomRecipeInput,
  FoodDetail,
  FoodListItem,
  FoodsQuery,
  FoodsResponse,
  RecipeDetail,
  RecipeListItem,
  RecipesResponse,
  UpdateCustomFoodInput,
  UpdateCustomRecipeInput,
} from "@blw/shared";
import { trackingKeys } from "../tracking/hooks.js";
import {
  createCustomFood,
  createCustomRecipe,
  deleteCustomFood,
  deleteCustomRecipe,
  fetchFood,
  fetchFoods,
  fetchRecipe,
  fetchRecipes,
  updateCustomFood,
  updateCustomRecipe,
  type RecipeFilters,
} from "./api.js";

/**
 * The catalog's query keys, previously inline string literals. Collected
 * here (mirroring `pantryKeys` / `trackingKeys`) because the custom-food
 * mutations now have to reach into these caches by prefix — `["foods"]`
 * matches every filter variant at once, including the `["foods", {}]` the
 * food picker's unfiltered `useFoods()` uses. The shapes are byte-identical
 * to the literals they replace, so existing tests that seed a cache by hand
 * keep hitting the same entries.
 */
export const catalogKeys = {
  /** Prefix covering every filter variant of the foods list. */
  foods: ["foods"] as const,
  foodsList: (filters: FoodsQuery) => ["foods", filters] as const,
  food: (slug: string | undefined) => ["food", slug] as const,
  recipe: (id: string | undefined) => ["recipe", id] as const,
  /** Prefix covering every filter variant of the recipes list. */
  recipes: ["recipes"] as const,
  recipesList: (filters: RecipeFilters) => ["recipes", filters] as const,
};

export function useFoods(filters: FoodsQuery = {}) {
  return useQuery({
    queryKey: catalogKeys.foodsList(filters),
    queryFn: () => fetchFoods(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFood(slug: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.food(slug),
    queryFn: () => fetchFood(slug as string),
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.recipe(id),
    queryFn: () => fetchRecipe(id as string),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Every recipe the caller can see (catalog + their own), filtered server-side
 * (item 205). `isFavorite` comes back per-caller, so this one query backs both
 * the Recipes segment's Favorites scope and the log form's favorites-first
 * picker without a second favorites fetch.
 */
export function useRecipes(filters: RecipeFilters = {}) {
  return useQuery({
    queryKey: catalogKeys.recipesList(filters),
    queryFn: () => fetchRecipes(filters),
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Custom foods — cache surgery (ledger 178-181)
//
// The picker's "add a custom food" flow (item 180) has to be able to SELECT
// the food it just created, immediately, without navigating and without
// waiting on a refetch. Selection is by food id against the option list the
// picker builds from `useFoods()`, so the created food has to be in that
// query's data before `onChange` runs — hence a synchronous write into every
// cached foods variant on success, with the invalidation left as the
// eventual-consistency backstop.
// ---------------------------------------------------------------------------

/**
 * The foods list with `food` in it: replacing the existing entry when the id
 * is already present (an edit), appending otherwise (a create). Appending —
 * rather than sorting — matches where the server would put it anyway: the
 * list comes back ordered by iron level then name, and a custom food's iron
 * level is always the neutral "low" placeholder, so it belongs at the tail
 * until the invalidation refetch settles the exact position.
 *
 * Pure, and returns the SAME object when nothing changed, so a no-op write
 * can't churn a query's reference identity.
 */
export function upsertFoodInList(data: FoodsResponse, food: FoodListItem): FoodsResponse {
  const index = data.foods.findIndex((candidate) => candidate.id === food.id);
  if (index === -1) return { ...data, foods: [...data.foods, food] };
  const foods = [...data.foods];
  foods[index] = food;
  return { ...data, foods };
}

/** The foods list without the food of that id (pure; see `upsertFoodInList`). */
export function removeFoodFromList(data: FoodsResponse, foodId: string): FoodsResponse {
  if (!data.foods.some((candidate) => candidate.id === foodId)) return data;
  return { ...data, foods: data.foods.filter((candidate) => candidate.id !== foodId) };
}

/**
 * Writes a just-created/just-updated custom food into every cached foods
 * list variant AND its own detail entry, so both the picker (which reads the
 * list) and `/foods/:slug` (which reads the detail) are correct on the very
 * next render. This is the "insert into the cache so the picker can select
 * it without a refetch" helper item 180 asks for.
 */
export function writeCustomFoodToCache(queryClient: QueryClient, food: FoodDetail): void {
  for (const [key, data] of queryClient.getQueriesData<FoodsResponse>({ queryKey: catalogKeys.foods })) {
    if (data) queryClient.setQueryData(key, upsertFoodInList(data, food));
  }
  queryClient.setQueryData(catalogKeys.food(food.slug), food);
}

/** The delete-side mirror of `writeCustomFoodToCache`. */
export function removeCustomFoodFromCache(queryClient: QueryClient, food: Pick<FoodDetail, "id" | "slug">): void {
  for (const [key, data] of queryClient.getQueriesData<FoodsResponse>({ queryKey: catalogKeys.foods })) {
    if (data) queryClient.setQueryData(key, removeFoodFromList(data, food.id));
  }
  queryClient.removeQueries({ queryKey: catalogKeys.food(food.slug) });
}

export function useCreateCustomFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomFoodInput) => createCustomFood(input),
    onSuccess: (created) => writeCustomFoodToCache(queryClient, created),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.foods });
    },
  });
}

export function useUpdateCustomFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomFoodInput }) => updateCustomFood(id, input),
    onSuccess: (updated) => writeCustomFoodToCache(queryClient, updated),
    onSettled: (updated) => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.foods });
      if (updated) void queryClient.invalidateQueries({ queryKey: catalogKeys.food(updated.slug) });
    },
  });
}

/**
 * Deleting a custom food can legitimately fail with a 409 (it's still
 * referenced by meals or pantry items — see `asCustomFoodConflict`), so the
 * cache is only touched on success. Meals and pantry aren't invalidated:
 * a food that could be deleted was, by definition, in neither.
 */
export function useDeleteCustomFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (food: Pick<FoodDetail, "id" | "slug">) => deleteCustomFood(food.id),
    onSuccess: (_result, food) => removeCustomFoodFromCache(queryClient, food),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.foods });
    },
  });
}

// ---------------------------------------------------------------------------
// Custom recipes — cache surgery (ledger 211-212)
//
// Same shape as the custom-food helpers above, with one difference that
// matters: the recipes list is FILTERED server-side (scope, age, allergen,
// ingredient), so a newly created recipe can't just be pushed into every
// cached variant — a recipe that doesn't match a filter would appear in a
// list that promised to exclude it. Inserting is therefore limited to the
// unfiltered variant (the one the picker and the default segment read);
// filtered variants only get an in-place REPLACE of a row they already hold,
// which is always correct, and the invalidation settles the rest.
// ---------------------------------------------------------------------------

/**
 * The list row for a just-saved recipe. `isFavorite` isn't part of
 * `RecipeDetail` (favoriting is a separate endpoint), so it's carried in
 * from whatever the cache already knew — a rename must never silently
 * un-favorite a row. Pure.
 */
export function recipeListItemFromDetail(recipe: RecipeDetail, isFavorite: boolean): RecipeListItem {
  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    minAgeMonths: recipe.minAgeMonths,
    ironFocus: recipe.ironFocus,
    allergens: [...recipe.allergens],
    isCustom: recipe.isCustom,
    isFavorite,
    ingredientNames: recipe.ingredients.map((ingredient) => ingredient.foodName),
  };
}

/** True for the `{}`-ish filter variant every recipe belongs in — no query,
 * no funnel filter, and either no scope or the default "all". */
export function isUnfilteredRecipeVariant(filters: unknown): boolean {
  if (typeof filters !== "object" || filters === null) return false;
  return Object.entries(filters as Record<string, unknown>).every(
    ([key, value]) => value === undefined || (key === "scope" && value === "all"),
  );
}

/**
 * The recipes list with `recipe` in it: an existing row of the same id is
 * replaced where it stands (so an edit keeps its position), otherwise the
 * recipe is inserted at its title-sorted spot — matching the server's
 * `title asc` ordering — but ONLY when `allowInsert` says this variant may
 * gain rows (see `isUnfilteredRecipeVariant`).
 *
 * Pure, and returns the SAME object when nothing changed.
 */
export function upsertRecipeInList(
  data: RecipesResponse,
  recipe: RecipeListItem,
  allowInsert = true,
): RecipesResponse {
  const index = data.recipes.findIndex((candidate) => candidate.id === recipe.id);
  if (index >= 0) {
    const recipes = [...data.recipes];
    recipes[index] = recipe;
    return { ...data, recipes };
  }
  if (!allowInsert) return data;
  const at = data.recipes.findIndex((candidate) => candidate.title.localeCompare(recipe.title) > 0);
  const recipes = [...data.recipes];
  recipes.splice(at === -1 ? recipes.length : at, 0, recipe);
  return { ...data, recipes };
}

/** The recipes list without the recipe of that id (pure; see `upsertRecipeInList`). */
export function removeRecipeFromList(data: RecipesResponse, recipeId: string): RecipesResponse {
  if (!data.recipes.some((candidate) => candidate.id === recipeId)) return data;
  return { ...data, recipes: data.recipes.filter((candidate) => candidate.id !== recipeId) };
}

/** Writes a just-created/just-updated custom recipe into the cached list
 * variants that may hold it, plus its own detail entry, so `/recipes/:id`
 * and the Recipes segment are both correct on the very next render. */
export function writeCustomRecipeToCache(queryClient: QueryClient, recipe: RecipeDetail): void {
  for (const [key, data] of queryClient.getQueriesData<RecipesResponse>({ queryKey: catalogKeys.recipes })) {
    if (!data) continue;
    const existing = data.recipes.find((candidate) => candidate.id === recipe.id);
    const row = recipeListItemFromDetail(recipe, existing?.isFavorite ?? false);
    queryClient.setQueryData(key, upsertRecipeInList(data, row, isUnfilteredRecipeVariant(key[1])));
  }
  queryClient.setQueryData(catalogKeys.recipe(recipe.id), recipe);
}

/** The delete-side mirror of `writeCustomRecipeToCache`. */
export function removeCustomRecipeFromCache(queryClient: QueryClient, recipeId: string): void {
  for (const [key, data] of queryClient.getQueriesData<RecipesResponse>({ queryKey: catalogKeys.recipes })) {
    if (data) queryClient.setQueryData(key, removeRecipeFromList(data, recipeId));
  }
  queryClient.removeQueries({ queryKey: catalogKeys.recipe(recipeId) });
}

export function useCreateCustomRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomRecipeInput) => createCustomRecipe(input),
    onSuccess: (created) => writeCustomRecipeToCache(queryClient, created),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.recipes });
    },
  });
}

export function useUpdateCustomRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomRecipeInput }) => updateCustomRecipe(id, input),
    onSuccess: (updated) => writeCustomRecipeToCache(queryClient, updated),
    onSettled: (updated) => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.recipes });
      if (updated) void queryClient.invalidateQueries({ queryKey: catalogKeys.recipe(updated.id) });
      // A favorited recipe's title is denormalised into the favorites list.
      void queryClient.invalidateQueries({ queryKey: trackingKeys.favorites });
    },
  });
}

/**
 * Deleting a custom recipe can legitimately fail with a 409 (meals or pantry
 * items still point at it — see `asCustomRecipeConflict`), so the cache is
 * only touched on success. The server drops the caller's favorite row along
 * with the recipe, hence the favorites invalidation.
 */
export function useDeleteCustomRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) => deleteCustomRecipe(recipeId),
    onSuccess: (_result, recipeId) => removeCustomRecipeFromCache(queryClient, recipeId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.recipes });
      void queryClient.invalidateQueries({ queryKey: trackingKeys.favorites });
    },
  });
}
