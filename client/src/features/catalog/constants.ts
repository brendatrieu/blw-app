import type { FoodCategory, Level } from "@blw/shared";

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
export function customFoodConflictMessage(conflict: { mealCount: number; pantryCount: number }): string {
  const meals = `${conflict.mealCount} ${conflict.mealCount === 1 ? "meal" : "meals"}`;
  const pantry = `${conflict.pantryCount} pantry ${conflict.pantryCount === 1 ? "item" : "items"}`;
  return `Used in ${meals} and ${pantry} — remove those first.`;
}
