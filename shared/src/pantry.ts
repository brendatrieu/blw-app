import { z } from "zod";
import { parseCalendarDate } from "./babies.js";
import { mealItemSchema, optionalNotes, optionalReactionNote, patchNotes, servedAtSchema } from "./tracking.js";

/**
 * Home pantry tracking: what's been prepared, where it's stored, and when it
 * expires. Shared between server/src/routes/pantry.ts and the client's
 * features/pantry/** query layer.
 */

export const pantryLocationSchema = z.enum(["fridge", "freezer", "counter"]);
export type PantryLocation = z.infer<typeof pantryLocationSchema>;

export const pantryStatusSchema = z.enum(["active", "finished", "discarded"]);
export type PantryStatus = z.infer<typeof pantryStatusSchema>;

// ---------------------------------------------------------------------------
// GET /api/pantry
// ---------------------------------------------------------------------------

export const pantryViewSchema = z.enum(["active", "history"]);
export type PantryView = z.infer<typeof pantryViewSchema>;

export const pantryQuerySchema = z.object({
  view: pantryViewSchema.optional().default("active"),
});
export type PantryQuery = z.infer<typeof pantryQuerySchema>;

export const pantryItemIdParamSchema = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------
// POST /api/pantry, PATCH /api/pantry/:id
// ---------------------------------------------------------------------------

/** One day of slack: mirrors servedAt/birthDate — a parent east of UTC can
 * log "just now" on a calendar day that has not started in UTC yet. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

export const preparedAtSchema = z
  .string()
  .datetime({ message: "preparedAt must be an ISO datetime" })
  .superRefine((value, ctx) => {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "preparedAt is not a real datetime" });
      return;
    }
    if (ms > Date.now() + FUTURE_SLACK_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "preparedAt cannot be more than 24h in the future" });
    }
  });

const labelSchema = z
  .string()
  .trim()
  .min(1, "Label cannot be empty")
  .max(80, "Label must be 80 characters or fewer");

/** Empty string from a form field means "no label", not an empty string. */
const optionalLabel = labelSchema.nullish().transform((value) => (value ? value : null));

const quantityNoteSchema = z.string().trim().max(200, "Quantity note must be 200 characters or fewer");

/** Empty string from a form field means "no note", not an empty string. */
const optionalQuantityNote = quantityNoteSchema.nullish().transform((value) => (value ? value : null));

// ---------------------------------------------------------------------------
// Servings tracking + best-by date
// ---------------------------------------------------------------------------

/** How many servings the container held when it was prepared. */
export const servingsTotalSchema = z
  .number()
  .int("Total servings must be a whole number")
  .min(1, "Total servings must be at least 1")
  .max(999, "Total servings must be 999 or fewer");

/** How many are still in it. Never negative, never above the total (the
 * route clamps rather than rejecting, so a stale client cannot 400). */
export const servingsLeftSchema = z
  .number()
  .int("Servings left must be a whole number")
  .min(0, "Servings left cannot be negative")
  .max(999, "Servings left must be 999 or fewer");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A parent-declared best-by date, normalized to `YYYY-MM-DD`.
 *
 * Accepts either a plain calendar date (what the client's date-only wheel
 * emits) or a full ISO datetime — the same input latitude `preparedAt`
 * allows — of which only the UTC calendar day is kept. Unlike `preparedAt`
 * there is no future bound: a best-by date is supposed to be in the future.
 * An empty string (a cleared form field) means "no best-by date", the same
 * way an empty label does.
 */
export const bestBySchema = z.string().trim().transform((value, ctx): string | null => {
  if (value === "") return null;

  if (ISO_DATE.test(value)) {
    if (parseCalendarDate(value) === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bestBy is not a real date" });
      return z.NEVER;
    }
    return value;
  }

  if (!z.string().datetime().safeParse(value).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "bestBy must be a date (YYYY-MM-DD) or an ISO datetime",
    });
    return z.NEVER;
  }
  return new Date(value).toISOString().slice(0, 10);
});

