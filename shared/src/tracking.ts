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

/** Empty string from a form field means "no note", not an empty string.
 * Exported so the pantry serve endpoint takes the identical note field. */
export const optionalReactionNote = z
  .string()
  .trim()
  .max(500, "Reaction note must be 500 characters or fewer")
  .nullish()
  .transform((value) => (value ? value : null));

/**
 * A general, non-clinical note on a meal ("ate the whole thing", "second
 * try"). Deliberately a SEPARATE field from `reactionNote`: only
 * `reactionNote` is read as a reaction signal by the AI symptom/snapshot
 * pipeline, so anything written here can never mark a food reactive.
 *
 * Same handling as `optionalReactionNote` — trimmed, `""`/null/undefined all
 * collapse to null, 500 characters max. Exported so the pantry create/edit
 * and serve endpoints take the identical field.
 */
export const optionalNotes = z
  .string()
  .trim()
  .max(500, "Notes must be 500 characters or fewer")
  .nullish()
  .transform((value) => (value ? value : null));

/**
 * The PATCH form of `optionalNotes`: an absent key leaves the column alone,
 * where an explicit `null` (or `""`) clears it. `.optional()` short-circuits
 * on `undefined` without running the inner transform, which is exactly the
 * "absent means untouched" semantics a partial update needs.
 */
export const patchNotes = optionalNotes.optional();

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
  /** General note — never read as a reaction signal. See `optionalNotes`. */
  notes: optionalNotes,
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
    notes: patchNotes,
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateMealInput = z.input<typeof updateMealInputSchema>;

/**
 * A food as it appears inside a meal. `category` is carried so the client
 * can resolve its emoji from the client-side table (keyed by slug with a
 * category fallback); `emoji` overrides that when a parent picked one on a
 * custom food. Optional in the contract because it only exists for custom
 * foods — a catalog food sends `null` and a cached older payload sends
 * nothing at all, and both must keep parsing.
 */
export const mealFoodSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: foodCategorySchema,
  emoji: z.string().nullable().optional(),
  /**
   * The pantry item this food was served from, or `null` for a meal logged
   * by hand. Only POST /api/pantry/:id/serve sets it — logging through
   * /api/babies/:babyId/meals never links to (or decrements) the pantry.
   */
  pantryItemId: z.string().uuid().nullable(),
});
export type MealFood = z.infer<typeof mealFoodSchema>;

