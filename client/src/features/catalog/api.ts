import type { FoodDetail, FoodsQuery, FoodsResponse, RecipeDetail } from "@blw/shared";
import { apiGet } from "../../lib/api.js";

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
