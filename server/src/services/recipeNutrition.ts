// The one place a recipe's nutrition badges are derived from its ingredients.
//
// `ironFocus`, `vitaminCHigh` and `fiberHigh` all answer the same question of
// the same join — "does any ingredient food carry level 'high'?" — so they
// live in one helper rather than as three hand-copied queries per route. They
// used to be copied: the recipes list, the recipe detail and the favorites
// list each spelled the vitamin C derivation out again, which is exactly how
// iron and vitamin C would have drifted apart the first time one of them
// changed. Fiber was added as a third flag on that one query rather than a
// second round trip.
//
// `ironFocus` is not purely derived, though: `recipes.iron_focus` is a
// CURATED claim on the seeded catalog ("this recipe is here for the iron"),
// and a recipe can earn the badge either way. So the rule everywhere is
//
//     ironFocus = stored recipes.iron_focus OR any ingredient food is high-iron
//
// and the stored column is never written from a derivation — a custom recipe
// still stores `false` and qualifies purely on its beef.
import { and, eq, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { foods, recipeIngredients, recipes } from "../db/schema.js";

/** What the ingredients alone say about one recipe. Neither flag knows about
 * `recipes.iron_focus` — combining the two is `deriveIronFocus`'s job. */
export interface RecipeNutritionFlags {
  /** At least one ingredient food has `ironLevel: "high"`. */
  ironHigh: boolean;
  /** At least one ingredient food has `vitaminCLevel: "high"`. */
  vitaminCHigh: boolean;
  /** At least one ingredient food has `fiberLevel: "high"`. */
  fiberHigh: boolean;
}

/** A recipe with no ingredients (or no ingredient row in the batch) is not
 * missing data — it simply qualifies for none of the badges. */
export const NO_RECIPE_NUTRITION: RecipeNutritionFlags = {
  ironHigh: false,
  vitaminCHigh: false,
  fiberHigh: false,
};

/**
 * All three flags for many recipes in ONE query — `bool_or` over the
 * ingredients -> foods join, grouped by recipe. Recipes with no high-level
 * ingredient still come back (all false); recipes with no ingredients at
 * all are simply absent from the map, so read it through `nutritionFor`.
 *
 * An empty `recipeIds` short-circuits: `inArray` with an empty list is not
 * something to hand a driver.
 */
export async function loadRecipeNutrition(
  db: Database,
  recipeIds: string[],
): Promise<Map<string, RecipeNutritionFlags>> {
  if (recipeIds.length === 0) return new Map();

  const rows = await db
    .select({
      recipeId: recipeIngredients.recipeId,
      ironHigh: sql<boolean>`bool_or(${foods.ironLevel} = 'high')`,
      vitaminCHigh: sql<boolean>`bool_or(${foods.vitaminCLevel} = 'high')`,
      fiberHigh: sql<boolean>`bool_or(${foods.fiberLevel} = 'high')`,
    })
    .from(recipeIngredients)
    .innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
    .where(inArray(recipeIngredients.recipeId, recipeIds))
    .groupBy(recipeIngredients.recipeId);

  return new Map(
    rows.map((row) => [
      row.recipeId,
      {
        ironHigh: row.ironHigh === true,
        vitaminCHigh: row.vitaminCHigh === true,
        fiberHigh: row.fiberHigh === true,
      },
    ]),
  );
}

/** Map lookup that treats "no ingredients" as "no badges". */
export function nutritionFor(byRecipeId: Map<string, RecipeNutritionFlags>, recipeId: string): RecipeNutritionFlags {
  return byRecipeId.get(recipeId) ?? NO_RECIPE_NUTRITION;
}

/** The `ironFocus` every response carries: the curated claim OR the
 * ingredients. One function so list, detail and favorites cannot disagree. */
export function deriveIronFocus(storedIronFocus: boolean, flags: RecipeNutritionFlags): boolean {
  return storedIronFocus || flags.ironHigh;
}

/** Recipe ids with at least one ingredient food at the given level — the
 * subquery all three filters below are built on. */
function recipeIdsWithHighLevel(
  db: Database,
  column: typeof foods.ironLevel | typeof foods.vitaminCLevel | typeof foods.fiberLevel,
) {
  return db
    .select({ recipeId: recipeIngredients.recipeId })
    .from(recipeIngredients)
    .innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
    .where(eq(column, "high"));
}

/**
 * `GET /api/recipes?ironFocus=…` as a SQL condition, so the filter matches the
 * DERIVED value the response carries rather than the stored column alone.
 *
 * Filtering in SQL rather than in JS after the fetch is deliberate: the list
 * is unpaginated today, but a `LIMIT` added later would otherwise silently
 * start counting rows the filter was about to drop. Ordering (title asc) is
 * unaffected either way.
 *
 * - `true`  -> curated iron recipes AND recipes with a high-iron ingredient.
 * - `false` -> only recipes with NEITHER.
 */
export function ironFocusFilter(db: Database, wanted: boolean): SQL {
  const withHighIron = recipeIdsWithHighLevel(db, foods.ironLevel);
  return wanted
    ? or(eq(recipes.ironFocus, true), inArray(recipes.id, withHighIron))!
    : and(eq(recipes.ironFocus, false), notInArray(recipes.id, withHighIron))!;
}

/** The vitamin C twin of `ironFocusFilter`. Purely derived — there is no
 * curated vitamin C column — so it is a plain in/not-in on the same join. */
export function vitaminCHighFilter(db: Database, wanted: boolean): SQL {
  const withHighVitaminC = recipeIdsWithHighLevel(db, foods.vitaminCLevel);
  return wanted ? inArray(recipes.id, withHighVitaminC) : notInArray(recipes.id, withHighVitaminC);
}

/** The fiber twin of `vitaminCHighFilter`. Also purely derived — nothing is
 * stored on the recipe — so it is the same in/not-in on the same join, read
 * off `foods.fiber_level` instead. */
export function fiberHighFilter(db: Database, wanted: boolean): SQL {
  const withHighFiber = recipeIdsWithHighLevel(db, foods.fiberLevel);
  return wanted ? inArray(recipes.id, withHighFiber) : notInArray(recipes.id, withHighFiber);
}
