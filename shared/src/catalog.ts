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
  vitaminCLevel: levelSchema.optional(),
  fiberLevel: levelSchema.optional(),
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
  fiberLevel: levelSchema,
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
  /** How many ingredient foods the recipe has in total (not just this one).
   * The client derives the "Basic" single-ingredient marker from it, so no
   * flag is stored anywhere. Optional so a body from before the basics
   * shipped still parses; the server always sends it. */
  ingredientCount: z.number().int().nonnegative().optional(),
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
 * can clear them. The slug is deliberately not editable — links and storage
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
 * what the UI needs to say "used in N meals and N storage items" instead of a
 * bare "can't delete this".
 */
export const customFoodConflictSchema = z.object({
  error: z.literal("conflict"),
  mealCount: z.number().int(),
  storageCount: z.number().int(),
  /** Custom recipes this food is an ingredient of. Optional so a body from
   * before custom recipes still parses; the server always sends it. */
  recipeCount: z.number().int().optional(),
});
export type CustomFoodConflict = z.infer<typeof customFoodConflictSchema>;

// ---------------------------------------------------------------------------
// GET /api/recipes/:id
// ---------------------------------------------------------------------------

export const recipeIngredientSchema = z.object({
  /** The ingredient's food id, so a client logging this recipe can fan it out
   * into meal foods without first mapping slugs through the foods list. */
  foodId: z.string().uuid(),
  foodSlug: z.string(),
  foodName: z.string(),
  /** True when the ingredient is a food this parent added themselves. */
  isCustom: z.boolean(),
  /** The parent's chosen emoji on a custom food, else null — catalog foods
   * keep resolving their emoji from the client's slug/category map. */
  foodEmoji: z.string().nullable(),
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
  /** Curated claim OR derivation: true when the catalog row stores
   * `iron_focus`, or ANY ingredient food has `ironLevel: "high"`. A custom
   * recipe built on beef is therefore iron-rich without storing anything. */
  ironFocus: z.boolean(),
  /** Derived from the ingredients' foods: true when at least one ingredient
   * food has `vitaminCLevel: "high"` — same derivation as `allergens`. */
  vitaminCHigh: z.boolean(),
  /** Derived from the ingredients' foods: true when at least one ingredient
   * food has `fiberLevel: "high"` — the same derivation as `vitaminCHigh`. */
  fiberHigh: z.boolean(),
  imageUrl: z.string().nullable(),
  fridgeHoursOverride: z.number().int().nullable(),
  freezerDaysOverride: z.number().int().nullable(),
  allergens: z.array(z.string()),
  ingredients: z.array(recipeIngredientSchema),
  extraIngredients: z.array(z.string()),
  variants: z.array(recipeVariantSchema),
  /**
   * True for a recipe a parent wrote themselves (`recipes.owner_id` set).
   * A custom recipe carries exactly ONE variant — the client renders its
   * steps as a single "Steps" section rather than age tabs — and stores
   * `prepMinutes: 0` / a stored `iron_focus` of false when the parent said
   * nothing (the `ironFocus` FIELD above can still be true, off its
   * ingredients).
   */
  isCustom: z.boolean(),
  /** The parent's own note on a custom recipe. Catalog rows are null. */
  notes: z.string().nullable(),
});
export type RecipeDetail = z.infer<typeof recipeDetailSchema>;

// ---------------------------------------------------------------------------
// GET /api/recipes
//
// Catalog recipes plus the caller's own, never anybody else's. Allergens are
// derived from the ingredients' foods (the same join the detail route and the
// favorites list use), so a custom recipe built on a custom peanut food shows
// "peanut" here too.
// ---------------------------------------------------------------------------

export const recipeScopeSchema = z.enum(["all", "favorites", "custom"]);
export type RecipeScope = z.infer<typeof recipeScopeSchema>;

/**
 * A flag arriving as a query string. `"true"`/`"1"` is on, `"false"`/`"0"` is
 * off — an ABSENT key means "don't filter on this at all", which is what a
 * client whose toggle is off should send.
 */
const queryFlag = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((value) => value === true || value === "true" || value === "1");

