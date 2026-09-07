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
  /**
   * True for a food a parent added themselves (`foods.owner_id` set), false
   * for seeded catalog content. Custom rows carry neutral placeholder levels
   * and empty prep text because nobody wrote curated guidance for them — the
   * client reads this flag to hide those fields rather than show a made-up
   * "low choking risk".
   */
  isCustom: z.boolean(),
  /** The parent's chosen emoji, or null — the client falls back to its own
   * slug/category emoji map. */
  emoji: z.string().nullable(),
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
// POST /api/foods, PATCH /api/foods/:id, DELETE /api/foods/:id
//
// Foods a parent adds for themselves. They live in the same table as the
// seeded catalog (owner_id distinguishes them) and appear everywhere catalog
// foods do, but they carry NO curated nutrition/prep/choking content: the
// fields exist only because the columns are NOT NULL, and `isCustom` tells
// the client not to render them.
// ---------------------------------------------------------------------------

export const foodIdParamSchema = z.object({ id: z.string().uuid() });

export const CUSTOM_FOOD_NAME_MAX = 60;
export const CUSTOM_FOOD_NOTES_MAX = 500;
/** A checklist, not a taxonomy — the seeded list is 9 long. */
export const CUSTOM_FOOD_ALLERGENS_MAX = 20;

/**
 * One emoji, not a label. Exactly one grapheme cluster — so a skin-toned or
 * ZWJ-joined sequence still counts as one character — and it has to contain
 * a pictographic codepoint, which keeps a stray letter or digit out of a
 * field the UI renders at display size.
 */
export function isSingleEmoji(value: string): boolean {
  if (value.length === 0 || value.length > 24) return false;
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)];
  return segments.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value);
}

/** `""` from an untouched emoji picker means "no emoji", not an empty string. */
const customFoodEmoji = z
  .string()
  .trim()
  .max(24)
  .nullish()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || isSingleEmoji(value), {
    message: "Emoji must be a single emoji character",
  });

const customFoodNotes = z
  .string()
  .trim()
  .max(CUSTOM_FOOD_NOTES_MAX, `Notes must be ${CUSTOM_FOOD_NOTES_MAX} characters or fewer`)
  .nullish()
  .transform((value) => (value ? value : null));

/**
 * Slugs from the seeded `allergens` table. Validated against that table by
 * the server rather than against a literal list here, so a catalog that
 * gains an allergen does not need a shared-package release.
 */
const customFoodAllergenSlugs = z.array(z.string().min(1).max(40)).max(CUSTOM_FOOD_ALLERGENS_MAX);

export const createCustomFoodSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(CUSTOM_FOOD_NAME_MAX, `Name must be ${CUSTOM_FOOD_NAME_MAX} characters or fewer`),
  category: foodCategorySchema,
  emoji: customFoodEmoji,
  /** Absent means "the parent ticked nothing", which is a real answer. */
  allergenSlugs: customFoodAllergenSlugs.default([]),
  notes: customFoodNotes,
});
export type CreateCustomFoodInput = z.input<typeof createCustomFoodSchema>;

/**
 * A true partial update: an absent key leaves that column alone. `emoji` and
 * `notes` still collapse `""`/null to null when they ARE sent, so the form
 * can clear them. The slug is deliberately not editable — links and pantry
 * rows already point at it.
 */
export const updateCustomFoodSchema = z
  .object({
    name: createCustomFoodSchema.shape.name.optional(),
    category: foodCategorySchema.optional(),
    emoji: customFoodEmoji.optional(),
    /** Replaces the food's allergen set wholesale when present. */
    allergenSlugs: customFoodAllergenSlugs.optional(),
    notes: customFoodNotes.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateCustomFoodInput = z.input<typeof updateCustomFoodSchema>;

/**
 * DELETE /api/foods/:id when the food is still referenced. The counts are
 * what the UI needs to say "used in N meals and N pantry items" instead of a
 * bare "can't delete this".
 */
export const customFoodConflictSchema = z.object({
  error: z.literal("conflict"),
  mealCount: z.number().int(),
  pantryCount: z.number().int(),
});
export type CustomFoodConflict = z.infer<typeof customFoodConflictSchema>;

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
