import type {
  AllergenProgressResponse,
  CreateMealInput,
  FavoritesResponse,
  MealItem,
  MealsResponse,
  UpdateMealInput,
} from "@blw/shared";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api.js";

// lib/api.ts only exposed GET/POST/PATCH/DELETE when this feature was
// built (favoriting needs PUT). A tiny local wrapper avoids reaching outside
// this feature's ownership to add one there.
async function apiPut<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "PUT", headers: { Accept: "application/json" } });

  if (!response.ok) {
    let message = response.statusText || `Request failed with status ${response.status}`;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string") {
        message = (body as { error: string }).error;
      }
    } catch {
      // Non-JSON or empty error body — fall through to the status text.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export interface MealsQuery {
  limit?: number;
  /** Cursor: only meals served strictly before this ISO timestamp. */
  before?: string;
}

function buildMealsQueryString(query: MealsQuery): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.before) params.set("before", query.before);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchMeals(babyId: string, query: MealsQuery = {}): Promise<MealsResponse> {
  return apiGet<MealsResponse>(`/api/babies/${babyId}/meals${buildMealsQueryString(query)}`);
}

export function createMeal(babyId: string, input: CreateMealInput): Promise<MealItem> {
  return apiPost<MealItem>(`/api/babies/${babyId}/meals`, input);
}

export function updateMeal(id: string, input: UpdateMealInput): Promise<MealItem> {
  return apiPatch<MealItem>(`/api/meals/${id}`, input);
}

export function deleteMeal(id: string): Promise<void> {
  return apiDelete<void>(`/api/meals/${id}`);
}

export function fetchAllergenProgress(babyId: string): Promise<AllergenProgressResponse> {
  return apiGet<AllergenProgressResponse>(`/api/babies/${babyId}/allergen-progress`);
}

export function fetchFavorites(): Promise<FavoritesResponse> {
  return apiGet<FavoritesResponse>("/api/favorites");
}

export function putFavorite(recipeId: string): Promise<void> {
  return apiPut<void>(`/api/recipes/${recipeId}/favorite`);
}

export function deleteFavorite(recipeId: string): Promise<void> {
  return apiDelete<void>(`/api/recipes/${recipeId}/favorite`);
}
