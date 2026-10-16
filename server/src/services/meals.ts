// Meal writing and reading, shared by the three routes that create meals:
// POST /api/babies/:babyId/meals (a meal logged by hand), and
// POST /api/storage/:id/serve and POST /api/storage/serve (a meal logged by
// serving one storage item or several parts at once, which additionally links
// every served food row back to the container it came from).
//
// Keeping every flow on one insert helper is what guarantees a served meal
// is byte-for-byte the same kind of row as a hand-logged one — the only
// difference is `meal_foods.storage_item_id`.
//
// Ledger 752: a meal's recipes live in `meal_recipes` (several per meal, each
// with its own rating, in picked order). `meals.recipe_id` / `recipe_rating`
// are only a legacy mirror of the first one, written here and never read.
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { MealItem, MealRecipe, RatingHistoryQuery, RatingHistoryResponse, RatingSummary, RatingsResponse } from "@blw/shared";
import type { Database } from "../db/index.js";
import {
  allergens,
  babies,
  foodAllergens,
  foods,
  mealFoods,
  mealRecipes,
  meals,
  recipeIngredients,
  recipes,
} from "../db/schema.js";

/**
 * The transaction handle `db.transaction()` hands its callback. Named here so
 * a caller can open the transaction (to bundle other writes into it) and
 * still pass the handle to `insertMeal`.
 */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Either the database or an open transaction — for reads that run in both. */
export type Queryable = Database | Transaction;

/** One food of a new meal, optionally carrying its storage provenance. */
export interface MealFoodInsert {
  foodId: string;
  /** Set only by the storage serve flow. */
  storageItemId?: string | null;
  /** 1-5, only on a food that is not an ingredient of the meal's recipes
   * (the route enforces that). */
  rating?: number | null;
}

/** One recipe of a new meal, with its 1-5 rating or null. */
export interface MealRecipeInsert {
  recipeId: string;
  rating?: number | null;
}

export interface MealInsert {
  babyId: string;
  /** In picked order (position 0 first), deduped by the caller. Attribution
   * only — never expanded into foods at read time. */
  recipes: MealRecipeInsert[];
  servedAt: Date;
  reactionNote: string | null;
  /** General note. Distinct from `reactionNote`, which is the only field the
   * AI symptom/snapshot pipeline reads as a reaction signal. */
  notes: string | null;
  /** At least one; callers dedupe by foodId before calling. */
  foods: MealFoodInsert[];
}

/**
 * Inserts one meal, its `meal_recipes` and its `meal_foods` children inside
 * the caller's transaction, returning the new meal id. The legacy mirror
 * (`meals.recipe_id` / `recipe_rating`) is the first recipe. All-or-nothing
 * is the caller's transaction boundary, not this function's.
 */
export async function insertMeal(tx: Transaction, input: MealInsert): Promise<string> {
  if (input.foods.length === 0) throw new Error("insertMeal needs at least one food");

  const first = input.recipes[0];
  const [meal] = await tx
    .insert(meals)
    .values({
      babyId: input.babyId,
      recipeId: first?.recipeId ?? null,
      servedAt: input.servedAt,
      reactionNote: input.reactionNote,
      notes: input.notes,
      recipeRating: first?.rating ?? null,
    })
    .returning();
  if (!meal) throw new Error("Meal insert returned no row");

  if (input.recipes.length > 0) {
    await tx.insert(mealRecipes).values(
      input.recipes.map((recipe, position) => ({
        mealId: meal.id,
        recipeId: recipe.recipeId,
        position,
        rating: recipe.rating ?? null,
      })),
    );
  }

  await tx.insert(mealFoods).values(
    input.foods.map((food) => ({
      mealId: meal.id,
      foodId: food.foodId,
      storageItemId: food.storageItemId ?? null,
      rating: food.rating ?? null,
    })),
  );

  return meal.id;
}