export const recipesQuerySchema = z.object({
  /** Substring match on the title. */
  q: z.string().min(1).optional(),
  scope: recipeScopeSchema.default("all"),
  /** Recipes suitable at or below this age, i.e. `minAgeMonths <= value`. */
  maxAgeMonths: z.coerce.number().int().nonnegative().optional(),
  /** Allergen slug, matched against the recipe's DERIVED allergen set. */
  allergen: z.string().min(1).optional(),
  /** "true"/"false"/"1"/"0". Present is an exact filter on the recipe's
   * DERIVED `ironFocus` (curated flag OR a high-iron ingredient), absent
   * filters on nothing. */
  ironFocus: queryFlag.optional(),
  /** Same "true"/"false"/"1"/"0" flag semantics as `ironFocus`: present is an
   * exact filter on the recipe's derived `vitaminCHigh`, absent filters on
   * nothing. */
  vitaminCHigh: queryFlag.optional(),
  /** Same flag semantics again: present is an exact filter on the recipe's
   * derived `fiberHigh`, absent filters on nothing. */
  fiberHigh: queryFlag.optional(),
  /** Recipes that use this food as an ingredient. */
  ingredientFoodId: z.string().uuid().optional(),
});
export type RecipesQuery = z.infer<typeof recipesQuerySchema>;

export const recipeListItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  minAgeMonths: z.number().int(),
  /** Curated claim OR derivation — see `recipeDetailSchema.ironFocus`. */
  ironFocus: z.boolean(),
  /** Derived from the ingredients' foods, not stored on the recipe — same
   * derivation as `allergens`. */
  vitaminCHigh: z.boolean(),
  /** Derived from the ingredients' foods, not stored on the recipe — the
   * vitamin C twin. */
  fiberHigh: z.boolean(),
  /** Derived from the ingredients' foods, not stored on the recipe. */
  allergens: z.array(z.string()),
  isCustom: z.boolean(),
  /** Whether the CALLER has favorited it — this list is always per-user. */
  isFavorite: z.boolean(),
  /** Ingredient food names, alphabetical, for a subtitle line. */
  ingredientNames: z.array(z.string()),
});
export type RecipeListItem = z.infer<typeof recipeListItemSchema>;

export const recipesResponseSchema = z.object({ recipes: z.array(recipeListItemSchema) });
export type RecipesResponse = z.infer<typeof recipesResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/recipes, PATCH /api/recipes/:id, DELETE /api/recipes/:id
//
// Recipes a parent writes for themselves. Same table as the seeded catalog
// (owner_id distinguishes them), but no curated content: no image, no storage
// overrides, no iron-focus claim, and ONE set of steps rather than the
// catalog's three age variants.
// ---------------------------------------------------------------------------

export const recipeIdParamSchema = z.object({ id: z.string().uuid() });

export const CUSTOM_RECIPE_TITLE_MAX = 80;
export const CUSTOM_RECIPE_MIN_AGE_MONTHS = 6;
export const CUSTOM_RECIPE_MAX_AGE_MONTHS = 36;
export const CUSTOM_RECIPE_INGREDIENTS_MAX = 30;
export const CUSTOM_RECIPE_QUANTITY_NOTE_MAX = 80;
export const CUSTOM_RECIPE_EXTRA_INGREDIENTS_MAX = 20;
export const CUSTOM_RECIPE_EXTRA_INGREDIENT_MAX = 60;
export const CUSTOM_RECIPE_STEPS_MAX = 30;
export const CUSTOM_RECIPE_STEP_MAX = 500;
export const CUSTOM_RECIPE_NOTES_MAX = 500;
export const CUSTOM_RECIPE_PREP_MINUTES_MAX = 600;

/**
 * Which single `recipe_variants` row a custom recipe's steps live in. The
 * catalog carries all three stages; a parent writes one set of steps, so it
 * is filed at the stage their "suitable from" age falls in.
 */
export function ageStageForMonths(minAgeMonths: number): AgeStage {
  if (minAgeMonths >= 12) return "12";
  if (minAgeMonths >= 9) return "9";
  return "6";
}

/** `""` is a real answer here — "no quantity given", not a missing field. */
const customRecipeQuantityNote = z
  .string()
  .trim()
  .max(CUSTOM_RECIPE_QUANTITY_NOTE_MAX, `Quantity must be ${CUSTOM_RECIPE_QUANTITY_NOTE_MAX} characters or fewer`)
  .nullish()
  .transform((value) => value ?? "");

