import type { MealItem, MealRecipe } from "@blw/shared";

/**
 * A meal's recipes, first-picked first (ledger 752). A body cached before
 * the server sent `recipes` (the service worker can serve one offline) has
 * only the single legacy recipe, which reads as a list of one.
 */
export function mealRecipes(meal: Pick<MealItem, "recipes" | "recipeId" | "recipeTitle" | "recipeRating">): MealRecipe[] {
  if (meal.recipes) return meal.recipes;
  return meal.recipeId ? [{ id: meal.recipeId, title: meal.recipeTitle ?? "Recipe", rating: meal.recipeRating ?? null }] : [];
}

/**
 * Ledger 761: the meal page title for its recipes, as the pieces joined by
 * " + " (the joiner storage titles already use); empty when it has none.
 * Two read "A + B"; three or more "A + {n} more" (the first, then a count of
 * the rest). A recipe the parent deleted keeps `deleted`, so the title marks
 * it (ledger 957).
 */
export function recipeTitleParts(
  recipes: readonly { title: string; deleted?: boolean | undefined }[],
): { name: string; deleted?: boolean | undefined }[] {
  const [first, ...rest] = recipes;
  if (!first) return [];
  const part = (recipe: typeof first) => ({ name: recipe.title, deleted: recipe.deleted });
  if (rest.length === 0) return [part(first)];
  if (rest.length === 1) return [part(first), part(rest[0]!)];
  return [part(first), { name: `${rest.length} more` }];
}