/** A meal's recipes in their one canonical order: (position, recipe_id). */
export async function loadMealRecipeRows(
  db: Queryable,
  mealIds: string[],
): Promise<{ mealId: string; recipeId: string; title: string; rating: number | null }[]> {
  if (mealIds.length === 0) return [];
  return db
    .select({ mealId: mealRecipes.mealId, recipeId: mealRecipes.recipeId, title: recipes.title, rating: mealRecipes.rating })
    .from(mealRecipes)
    .innerJoin(recipes, eq(mealRecipes.recipeId, recipes.id))
    .where(inArray(mealRecipes.mealId, mealIds))
    .orderBy(asc(mealRecipes.mealId), asc(mealRecipes.position), asc(mealRecipes.recipeId));
}

/**
 * Rewrites the legacy mirror from the meal's `meal_recipes` rows as they
 * stand: the first row by (position, recipe_id), or both null. Every write
 * that changes a meal's recipes or their ratings calls this LAST.
 */
export async function writeMealMirror(tx: Transaction, mealId: string): Promise<void> {
  const [first] = await tx
    .select({ recipeId: mealRecipes.recipeId, rating: mealRecipes.rating })
    .from(mealRecipes)
    .where(eq(mealRecipes.mealId, mealId))
    .orderBy(asc(mealRecipes.position), asc(mealRecipes.recipeId))
    .limit(1);
  await tx
    .update(meals)
    .set({ recipeId: first?.recipeId ?? null, recipeRating: first?.rating ?? null })
    .where(eq(meals.id, mealId));
}

/** The CURRENT ingredient foods of each recipe, in one query. A recipe with
 * no ingredients maps to an empty set. */
export async function loadIngredientFoodIds(
  db: Queryable,
  recipeIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const byRecipe = new Map<string, Set<string>>(recipeIds.map((id) => [id, new Set<string>()]));
  if (recipeIds.length === 0) return byRecipe;
  const rows = await db
    .select({ recipeId: recipeIngredients.recipeId, foodId: recipeIngredients.foodId })
    .from(recipeIngredients)
    .where(inArray(recipeIngredients.recipeId, [...recipeIds]));
  for (const row of rows) byRecipe.get(row.recipeId)?.add(row.foodId);
  return byRecipe;
}

/** The 400 reason when a meal or a container names an 'info' food on its own. */
export const INFO_FOOD_ALONE = "logged only through a recipe that uses it";

/**
 * Ledger 838: the `kind = 'info'` foods (whole milk) among `foodIds` that
 * `allowed` does not cover. An info food is never logged on its own — it
 * reaches a meal only as an ingredient of one of that meal's recipes (baked
 * milk is real milk exposure, so the served recipe still brings it in) — so
 * every write that names foods passes what its recipes bring in (and, on an
 * edit, what the meal already held) as `allowed`, and refuses the rest. A
 * container's foods have no recipe, so it passes an empty set.
 */
export async function looseInfoFoodIds(
  db: Queryable,
  foodIds: readonly string[],
  allowed: ReadonlySet<string>,
): Promise<string[]> {
  const candidates = foodIds.filter((id) => !allowed.has(id));
  if (candidates.length === 0) return [];
  const rows = await db
    .select({ id: foods.id })
    .from(foods)
    .where(and(inArray(foods.id, candidates), eq(foods.kind, "info")));
  return rows.map((row) => row.id);
}

/** Union of the ingredient sets of `recipeIds`. */
export function ingredientUnion(byRecipe: ReadonlyMap<string, ReadonlySet<string>>, recipeIds: readonly string[]): Set<string> {
  const union = new Set<string>();
  for (const id of recipeIds) for (const foodId of byRecipe.get(id) ?? []) union.add(foodId);
  return union;
}

/**
 * Hydrates meal rows into API items: one `meals` row plus its foods, in a
 * fixed order (foods by name) so the same meal always renders the same way.
 * Ownership is the caller's business — this only reads by id.
 */
