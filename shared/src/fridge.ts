import { z } from "zod";
import { parseCalendarDate } from "./babies.js";
import { mealItemSchema, optionalNotes, optionalReactionNote, patchNotes, servedAtSchema } from "./tracking.js";

/**
 * Home fridge tracking: what's been prepared, where it's stored, and when it
 * expires. Shared between server/src/routes/fridge.ts and the client's
 * features/fridge/** query layer.
 */

export const fridgeLocationSchema = z.enum(["fridge", "freezer", "counter"]);
export type FridgeLocation = z.infer<typeof fridgeLocationSchema>;

export const fridgeStatusSchema = z.enum(["active", "finished", "discarded"]);
export type FridgeStatus = z.infer<typeof fridgeStatusSchema>;

// ---------------------------------------------------------------------------
// GET /api/fridge
// ---------------------------------------------------------------------------

export const fridgeViewSchema = z.enum(["active", "history"]);
export type FridgeView = z.infer<typeof fridgeViewSchema>;

export const fridgeQuerySchema = z.object({
  view: fridgeViewSchema.optional().default("active"),
});
export type FridgeQuery = z.infer<typeof fridgeQuerySchema>;

export const fridgeItemIdParamSchema = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------
// POST /api/fridge, PATCH /api/fridge/:id
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

export const createFridgeItemInputSchema = z
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
    location: fridgeLocationSchema,
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
export type CreateFridgeItemInput = z.input<typeof createFridgeItemInputSchema>;

export const updateFridgeItemInputSchema = z
  .object({
    location: fridgeLocationSchema.optional(),
    preparedAt: preparedAtSchema.optional(),
    quantityNote: optionalQuantityNote.optional(),
    /** Setting `"active"` on a finished/discarded row undoes the change. */
    status: fridgeStatusSchema.optional(),
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
export type UpdateFridgeItemInput = z.input<typeof updateFridgeItemInputSchema>;

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export const fridgeItemSchema = z.object({
  id: z.string().uuid(),
  label: z.string().nullable(),
  foodSlug: z.string().nullable(),
  foodName: z.string().nullable(),
  /** The food's own emoji when a parent picked one on a custom food; the
   * client falls back to its slug/category map. Optional for the same reason
   * as `MealFood.emoji` — only custom foods ever have one. */
  foodEmoji: z.string().nullable().optional(),
  recipeId: z.string().uuid().nullable(),
  recipeTitle: z.string().nullable(),
  preparedAt: z.string(),
  location: fridgeLocationSchema,
  status: fridgeStatusSchema,
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
export type FridgeItem = z.infer<typeof fridgeItemSchema>;

export const fridgeResponseSchema = z.object({ items: z.array(fridgeItemSchema) });
export type FridgeResponse = z.infer<typeof fridgeResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/fridge/:id/serve
// ---------------------------------------------------------------------------

/**
 * Serving a fridge item is the ONE explicit link between the fridge and the
 * meal log: it writes a meal (with `fridgeItemId` on every food row) and,
 * when the item tracks servings, takes that many out of it. Logging a meal
 * the ordinary way never touches the fridge.
 */
export const serveFridgeItemInputSchema = z.object({
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
  /** General note on the MEAL this serve creates — not on the fridge item.
   * Never read as a reaction signal; see `optionalNotes`. */
  notes: optionalNotes,
});
export type ServeFridgeItemInput = z.input<typeof serveFridgeItemInputSchema>;

/** The meal that was created, plus the fridge item as it now stands. */
export const serveFridgeItemResponseSchema = z.object({
  meal: mealItemSchema,
  item: fridgeItemSchema,
});
export type ServeFridgeItemResponse = z.infer<typeof serveFridgeItemResponseSchema>;
