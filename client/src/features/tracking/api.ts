import type {
  AllergenProgressResponse,
  CreateServeLogInput,
  FavoritesResponse,
  ServeLogItem,
  ServeLogsResponse,
} from "@blw/shared";
import { ApiError, apiDelete, apiGet, apiPost } from "../../lib/api.js";

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

export interface ServeLogsQuery {
  limit?: number;
  /** Cursor: only rows served strictly before this ISO timestamp. */
  before?: string;
}

function buildServeLogsQueryString(query: ServeLogsQuery): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.before) params.set("before", query.before);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchServeLogs(babyId: string, query: ServeLogsQuery = {}): Promise<ServeLogsResponse> {
  return apiGet<ServeLogsResponse>(`/api/babies/${babyId}/serve-logs${buildServeLogsQueryString(query)}`);
}

export function createServeLog(babyId: string, input: CreateServeLogInput): Promise<ServeLogItem[]> {
  return apiPost<ServeLogItem[]>(`/api/babies/${babyId}/serve-logs`, input);
}

export function deleteServeLog(id: string): Promise<void> {
  return apiDelete<void>(`/api/serve-logs/${id}`);
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
