// Ledger 901 (plan SPEC §1.3-1.4): the ONE writer of a plate. Log meal, a
// serve from storage and Edit meal all save through `writePlate`, and every
// plate write ends with `syncLegacy`, which derives the legacy tables
// (`meal_foods` = exposure, `meal_recipes`, the `meals` mirror) from the
// meal's `meal_items`, so every reader of those tables keeps working
// unchanged. Older request shapes never come here: they run their own code
// verbatim and end with the per-meal heal (db/migrate.ts `healMealItems`).
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { MEAL_FOODS_MAX, MEAL_RECIPES_MAX, PLATE_NOTHING_COUNTS, type PlateItemInput } from "@blw/shared";
import { healMealItems } from "../db/migrate.js";
import { mealFoods, mealItems, mealRecipes, mealStorageItems, meals, storageItemRecipes, storageItems } from "../db/schema.js";
import {
  loadIngredientFoodIds,
  validateFoodIds,
  validateRecipeIds,
  writeMealMirror,
  type Transaction,
} from "./meals.js";
import { NO_SERVINGS_LEFT, loadStorageItemFoods, notServable, returnServings } from "./storage.js";

/** Thrown inside the write's transaction to roll it back with a reply. */
export class PlateAborted extends Error {
  constructor(readonly outcome: { code: 400; details: unknown } | { code: 409; body: Record<string, unknown> }) {
    super("plate write aborted");
    this.name = "PlateAborted";
  }
}

const bad = (details: unknown) => new PlateAborted({ code: 400, details });

/** A kept item, an item rating or an unchanged container that is not on the
 * meal any more: another device, or a heal rebuild, replaced it. The client
 * refetches the meal and re-applies nothing on its own (SPEC §1.4 step 1). */
const mealChanged = () =>
  new PlateAborted({
    code: 409,
    body: { error: "meal_changed", message: "This meal was changed somewhere else. Reload it and try again." },
  });

const containerConflict = (message: string, storageItemId: string) =>
  new PlateAborted({ code: 409, body: { error: "conflict", message, storageItemId } });

interface ItemRow {
  id: string;
  position: number;
  foodId: string | null;
  recipeId: string | null;
  storageItemId: string | null;
  countedFoodIds: string[];
  rating: number | null;
  /** Rebuilt from legacy rows (chair §10.1); see `PlateItem` recipe `inferred`. */
  inferred: boolean;
}

/** A row the write wants, in plate order; `keepId` updates that row. */
type Desired = Omit<ItemRow, "id" | "position"> & { keepId?: string };

async function loadRows(tx: Transaction, mealId: string): Promise<ItemRow[]> {
  return tx
    .select({
      id: mealItems.id,
      position: mealItems.position,
      foodId: mealItems.foodId,
      recipeId: mealItems.recipeId,
      storageItemId: mealItems.storageItemId,
      countedFoodIds: mealItems.countedFoodIds,
      rating: mealItems.rating,
      inferred: mealItems.inferred,
    })
    .from(mealItems)
    .where(eq(mealItems.mealId, mealId))
    .orderBy(asc(mealItems.position), asc(mealItems.id));
}

const sorted = (ids: Iterable<string>) => [...new Set(ids)].sort();
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export interface PlateWrite {
  userId: string;
  /** Create: the baby the new meal is for. */
  babyId?: string;
  /** Edit: the meal, already locked FOR UPDATE by the caller. */
  mealId?: string;
  /** The whole plate. Absent on an edit that only rates (`itemRatings`) or
   * changes a column. */
  items?: PlateItemInput[];
  itemRatings?: Record<string, number | null>;
  columns: { servedAt?: Date; reactionNote?: string | null; notes?: string | null };
}

/**
 * SPEC §1.4, in the caller's transaction. Lock order: the meal (the caller,
 * on an edit), then every container this write touches in id order, the
 * order every serve and `returnServings` use. Returns the meal id.
 */
