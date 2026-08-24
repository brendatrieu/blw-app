import { z } from "zod";

/**
 * Per-baby tracking: serve logs (the completion log + allergen-progress
 * source of truth), derived allergen-ladder progress, and recipe favorites.
 * Shared between server/src/routes/{serve-logs,favorites}.ts and the
 * client's features/tracking/** query layer.
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
// GET/POST /api/babies/:babyId/serve-logs, DELETE /api/serve-logs/:id
// ---------------------------------------------------------------------------

export const babyIdRouteParamSchema = z.object({ babyId: z.string().uuid() });
export const serveLogIdParamSchema = z.object({ id: z.string().uuid() });

export const serveLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  /** Cursor: only rows served strictly before this timestamp. */
  before: z.string().datetime().optional(),
});
export type ServeLogsQuery = z.infer<typeof serveLogsQuerySchema>;

export const createServeLogInputSchema = z.object({
  foodId: z.string().uuid(),
  recipeId: z
    .string()
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  /** Defaults to now on the server when omitted. */
  servedAt: servedAtSchema.optional(),
  reactionNote: optionalReactionNote,
});
export type CreateServeLogInput = z.input<typeof createServeLogInputSchema>;

export const serveLogItemSchema = z.object({
  id: z.string().uuid(),
  foodId: z.string().uuid(),
  foodSlug: z.string(),
  foodName: z.string(),
  recipeId: z.string().uuid().nullable(),
  recipeTitle: z.string().nullable(),
  servedAt: z.string(),
  reactionNote: z.string().nullable(),
});
export type ServeLogItem = z.infer<typeof serveLogItemSchema>;

export const serveLogsResponseSchema = z.object({ items: z.array(serveLogItemSchema) });
export type ServeLogsResponse = z.infer<typeof serveLogsResponseSchema>;

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
