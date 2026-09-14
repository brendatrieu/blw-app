import type { QueryClient } from "@tanstack/react-query";
import type { UsageEvent } from "@blw/shared";
import { fromRouteFor } from "./track.js";
import { toRoutePattern } from "./routes.js";
import { resolveFreshness, type FreshnessInput } from "../../features/storage/freshness.js";

/**
 * Every prop a call site sends, derived in one pure place.
 *
 * Two rules shape this file:
 *
 *   * a COUNT becomes a bucket before it leaves the device. "3 foods" is a
 *     product fact; "7 foods, 22:14, Tuesday" starts to be a fingerprint,
 *     and no question in the plan needs the exact number;
 *   * `via` is DERIVED from the route and its query params, never wired to a
 *     button. A new entry point to the log form is then measured the moment
 *     it links there, and no button is one refactor away from lying about
 *     where it lives.
 */

type Props<N extends UsageEvent["name"]> = Extract<UsageEvent, { name: N }>["props"];

export type MealVia = Props<"meal_logged">["via"];
export type StorageAddVia = Props<"storage_item_added">["via"];
export type StorageClosedVia = Props<"storage_item_closed">["via"];
export type RecipeKind = Props<"meal_logged">["recipe_kind"];
export type FailureKind = Props<"meal_save_failed">["kind"];
export type ClientErrorKind = Props<"client_error">["kind"];
export type AiKeyOutcome = Props<"ai_key_saved">["outcome"];

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export function foodCountBucket(count: number): Props<"meal_logged">["food_count"] {
  if (count <= 1) return "1";
  if (count === 2) return "2";
  if (count === 3) return "3";
  if (count <= 5) return "4-5";
  return "6+";
}

/** How far back the "when" field was set, relative to the moment of saving. */
export function backdatedBucket(servedAt: Date | string, now: Date = new Date()): Props<"meal_logged">["backdated"] {
  const at = typeof servedAt === "string" ? Date.parse(servedAt) : servedAt.getTime();
  if (!Number.isFinite(at)) return "now";
  const ms = now.getTime() - at;
  // A "when" the parent never touched is the current minute, which can round
  // a few seconds either side of now.
  if (ms < 60_000) return "now";
  if (ms < 60 * 60_000) return "<1h";
  if (ms < 24 * 60 * 60_000) return "<1d";
  return "1d+";
}

export function resultsBucket(count: number): Props<"catalog_filtered">["results"] {
  if (count <= 0) return "0";
  if (count <= 5) return "1-5";
  if (count <= 20) return "6-20";
  if (count <= 50) return "21-50";
  return "50+";
}

export function ageDaysBucket(days: number): Props<"storage_item_closed">["age_days_bucket"] {
  if (!Number.isFinite(days) || days <= 0) return "0";
  const whole = Math.floor(days);
  if (whole <= 0) return "0";
  if (whole === 1) return "1";
  if (whole <= 3) return "2-3";
  if (whole <= 7) return "4-7";
  if (whole <= 14) return "8-14";
  return "15+";
}

/** Whole days between two instants — how old a storage item was when it closed. */
export function daysBetween(from: string | Date, to: Date = new Date()): number {
  const start = typeof from === "string" ? Date.parse(from) : from.getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((to.getTime() - start) / (24 * 60 * 60 * 1000)));
}

export function attemptBucket(attempt: number): Props<"ai_key_saved">["attempt"] {
  if (attempt <= 1) return "1";
  if (attempt === 2) return "2";
  return "3+";
}

/** HTTP status → the codes we actually act on. `undefined` is "no response at all". */
export function statusBucket(status: number | undefined | null): Props<"client_error">["status"] {
  if (status === undefined || status === null || !Number.isFinite(status)) return "none";
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 409:
    case 429:
    case 500:
    case 502:
    case 503:
    case 504:
      return String(status) as Props<"client_error">["status"];
    default:
      break;
  }
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "none";
}

// ---------------------------------------------------------------------------
// `via`, from the route
// ---------------------------------------------------------------------------

export interface LocationLike {
  pathname: string;
  search: string;
}

/** The browser's location, or a blank one outside a browser. */
export function readLocation(): LocationLike {
  if (typeof window === "undefined" || !window.location) return { pathname: "", search: "" };
  return { pathname: window.location.pathname, search: window.location.search };
}

/**
 * Where a meal was logged from.
 *
 * `/log-meal?recipe=<id>` is a recipe page's "Log meal"; `?food=<id>` is a
 * food page's. Only the PRESENCE of the param is read — the id itself never
 * leaves this function.
 */
export function mealViaFromLocation(location: LocationLike = readLocation()): MealVia {
  if (toRoutePattern(location.pathname) !== "/log-meal") return "log_page";
  const params = new URLSearchParams(location.search);
  if (params.has("recipe")) return "recipe_page";
  if (params.has("food")) return "food_page";
  return "log_page";
}

/**
 * Where a storage item was added from.
 *
 * Home and the Storage tab both link to a bare `/storage/add`, so the two are
 * told apart by the route the parent came FROM — still derived, still no
 * per-button wiring.
 */
