import type { RecipeIngredient } from "@blw/shared";

/**
 * Maps a recipe's ingredients (identified by `foodSlug` — `RecipeDetail`
 * carries no food id) to catalog food ids via a slug->id lookup built from
 * the food list already loaded for the food `MultiCombobox`. An ingredient
 * whose slug isn't in the map (stale seed data, in practice) is silently
 * skipped rather than surfaced as a chip for a food the picker can't select.
 */
export function recipeIngredientFoodIds(ingredients: RecipeIngredient[], slugToFoodId: Map<string, string>): string[] {
  const ids: string[] = [];
  for (const ingredient of ingredients) {
    const id = slugToFoodId.get(ingredient.foodSlug);
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Recomputes the food selection when the recipe-derived contribution
 * changes, from `previousRecipeFoodIds` (what the last-applied recipe added)
 * to `nextRecipeFoodIds` (what the newly selected recipe adds, or `[]` when
 * clearing the recipe entirely).
 *
 * A food the user added by hand — never part of `previousRecipeFoodIds` — is
 * left exactly where it is. A food the previous recipe contributed is
 * dropped unless the new recipe also calls for it (a food two recipes share
 * just stays selected, and never toggles off then back on). Newly-required
 * ids are appended after whatever survives, so existing chip order is
 * otherwise stable.
 */
export function applyRecipeIngredients(
  currentFoodIds: string[],
  previousRecipeFoodIds: string[],
  nextRecipeFoodIds: string[],
): string[] {
  const kept = currentFoodIds.filter((id) => !previousRecipeFoodIds.includes(id) || nextRecipeFoodIds.includes(id));
  const added = nextRecipeFoodIds.filter((id) => !kept.includes(id));
  return [...kept, ...added];
}
