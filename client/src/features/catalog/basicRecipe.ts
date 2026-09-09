/**
 * "Basic" recipes — the single-food `Simple <food>` entries seeded one per
 * catalog food (ledger items 253/255).
 *
 * Nothing is stored to mark them: a basic recipe is simply one with exactly
 * one ingredient, so the badge and the food-page ordering are both DERIVED
 * from the ingredient count the API already sends. That also means a parent's
 * own one-ingredient recipe reads as "Basic" too, which is the honest answer —
 * the badge describes the recipe, not who wrote it.
 *
 * Both helpers are pure so the rule lives in one testable place instead of
 * being re-stated at each of the three call sites (recipe rows, the recipe
 * page header, and the food page's "Recipes with <food>" cards).
 */

/** The badge copy, shared by every call site so they cannot drift apart. */
export const BASIC_RECIPE_LABEL = "Basic";

/**
 * True when a recipe is built on exactly one food. `undefined` (an older API
 * body that predates `ingredientCount`) is NOT basic — an unknown count must
 * never be presented as a claim about the recipe.
 */
export function isBasicRecipe(ingredientsCount: number | undefined): boolean {
  return ingredientsCount === 1;
}

/**
 * Single-ingredient recipes first, everything else after, each group keeping
 * the order it arrived in (the API sorts by title). Returns a new array —
 * React Query's cached data is never mutated.
 */
export function sortBasicRecipesFirst<T extends { ingredientCount?: number }>(recipes: readonly T[]): T[] {
  const basics: T[] = [];
  const rest: T[] = [];
  for (const recipe of recipes) {
    (isBasicRecipe(recipe.ingredientCount) ? basics : rest).push(recipe);
  }
  return [...basics, ...rest];
}
