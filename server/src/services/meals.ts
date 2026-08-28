// Meal writing and reading, shared by the two routes that create meals:
// POST /api/babies/:babyId/meals (a meal logged by hand) and
// POST /api/pantry/:id/serve (a meal logged by serving a pantry item, which
// additionally links every food row back to the container it came from).
//
// Keeping both flows on one insert helper is what guarantees a served meal
// is byte-for-byte the same kind of row as a hand-logged one — the only
// difference is `meal_foods.pantry_item_id`.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { MealItem } from "@blw/shared";
import type { Database } from "../db/index.js";
import { babies, foods, mealFoods, meals, recipes } from "../db/schema.js";

/**
 * The transaction handle `db.transaction()` hands its callback. Named here so
 * a caller can open the transaction (to bundle other writes into it) and
 * still pass the handle to `insertMealWithFoods`.
 */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** One food of a new meal, optionally carrying its pantry provenance. */
export interface MealFoodInsert {
  foodId: string;
  /** Set only by the pantry serve flow. */
  pantryItemId?: string | null;
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
    })
    .returning();
  if (!meal) throw new Error("Meal insert returned no row");

  await tx.insert(mealFoods).values(
    input.foods.map((food) => ({
      mealId: meal.id,
      foodId: food.foodId,
      pantryItemId: food.pantryItemId ?? null,
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
      pantryItemId: mealFoods.pantryItemId,
    })
    .from(mealFoods)
    .innerJoin(foods, eq(mealFoods.foodId, foods.id))
    .where(inArray(mealFoods.mealId, mealIds))
    .orderBy(asc(foods.name));

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
      pantryItemId: row.pantryItemId,
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
