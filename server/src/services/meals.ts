// Meal writing and reading, shared by the two routes that create meals:
// POST /api/babies/:babyId/meals (a meal logged by hand) and
// POST /api/storage/:id/serve (a meal logged by serving a storage item, which
// additionally links every food row back to the container it came from).
//
// Keeping both flows on one insert helper is what guarantees a served meal
// is byte-for-byte the same kind of row as a hand-logged one — the only
// difference is `meal_foods.storage_item_id`.
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { MealItem, RatingHistoryQuery, RatingHistoryResponse, RatingSummary, RatingsResponse } from "@blw/shared";
import type { Database } from "../db/index.js";
import { allergens, babies, foodAllergens, foods, mealFoods, meals, recipes } from "../db/schema.js";

/**
 * The transaction handle `db.transaction()` hands its callback. Named here so
 * a caller can open the transaction (to bundle other writes into it) and
 * still pass the handle to `insertMealWithFoods`.
 */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** One food of a new meal, optionally carrying its storage provenance. */
export interface MealFoodInsert {
  foodId: string;
  /** Set only by the storage serve flow. */
  storageItemId?: string | null;
  /** 1-5, loose-food meals only (the route enforces that). */
  rating?: number | null;
}

export interface MealInsert {
  babyId: string;
  /** Attribution only — never expanded into foods at read time. */
  recipeId: string | null;
  servedAt: Date;
  reactionNote: string | null;
  /** General note. Distinct from `reactionNote`, which is the only field the
   * AI symptom/snapshot pipeline reads as a reaction signal. */
  notes: string | null;
  /** 1-5, recipe meals only (the route enforces that). */
  recipeRating?: number | null;
  /** At least one; callers dedupe by foodId before calling. */
  foods: MealFoodInsert[];
}

/**
 * Inserts one meal and its `meal_foods` children inside the caller's
 * transaction, returning the new meal id. All-or-nothing is the caller's
 * transaction boundary, not this function's.
 */
export async function insertMealWithFoods(tx: Transaction, input: MealInsert): Promise<string> {
  if (input.foods.length === 0) throw new Error("insertMealWithFoods needs at least one food");

  const [meal] = await tx
    .insert(meals)
    .values({
      babyId: input.babyId,
      recipeId: input.recipeId,
      servedAt: input.servedAt,
      reactionNote: input.reactionNote,
      notes: input.notes,
      recipeRating: input.recipeRating ?? null,
    })
    .returning();
  if (!meal) throw new Error("Meal insert returned no row");

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
      recipeId: meals.recipeId,
      recipeTitle: recipes.title,
      recipeRating: meals.recipeRating,
    })
    .from(meals)
    .leftJoin(recipes, eq(meals.recipeId, recipes.id))
    .where(inArray(meals.id, mealIds));

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
    mealRows.map((row) => [
      row.id,
      {
        id: row.id,
        babyId: row.babyId,
        servedAt: row.servedAt.toISOString(),
        reactionNote: row.reactionNote,
        notes: row.notes,
        recipeId: row.recipeId,
        recipeTitle: row.recipeTitle ?? null,
        recipeRating: row.recipeRating,
        foods: [],
      },
    ]),
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
 * One row per rating, newest meal first: every rated food on this baby's
 * LOOSE-FOOD meals, or every rated recipe meal. The `recipe_id IS NULL`
 * filter on the food side is the chair call of item 573 — a recipe's rating
 * never counts toward its ingredient foods (PATCH also clears food ratings
 * when a meal becomes a recipe meal, so this is belt and braces).
 */
function ratedFoodRows(db: Database, babyId: string, foodId?: string) {
  return db
    .select({ id: mealFoods.foodId, rating: mealFoods.rating, servedAt: meals.servedAt })
    .from(mealFoods)
    .innerJoin(meals, eq(mealFoods.mealId, meals.id))
    .where(
      and(
        eq(meals.babyId, babyId),
        isNull(meals.recipeId),
        isNotNull(mealFoods.rating),
        foodId === undefined ? undefined : eq(mealFoods.foodId, foodId),
      ),
    )
    .orderBy(desc(meals.servedAt), desc(meals.id));
}

function ratedRecipeRows(db: Database, babyId: string, recipeId?: string) {
  return db
    .select({ id: meals.recipeId, rating: meals.recipeRating, servedAt: meals.servedAt })
    .from(meals)
    .where(
      and(
        eq(meals.babyId, babyId),
        isNotNull(meals.recipeId),
        isNotNull(meals.recipeRating),
        recipeId === undefined ? undefined : eq(meals.recipeId, recipeId),
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
