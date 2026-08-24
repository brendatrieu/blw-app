import { z } from "zod";

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

export const createPantryItemInputSchema = z
  .object({
    foodId: z
      .string()
      .uuid()
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
  })
  .refine((value) => Boolean(value.foodId || value.recipeId || value.label), {
    message: "At least one of foodId, recipeId, or label is required",
    path: ["foodId"],
  });
export type CreatePantryItemInput = z.input<typeof createPantryItemInputSchema>;

export const updatePantryItemInputSchema = z
  .object({
    location: pantryLocationSchema.optional(),
    preparedAt: preparedAtSchema.optional(),
    quantityNote: optionalQuantityNote.optional(),
    /** Setting `"active"` on a finished/discarded row undoes the change. */
    status: pantryStatusSchema.optional(),
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
});
export type PantryItem = z.infer<typeof pantryItemSchema>;

export const pantryResponseSchema = z.object({ items: z.array(pantryItemSchema) });
export type PantryResponse = z.infer<typeof pantryResponseSchema>;
