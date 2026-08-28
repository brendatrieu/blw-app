import { z } from "zod";

/**
 * Baby profiles. Deliberately minimal: a nickname and a birth date are the
 * only things the app needs, plus free-text notes the parent controls.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Earliest birth date we accept — anything older is a typo, not a baby. */
const MIN_BIRTH_DATE_MS = Date.UTC(1900, 0, 1);

/**
 * One day of slack on the upper bound. Birth dates are plain calendar dates
 * with no timezone, and a parent east of UTC can legitimately be on a
 * calendar day that has not started in UTC yet.
 */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

/**
 * Milliseconds for a `YYYY-MM-DD` string, or `null` if the components do not
 * describe a real day. `Date.parse` silently rolls 2025-02-30 over into
 * March, which the database then rejects — so the components are compared
 * against the date they produce.
 */
export function parseCalendarDate(value: string): number | null {
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const ms = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(ms);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

export const babyNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(60, "Name must be 60 characters or fewer");

export const babyNotesSchema = z.string().trim().max(500, "Notes must be 500 characters or fewer");

export const babyBirthDateSchema = z
  .string()
  .regex(ISO_DATE, "Birth date must be an ISO date (YYYY-MM-DD)")
  .superRefine((value, ctx) => {
    const ms = parseCalendarDate(value);
    if (ms === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Birth date is not a real date" });
      return;
    }
    if (ms > Date.now() + FUTURE_SLACK_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Birth date cannot be in the future" });
    }
    if (ms < MIN_BIRTH_DATE_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Birth date is too far in the past" });
    }
  });

/** Empty notes coming from a form field mean "no notes", not an empty string. */
const optionalNotes = babyNotesSchema
  .nullish()
  .transform((value) => (value === undefined || value === null || value === "" ? null : value));

export const createBabyInputSchema = z.object({
  name: babyNameSchema,
  birthDate: babyBirthDateSchema,
  notes: optionalNotes,
});

export type CreateBabyInput = z.input<typeof createBabyInputSchema>;

export const updateBabyInputSchema = z
  .object({
    name: babyNameSchema.optional(),
    birthDate: babyBirthDateSchema.optional(),
    notes: optionalNotes.optional(),
    /** `true` archives the baby, `false` restores it. */
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field must be provided",
  });

export type UpdateBabyInput = z.input<typeof updateBabyInputSchema>;

export const babySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  birthDate: z.string(),
  notes: z.string().nullable(),
  archived: z.boolean(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type Baby = z.infer<typeof babySchema>;

export const babyListSchema = z.array(babySchema);

export const babyListQuerySchema = z.object({
  /** Archived babies are hidden unless explicitly asked for. */
  includeArchived: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => value === "true" || value === "1"),
});

/** Route params for every `/api/babies/:id` endpoint. */
export const babyIdParamSchema = z.object({ id: z.string().uuid() });

/**
 * Tells the sign-in UI whether the server has Google OAuth credentials
 * configured, so the button can be disabled with an explanation instead of
 * bouncing the user through a broken redirect.
 */
export const authConfigSchema = z.object({
  googleEnabled: z.boolean(),
});

export type AuthConfig = z.infer<typeof authConfigSchema>;

/** Uniform error body for every API failure. */
export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/** Whole months elapsed between a birth date and `now`. Never negative. */
export function ageInMonths(birthDate: string, now: Date = new Date()): number {
  const born = new Date(`${birthDate}T00:00:00.000Z`);
  let months =
    (now.getUTCFullYear() - born.getUTCFullYear()) * 12 + (now.getUTCMonth() - born.getUTCMonth());
  if (now.getUTCDate() < born.getUTCDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}
