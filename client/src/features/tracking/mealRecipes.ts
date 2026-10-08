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
