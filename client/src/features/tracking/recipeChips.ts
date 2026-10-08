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
 * Ledger 759: which foods each picked recipe put on the meal, keyed by
 * recipe id. A recipe owns only the ingredients it ADDED; a food that was
 * already there (picked by hand, or added by an earlier recipe) is not its.
 */
export type RecipeChipOwners = Readonly<Record<string, readonly string[]>>;

interface ChipState {
  foodIds: string[];
  owners: RecipeChipOwners;
}

/** A newly picked recipe's ingredients join the meal: the ones not already
 * on it are appended, in recipe order, and become that recipe's own. */
export function addRecipeChips(foodIds: string[], owners: RecipeChipOwners, recipeId: string, ingredientIds: readonly string[]): ChipState {
  const added = [...new Set(ingredientIds)].filter((id) => !foodIds.includes(id));
  return { foodIds: [...foodIds, ...added], owners: { ...owners, [recipeId]: added } };
}

/**
 * Edit mode: a recipe already on the saved meal takes its ingredients that
 * are on the meal (and not another recipe's) as its own WITHOUT changing the
 * foods. The saved foods are the truth: a chip the parent removed back then
 * (or since this page opened) must not come back.
 */
export function adoptRecipeChips(foodIds: string[], owners: RecipeChipOwners, recipeId: string, ingredientIds: readonly string[]): ChipState {
  const taken = new Set(Object.values(owners).flat());
  const mine = [...new Set(ingredientIds)].filter((id) => foodIds.includes(id) && !taken.has(id));
  return { foodIds, owners: { ...owners, [recipeId]: mine } };
}

/**
 * A recipe is taken off: only the foods IT added go, and not even those when
 * another picked recipe calls for them — they pass to that recipe, so taking
 * it off later removes them then. `remaining` is the other picked recipes'
 * ingredients, for those whose ingredients have loaded (one still loading
 * adds whatever it needs when it lands).
 */
export function removeRecipeChips(
  foodIds: string[],
  owners: RecipeChipOwners,
  recipeId: string,
  remaining: ReadonlyMap<string, readonly string[]>,
): ChipState {
  const { [recipeId]: mine = [], ...rest } = owners;
  const next: Record<string, readonly string[]> = { ...rest };
  const dropped = new Set<string>();
  for (const id of mine) {
    const heir = [...remaining].find(([other, ingredients]) => other in next && ingredients.includes(id))?.[0];
    if (heir) next[heir] = [...next[heir]!, id];
    else dropped.add(id);
  }
  return { foodIds: foodIds.filter((id) => !dropped.has(id)), owners: next };
}