export const createPantryItemInputSchema = z
  .object({
    foodIds: z
      .array(z.string().uuid())
      .min(1)
      .max(25)
      .nullish()
      .transform((value) => value ?? null),
    recipeId: z
      .string()
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
    label: optionalLabel,
    /** Defaults to now on the server when omitted. */
    preparedAt: preparedAtSchema.optional(),
    location: pantryLocationSchema,
    quantityNote: optionalQuantityNote,
    /** Turns servings tracking on; `servingsLeft` starts equal to it. */
    servingsTotal: servingsTotalSchema.nullish().transform((value) => value ?? null),
    bestBy: bestBySchema.nullish().transform((value) => value ?? null),
    /** Free-form note about the container, separate from `quantityNote`. */
    notes: optionalNotes,
  })
  .refine((value) => Boolean(value.foodIds || value.recipeId || value.label), {
    message: "At least one of foodIds, recipeId, or label is required",
    path: ["foodIds"],
  });
export type CreatePantryItemInput = z.input<typeof createPantryItemInputSchema>;

export const updatePantryItemInputSchema = z
  .object({
    location: pantryLocationSchema.optional(),
    preparedAt: preparedAtSchema.optional(),
    quantityNote: optionalQuantityNote.optional(),
    /** Setting `"active"` on a finished/discarded row undoes the change. */
    status: pantryStatusSchema.optional(),
    /**
     * `null` turns servings tracking off, clearing `servingsLeft` with it.
     * A number turns it on (or resizes it); `servingsLeft` is then clamped
     * into `[0, servingsTotal]` by the route, never rejected.
     */
    servingsTotal: servingsTotalSchema.nullable().optional(),
    /** Only meaningful while tracking is on — see `servingsTotal`. */
    servingsLeft: servingsLeftSchema.optional(),
    bestBy: bestBySchema.nullable().optional(),
    /** Absent leaves it alone; `null`/`""` clears it. */
    notes: patchNotes,
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdatePantryItemInput = z.input<typeof updatePantryItemInputSchema>;

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export const pantryItemSchema = z.object({
  id: z.string().uuid(),
  label: z.string().nullable(),
  foodSlug: z.string().nullable(),
  foodName: z.string().nullable(),
  recipeId: z.string().uuid().nullable(),
  recipeTitle: z.string().nullable(),
  preparedAt: z.string(),
  location: pantryLocationSchema,
  status: pantryStatusSchema,
  statusChangedAt: z.string(),
  expiresAt: z.string(),
  useSoon: z.boolean(),
  expired: z.boolean(),
  quantityNote: z.string().nullable(),
  /** Both null when servings tracking is off, both set when it is on. */
  servingsTotal: z.number().int().nullable(),
  servingsLeft: z.number().int().nullable(),
  /** `YYYY-MM-DD`, or null. Does not affect `expiresAt`/`useSoon`/`expired`,
   * which stay derived from `preparedAt` + the storage window. */
  bestBy: z.string().nullable(),
  /** Free-form note about the container, or null. */
  notes: z.string().nullable(),
});
export type PantryItem = z.infer<typeof pantryItemSchema>;

export const pantryResponseSchema = z.object({ items: z.array(pantryItemSchema) });
export type PantryResponse = z.infer<typeof pantryResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/pantry/:id/serve
// ---------------------------------------------------------------------------

/**
 * Serving a pantry item is the ONE explicit link between the pantry and the
 * meal log: it writes a meal (with `pantryItemId` on every food row) and,
 * when the item tracks servings, takes that many out of it. Logging a meal
 * the ordinary way never touches the pantry.
 */
export const servePantryItemInputSchema = z.object({
  /**
   * Which baby ate it. Optional only for the single-baby case: omitted, the
   * server uses the account's one active baby and 400s when the account has
   * none or more than one.
   */
  babyId: z.string().uuid().optional(),
  /** How many servings this sitting used up. */
  servings: z
    .number()
    .int("Servings must be a whole number")
    .min(1, "Servings must be at least 1")
    .max(99, "Servings must be 99 or fewer")
    .optional()
    .default(1),
  /** Defaults to now on the server when omitted. */
  servedAt: servedAtSchema.optional(),
  reactionNote: optionalReactionNote,
  /** General note on the MEAL this serve creates — not on the pantry item.
   * Never read as a reaction signal; see `optionalNotes`. */
  notes: optionalNotes,
});
export type ServePantryItemInput = z.input<typeof servePantryItemInputSchema>;

/** The meal that was created, plus the pantry item as it now stands. */
export const servePantryItemResponseSchema = z.object({
  meal: mealItemSchema,
  item: pantryItemSchema,
});
export type ServePantryItemResponse = z.infer<typeof servePantryItemResponseSchema>;
