import {
  customFoodConflictSchema,
  type CreateCustomFoodInput,
  type CustomFoodConflict,
  type FoodDetail,
  type FoodsQuery,
  type FoodsResponse,
  type RecipeDetail,
  type UpdateCustomFoodInput,
} from "@blw/shared";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api.js";

function buildFoodsQueryString(filters: FoodsQuery): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.allergen) params.set("allergen", filters.allergen);
  if (filters.ironLevel) params.set("ironLevel", filters.ironLevel);
  if (filters.q) params.set("q", filters.q);
  if (filters.maxAgeMonths !== undefined) params.set("maxAgeMonths", String(filters.maxAgeMonths));
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

export function deleteCustomFood(id: string): Promise<void> {
  return apiDelete<void>(`/api/foods/${encodeURIComponent(id)}`);
}

/**
 * The `{ error: "conflict", mealCount, pantryCount }` body behind a 409 from
 * `deleteCustomFood`, or null for any other failure. Pure and exported so
 * the food page's inline "used in N meals…" message is unit-testable without
 * a network layer: it takes the thrown value as `unknown` (that's what a
 * mutation's `error` is typed as at the call site) and narrows it here, so
 * no caller has to hand-check `instanceof ApiError` plus the shape.
 */
export function asCustomFoodConflict(error: unknown): CustomFoodConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const parsed = customFoodConflictSchema.safeParse(error.body);
  return parsed.success ? parsed.data : null;
}
