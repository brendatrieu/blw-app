import type { FoodCategory, Level, RecipeScope } from "@blw/shared";

// Display labels for enum values shared with the server. The allergen slug
// list mirrors the seeded top-9 (server/db/seeds/index.ts) — it isn't a
// hard-typed union server-side (allergens.slug is free text), so it's kept
// here as a UI-only convenience for building filter chips.
export const CATEGORIES: { value: FoodCategory; label: string }[] = [
  { value: "protein", label: "Protein" },
  { value: "veg", label: "Veg" },
  { value: "fruit", label: "Fruit" },
  { value: "grain", label: "Grain" },
  { value: "dairy", label: "Dairy" },
  { value: "legume", label: "Legume" },
];

export const IRON_LEVELS: { value: Level; label: string }[] = [
  { value: "high", label: "High iron" },
  { value: "moderate", label: "Moderate iron" },
  { value: "low", label: "Low iron" },
];

export const ALLERGEN_SLUGS: { value: string; label: string }[] = [
  { value: "milk", label: "Milk" },
  { value: "egg", label: "Egg" },
  { value: "peanut", label: "Peanut" },
  { value: "tree_nut", label: "Tree nut" },
  { value: "fish", label: "Fish" },
  { value: "shellfish", label: "Shellfish" },
  { value: "wheat", label: "Wheat" },
  { value: "soy", label: "Soy" },
  { value: "sesame", label: "Sesame" },
];

export const AGE_THRESHOLDS: { value: number; label: string }[] = [
  { value: 6, label: "6m+" },
  { value: 9, label: "9m+" },
  { value: 12, label: "12m+" },
];

/**
 * Where the recipe list lives (item 209). It's a segment of the Foods page,
 * not a route of its own, so every "back to the list" destination — after a
 * delete, from a create page's close button — spells the same URL by
 * importing this rather than by retyping the query string.
 */
export const RECIPES_TAB_PATH = "/foods?tab=recipes";

/** The Recipes segment's scope chips (item 210). "all" is the default and
 * the one every other scope falls back to when it's tapped off again. */
export const RECIPE_SCOPES: { value: RecipeScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "favorites", label: "Favorites" },
  { value: "custom", label: "Custom" },
];

/**
 * The "suitable from" options a custom recipe can be filed under (item 211),
 * spanning the shared schema's 6–36 month range in the steps parents
 * actually think in rather than every single month.
 */
export const CUSTOM_RECIPE_AGE_OPTIONS: { value: number; label: string }[] = [
  { value: 6, label: "6 months" },
  { value: 7, label: "7 months" },
  { value: 8, label: "8 months" },
  { value: 9, label: "9 months" },
  { value: 10, label: "10 months" },
  { value: 12, label: "12 months" },
  { value: 15, label: "15 months" },
  { value: 18, label: "18 months" },
  { value: 24, label: "24 months" },
  { value: 36, label: "36 months" },
];

export function allergenLabel(slug: string): string {
  return ALLERGEN_SLUGS.find((a) => a.value === slug)?.label ?? slug;
}

export function levelLabel(level: Level): string {
  switch (level) {
    case "high":
      return "High";
    case "moderate":
      return "Moderate";
    case "low":
      return "Low";
  }
}

/**
 * The one wording for "this search matched nothing — make it a food", shared
 * by the Foods page's empty state (item 179) and the picker's trailing
 * create row (item 180) so the two surfaces can never drift apart. The query
 * is quoted, not truncated: it's the parent's own typing, and it's what the
 * form gets prefilled with.
 */
export function addCustomFoodLabel(query: string): string {
  return `Add '${query.trim()}' as a custom food`;
}

/**
 * The soft note a custom food's page carries instead of the prep/choking
 * sections a catalog food has (item 181). Wording is deliberate and fixed:
 * it says the gap is expected ("added by you"), not a bug, and points at the
 * pediatrician rather than pretending the app can fill it.
 */
export const CUSTOM_FOOD_SOFT_NOTE =
  "Added by you — there's no curated prep or choking guidance for this food. Check serving safety with your pediatrician.";

/**
 * Why a custom food couldn't be deleted, from the server's 409 counts. Pure
 * so the copy is pinned by a test — deleting a food that meals point at
 * would leave those meals (and their allergen exposures) dangling, so the
 * message has to name both places to go clean up.
 */
export function customFoodConflictMessage(conflict: {
  mealCount: number;
  pantryCount: number;
  /** Custom recipes this food is an ingredient of. Absent on a 409 body
   * from before custom recipes existed; omitted from the sentence at 0. */
  recipeCount?: number;
}): string {
  const parts = [countPhrase(conflict.mealCount, "meal"), countPhrase(conflict.pantryCount, "pantry item")];
  if (conflict.recipeCount) parts.push(countPhrase(conflict.recipeCount, "recipe"));
  return usedInMessage(parts);
}

/**
 * Why a custom recipe couldn't be deleted, from the server's 409 counts
 * (item 212) — the recipe-side twin of `customFoodConflictMessage`, with the
 * same wording and the same singular/plural care. Favorites never appear
 * here: they're removed with the recipe rather than blocking it.
 */
export function customRecipeConflictMessage(conflict: { mealCount: number; pantryCount: number }): string {
  return usedInMessage([countPhrase(conflict.mealCount, "meal"), countPhrase(conflict.pantryCount, "pantry item")]);
}

/** "3 meals" / "1 pantry item" — the count with its noun pluralized. */
function countPhrase(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** "Used in A and B — remove those first.", or "A, B and C" for three. */
function usedInMessage(parts: string[]): string {
  const last = parts[parts.length - 1]!;
  const head = parts.slice(0, -1);
  const list = head.length === 0 ? last : `${head.join(", ")} and ${last}`;
  return `Used in ${list} — remove those first.`;
}
