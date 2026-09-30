import type { FoodCategory, Level, RecipeScope } from "@blw/shared";

// Display labels for enum values shared with the server. The allergen slug
// list mirrors the seeded top-9 (server/db/seeds/index.ts) — it isn't a
// hard-typed union server-side (allergens.slug is free text), so it's kept
// here as a UI-only convenience for building filter chips.
/**
 * `chipLabel` is the Foods page's filter-chip wording, `label` the long one the
 * custom-food select uses (item 332). Seven equal-width chips share a 360px
 * phone, so "Spices & herbs" would ellipsize into "Spices…" anyway — the short
 * label says the same thing on purpose rather than by truncation. "Vegetables"
 * gets "Veggies" the same way (item 569: "Veg" is British shorthand). Every
 * other category is already one short word and sets no `chipLabel`.
 */
export const CATEGORIES: { value: FoodCategory; label: string; chipLabel?: string }[] = [
  { value: "protein", label: "Protein" },
  { value: "veg", label: "Vegetables", chipLabel: "Veggies" },
  { value: "fruit", label: "Fruit" },
  { value: "grain", label: "Grain" },
  { value: "dairy", label: "Dairy" },
  { value: "legume", label: "Legume" },
  { value: "spice", label: "Spices & herbs", chipLabel: "Spices" },
];

/** The chip row's wording for a category — the short label where one exists. */
export function categoryChipLabel(category: { label: string; chipLabel?: string }): string {
  return category.chipLabel ?? category.label;
}

export const IRON_LEVELS: { value: Level; label: string }[] = [
  { value: "high", label: "High iron" },
  { value: "moderate", label: "Moderate iron" },
  { value: "low", label: "Low iron" },
];

export const VITAMIN_C_LEVELS: { value: Level; label: string }[] = [
  { value: "high", label: "High vitamin C" },
  { value: "moderate", label: "Moderate vitamin C" },
  { value: "low", label: "Low vitamin C" },
];

export const FIBER_LEVELS: { value: Level; label: string }[] = [
  { value: "high", label: "High fiber" },
  { value: "moderate", label: "Moderate fiber" },
  { value: "low", label: "Low fiber" },
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
 * Where the recipe list lives (item 273). It's a route of its own now — and a
 * bottom-nav tab — rather than a `?tab=` segment of the Foods page, so every
 * "back to the list" destination (after a delete, from a create page's close
 * button, from the old `/foods?tab=recipes` redirect) spells it by importing
 * this rather than by retyping the path.
 */
export const RECIPES_TAB_PATH = "/recipes";

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

/** A custom recipe's 409 has no `recipeCount`; a food's usage does. */
type UsageCounts = { mealCount: number; storageCount: number; recipeCount?: number };

/**
 * Where a custom food or recipe is used — "Used in 2 meals and 1 storage
 * item" — naming only the places that hold it, so "0 meals" never appears.
 * Null when nothing does. Pure so the copy is pinned by a test.
 */
export function usedInPhrase(counts: UsageCounts): string | null {
  const list = countList(counts);
  return list ? `Used in ${list}` : null;
}

/**
 * Why a custom recipe couldn't be deleted, from the server's 409 counts
 * (item 212). Favorites never appear here: they're removed with the recipe
 * rather than blocking it.
 */
export function customRecipeConflictMessage(conflict: { mealCount: number; storageCount: number }): string {
  return `${usedInPhrase(conflict) ?? "Still in use"} — remove those first.`;
}

/** Appended to a food name wherever history shows one its owner deleted. */
export const DELETED_FOOD_MARK = "(deleted)";

/** "Banana bread (deleted)" for a deleted food, the plain name otherwise —
 * for the places a name is only ever a string (titles, joined lists). */
export function withDeletedMark(name: string, deleted: boolean | undefined): string {
  // No-break space, as in DeletedMark: the mark wraps with its name.
  return deleted ? `${name}\u00a0${DELETED_FOOD_MARK}` : name;
}

/** "3 meals" / "1 storage item" — the count with its noun pluralized. */
function countPhrase(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** "A and B", or "A, B and C" for three — the non-zero counts only. */
function countList({ mealCount, storageCount, recipeCount = 0 }: UsageCounts): string | null {
  const parts: string[] = [];
  if (mealCount > 0) parts.push(countPhrase(mealCount, "meal"));
  if (storageCount > 0) parts.push(countPhrase(storageCount, "storage item"));
  if (recipeCount > 0) parts.push(countPhrase(recipeCount, "recipe"));
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1]!;
  const head = parts.slice(0, -1);
  return head.length === 0 ? last : `${head.join(", ")} and ${last}`;
}