export async function writePlate(tx: Transaction, write: PlateWrite): Promise<string> {
  const { userId } = write;

  // 0. An edit starts from exact items: the per-meal heal rebuilds a meal an
  // older writer left drifted (new row ids, so a stale request 409s below).
  let current: ItemRow[] = [];
  if (write.mealId) {
    await healMealItems(tx, [write.mealId]);
    current = await loadRows(tx, write.mealId);
  }
  const byId = new Map(current.map((row) => [row.id, row]));

  if (write.itemRatings) {
    const mealId = write.mealId!;
    const entries = Object.entries(write.itemRatings);
    if (entries.some(([id]) => !byId.has(id))) throw mealChanged();
    for (const [id, rating] of entries) await tx.update(mealItems).set({ rating }).where(eq(mealItems.id, id));
    await writeColumns(tx, mealId, write.columns);
    await syncLegacy(tx, mealId, new Set());
    return mealId;
  }
  const items = write.items;
  if (!items) throw new Error("writePlate needs items or itemRatings");

  // Container groups on the meal: rows sharing a storage_item_id, in order.
  const groups = new Map<string, ItemRow[]>();
  for (const row of current) {
    if (row.storageItemId) groups.set(row.storageItemId, [...(groups.get(row.storageItemId) ?? []), row]);
  }

  // 1. Kept ids must still be on the meal as that same fresh item.
  for (const item of items) {
    if (item.kind === "storage") {
      if (!groups.has(item.storageItemId) && item.servings === undefined) {
        if (write.mealId) throw mealChanged();
        throw bad({ servings: "servings is required for a container new to the meal" });
      }
      continue;
    }
    if (item.id === undefined) continue;
    const row = byId.get(item.id);
    const ref = item.kind === "food" ? row?.foodId : row?.recipeId;
    if (!row || row.storageItemId !== null || ref !== (item.kind === "food" ? item.foodId : item.recipeId)) {
      throw mealChanged();
    }
  }

  const storageInputs = items.filter((item) => item.kind === "storage");
  const added = storageInputs.filter((item) => !groups.has(item.storageItemId));
  const resized = storageInputs.filter((item) => groups.has(item.storageItemId) && item.servings !== undefined);
  const removed = [...groups.keys()].filter((id) => !storageInputs.some((item) => item.storageItemId === id));

  // Every container this write touches, locked in id order (FOR NO KEY
  // UPDATE, as a serve does: it queues behind another serve and the storage
  // PATCH, not behind a meal_foods insert's foreign-key check).
  const touched = sorted([...added, ...resized].map((item) => item.storageItemId).concat(removed));
  const lockedRows =
    touched.length === 0
      ? []
      : await tx
          .select({
            id: storageItems.id,
            recipeId: storageItems.recipeId,
            status: storageItems.status,
            servingsLeft: storageItems.servingsLeft,
            servingsTotal: storageItems.servingsTotal,
          })
          .from(storageItems)
          .where(and(inArray(storageItems.id, touched), eq(storageItems.userId, userId)))
          .orderBy(asc(storageItems.id))
          .for("no key update");
  const lockedById = new Map(lockedRows.map((row) => [row.id, row]));
  const unknownStorageItemIds = added.map((item) => item.storageItemId).filter((id) => !lockedById.has(id));
  if (unknownStorageItemIds.length > 0) throw bad({ items: "unknown storage item", unknownStorageItemIds });
  // Only an active container with something left can give (more) servings.
  const assertServable = (id: string) => {
    const row = lockedById.get(id)!;
    if (row.status !== "active") throw containerConflict(notServable(row.status), id);
    if (row.servingsTotal !== null && (row.servingsLeft ?? 0) <= 0) throw containerConflict(NO_SERVINGS_LEFT, id);
  };
  for (const item of added) assertServable(item.storageItemId);

  // Refs new to the meal. A kept row is exempt: a deleted custom food stays
  // on the meal it was eaten in, and only there.
  const newFoodIds = items.flatMap((item) => (item.kind === "food" && !item.id ? [item.foodId] : []));
  if (newFoodIds.length > 0) {
    const foodCheck = await validateFoodIds(tx, newFoodIds, userId);
    if (!foodCheck.ok) throw bad(foodCheck.details);
  }
  const newRecipeIds = sorted(items.flatMap((item) => (item.kind === "recipe" && !item.id ? [item.recipeId] : [])));
  const recipeCheck = await validateRecipeIds(tx, newRecipeIds, userId, "recipeIds");
  if (!recipeCheck.ok) throw bad(recipeCheck.details);

  // What each new container holds, read under its lock (contents are
  // editable): its own foods, and its recipes (the 0021 rows, else its one).
  const addedIds = added.map((item) => item.storageItemId);
  const heldFoods = await loadStorageItemFoods(tx, addedIds);
  const severalRows =
    addedIds.length === 0
      ? []
      : await tx
          .select({ storageItemId: storageItemRecipes.storageItemId, recipeId: storageItemRecipes.recipeId })
          .from(storageItemRecipes)
          .where(inArray(storageItemRecipes.storageItemId, addedIds))
          .orderBy(asc(storageItemRecipes.position), asc(storageItemRecipes.recipeId));
  const containerRecipes = (id: string): string[] => {
    const several = severalRows.filter((row) => row.storageItemId === id).map((row) => row.recipeId);
    const one = lockedById.get(id)?.recipeId;
    return several.length > 0 ? several : one ? [one] : [];
  };
  const ingredients = await loadIngredientFoodIds(
    tx,
    sorted([
      ...items.flatMap((item) => (item.kind === "recipe" ? [item.recipeId] : [])),
      ...addedIds.flatMap(containerRecipes),
    ]),
  );

  // 2-3. The rows, in plate order.
  const desired: Desired[] = [];
  const pick = (input: number | null | undefined, stored: number | null) => (input === undefined ? stored : input);
  for (const item of items) {
    if (item.kind === "food") {
      const kept = item.id ? byId.get(item.id) : undefined;
      desired.push({
        keepId: kept?.id,
        foodId: item.foodId,
        recipeId: null,
        storageItemId: null,
        countedFoodIds: [],
        rating: pick(item.rating, kept?.rating ?? null),
        inferred: kept?.inferred ?? false,
      });
    } else if (item.kind === "recipe") {
      const kept = item.id ? byId.get(item.id) : undefined;
      const current = ingredients.get(item.recipeId) ?? new Set<string>();
      const strays = (item.leftOutFoodIds ?? []).filter((id) => !current.has(id));
      if (strays.length > 0) throw bad({ leftOutFoodIds: "not an ingredient of this recipe", foodIds: strays });
      const leftOut = new Set(item.leftOutFoodIds ?? []);
      // A kept row never re-derives what was eaten from the recipe as it is
      // NOW (901b): foods the recipe lost since stay counted, and an inferred
      // row can only lose foods, so echoing the plate it was shown is a no-op.
      // counted = (stored − current) ∪ (inferred ? (stored ∩ current) − L : current − L)
      const stored = kept?.countedFoodIds ?? [];
      const base = kept?.inferred ? stored.filter((id) => current.has(id)) : [...current];
      desired.push({
        keepId: kept?.id,
        foodId: null,
        recipeId: item.recipeId,
        storageItemId: null,
        countedFoodIds:
          kept && item.leftOutFoodIds === undefined
            ? kept.countedFoodIds
            : sorted([...stored.filter((id) => !current.has(id)), ...base.filter((id) => !leftOut.has(id))]),
        rating: pick(item.rating, kept?.rating ?? null),
        // Once the parent says what was left out, the item shows "Left out"
        // like any other (current ingredients − counted).
        inferred: Boolean(kept?.inferred) && item.leftOutFoodIds === undefined,
      });
    } else {
      const group = groups.get(item.storageItemId);
      const ratings = item.ratings ?? {};
      if (group) {
        const refs = new Set(group.map((row) => row.foodId ?? row.recipeId));
        const strays = Object.keys(ratings).filter((id) => !refs.has(id));
        if (strays.length > 0) throw bad({ ratings: "not a part of this container", strays });
        for (const { id, position: _position, ...row } of group) {
          desired.push({ ...row, keepId: id, rating: pick(ratings[(row.foodId ?? row.recipeId)!], row.rating) });
        }
        continue;
      }
      // A new container (SPEC §1.2): one row per recipe, counting its current
      // ingredients, then one row per held food. Held foods win, as in a
      // serve: a container holding foods AND a recipe counts the foods.
      const foodsHeld = (heldFoods.get(item.storageItemId) ?? []).map((food) => food.id);
      const recipesHeld = containerRecipes(item.storageItemId);
      if (foodsHeld.length === 0 && recipesHeld.length === 0) {
        throw bad({ items: "a label-only storage item has no food to log — add a food or a recipe to serve it" });
      }
      const parts = new Set([...foodsHeld, ...recipesHeld]);
      const strays = Object.keys(ratings).filter((id) => !parts.has(id));
      if (strays.length > 0) throw bad({ ratings: "not a part of this container", strays });
      for (const recipeId of recipesHeld) {
        desired.push({
          foodId: null,
          recipeId,
          storageItemId: item.storageItemId,
          countedFoodIds: foodsHeld.length > 0 ? [] : sorted(ingredients.get(recipeId) ?? []),
          rating: ratings[recipeId] ?? null,
          inferred: false,
        });
      }
      for (const foodId of foodsHeld) {
        desired.push({
          foodId,
          recipeId: null,
          storageItemId: item.storageItemId,
          countedFoodIds: [],
          rating: ratings[foodId] ?? null,
          inferred: false,
        });
      }
    }
  }

  // 4. Something on the plate has to count, and the legacy limits hold.
  const exposure = new Set(desired.flatMap((row) => (row.foodId ? [row.foodId] : row.countedFoodIds)));
  if (exposure.size === 0) throw bad({ items: PLATE_NOTHING_COUNTS });
  if (exposure.size > MEAL_FOODS_MAX) throw bad({ items: `at most ${MEAL_FOODS_MAX} foods per meal` });
  if (new Set(desired.flatMap((row) => (row.recipeId ? [row.recipeId] : []))).size > MEAL_RECIPES_MAX) {
    throw bad({ items: `at most ${MEAL_RECIPES_MAX} recipes per meal` });
  }

  // The meal row: a create inserts it; the mirror comes from syncLegacy.
  let mealId = write.mealId;
  if (!mealId) {
    const [meal] = await tx
      .insert(meals)
      .values({
        babyId: write.babyId!,
        servedAt: write.columns.servedAt ?? new Date(),
        reactionNote: write.columns.reactionNote ?? null,
        notes: write.columns.notes ?? null,
      })
      .returning();
    if (!meal) throw new Error("Meal insert returned no row");
    mealId = meal.id;
  } else {
    await writeColumns(tx, mealId, write.columns);
  }

  // 5. Storage. What each container gave this meal lives in
  // meal_storage_items; a removed one gets exactly that back, a resized one
  // moves only the difference, a new one is claimed.
  const served = new Map(
    (
      await tx
        .select({ storageItemId: mealStorageItems.storageItemId, servings: mealStorageItems.servings })
        .from(mealStorageItems)
        .where(eq(mealStorageItems.mealId, mealId))
    ).map((row) => [row.storageItemId, row.servings]),
  );
  const gone = removed.flatMap((id) => (served.has(id) ? [{ storageItemId: id, servings: served.get(id)! }] : []));
  if (gone.length > 0) {
    await returnServings(tx, userId, gone);
    await tx.delete(mealStorageItems).where(
      and(
        eq(mealStorageItems.mealId, mealId),
        inArray(
          mealStorageItems.storageItemId,
          gone.map((row) => row.storageItemId),
        ),
      ),
    );
  }
  for (const item of resized) {
    const before = served.get(item.storageItemId);
    if (before === undefined) {
      throw bad({ servings: "this container was served before servings were recorded, so it can only be removed" });
    }
    const change = item.servings! - before;
    if (change < 0) {
      await returnServings(tx, userId, [{ storageItemId: item.storageItemId, servings: -change }]);
      await setServed(tx, mealId, item.storageItemId, item.servings!);
    } else if (change > 0) {
      assertServable(item.storageItemId);
      const taken = await claim(tx, userId, lockedById.get(item.storageItemId)!, change);
      await setServed(tx, mealId, item.storageItemId, before + taken);
    }
  }
  for (const item of added) {
    const taken = await claim(tx, userId, lockedById.get(item.storageItemId)!, item.servings!);
    // A backfill orphan of this container (SPEC §2.2 C) already has a row:
    // add to it, so a later removal or delete returns both.
    await tx
      .insert(mealStorageItems)
      .values({ mealId, storageItemId: item.storageItemId, servings: taken })
      .onConflictDoUpdate({
        target: [mealStorageItems.mealId, mealStorageItems.storageItemId],
        set: { servings: sql`${mealStorageItems.servings} + excluded.servings` },
      });
  }

  // 6. Rows: drop what was not kept, renumber the kept, insert the new.
  const keptIds = desired.flatMap((row) => (row.keepId ? [row.keepId] : []));
  await tx
    .delete(mealItems)
    .where(and(eq(mealItems.mealId, mealId), keptIds.length > 0 ? notInArray(mealItems.id, keptIds) : undefined));
  const inserts: (typeof mealItems.$inferInsert)[] = [];
  for (const [position, { keepId, ...row }] of desired.entries()) {
    const kept = keepId ? byId.get(keepId)! : undefined;
    if (!kept) {
      inserts.push({ mealId, position, ...row });
    } else if (
      kept.position !== position ||
      kept.rating !== row.rating ||
      kept.inferred !== row.inferred ||
      !sameList(kept.countedFoodIds, row.countedFoodIds)
    ) {
      await tx
        .update(mealItems)
        .set({ position, rating: row.rating, countedFoodIds: row.countedFoodIds, inferred: row.inferred })
        .where(eq(mealItems.id, kept.id));
    }
  }
  if (inserts.length > 0) await tx.insert(mealItems).values(inserts);

  // 7.
  await syncLegacy(tx, mealId, new Set(removed));
  // 8. Invariants hold after every write (901b): adding fresh what a linked
  // ORPHAN container holds now makes that container fillable, so the meal is
  // drifted; rebuild it here, and the answer is the rebuilt plate. A no-op
  // otherwise.
  await healMealItems(tx, [mealId]);
  return mealId;
}

