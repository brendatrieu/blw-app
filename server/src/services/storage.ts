// Storage freshness and container contents, in one place.
//
// Three callers need the same answers — the storage routes (which serve the
// cards), the AI `get_storage` tool (which tells the model what is in the
// fridge), and the account export (which names what each container held) —
// and the two that used to compute it separately drifted: the tool kept its
// own copy of the fallback window and its own hand-rolled expiry maths, with
// a comment admitting it was "kept in sync by hand". It is not duplicated any
// more; there is one window rule and one freshness rule, here.
import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { StorageItem, StorageItemFood, StorageLocation } from "@blw/shared";
import type { Database } from "../db/index.js";
import type { Transaction } from "./meals.js";
import {
  foods,
  recipeIngredients,
  recipes,
  storageGuidelines,
  storageItemFoods,
  storageItemRecipes,
  storageItems,
} from "../db/schema.js";

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
  // `select` only, so the serve route can read contents inside its
  // transaction (item 729: contents are editable now).
  db: Database | Transaction,
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
      // A deleted food stays in its container, marked.
      deleted: sql<boolean>`${foods.deletedAt} is not null`,
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

/** A recipe a container was made from, with its own window overrides. */
export interface ContainerRecipe {
  id: string;
  title: string;
  fridgeHoursOverride: number | null;
  freezerDaysOverride: number | null;
  /** Its owner has since deleted it; the container keeps it, marked (ledger 957). */
  deleted?: boolean;
}

/** The columns of a container row (joined to its `recipe_id` recipe) that
 * `loadContainerRecipes` and `containerWindowHours` read. */
export interface ContainerRow {
  id: string;
  recipeId: string | null;
  recipeTitle: string | null;
  recipeFridgeHoursOverride: number | null;
  recipeFreezerOverride: number | null;
  location: StorageLocation;
}

/**
 * Every recipe each container was made from, in the parent's order: the
 * `storage_item_recipes` rows of a several-recipe container (ledger 753), or
 * else its one `recipe_id`, or none. One query for the whole list.
 */
