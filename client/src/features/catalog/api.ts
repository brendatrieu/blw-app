import {
  customRecipeConflictSchema,
  type CreateCustomFoodInput,
  type CreateCustomRecipeInput,
  type CustomRecipeConflict,
  type FoodDetail,
  type FoodsQuery,
  type FoodsResponse,
  type RecipeDetail,
  type RecipeScope,
  type RecipesResponse,
  type ReplaceCustomFoodResponse,
  type UpdateCustomFoodInput,
  type UpdateCustomRecipeInput,
} from "@blw/shared";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api.js";

/**
 * Every FoodsQuery key becomes a query param — this is an allow-list, so a
 * new filter that isn't added here silently never reaches the server (the
 * chip would show, the list wouldn't change). api.test.ts pins the full set.
 */
export function buildFoodsQueryString(filters: FoodsQuery): string {
  const params = new URLSearchParams();
  // Pick-several groups (item 595): one repeated param per value, and an
  // empty pick sends nothing at all (never `category=`).
  for (const key of ["category", "allergen", "ironLevel", "vitaminCLevel", "fiberLevel"] as const) {
    for (const value of filters[key] ?? []) params.append(key, value);
  }
  if (filters.q) params.set("q", filters.q);
  if (filters.maxAgeMonths !== undefined) params.set("maxAgeMonths", String(filters.maxAgeMonths));
  if (filters.deleted) params.set("deleted", "true");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchFoods(filters: FoodsQuery): Promise<FoodsResponse> {
  return apiGet<FoodsResponse>(`/api/foods${buildFoodsQueryString(filters)}`);
}

export function fetchFood(slug: string): Promise<FoodDetail> {
  return apiGet<FoodDetail>(`/api/foods/${encodeURIComponent(slug)}`);
}

export function fetchRecipe(id: string): Promise<RecipeDetail> {
  return apiGet<RecipeDetail>(`/api/recipes/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Custom foods (ledger 171-173). The server takes a food's UUID — not its
// slug — for the write routes, and answers with the same `FoodDetail` shape
// the read route does, so a created/updated food can go straight into the
// caches the list and detail queries read from.
// ---------------------------------------------------------------------------

export function createCustomFood(input: CreateCustomFoodInput): Promise<FoodDetail> {
  return apiPost<FoodDetail>("/api/foods", input);
}

export function updateCustomFood(id: string, input: UpdateCustomFoodInput): Promise<FoodDetail> {
  return apiPatch<FoodDetail>(`/api/foods/${encodeURIComponent(id)}`, input);
}

/** Soft: the food stays for the history that names it (ledger 537). */
export function deleteCustomFood(id: string): Promise<void> {
  return apiDelete<void>(`/api/foods/${encodeURIComponent(id)}`);
}

export function restoreCustomFood(id: string): Promise<FoodDetail> {
  return apiPost<FoodDetail>(`/api/foods/${encodeURIComponent(id)}/restore`);
}

/** Moves every use onto `replacementId`, then deletes the food for good. */
export function replaceCustomFood(id: string, replacementId: string): Promise<ReplaceCustomFoodResponse> {
  return apiPost<ReplaceCustomFoodResponse>(`/api/foods/${encodeURIComponent(id)}/replace`, { replacementId });
}

// ---------------------------------------------------------------------------
// Recipes (ledger 205-206, 210). `GET /api/recipes` is the one list every
// recipe surface reads: the Recipes segment of the Foods page and the log
// form's recipe picker. It answers with the caller's own custom recipes
// alongside the catalog, never anyone else's.
// ---------------------------------------------------------------------------

/**
 * The filter state the Recipes segment holds, and the query key it caches
 * under. Deliberately the client's own shape rather than shared's
 * `RecipesQuery`: `scope` is optional here (absent = the server's "all"
 * default) and `ironFocus` is a real boolean, because it's a toggle.
 */
export interface RecipeFilters {
  q?: string;
  scope?: RecipeScope;
  maxAgeMonths?: number;
  /** Pick-several: a recipe containing ANY of these matches. */
  allergen?: string[];
  ironFocus?: boolean;
  vitaminCHigh?: boolean;
  fiberHigh?: boolean;
  ingredientFoodId?: string;
}

/**
 * The query string for a set of filters. Pure and exported for the same
 * reason `buildCustomFoodInput` is: the ONE rule that's easy to get wrong —
 * `ironFocus`, `vitaminCHigh` and `fiberHigh` are exact matches server-side,
 * so an off toggle must OMIT the key rather than send `false` (which would
 * hide every matching recipe) — is pinned by a test instead of by reading the
 * fetch call.
 */
export function buildRecipesQueryString(filters: RecipeFilters): string {
  const params = new URLSearchParams();
  const q = filters.q?.trim();
  if (q) params.set("q", q);
  if (filters.scope && filters.scope !== "all") params.set("scope", filters.scope);
  if (filters.maxAgeMonths !== undefined) params.set("maxAgeMonths", String(filters.maxAgeMonths));
  for (const allergen of filters.allergen ?? []) params.append("allergen", allergen);
  if (filters.ironFocus) params.set("ironFocus", "true");
  if (filters.vitaminCHigh) params.set("vitaminCHigh", "true");
  if (filters.fiberHigh) params.set("fiberHigh", "true");
  if (filters.ingredientFoodId) params.set("ingredientFoodId", filters.ingredientFoodId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchRecipes(filters: RecipeFilters): Promise<RecipesResponse> {
  return apiGet<RecipesResponse>(`/api/recipes${buildRecipesQueryString(filters)}`);
}

export function createCustomRecipe(input: CreateCustomRecipeInput): Promise<RecipeDetail> {
  return apiPost<RecipeDetail>("/api/recipes", input);
}

export function updateCustomRecipe(id: string, input: UpdateCustomRecipeInput): Promise<RecipeDetail> {
  return apiPatch<RecipeDetail>(`/api/recipes/${encodeURIComponent(id)}`, input);
}

export function deleteCustomRecipe(id: string): Promise<void> {
  return apiDelete<void>(`/api/recipes/${encodeURIComponent(id)}`);
}

/**
 * The `{ error: "conflict", mealCount, storageCount }` body behind a 409 from
 * `deleteCustomRecipe`, or null for any other failure. Pure and exported so
 * the recipe page's inline "used in N meals…" message is unit-testable: it
 * takes the thrown value as `unknown` (a mutation's `error` type) and narrows
 * it here, so no caller has to hand-check `instanceof ApiError` plus the shape.
 * Favorites are never a block: the server just deletes the caller's own
 * favorite row along with the recipe.
 */
export function asCustomRecipeConflict(error: unknown): CustomRecipeConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const parsed = customRecipeConflictSchema.safeParse(error.body);
  return parsed.success ? parsed.data : null;
}
