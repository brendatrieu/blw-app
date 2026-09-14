import { z } from "zod";
import { parseCalendarDate } from "./babies.js";
import { mealItemSchema, optionalNotes, optionalReactionNote, patchNotes, servedAtSchema } from "./tracking.js";

/**
 * Home storage tracking: what's been prepared, where it's stored, and when it
 * expires. Shared between server/src/routes/storage.ts and the client's
 * features/storage/** query layer.
 */

export const storageLocationSchema = z.enum(["fridge", "freezer", "counter"]);
export type StorageLocation = z.infer<typeof storageLocationSchema>;

export const storageStatusSchema = z.enum(["active", "finished", "discarded"]);
export type StorageStatus = z.infer<typeof storageStatusSchema>;

// ---------------------------------------------------------------------------
// GET /api/storage
// ---------------------------------------------------------------------------

export const storageViewSchema = z.enum(["active", "history"]);
export type StorageView = z.infer<typeof storageViewSchema>;

export const storageQuerySchema = z.object({
  view: storageViewSchema.optional().default("active"),
});
export type StorageQuery = z.infer<typeof storageQuerySchema>;

export const storageItemIdParamSchema = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------
// POST /api/storage, PATCH /api/storage/:id
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

/** The message both the create schema and the PATCH route answer with, so a
 * client that skips its own check reads one sentence, not two. */
export const BEST_BY_BEFORE_PREPARED_ERROR = "bestBy cannot be before the prepared date";

/**
 * Server-side backstop for "best by is before the prepared date" — the
 * combination that, since item 333, would make a just-prepared container
 * render as Expired. The client checks it against LOCAL calendar days,
 * which is the honest comparison; the server has no timezone at all, so it
 * allows the same ONE DAY of slack `preparedAtSchema` allows for exactly
 * the same reason (a parent east of UTC saves "today" on a UTC day that has
 * not started). Only a date genuinely earlier than that is rejected.
 *
 * Zero-padded `YYYY-MM-DD` strings compare lexically the same as
 * chronologically, so no re-parsing is needed once both sides are days.
 *
 * `preparedAt` omitted means "now" — the default the create route applies.
 */
export function isBestByBeforePreparedDay(
  bestBy: string | null | undefined,
  preparedAt: string | Date | null | undefined,
): boolean {
  if (!bestBy) return false;
  const preparedMs =
    preparedAt == null
      ? Date.now()
      : preparedAt instanceof Date
        ? preparedAt.getTime()
        : Date.parse(preparedAt);
  if (Number.isNaN(preparedMs)) return false;
  const earliestAllowedDay = new Date(preparedMs - FUTURE_SLACK_MS).toISOString().slice(0, 10);
  return bestBy < earliestAllowedDay;
}

export const createStorageItemInputSchema = z
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
    location: storageLocationSchema,
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
  })
  // Both fields are on this payload, so create can decide it here. PATCH
  // cannot — its answer depends on the row's stored values — so the route
  // calls `isBestByBeforePreparedDay` on the merged pair instead.
  .refine((value) => !isBestByBeforePreparedDay(value.bestBy, value.preparedAt), {
    message: BEST_BY_BEFORE_PREPARED_ERROR,
    path: ["bestBy"],
  });
export type CreateStorageItemInput = z.input<typeof createStorageItemInputSchema>;

export const updateStorageItemInputSchema = z
  .object({
    location: storageLocationSchema.optional(),
    preparedAt: preparedAtSchema.optional(),
    quantityNote: optionalQuantityNote.optional(),
    /** Setting `"active"` on a finished/discarded row undoes the change. */
    status: storageStatusSchema.optional(),
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
export type UpdateStorageItemInput = z.input<typeof updateStorageItemInputSchema>;

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export const storageItemSchema = z.object({
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
  location: storageLocationSchema,
  status: storageStatusSchema,
  statusChangedAt: z.string(),
  expiresAt: z.string(),
  useSoon: z.boolean(),
  expired: z.boolean(),
  quantityNote: z.string().nullable(),
  /** Both null when servings tracking is off, both set when it is on. */
  servingsTotal: z.number().int().nullable(),
  servingsLeft: z.number().int().nullable(),
  /**
   * `YYYY-MM-DD`, or null.
   *
   * `expiresAt`/`useSoon`/`expired` beside it stay derived from `preparedAt`
   * + the category storage window and are NOT affected by it — the server
   * never learns the caller's timezone, so it cannot say which local day a
   * calendar date is. When a best-by date IS set it nonetheless wins: the
   * client resolves the Use soon / Expired chip from it, and falls back to
   * these three fields only when it is null (item 333, `resolveFreshness` in
   * client/src/features/storage/freshness.ts).
   */
  bestBy: z.string().nullable(),
  /** Free-form note about the container, or null. */
  notes: z.string().nullable(),
});
export type StorageItem = z.infer<typeof storageItemSchema>;

export const storageResponseSchema = z.object({ items: z.array(storageItemSchema) });
export type StorageResponse = z.infer<typeof storageResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/storage/:id/serve
// ---------------------------------------------------------------------------

/**
 * Serving a storage item is the ONE explicit link between storage and the
 * meal log: it writes a meal (with `storageItemId` on every food row) and,
 * when the item tracks servings, takes that many out of it. Logging a meal
 * the ordinary way never touches storage.
 */
export const serveStorageItemInputSchema = z.object({
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
  /** General note on the MEAL this serve creates — not on the storage item.
   * Never read as a reaction signal; see `optionalNotes`. */
  notes: optionalNotes,
});
export type ServeStorageItemInput = z.input<typeof serveStorageItemInputSchema>;

/** The meal that was created, plus the storage item as it now stands. */
export const serveStorageItemResponseSchema = z.object({
  meal: mealItemSchema,
  item: storageItemSchema,
});
export type ServeStorageItemResponse = z.infer<typeof serveStorageItemResponseSchema>;