export async function loadContainerRecipes(
  db: Database | Transaction,
  rows: readonly (Pick<ContainerRow, "id" | "recipeId" | "recipeTitle"> &
    Partial<Pick<ContainerRow, "recipeFridgeHoursOverride" | "recipeFreezerOverride">> & { recipeDeleted?: boolean })[],
): Promise<Map<string, ContainerRecipe[]>> {
  const several = new Map<string, ContainerRecipe[]>();
  if (rows.length > 0) {
    const joined = await db
      .select({
        storageItemId: storageItemRecipes.storageItemId,
        id: recipes.id,
        title: recipes.title,
        fridgeHoursOverride: recipes.fridgeHoursOverride,
        freezerDaysOverride: recipes.freezerDaysOverride,
        deleted: sql<boolean>`${recipes.deletedAt} is not null`,
      })
      .from(storageItemRecipes)
      .innerJoin(recipes, eq(storageItemRecipes.recipeId, recipes.id))
      .where(
        inArray(
          storageItemRecipes.storageItemId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(storageItemRecipes.position), asc(storageItemRecipes.recipeId));
    for (const { storageItemId, ...recipe } of joined) {
      const list = several.get(storageItemId);
      if (list) list.push(recipe);
      else several.set(storageItemId, [recipe]);
    }
  }
  return new Map(
    rows.map((row) => [
      row.id,
      several.get(row.id) ??
        (row.recipeId
          ? [
              {
                id: row.recipeId,
                title: row.recipeTitle ?? "",
                fridgeHoursOverride: row.recipeFridgeHoursOverride ?? null,
                freezerDaysOverride: row.recipeFreezerOverride ?? null,
                deleted: row.recipeDeleted ?? false,
              },
            ]
          : []),
    ]),
  );
}

/**
 * How many hours each container is good for — the one rule the storage cards
 * and the AI `get_storage` tool share. A container with foods of its own
 * resolves from every food (with its recipe's overrides, as it always did);
 * one made from recipes resolves each recipe from its first ingredient and its
 * own overrides, and the SHORTEST window wins, as it does across foods.
 */
export async function containerWindowHours(
  db: Database | Transaction,
  rows: readonly ContainerRow[],
  foodsByItemId: ReadonlyMap<string, StorageItemFoodRow[]>,
  recipesByItemId: ReadonlyMap<string, ContainerRecipe[]>,
): Promise<Map<string, number>> {
  const recipeOnly = rows.filter((row) => !foodsByItemId.get(row.id)?.length);
  const categoryByRecipeId = await loadRecipeIngredientCategories(db, [
    ...new Set(recipeOnly.flatMap((row) => (recipesByItemId.get(row.id) ?? []).map((recipe) => recipe.id))),
  ]);
  const categoriesOf = (row: ContainerRow): string[] => {
    const itemFoods = foodsByItemId.get(row.id);
    if (itemFoods?.length) return itemFoods.map((food) => food.storageCategory);
    return (recipesByItemId.get(row.id) ?? []).flatMap((recipe) => {
      const category = categoryByRecipeId.get(recipe.id);
      return category ? [category] : [];
    });
  };
  const guidelineByCategory = await loadStorageGuidelines(db, [...new Set(rows.flatMap(categoriesOf))]);

  return new Map(
    rows.map((row) => {
      const itemFoods = foodsByItemId.get(row.id);
      const recipeList = recipesByItemId.get(row.id) ?? [];
      if (itemFoods?.length || recipeList.length <= 1) {
        return [
          row.id,
          resolveStorageWindowHours(
            {
              location: row.location,
              categories: categoriesOf(row),
              recipeOverrides: { fridgeHours: row.recipeFridgeHoursOverride, freezerDays: row.recipeFreezerOverride },
            },
            guidelineByCategory,
          ),
        ];
      }
      return [
        row.id,
        Math.min(
          ...recipeList.map((recipe) => {
            const category = categoryByRecipeId.get(recipe.id);
            return resolveStorageWindowHours(
              {
                location: row.location,
                categories: category ? [category] : [],
                recipeOverrides: { fridgeHours: recipe.fridgeHoursOverride, freezerDays: recipe.freezerDaysOverride },
              },
              guidelineByCategory,
            );
          }),
        ),
      ];
    }),
  );
}

/**
 * The storage category of each recipe's FIRST ingredient — what a
 * recipe-sourced container (which names no foods of its own) derives its
 * window from. "First" has no explicit ordering column in
 * `recipe_ingredients`, so this orders by the join row's id for a
 * deterministic, if arbitrary, pick — the same one this has always made.
 */
export async function loadRecipeIngredientCategories(
  db: Database | Transaction,
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
  db: Database | Transaction,
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
export function deriveFreshness(
  preparedAt: Date,
  windowHours: number,
  now: number,
  bestBy: string | null = null,
): StorageFreshness {
  if (bestBy) {
    // A parent's own best-by date overrides the guideline window. The server
    // has no timezone, so it reads the date as a UTC calendar day: expired
    // once that day is over, use-soon on the day itself and the day before.
    // The client re-derives the same rule on the LOCAL calendar for the
    // screen (features/storage/freshness.ts); the two can disagree by at most
    // a day around midnight, which is why the card, not this, is authoritative
    // for what the parent sees.
    const today = new Date(now).toISOString().slice(0, 10);
    const tomorrow = new Date(now + 24 * HOUR_MS).toISOString().slice(0, 10);
    const expired = today > bestBy;
    return {
      expiresAt: `${bestBy}T23:59:59.999Z`,
      useSoon: !expired && bestBy <= tomorrow,
      expired,
    };
  }
  const preparedMs = preparedAt.getTime();
  const expiresAtMs = preparedMs + windowHours * HOUR_MS;
  const expired = now > expiresAtMs;
  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    useSoon: !expired && now >= preparedMs + windowHours * HOUR_MS * USE_SOON_THRESHOLD,
    expired,
  };
}

// ---------------------------------------------------------------------------
// Servings back (ledger 751, DESIGN-B §5a)
// ---------------------------------------------------------------------------

/** The 409 messages of a serve that cannot take from a container (both
 * serve routes, and a plate that adds one). */
export const NO_SERVINGS_LEFT = "This storage item has no servings left — mark it finished or edit its servings first.";
export const notServable = (status: string) => `This storage item is ${status} and cannot be served. Restore it first.`;

/** What one serve took from one container (`meal_storage_items`). */
export interface ServedFromStorage {
  storageItemId: string;
  servings: number;
}

/**
 * Gives the servings a meal took back to its containers, when the meal is
 * deleted (which is also Undo) or an edit removes a served part. The caller
 * already holds the meal row's lock and deletes the rows it passes here, so
 * the same servings can never come back twice.
 *
 * Per container, as it is now: a removed (`discarded`) one and one whose
 * tracking was turned off get nothing; an active or finished one gets
 * `least(left + n, total)`, and a finished one is active again (in this app
 * only a serve ever finishes a container). Containers are locked in id order
 * first, the one lock order every serve uses too.
 */
export async function returnServings(tx: Transaction, userId: string, rows: readonly ServedFromStorage[]): Promise<void> {
  const taken = rows.filter((row) => row.servings > 0).sort((a, b) => (a.storageItemId < b.storageItemId ? -1 : 1));
  if (taken.length === 0) return;

  await tx
    .select({ id: storageItems.id })
    .from(storageItems)
    .where(
      and(
        inArray(
          storageItems.id,
          taken.map((row) => row.storageItemId),
        ),
        eq(storageItems.userId, userId),
      ),
    )
    .orderBy(asc(storageItems.id))
    .for("no key update");

  for (const row of taken) {
    // Every SET expression reads the row as it was before this UPDATE, so the
    // status test in the last two is the old status.
    await tx
      .update(storageItems)
      .set({
        servingsLeft: sql`least(${storageItems.servingsLeft} + ${row.servings}, ${storageItems.servingsTotal})`,
        status: sql`case when ${storageItems.status} = 'finished' then 'active' else ${storageItems.status} end`,
        statusChangedAt: sql`case when ${storageItems.status} = 'finished' then now() else ${storageItems.statusChangedAt} end`,
      })
      .where(
        and(
          eq(storageItems.id, row.storageItemId),
          eq(storageItems.userId, userId),
          ne(storageItems.status, "discarded"),
          isNotNull(storageItems.servingsTotal),
        ),
      );
  }
}

// ---------------------------------------------------------------------------
// Storage items as the API shows them (the storage routes and plan reads)
// ---------------------------------------------------------------------------

// No foods join: what a container holds lives in `storage_item_foods` and is
// loaded per item by `loadStorageItemFoods` during hydration (item 345).
export const STORAGE_SELECTION = {
  id: storageItems.id,
  label: storageItems.label,
  recipeId: storageItems.recipeId,
  recipeTitle: recipes.title,
  recipeDeleted: sql<boolean>`${recipes.deletedAt} is not null`,
  recipeFridgeHoursOverride: recipes.fridgeHoursOverride,
  recipeFreezerOverride: recipes.freezerDaysOverride,
  preparedAt: storageItems.preparedAt,
  location: storageItems.location,
  status: storageItems.status,
  statusChangedAt: storageItems.statusChangedAt,
  quantityNote: storageItems.quantityNote,
  servingsTotal: storageItems.servingsTotal,
  servingsLeft: storageItems.servingsLeft,
  bestBy: storageItems.bestBy,
  notes: storageItems.notes,
} as const;

export type StorageRow = {
  id: string;
  label: string | null;
  recipeId: string | null;
  recipeTitle: string | null;
  recipeDeleted: boolean;
  recipeFridgeHoursOverride: number | null;
  recipeFreezerOverride: number | null;
  preparedAt: Date;
  location: "fridge" | "freezer" | "counter";
  status: "active" | "finished" | "discarded";
  statusChangedAt: Date;
  quantityNote: string | null;
  servingsTotal: number | null;
  servingsLeft: number | null;
  /** `date` columns come back as `YYYY-MM-DD` strings, not Dates. */
  bestBy: string | null;
  notes: string | null;
};

/**
 * Loads each row's foods, resolves its storage window from them, and derives
 * `expiresAt`/`useSoon`/`expired`. Batches every lookup it needs (the foods
 * themselves, recipe-only items' food category via their first ingredient,
 * and the `storage_guidelines` rows) so a list of N items costs three extra
 * queries, not 3N.
 *
 * The window rule itself is `services/storage.ts` — shared with the AI tool,
 * which used to keep its own copy.
 */
export async function hydrateStorageItems(db: Database | Transaction, rows: StorageRow[]): Promise<StorageItem[]> {
  const foodsByItemId = await loadStorageItemFoods(
    db,
    rows.map((row) => row.id),
  );
  const recipesByItemId = await loadContainerRecipes(db, rows);
  // Every food (or recipe) in the container speaks: the shortest window
  // among them is what the item gets.
  const windowByItemId = await containerWindowHours(db, rows, foodsByItemId, recipesByItemId);

  const now = Date.now();

  return rows.map((row) => {
    const freshness = deriveFreshness(row.preparedAt, windowByItemId.get(row.id) as number, now, row.bestBy);

    const item: StorageItem = {
      id: row.id,
      label: row.label,
      // In the order the parent saved them. Empty for a recipe-sourced or
      // label-only container. `emoji` is only ever set on a custom food; the
      // client falls back to its own slug/category table when it is null.
      foods: (foodsByItemId.get(row.id) ?? []).map((food) => ({
        id: food.id,
        slug: food.slug,
        name: food.name,
        emoji: food.emoji,
        deleted: food.deleted,
      })),
      recipeId: row.recipeId,
      recipeTitle: row.recipeTitle,
      // Ledger 753: every recipe, in order (one container can hold the
      // leftovers of several); `recipeId`/`recipeTitle` stay the first.
      // A deleted recipe stays named, marked (ledger 957).
      recipes: (recipesByItemId.get(row.id) ?? []).map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        ...(recipe.deleted && { deleted: true }),
      })),
      preparedAt: row.preparedAt.toISOString(),
      location: row.location,
      status: row.status,
      statusChangedAt: row.statusChangedAt.toISOString(),
      expiresAt: freshness.expiresAt,
      useSoon: freshness.useSoon,
      expired: freshness.expired,
      quantityNote: row.quantityNote,
      // Servings and best-by are stored, not derived: an untracked item
      // reports nulls, exactly as it did before these columns existed.
      servingsTotal: row.servingsTotal,
      servingsLeft: row.servingsLeft,
      bestBy: row.bestBy,
      notes: row.notes,
    };
    return item;
  });
}

/** One item, joined and hydrated the same way the list route does it. */
export async function loadStorageItem(db: Database | Transaction, id: string): Promise<StorageItem> {
  const rows = await db
    .select(STORAGE_SELECTION)
    .from(storageItems)
    .leftJoin(recipes, eq(storageItems.recipeId, recipes.id))
    .where(eq(storageItems.id, id))
    .limit(1);

  const [item] = await hydrateStorageItems(db, rows);
  if (!item) {
    throw new Error("Hydration of a just-written storage item produced no item");
  }
  return item;
}

/** Items by id, hydrated like the list, in any status (plan reads). */
export async function loadStorageItems(db: Database | Transaction, ids: readonly string[]): Promise<StorageItem[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select(STORAGE_SELECTION)
    .from(storageItems)
    .leftJoin(recipes, eq(storageItems.recipeId, recipes.id))
    .where(inArray(storageItems.id, [...ids]));
  return hydrateStorageItems(db, rows);
}