async function writeColumns(tx: Transaction, mealId: string, columns: PlateWrite["columns"]): Promise<void> {
  const set = Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined));
  if (Object.keys(set).length > 0) await tx.update(meals).set(set).where(eq(meals.id, mealId));
}

async function setServed(tx: Transaction, mealId: string, storageItemId: string, servings: number): Promise<void> {
  await tx
    .update(mealStorageItems)
    .set({ servings })
    .where(and(eq(mealStorageItems.mealId, mealId), eq(mealStorageItems.storageItemId, storageItemId)));
}

/**
 * Takes `servings` from a locked container with the serve's own guarded,
 * self-referential UPDATE (routes/storage.ts serveParts): min(asked, left)
 * on a tracked container, nothing on an untracked one; an emptied one
 * finishes. Returns what was really taken. The row object is the lock
 * query's, kept current so a second claim in one write reads the new count.
 */
async function claim(
  tx: Transaction,
  userId: string,
  row: { id: string; servingsLeft: number | null; servingsTotal: number | null },
  servings: number,
): Promise<number> {
  const [claimed] = await tx
    .update(storageItems)
    .set({
      servingsLeft: sql`case
        when ${storageItems.servingsTotal} is null then ${storageItems.servingsLeft}
        else greatest(${storageItems.servingsLeft} - ${servings}, 0)
      end`,
    })
    .where(
      and(
        eq(storageItems.id, row.id),
        eq(storageItems.userId, userId),
        eq(storageItems.status, "active"),
        sql`(${storageItems.servingsTotal} is null or ${storageItems.servingsLeft} > 0)`,
      ),
    )
    .returning();
  if (!claimed) throw containerConflict(NO_SERVINGS_LEFT, row.id);
  if (claimed.servingsTotal !== null && claimed.servingsLeft === 0) {
    await tx.update(storageItems).set({ status: "finished", statusChangedAt: new Date() }).where(eq(storageItems.id, row.id));
  }
  const taken =
    claimed.servingsTotal !== null && row.servingsLeft !== null && claimed.servingsLeft !== null
      ? row.servingsLeft - claimed.servingsLeft
      : 0;
  row.servingsLeft = claimed.servingsLeft;
  return taken;
}

