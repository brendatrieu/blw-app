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
 * Ledger 761: the meal page title for its recipes, null when it has none.
 * Two read "A + B"; three or more "A + {n} more" (the first, then a count of
 * the rest), the " + " joiner storage titles already use.
 */
export function recipesTitle(recipes: readonly { title: string }[]): string | null {
  const [first, ...rest] = recipes;
  if (!first) return null;
  if (rest.length === 0) return first.title;
  if (rest.length === 1) return `${first.title} + ${rest[0]!.title}`;
  return `${first.title} + ${rest.length} more`;
}
