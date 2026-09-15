// Storage freshness and container contents, in one place.
//
// Three callers need the same answers — the storage routes (which serve the
// cards), the AI `get_storage` tool (which tells the model what is in the
// fridge), and the account export (which names what each container held) —
// and the two that used to compute it separately drifted: the tool kept its
// own copy of the fallback window and its own hand-rolled expiry maths, with
// a comment admitting it was "kept in sync by hand". It is not duplicated any
// more; there is one window rule and one freshness rule, here.
import { asc, eq, inArray } from "drizzle-orm";
import type { StorageItemFood, StorageLocation } from "@blw/shared";
import type { Database } from "../db/index.js";
import { foods, recipeIngredients, storageGuidelines, storageItemFoods } from "../db/schema.js";

const HOUR_MS = 60 * 60 * 1000;

/** Fraction of the window after which an item is flagged "use soon". */
const USE_SOON_THRESHOLD = 0.75;

/**
 * Window used when an item has neither a catalog food nor a recipe to derive
 * a `storage_guidelines` category from (a pure free-form label). Mirrors the
 * seeded `soup_stew_curry` row — the closest "any cooked home meal" analog —
 * since no literal `cooked-meal` category exists in the seed data.
 */
export const STORAGE_FALLBACK_WINDOW = { fridgeHours: 48, freezerDays: 60, roomTempHours: 2 };

// ---------------------------------------------------------------------------
// What is in a container
// ---------------------------------------------------------------------------

/** A food in a container, plus the storage category the window comes from. */
export interface StorageItemFoodRow extends StorageItemFood {
  storageItemId: string;
  storageCategory: string;
}

/**
 * Every food of every named container, in ONE query, grouped by item and in
 * the order the parent saved them (`position`, then food id as a stable
 * tiebreaker so two foods written in the same statement never swap places
 * between reads). An item with no foods — recipe-sourced or label-only —
 * simply has no entry in the map.
 */
export async function loadStorageItemFoods(
  db: Database,
  itemIds: string[],
): Promise<Map<string, StorageItemFoodRow[]>> {
  const byItemId = new Map<string, StorageItemFoodRow[]>();
  if (itemIds.length === 0) return byItemId;

  const rows = await db
    .select({
      storageItemId: storageItemFoods.storageItemId,
      id: foods.id,
      slug: foods.slug,
      name: foods.name,
      emoji: foods.emoji,
      storageCategory: foods.storageCategory,
    })
    .from(storageItemFoods)
    .innerJoin(foods, eq(storageItemFoods.foodId, foods.id))
    .where(inArray(storageItemFoods.storageItemId, itemIds))
    .orderBy(asc(storageItemFoods.position), asc(storageItemFoods.foodId));

  for (const row of rows) {
    const list = byItemId.get(row.storageItemId);
    if (list) list.push(row);
    else byItemId.set(row.storageItemId, [row]);
  }
  return byItemId;
}

/**
 * The storage category of each recipe's FIRST ingredient — what a
 * recipe-sourced container (which names no foods of its own) derives its
 * window from. "First" has no explicit ordering column in
 * `recipe_ingredients`, so this orders by the join row's id for a
 * deterministic, if arbitrary, pick — the same one this has always made.
 */
export async function loadRecipeIngredientCategories(
  db: Database,
  recipeIds: string[],
): Promise<Map<string, string>> {
  const byRecipeId = new Map<string, string>();
  if (recipeIds.length === 0) return byRecipeId;

  const rows = await db
    .select({ recipeId: recipeIngredients.recipeId, storageCategory: foods.storageCategory })
    .from(recipeIngredients)
    .innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
    .where(inArray(recipeIngredients.recipeId, recipeIds))
    .orderBy(asc(recipeIngredients.id));

  for (const row of rows) {
    if (!byRecipeId.has(row.recipeId)) byRecipeId.set(row.recipeId, row.storageCategory);
  }
  return byRecipeId;
}

// ---------------------------------------------------------------------------
// The window, and the freshness derived from it
// ---------------------------------------------------------------------------

/** The columns of `storage_guidelines` a window is resolved from. */
export interface StorageGuideline {
  fridgeHours: number;
  freezerDays: number | null;
  roomTempHours: number;
}

export interface StorageWindowInput {
  location: StorageLocation;
  /**
   * The storage categories of everything in the container: every food's own
   * category, or — for a recipe-sourced item — its first ingredient's, which
   * is what this has always used. Empty means "nothing to derive from".
   */
  categories: string[];
  /**
   * A recipe item's own overrides, which still beat the category guideline.
   * There is no room-temperature override column, so the counter window is
   * always the guideline's.
   */
  recipeOverrides?: { fridgeHours: number | null; freezerDays: number | null } | null;
}

/**
 * How many hours a container is good for.
 *
 * With several foods in one container the SHORTEST window wins: leftovers of
 * chicken and banana go off when the chicken does, and telling a parent
 * otherwise is the one error that actually matters here. Precedence inside
 * each category is unchanged — a recipe's override beats the category
 * guideline, which beats the fallback.
 *
 * A category with no guideline row contributes the fallback rather than being
 * skipped, so an unknown category can only ever shorten the answer.
 */
export function resolveStorageWindowHours(
  input: StorageWindowInput,
  guidelineByCategory: Map<string, StorageGuideline>,
): number {
  const windowFor = (guideline: StorageGuideline | undefined): number => {
    const fridgeHours = input.recipeOverrides?.fridgeHours ?? guideline?.fridgeHours ?? STORAGE_FALLBACK_WINDOW.fridgeHours;
    const freezerDays = input.recipeOverrides?.freezerDays ?? guideline?.freezerDays ?? STORAGE_FALLBACK_WINDOW.freezerDays;
    const roomTempHours = guideline?.roomTempHours ?? STORAGE_FALLBACK_WINDOW.roomTempHours;
    return input.location === "fridge" ? fridgeHours : input.location === "freezer" ? freezerDays * 24 : roomTempHours;
  };

  if (input.categories.length === 0) return windowFor(undefined);
  return Math.min(...input.categories.map((category) => windowFor(guidelineByCategory.get(category))));
}

/** The `storage_guidelines` rows for these categories, keyed by category. */
export async function loadStorageGuidelines(
  db: Database,
  categories: string[],
): Promise<Map<string, StorageGuideline>> {
  if (categories.length === 0) return new Map();
  const rows = await db.select().from(storageGuidelines).where(inArray(storageGuidelines.category, categories));
  return new Map(rows.map((row) => [row.category, row]));
}

export interface StorageFreshness {
  /** ISO — when the window runs out. Never stored; derived on every read. */
  expiresAt: string;
  useSoon: boolean;
  expired: boolean;
}

/** The 0.75 rule: past the window is `expired`, three quarters through it is
 * `useSoon`, and an expired item is never also `useSoon`. */
export function deriveFreshness(preparedAt: Date, windowHours: number, now: number): StorageFreshness {
  const preparedMs = preparedAt.getTime();
  const expiresAtMs = preparedMs + windowHours * HOUR_MS;
  const expired = now > expiresAtMs;
  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    useSoon: !expired && now >= preparedMs + windowHours * HOUR_MS * USE_SOON_THRESHOLD,
    expired,
  };
}
