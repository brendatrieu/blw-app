import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CreateCustomFoodInput,
  FoodDetail,
  FoodListItem,
  FoodsQuery,
  FoodsResponse,
  UpdateCustomFoodInput,
} from "@blw/shared";
import {
  createCustomFood,
  deleteCustomFood,
  fetchFood,
  fetchFoods,
  fetchRecipe,
  updateCustomFood,
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
