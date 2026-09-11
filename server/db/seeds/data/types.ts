// server/db/seeds/data/types.ts - shared shapes for the seed data files.
export type Level = 'high' | 'moderate' | 'low'
export type AllergenSlug = 'milk'|'egg'|'peanut'|'tree_nut'|'fish'|'shellfish'|'wheat'|'soy'|'sesame'
export interface FoodSeed {
  slug: string; name: string;
  category: 'protein'|'veg'|'fruit'|'grain'|'dairy'|'legume';
  ironLevel: Level; vitaminCLevel: Level; fiberLevel: Level; chokingRisk: Level;
  minAgeMonths: number;
  prep6m: string; prep9m: string; prep12m: string;
  chokingNotes?: string; notes?: string;
  allergens: AllergenSlug[];
  storageCategory: string;
}
export interface PairingSeed { ironFoodSlug: string; vitCFoodSlug: string; reason: string }
export interface RecipeSeed {
  slug: string; title: string; minAgeMonths: number; prepMinutes: number;
  ironFocus: boolean;
  fridgeHoursOverride?: number; freezerDaysOverride?: number;
  ingredients: { foodSlug: string; quantityNote: string }[];
  // Free-text staples with no catalog food row. Objects since item 298: an
  // obvious leading quantity ("a pinch of", "1 teaspoon") is split off into
  // `quantityNote` HERE rather than in migration 0011, which only renames the
  // old strings into `name`. Omitted quantityNote is stored as "".
  extraIngredients?: { name: string; quantityNote?: string }[];
  // Stage variants. Every stage at or above the recipe's minAgeMonths is
  // present; earlier stages are omitted — a 9-month recipe (shrimp) carries
  // 9 and 12 only, and the seeder writes a row per stage that IS present.
  variants: Partial<Record<'6'|'9'|'12', { textureNote: string; steps: string[] }>>;
}
export interface LadderStepSeed { step: number; allergen: AllergenSlug; starterFoodSlug: string; howTo: string; waitDays: number }
export interface StorageGuidelineSeed { category: string; fridgeHours: number; freezerDays: number | null; roomTempHours: number; notes: string }