export async function loadMeals(db: Database, mealIds: string[]): Promise<Map<string, MealItem>> {
  if (mealIds.length === 0) return new Map();

  const mealRows = await db
    .select({
      id: meals.id,
      babyId: meals.babyId,
      servedAt: meals.servedAt,
      reactionNote: meals.reactionNote,
      notes: meals.notes,
    })
    .from(meals)
    .where(inArray(meals.id, mealIds));

  const recipeRows = await loadMealRecipeRows(db, mealIds);
  const recipesByMealId = new Map<string, MealRecipe[]>();
  for (const row of recipeRows) {
    const list = recipesByMealId.get(row.mealId) ?? [];
    list.push({ id: row.recipeId, title: row.title, rating: row.rating });
    recipesByMealId.set(row.mealId, list);
  }
  // `inRecipe` reads each recipe's CURRENT ingredients, like the rating rule.
  const ingredientsByRecipe = await loadIngredientFoodIds(db, [...new Set(recipeRows.map((row) => row.recipeId))]);
  const ingredientsByMealId = new Map(
    [...recipesByMealId].map(([mealId, list]) => [mealId, ingredientUnion(ingredientsByRecipe, list.map((r) => r.id))]),
  );

  const foodRows = await db
    .select({
      mealId: mealFoods.mealId,
      id: foods.id,
      slug: foods.slug,
      name: foods.name,
      category: foods.category,
      emoji: foods.emoji,
      storageItemId: mealFoods.storageItemId,
      rating: mealFoods.rating,
      // A deleted food stays in the meal it was eaten in, marked.
      deleted: sql<boolean>`${foods.deletedAt} is not null`,
    })
    .from(mealFoods)
    .innerJoin(foods, eq(mealFoods.foodId, foods.id))
    .where(inArray(mealFoods.mealId, mealIds))
    .orderBy(asc(foods.name));

  // One batch query for every food's allergens, deleted foods included: a
  // past meal keeps its chips whatever became of the food since.
  const foodIds = [...new Set(foodRows.map((row) => row.id))];
  const allergenRows =
    foodIds.length === 0
      ? []
      : await db
          .select({ foodId: foodAllergens.foodId, slug: allergens.slug })
          .from(foodAllergens)
          .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
          .where(inArray(foodAllergens.foodId, foodIds))
          .orderBy(asc(allergens.slug));
  const allergensByFoodId = new Map<string, string[]>();
  for (const row of allergenRows) {
    allergensByFoodId.set(row.foodId, [...(allergensByFoodId.get(row.foodId) ?? []), row.slug]);
  }

  const byMealId = new Map<string, MealItem>(
    mealRows.map((row) => {
      const mealRecipeList = recipesByMealId.get(row.id) ?? [];
      const first = mealRecipeList[0];
      return [
        row.id,
        {
          id: row.id,
          babyId: row.babyId,
          servedAt: row.servedAt.toISOString(),
          reactionNote: row.reactionNote,
          notes: row.notes,
          recipes: mealRecipeList,
          // The single-recipe view older app versions read: the first recipe.
          recipeId: first?.id ?? null,
          recipeTitle: first?.title ?? null,
          recipeRating: first?.rating ?? null,
          foods: [],
        },
      ];
    }),
  );

  for (const row of foodRows) {
    byMealId.get(row.mealId)?.foods.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      // Null for every catalog food; the client falls back to its own
      // slug/category emoji table for those.
      emoji: row.emoji,
      storageItemId: row.storageItemId,
      deleted: row.deleted,
      allergens: allergensByFoodId.get(row.id) ?? [],
      rating: row.rating,
      inRecipe: ingredientsByMealId.get(row.mealId)?.has(row.id) ?? false,
    });
  }

  return byMealId;
}