export function storageAddViaFromLocation(location: LocationLike = readLocation()): StorageAddVia {
  const pattern = toRoutePattern(location.pathname);
  // The leftovers switch on the log form posts its storage item while still
  // on /log-meal.
  if (pattern === "/log-meal") return "log_leftovers";
  if (pattern !== "/storage/add") return "storage_page";
  const params = new URLSearchParams(location.search);
  if (params.has("recipe")) return "recipe_page";
  if (params.has("food")) return "food_page";
  return fromRouteFor("/storage/add") === "/" ? "home" : "storage_page";
}

/** Restore vs remove, read off the status being written rather than the button. */
export function storageClosedVia(to: Props<"storage_item_closed">["to"]): StorageClosedVia {
  return to === "active" ? "restore" : "remove";
}

/** Which container source an add came from, read off the payload. */
export function storageSourceFromInput(input: {
  recipeId?: string | null;
  foodIds?: string[] | null;
}): Props<"storage_item_added">["source"] {
  if (input.recipeId) return "recipe";
  if (input.foodIds && input.foodIds.length > 0) return "food";
  return "label";
}

/**
 * How fresh an item was at the moment its status changed.
 *
 * Read through `resolveFreshness` — the same rule the card's chip shows — so
 * an item a parent discarded because the app called it Expired is never
 * counted as "fresh" just because the server's window-derived flags
 * disagreed with the best-by date on the tub (item 333). Still three buckets
 * and still nothing about the container itself.
 */
export function freshnessAtChange(item: FreshnessInput): Props<"storage_item_closed">["freshness_at_change"] {
  return resolveFreshness(item).state;
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

/** A one-ingredient recipe is a "basic" — the same rule `isBasicRecipe` uses. */
export function recipeKindFromRecipe(recipe: { isCustom: boolean; ingredientCount: number }): RecipeKind {
  if (recipe.isCustom) return "custom";
  return recipe.ingredientCount === 1 ? "basic" : "catalog";
}

/**
 * The catalog's query keys, restated rather than imported.
 *
 * `catalogKeys` lives in features/catalog/hooks.ts, which itself imports the
 * tracking hooks that call this — importing it back would close a runtime
 * cycle for the sake of two array literals. A test pins these against
 * `catalogKeys` so they cannot drift.
 */
const RECIPE_DETAIL_KEY = (id: string) => ["recipe", id] as const;
const RECIPES_LIST_PREFIX = ["recipes"] as const;

interface CachedRecipeDetail {
  isCustom: boolean;
  ingredients: readonly unknown[];
}
interface CachedRecipeRow {
  id: string;
  isCustom: boolean;
  ingredientNames: readonly unknown[];
}

/**
 * Which kind of recipe a meal was attributed to, answered from caches the
 * page already holds: the detail entry the log form's `useRecipe` fills, else
 * any cached recipes list.
 *
 * A recipe in neither reads as `catalog` — the honest default, since every
 * custom recipe a parent can attach was fetched by the picker they attached
 * it with.
 */
export function lookupRecipeKind(queryClient: QueryClient, recipeId: string | null | undefined): RecipeKind {
  if (!recipeId) return "none";

  const detail = queryClient.getQueryData<CachedRecipeDetail>(RECIPE_DETAIL_KEY(recipeId));
  if (detail) return recipeKindFromRecipe({ isCustom: detail.isCustom, ingredientCount: detail.ingredients.length });

  for (const [, data] of queryClient.getQueriesData<{ recipes: CachedRecipeRow[] }>({ queryKey: RECIPES_LIST_PREFIX })) {
    const row = data?.recipes.find((candidate) => candidate.id === recipeId);
    if (row) return recipeKindFromRecipe({ isCustom: row.isCustom, ingredientCount: row.ingredientNames.length });
  }
  return "catalog";
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

/**
 * Why a write failed, at the coarsest grain that still separates "the network
 * was gone" from "we sent something wrong" from "we broke". The message and
 * stack stay on the console; only this three-way answer travels.
 */
export function failureKind(error: unknown): FailureKind {
  const status = errorStatus(error);
  if (status === undefined) return "network";
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  return "network";
}

/** The HTTP status behind an error, when it had one (see `ApiError`). */
export function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === "number" && Number.isFinite(status)) return status;
  }
  return undefined;
}

/** Whether the device believes it is offline right now. */
export function isOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false;
}

/**
 * A failed dynamic import — the one runtime error a DEPLOY causes rather than
 * a bug: the old bundle asks for a chunk the new one no longer serves. Told
 * apart from an ordinary crash because the fix is different (reload, not
 * patch), which is exactly what the quality panel needs to know.
 */
export function isChunkLoadError(message: string): boolean {
  return /dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed|error loading dynamically imported/i.test(
    message,
  );
}

/** The message of anything throwable, for `isChunkLoadError` only — never sent. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  return "";
}

/** Settings' AI key form: the server's machine code → the closed outcome set. */
export function aiKeySaveOutcome(error: unknown): AiKeyOutcome {
  const code = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  switch (code) {
    case "invalid_key":
      return "invalid_key";
    case "validation_unavailable":
      return "validation_unavailable";
    case "rate_limited":
      return "rate_limited";
    default:
      return "network_error";
  }
}