export const mealItemSchema = z.object({
  id: z.string().uuid(),
  babyId: z.string().uuid(),
  servedAt: z.string(),
  reactionNote: z.string().nullable(),
  /** General note, distinct from `reactionNote` — see `optionalNotes`. */
  notes: z.string().nullable(),
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

/**
 * The union of the derived ladder and the parent's manual overrides
 * (PUT /api/babies/:babyId/allergens/:key/established), and the single place
 * that precedence is spelled out — the progress route and the AI baby-profile
 * summary both call this instead of re-implementing the rule.
 *
 * Rules, in order:
 *  - Derived-established wins outright. An allergen the meal log already
 *    proves established reads `established` with `overridden: false`, even
 *    when a stray override row also exists — the flag answers "is this
 *    status only true because a parent said so?", so real data always
 *    un-flags it. (A client labelling "marked by you" therefore never
 *    labels a row the log itself supports.)
 *  - Otherwise an override promotes to `established` with `overridden: true`.
 *  - Otherwise the derived status stands as-is.
 *
 * An override can only ever promote: `started` never falls back to
 * `not_started`, and `established` is never downgraded, whatever the
 * overrides table says. `exposures`/`firstAt`/`lastServedAt` stay purely
 * derived — an override contributes a status, never a date.
 */
export function unionAllergenStatus(
  exposures: number,
  hasOverride: boolean,
): { status: AllergenStatus; overridden: boolean } {
  const derived = deriveAllergenStatus(exposures);
  if (derived === "established") return { status: "established", overridden: false };
  if (hasOverride) return { status: "established", overridden: true };
  return { status: derived, overridden: false };
}

export const allergenProgressItemSchema = z.object({
  allergenSlug: z.string(),
  allergenName: z.string(),
  /** allergens.intro_guidance — included so the ladder tracker needs only
   * this one request, not a second round trip for guidance copy. */
  introGuidance: z.string(),
  /** Always the DERIVED exposure count — an override never inflates it. */
  exposures: z.number().int().nonnegative(),
  firstAt: z.string().nullable(),
  /**
   * The most recent `meals.servedAt` across every food carrying this allergen
   * for this baby, ISO-8601, or null when the log holds no exposure at all.
   * Purely derived, exactly like `exposures`/`firstAt`: a parent override
   * establishes the allergen but carries no date, so an override-only row
   * reads `lastServedAt: null` — which is what lets the client say "no serves
   * logged yet" instead of inventing a recency it does not have.
   */
  lastServedAt: z.string().nullable(),
  /** Derived status unioned with the parent's override — see `unionAllergenStatus`. */
  status: allergenStatusSchema,
  /**
   * True only when `status` is `established` BECAUSE of a parent override and
   * the derived exposures alone would not have gotten there. Never true for a
   * `started`/`not_started` row, and never true when the meal log already
   * establishes the allergen. See `unionAllergenStatus`.
   */
  overridden: z.boolean(),
});
export type AllergenProgressItem = z.infer<typeof allergenProgressItemSchema>;

export const allergenProgressResponseSchema = z.object({ items: z.array(allergenProgressItemSchema) });
export type AllergenProgressResponse = z.infer<typeof allergenProgressResponseSchema>;

// ---------------------------------------------------------------------------
// PUT/DELETE /api/babies/:babyId/allergens/:key/established
// ---------------------------------------------------------------------------

/**
 * `:key` is an `allergens.slug`. The shape check here is cheap and only
 * screens out things a slug can never be — the CANONICAL list is the seeded
 * `allergens` table, and the route still looks the key up there before
 * writing, so an unknown-but-well-formed key is a 400 too.
 */
export const allergenKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "allergen key must be a lowercase slug");

/**
 * Only the `:key` half. `:babyId` is parsed separately with
 * `babyIdRouteParamSchema` because the two halves fail differently: a
 * malformed/foreign baby id is a 404 (it cannot name a row this caller owns),
 * where a malformed or unknown allergen key is a 400.
 */
export const allergenKeyParamSchema = z.object({ key: allergenKeySchema });
export type AllergenKeyParams = z.infer<typeof allergenKeyParamSchema>;

// ---------------------------------------------------------------------------
// GET /api/babies/:babyId/allergen-progress/:slug
// ---------------------------------------------------------------------------

/**
 * Both halves of the detail route's path. `:babyId` still fails as a 404
 * (a malformed id cannot name a row this caller owns) and so does an
 * unknown `:slug` — unlike the override routes, where a bad key is a 400,
 * this one is a page address: "no such allergen" and "not your baby" are the
 * same dead end and answer the same way.
 */
export const allergenDetailParamsSchema = z.object({
  babyId: z.string().uuid(),
  slug: allergenKeySchema,
});
export type AllergenDetailParams = z.infer<typeof allergenDetailParamsSchema>;

/**
 * A food carrying this allergen: the seeded catalog plus the CALLER's own
 * custom foods (another parent's custom foods are invisible here, exactly as
 * they are everywhere else — see the catalog's visibility rule). `emoji` is
 * the parent's pick on a custom food and null for catalog rows, which resolve
 * theirs from the client's slug/category table.
 */
export const allergenDetailFoodSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: foodCategorySchema,
  emoji: z.string().nullable(),
  isCustom: z.boolean(),
});
export type AllergenDetailFood = z.infer<typeof allergenDetailFoodSchema>;

/**
 * One meal that exposed this baby to the allergen. `foods` lists ONLY the
 * allergen-carrying foods of that meal — the rest of the plate is not what
 * this page is about — so it is a subset of the meal's real foods and always
 * has at least one entry.
 */
export const allergenDetailExposureSchema = z.object({
  mealId: z.string().uuid(),
  servedAt: z.string(),
  foods: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      emoji: z.string().nullable(),
    }),
  ),
  /** `meals.reactionNote` under the name this page reads it by. */
  reaction: z.string().nullable(),
  notes: z.string().nullable(),
});
export type AllergenDetailExposure = z.infer<typeof allergenDetailExposureSchema>;

/**
 * `progress` is byte-for-byte the item the ladder route returns for this
 * allergen — both come out of the same derivation helper, so the detail page
 * can never disagree with the row that opened it. `exposures` is newest
 * first and capped; an allergen established by a parent override alone has
 * an empty list and a null `lastServedAt`, because an override carries a
 * status and never a date.
 */
export const allergenDetailSchema = z.object({
  progress: allergenProgressItemSchema,
  foods: z.array(allergenDetailFoodSchema),
  exposures: z.array(allergenDetailExposureSchema),
});
export type AllergenDetail = z.infer<typeof allergenDetailSchema>;

// ---------------------------------------------------------------------------
// PUT/DELETE /api/recipes/:id/favorite, GET /api/favorites
// ---------------------------------------------------------------------------

export const favoriteRecipeIdParamSchema = z.object({ id: z.string().uuid() });

export const favoriteItemSchema = z.object({
  recipeId: z.string().uuid(),
  title: z.string(),
  minAgeMonths: z.number().int(),
  /** Curated claim OR a high-iron ingredient, exactly as the recipes list
   * and the recipe detail derive it. */
  ironFocus: z.boolean(),
  /** Derived the same way the recipes list derives it — see
   * `GET /api/favorites`. */
  vitaminCHigh: z.boolean(),
  /** Derived the same way the recipes list derives it. */
  fiberHigh: z.boolean(),
  allergens: z.array(z.string()),
});
export type FavoriteItem = z.infer<typeof favoriteItemSchema>;

export const favoritesResponseSchema = z.object({ items: z.array(favoriteItemSchema) });
export type FavoritesResponse = z.infer<typeof favoritesResponseSchema>;
