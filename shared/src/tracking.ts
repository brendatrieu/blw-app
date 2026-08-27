import { z } from "zod";
import { foodCategorySchema } from "./catalog.js";

/**
 * Per-baby tracking: meals (one sitting, one or more foods — the completion
 * log and the allergen-progress source of truth), derived allergen-ladder
 * progress, and recipe favorites. Shared between
 * server/src/routes/{meals,favorites}.ts and the client's
 * features/tracking/** query layer.
 */

/** One day of slack: a parent east of UTC can log "just now" on a calendar
 * day that has not started in UTC yet. Anything further out is a typo. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

export const servedAtSchema = z
  .string()
  .datetime({ message: "servedAt must be an ISO datetime" })
  .superRefine((value, ctx) => {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "servedAt is not a real datetime" });
      return;
    }
    if (ms > Date.now() + FUTURE_SLACK_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "servedAt cannot be more than 24h in the future" });
    }
  });

/** Empty string from a form field means "no note", not an empty string. */
const optionalReactionNote = z
  .string()
  .trim()
  .max(500, "Reaction note must be 500 characters or fewer")
  .nullish()
  .transform((value) => (value ? value : null));

// ---------------------------------------------------------------------------
// GET/POST /api/babies/:babyId/meals, PATCH/DELETE /api/meals/:id
// ---------------------------------------------------------------------------

export const babyIdRouteParamSchema = z.object({ babyId: z.string().uuid() });
export const mealIdParamSchema = z.object({ id: z.string().uuid() });

export const mealsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  /** Cursor: only meals served strictly before this timestamp. */
  before: z.string().datetime().optional(),
});
export type MealsQuery = z.infer<typeof mealsQuerySchema>;

/**
 * The final food list for the meal. The client sends what was actually
 * eaten — recipe ingredients are pre-filled and removable client-side, so
 * the server never expands a recipe itself. Duplicates are deduped by the
 * route (and by `meal_foods`' unique index) rather than rejected.
 */
export const mealFoodIdsSchema = z.array(z.string().uuid()).min(1).max(25);

export const createMealInputSchema = z.object({
  foodIds: mealFoodIdsSchema,
  /** Attribution only — never expanded into foods server-side. */
  recipeId: z
    .string()
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  /** Defaults to now on the server when omitted. */
  servedAt: servedAtSchema.optional(),
  reactionNote: optionalReactionNote,
});
export type CreateMealInput = z.input<typeof createMealInputSchema>;

/**
 * PATCH is a true partial update: an absent key leaves that column alone,
 * where an explicit `null` clears it. `reactionNote` therefore cannot reuse
 * `optionalReactionNote`, which collapses undefined into null.
 */
const patchReactionNote = z
  .string()
  .trim()
  .max(500, "Reaction note must be 500 characters or fewer")
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value ? value : null));

export const updateMealInputSchema = z
  .object({
    /** Replaces the meal's foods wholesale when present. */
    foodIds: mealFoodIdsSchema.optional(),
    recipeId: z.string().uuid().nullable().optional(),
    servedAt: servedAtSchema.optional(),
    reactionNote: patchReactionNote,
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateMealInput = z.input<typeof updateMealInputSchema>;

/**
 * A food as it appears inside a meal. `category` is carried so the client
 * can resolve its emoji (the emoji table is client-side, keyed by slug with
 * a category fallback); the server has no emoji column.
 */
export const mealFoodSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: foodCategorySchema,
});
export type MealFood = z.infer<typeof mealFoodSchema>;

export const mealItemSchema = z.object({
  id: z.string().uuid(),
  babyId: z.string().uuid(),
  servedAt: z.string(),
  reactionNote: z.string().nullable(),
  recipeId: z.string().uuid().nullable(),
  recipeTitle: z.string().nullable(),
  /** Always at least one food, ordered by name for a stable render. */
  foods: z.array(mealFoodSchema),
});
export type MealItem = z.infer<typeof mealItemSchema>;

export const mealsResponseSchema = z.object({ items: z.array(mealItemSchema) });
export type MealsResponse = z.infer<typeof mealsResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/babies/:babyId/allergen-progress
// ---------------------------------------------------------------------------

export const allergenStatusSchema = z.enum(["not_started", "started", "established"]);
export type AllergenStatus = z.infer<typeof allergenStatusSchema>;

/**
 * 0 exposures = not started, 1-2 = started, 3+ = established. The single
 * place this rule is spelled out — the server route and its tests both call
 * this instead of re-deriving the thresholds.
 */
export function deriveAllergenStatus(exposures: number): AllergenStatus {
  if (exposures <= 0) return "not_started";
  if (exposures < 3) return "started";
  return "established";
}

export const allergenProgressItemSchema = z.object({
  allergenSlug: z.string(),
  allergenName: z.string(),
  /** allergens.intro_guidance — included so the ladder tracker needs only
   * this one request, not a second round trip for guidance copy. */
  introGuidance: z.string(),
  exposures: z.number().int().nonnegative(),
  firstAt: z.string().nullable(),
  lastAt: z.string().nullable(),
  status: allergenStatusSchema,
});
export type AllergenProgressItem = z.infer<typeof allergenProgressItemSchema>;

export const allergenProgressResponseSchema = z.object({ items: z.array(allergenProgressItemSchema) });
export type AllergenProgressResponse = z.infer<typeof allergenProgressResponseSchema>;

// ---------------------------------------------------------------------------
// PUT/DELETE /api/recipes/:id/favorite, GET /api/favorites
// ---------------------------------------------------------------------------

export const favoriteRecipeIdParamSchema = z.object({ id: z.string().uuid() });

export const favoriteItemSchema = z.object({
  recipeId: z.string().uuid(),
  title: z.string(),
  minAgeMonths: z.number().int(),
  ironFocus: z.boolean(),
  allergens: z.array(z.string()),
});
export type FavoriteItem = z.infer<typeof favoriteItemSchema>;

export const favoritesResponseSchema = z.object({ items: z.array(favoriteItemSchema) });
export type FavoritesResponse = z.infer<typeof favoritesResponseSchema>;
