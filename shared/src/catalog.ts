import { z } from "zod";

/**
 * Foods & recipes catalog: response shapes and query schemas shared between
 * the server routes (server/src/routes/catalog.ts) and the client's
 * react-query hooks (client/src/features/catalog/**).
 */

export const levelSchema = z.enum(["high", "moderate", "low"]);
export type Level = z.infer<typeof levelSchema>;

export const foodCategorySchema = z.enum(["protein", "veg", "fruit", "grain", "dairy", "legume"]);
export type FoodCategory = z.infer<typeof foodCategorySchema>;

export const ageStageSchema = z.enum(["6", "9", "12"]);
export type AgeStage = z.infer<typeof ageStageSchema>;

// ---------------------------------------------------------------------------
// GET /api/foods
// ---------------------------------------------------------------------------

export const foodsQuerySchema = z.object({
  category: foodCategorySchema.optional(),
  allergen: z.string().min(1).optional(),
  ironLevel: levelSchema.optional(),
  q: z.string().min(1).optional(),
  maxAgeMonths: z.coerce.number().int().nonnegative().optional(),
});
export type FoodsQuery = z.infer<typeof foodsQuerySchema>;

export const foodListItemSchema = z.object({
  // The catalog's own read routes never needed this (slug is the
  // client-facing key), but tracking (server/src/routes/serve-logs.ts)
  // POSTs a real foods.id, so the client needs a way to learn it.
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: foodCategorySchema,
  ironLevel: levelSchema,
  vitaminCLevel: levelSchema,
  chokingRisk: levelSchema,
  minAgeMonths: z.number().int(),
  allergens: z.array(z.string()),
});
export type FoodListItem = z.infer<typeof foodListItemSchema>;

export const foodsResponseSchema = z.object({
  foods: z.array(foodListItemSchema),
});
export type FoodsResponse = z.infer<typeof foodsResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/foods/:slug
// ---------------------------------------------------------------------------

export const foodPairingSchema = z.object({
  food: z.object({
    slug: z.string(),
    name: z.string(),
    ironLevel: levelSchema,
    vitaminCLevel: levelSchema,
  }),
  reason: z.string(),
});
export type FoodPairing = z.infer<typeof foodPairingSchema>;

export const foodRecipeRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  minAgeMonths: z.number().int(),
});
export type FoodRecipeRef = z.infer<typeof foodRecipeRefSchema>;

export const foodDetailSchema = foodListItemSchema.extend({
  prep6m: z.string(),
  prep9m: z.string(),
  prep12m: z.string(),
  chokingNotes: z.string().nullable(),
  notes: z.string().nullable(),
  imageUrl: z.string().nullable(),
  pairings: z.array(foodPairingSchema),
  recipes: z.array(foodRecipeRefSchema),
});
export type FoodDetail = z.infer<typeof foodDetailSchema>;

// ---------------------------------------------------------------------------
// GET /api/recipes/:id
// ---------------------------------------------------------------------------

export const recipeIngredientSchema = z.object({
  foodSlug: z.string(),
  foodName: z.string(),
  quantityNote: z.string(),
});
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

export const recipeVariantSchema = z.object({
  ageStage: ageStageSchema,
  textureNote: z.string(),
  steps: z.array(z.string()),
});
export type RecipeVariant = z.infer<typeof recipeVariantSchema>;

export const recipeDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  minAgeMonths: z.number().int(),
  prepMinutes: z.number().int(),
  ironFocus: z.boolean(),
  imageUrl: z.string().nullable(),
  fridgeHoursOverride: z.number().int().nullable(),
  freezerDaysOverride: z.number().int().nullable(),
  allergens: z.array(z.string()),
  ingredients: z.array(recipeIngredientSchema),
  extraIngredients: z.array(z.string()),
  variants: z.array(recipeVariantSchema),
});
export type RecipeDetail = z.infer<typeof recipeDetailSchema>;
