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