export const customRecipeIngredientInputSchema = z.object({
  foodId: z.string().uuid(),
  quantityNote: customRecipeQuantityNote,
});
export type CustomRecipeIngredientInput = z.input<typeof customRecipeIngredientInputSchema>;

const customRecipeIngredients = z
  .array(customRecipeIngredientInputSchema)
  .min(1, "Add at least one ingredient")
  .max(CUSTOM_RECIPE_INGREDIENTS_MAX, `A recipe can have at most ${CUSTOM_RECIPE_INGREDIENTS_MAX} ingredients`);

const customRecipeExtraIngredients = z
  .array(z.string().trim().min(1).max(CUSTOM_RECIPE_EXTRA_INGREDIENT_MAX))
  .max(CUSTOM_RECIPE_EXTRA_INGREDIENTS_MAX);

/**
 * A custom recipe's steps — OPTIONAL since item 240: plenty of real recipes
 * are "these ingredients, mashed", and a parent should not have to invent a
 * step to save one. An empty list is therefore a valid answer, and a blank
 * entry is DROPPED rather than rejected (an empty step box means "I did not
 * fill this in", not "the recipe has a blank step"). The cap is unchanged,
 * and applies before the blanks are dropped.
 */
const customRecipeSteps = z
  .array(z.string().trim().max(CUSTOM_RECIPE_STEP_MAX))
  .max(CUSTOM_RECIPE_STEPS_MAX, `A recipe can have at most ${CUSTOM_RECIPE_STEPS_MAX} steps`)
  .transform((steps) => steps.filter((step) => step.length > 0));

const customRecipeNotes = z
  .string()
  .trim()
  .max(CUSTOM_RECIPE_NOTES_MAX, `Notes must be ${CUSTOM_RECIPE_NOTES_MAX} characters or fewer`)
  .nullish()
  .transform((value) => (value ? value : null));

export const createCustomRecipeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(CUSTOM_RECIPE_TITLE_MAX, `Title must be ${CUSTOM_RECIPE_TITLE_MAX} characters or fewer`),
  minAgeMonths: z.number().int().min(CUSTOM_RECIPE_MIN_AGE_MONTHS).max(CUSTOM_RECIPE_MAX_AGE_MONTHS),
  /** Every food id must be one the caller can see — the catalog or their own
   * custom foods. Anything else is a 400, never a silent drop. */
  ingredients: customRecipeIngredients,
  /** Free-text ingredients with no food row behind them ("olive oil"). */
  extraIngredients: customRecipeExtraIngredients.default([]),
  /** Optional since item 240 — an omitted list means "no steps". */
  steps: customRecipeSteps.default([]),
  notes: customRecipeNotes,
  /** Omitted means "not stated"; stored as 0 and hidden by the client. */
  prepMinutes: z.number().int().min(0).max(CUSTOM_RECIPE_PREP_MINUTES_MAX).optional(),
});
export type CreateCustomRecipeInput = z.input<typeof createCustomRecipeSchema>;

/**
 * A true partial update: an absent key leaves that column alone. The three
 * list fields REPLACE their set wholesale when present — there is no
 * add-one/remove-one verb. The slug is not editable: links already point at
 * it, exactly as with custom foods.
 */
export const updateCustomRecipeSchema = z
  .object({
    title: createCustomRecipeSchema.shape.title.optional(),
    minAgeMonths: createCustomRecipeSchema.shape.minAgeMonths.optional(),
    ingredients: customRecipeIngredients.optional(),
    extraIngredients: customRecipeExtraIngredients.optional(),
    steps: customRecipeSteps.optional(),
    notes: customRecipeNotes.optional(),
    prepMinutes: z.number().int().min(0).max(CUSTOM_RECIPE_PREP_MINUTES_MAX).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateCustomRecipeInput = z.input<typeof updateCustomRecipeSchema>;

/**
 * DELETE /api/recipes/:id when the recipe is still referenced by logged meals
 * or storage items. Favorites are NOT a block — the caller's own favorite row
 * is simply removed with the recipe.
 */
export const customRecipeConflictSchema = z.object({
  error: z.literal("conflict"),
  mealCount: z.number().int(),
  storageCount: z.number().int(),
});
export type CustomRecipeConflict = z.infer<typeof customRecipeConflictSchema>;