/** Whether this baby exists AND belongs to this user — a miss is a 404. */
export async function ownsBaby(db: Database, babyId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: babies.id })
    .from(babies)
    .where(and(eq(babies.id, babyId), eq(babies.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/**
 * One row per rating, newest meal first. Foods: every food rating on any of
 * this baby's meals. Item 573's "a recipe's rating never counts toward its
 * ingredient foods" still holds, now by the write rule instead of a filter
 * here (ledger 754, DESIGN-B §2): a food rated as part of a recipe has no
 * rating of its own (adding a recipe clears its ingredients' stars), so
 * every stored food rating is the parent's own, e.g. a loose extra beside
 * the meal's recipes.
 */
function ratedFoodRows(db: Database, babyId: string, foodId?: string) {
  return db
    .select({ id: mealFoods.foodId, rating: mealFoods.rating, servedAt: meals.servedAt })
    .from(mealFoods)
    .innerJoin(meals, eq(mealFoods.mealId, meals.id))
    .where(
      and(
        eq(meals.babyId, babyId),
        isNotNull(mealFoods.rating),
        foodId === undefined ? undefined : eq(mealFoods.foodId, foodId),
      ),
    )
    .orderBy(desc(meals.servedAt), desc(meals.id));
}

/** Recipes: every rated recipe of every meal, whatever its position (754). */
function ratedRecipeRows(db: Database, babyId: string, recipeId?: string) {
  return db
    .select({ id: mealRecipes.recipeId, rating: mealRecipes.rating, servedAt: meals.servedAt })
    .from(mealRecipes)
    .innerJoin(meals, eq(mealRecipes.mealId, meals.id))
    .where(
      and(
        eq(meals.babyId, babyId),
        isNotNull(mealRecipes.rating),
        recipeId === undefined ? undefined : eq(mealRecipes.recipeId, recipeId),
      ),
    )
    .orderBy(desc(meals.servedAt), desc(meals.id));
}

/** Folds newest-first rating rows into one summary per id. */
function summarize(rows: { id: string | null; rating: number | null; servedAt: Date }[]): Record<string, RatingSummary> {
  const byId: Record<string, RatingSummary & { total: number }> = {};
  for (const row of rows) {
    if (row.id === null || row.rating === null) continue;
    const summary = byId[row.id];
    if (summary) {
      summary.total += row.rating;
      summary.count += 1;
    } else {
      // Rows arrive newest first, so the first one seen is the latest.
      byId[row.id] = { total: row.rating, count: 1, average: 0, latest: row.rating, lastRatedAt: row.servedAt.toISOString() };
    }
  }
  return Object.fromEntries(
    Object.entries(byId).map(([id, { total, ...summary }]) => [id, { ...summary, average: total / summary.count }]),
  );
}

// ponytail: aggregates in JS over one baby's rated rows (hundreds a year);
// move to GROUP BY if a baby ever has tens of thousands.
export async function loadRatingSummaries(db: Database, babyId: string): Promise<RatingsResponse> {
  const [foodRows, recipeRows] = await Promise.all([ratedFoodRows(db, babyId), ratedRecipeRows(db, babyId)]);
  return { foods: summarize(foodRows), recipes: summarize(recipeRows) };
}

export async function loadRatingHistory(
  db: Database,
  babyId: string,
  query: RatingHistoryQuery,
): Promise<RatingHistoryResponse["points"]> {
  const rows = query.foodId
    ? await ratedFoodRows(db, babyId, query.foodId)
    : await ratedRecipeRows(db, babyId, query.recipeId);
  return rows
    .flatMap((row) => (row.rating === null ? [] : [{ servedAt: row.servedAt.toISOString(), rating: row.rating }]))
    .reverse();
}

/**
 * Item 715: how many of this baby's meals had this food on them (a recipe
 * meal counts for each of its foods, as it always did on the food page), or
 * had this recipe on them, at any position (ledger 754) — counted in the database over every meal, so the food
 * page's "served N times" is exact rather than a count over a recent page.
 * Deleted meals are gone from the table, so they never count.
 */
export async function countServed(db: Database, babyId: string, query: RatingHistoryQuery): Promise<number> {
  const [row] = query.foodId
    ? await db
        .select({ count: sql<number>`count(distinct ${meals.id})::int` })
        .from(meals)
        .innerJoin(mealFoods, eq(mealFoods.mealId, meals.id))
        .where(and(eq(meals.babyId, babyId), eq(mealFoods.foodId, query.foodId)))
    : await db
        .select({ count: sql<number>`count(distinct ${meals.id})::int` })
        .from(meals)
        .innerJoin(mealRecipes, eq(mealRecipes.mealId, meals.id))
        .where(and(eq(meals.babyId, babyId), eq(mealRecipes.recipeId, query.recipeId!)));
  return row?.count ?? 0;
}
