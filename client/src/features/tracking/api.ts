import type {
  AllergenDetail,
  AllergenProgressResponse,
  CreateMealInput,
  FavoritesResponse,
  MarkAllergenEstablishedInput,
  MealItem,
  MealsResponse,
  UpdateMealInput,
} from "@blw/shared";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api.js";

// lib/api.ts only exposed GET/POST/PATCH/DELETE when this feature was
// built (favoriting needs PUT). A tiny local wrapper avoids reaching outside
// this feature's ownership to add one there.
//
// `body` is optional because one of its two callers (`putFavorite`) has
// nothing to say. It is either a real JSON object (serialized, with the
// header) or NO body at all — never an empty string with `Content-Type:
// application/json`, which Fastify rejects as a malformed payload before any
// route handler runs. Both branches are pinned in api.test.ts.
async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    headers:
      body === undefined
        ? { Accept: "application/json" }
        : { Accept: "application/json", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

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

/**
 * The ladder row zoomed in: the same progress item plus the foods carrying
 * this allergen and the meals that exposed this baby to it. Lives under the
 * progress route's own path because it IS that route's row in detail.
 */
export function fetchAllergenDetail(babyId: string, allergenSlug: string): Promise<AllergenDetail> {
  return apiGet<AllergenDetail>(`/api/babies/${babyId}/allergen-progress/${allergenSlug}`);
}

/**
 * The body THIS client always sends: the shared schema's, with
 * `establishedAt` required.
 *
 * The wire contract keeps it optional — the server reads an absent one as
 * "now" so a PWA still running a pre-item-364 bundle keeps working — but that
 * default is exactly the accident this app must never have: the maintenance
 * countdown runs from `establishedAt`, so a mark that forgets to send the
 * parent's date silently restarts the week at today and still looks right.
 * Required here makes dropping it a type error at the call site rather than a
 * silent behaviour change. An intersection rather than `Required<…>` so a
 * future optional key on the shared body stays optional for this caller —
 * `establishedAt` is the only one that must never go missing.
 */
export type MarkAllergenEstablishedBody = MarkAllergenEstablishedInput & { establishedAt: string };

/** "Already established before the app" override — see `unionAllergenStatus`
 * in shared/src/tracking.ts. Idempotent server-side, and re-marking MOVES the
 * date rather than adding a row (item 364), so the same PUT is both "mark"
 * and "correct the date I picked". */
export function putAllergenOverride(
  babyId: string,
  allergenKey: string,
  input: MarkAllergenEstablishedBody,
): Promise<void> {
  return apiPut<void>(`/api/babies/${babyId}/allergens/${allergenKey}/established`, input);
}

/** Undo for `putAllergenOverride` — DELETE is idempotent too. */
export function deleteAllergenOverride(babyId: string, allergenKey: string): Promise<void> {
  return apiDelete<void>(`/api/babies/${babyId}/allergens/${allergenKey}/established`);
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