/**
 * SPEC §1.3: rewrites the legacy rows of one meal from its items, then the
 * mirror (`writeMealMirror`, unchanged).
 * - `meal_foods` = the exposure union: every food row's food, plus every
 *   recipe row's `counted_food_ids`; one row per food. A food that stays
 *   KEEPS its link (NULL included) unless this write removed that container
 *   (`removed`); a new food, or one whose container went, links to the first
 *   row by position that brings it from a container. Its rating is the first
 *   rated FOOD row's (what older clients read).
 * - `meal_recipes` = the distinct recipes in order of first appearance, each
 *   rated by its first rated row.
 */
export async function syncLegacy(tx: Transaction, mealId: string, removed: ReadonlySet<string>): Promise<void> {
  const rows = await loadRows(tx, mealId);
  // Never derive from nothing: that would erase the meal's exposure.
  if (rows.length === 0) throw new Error(`syncLegacy: meal ${mealId} has no items`);

  const derivedLink = new Map<string, string | null>();
  const foodRating = new Map<string, number>();
  const recipeOrder: string[] = [];
  const recipeRating = new Map<string, number>();
  for (const row of rows) {
    for (const foodId of row.foodId ? [row.foodId] : row.countedFoodIds) {
      if (!derivedLink.get(foodId)) derivedLink.set(foodId, row.storageItemId);
    }
    if (row.foodId && row.rating !== null && !foodRating.has(row.foodId)) foodRating.set(row.foodId, row.rating);
    if (row.recipeId) {
      if (!recipeOrder.includes(row.recipeId)) recipeOrder.push(row.recipeId);
      if (row.rating !== null && !recipeRating.has(row.recipeId)) recipeRating.set(row.recipeId, row.rating);
    }
  }

  const existingFoods = await tx
    .select({ foodId: mealFoods.foodId, storageItemId: mealFoods.storageItemId, rating: mealFoods.rating })
    .from(mealFoods)
    .where(eq(mealFoods.mealId, mealId));
  const exposure = [...derivedLink.keys()];
  await tx
    .delete(mealFoods)
    .where(and(eq(mealFoods.mealId, mealId), notInArray(mealFoods.foodId, exposure)));
  const foodInserts: (typeof mealFoods.$inferInsert)[] = [];
  for (const foodId of exposure) {
    const existing = existingFoods.find((row) => row.foodId === foodId);
    const keepsLink = existing && !(existing.storageItemId && removed.has(existing.storageItemId));
    const storageItemId = keepsLink ? existing.storageItemId : (derivedLink.get(foodId) ?? null);
    const rating = foodRating.get(foodId) ?? null;
    if (!existing) foodInserts.push({ mealId, foodId, storageItemId, rating });
    else if (existing.storageItemId !== storageItemId || existing.rating !== rating) {
      await tx
        .update(mealFoods)
        .set({ storageItemId, rating })
        .where(and(eq(mealFoods.mealId, mealId), eq(mealFoods.foodId, foodId)));
    }
  }
  if (foodInserts.length > 0) await tx.insert(mealFoods).values(foodInserts);

  const existingRecipes = await tx
    .select({ recipeId: mealRecipes.recipeId, position: mealRecipes.position, rating: mealRecipes.rating })
    .from(mealRecipes)
    .where(eq(mealRecipes.mealId, mealId));
  await tx
    .delete(mealRecipes)
    .where(
      and(eq(mealRecipes.mealId, mealId), recipeOrder.length > 0 ? notInArray(mealRecipes.recipeId, recipeOrder) : undefined),
    );
  for (const [position, recipeId] of recipeOrder.entries()) {
    const existing = existingRecipes.find((row) => row.recipeId === recipeId);
    const rating = recipeRating.get(recipeId) ?? null;
    if (!existing) await tx.insert(mealRecipes).values({ mealId, recipeId, position, rating });
    else if (existing.position !== position || existing.rating !== rating) {
      await tx
        .update(mealRecipes)
        .set({ position, rating })
        .where(and(eq(mealRecipes.mealId, mealId), eq(mealRecipes.recipeId, recipeId)));
    }
  }

  await writeMealMirror(tx, mealId);
}
