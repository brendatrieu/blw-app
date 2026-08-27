import { z } from "zod";

/**
 * Account-wide operations: take everything out, or remove everything.
 *
 * Both are one-way doors from the parent's point of view, so the contract is
 * deliberately explicit — the export names every table it covers, and the
 * delete input carries a typed confirmation phrase alongside the credential
 * re-check.
 */

// ---------------------------------------------------------------------------
// GET /api/account/export
// ---------------------------------------------------------------------------

/**
 * Bumped whenever the bundle's shape changes incompatibly, so a file
 * exported today is still identifiable years later.
 */
export const ACCOUNT_EXPORT_VERSION = 2;

/** `blw-export-2026-08-24.json` — date only, matching the attachment name. */
export function accountExportFilename(date: Date = new Date()): string {
  return `blw-export-${date.toISOString().slice(0, 10)}.json`;
}

/**
 * Free-form JSON captured verbatim from a `jsonb` column (survey answers,
 * model results, chat content blocks). Exported unchanged rather than
 * reshaped: the point of an export is fidelity, not presentation.
 */
const storedJson = z.unknown();

export const exportProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});

export const exportBabySchema = z.object({
  id: z.string(),
  name: z.string(),
  birthDate: z.string(),
  notes: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});

/** Food and recipe names are denormalised in so the file reads on its own.
 * v2 (meal model): one entry per meal, with its foods nested — where v1 had
 * one flat entry per food served. */
export const exportMealFoodSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});

export const exportMealSchema = z.object({
  id: z.string(),
  babyId: z.string(),
  recipeId: z.string().nullable(),
  recipeTitle: z.string().nullable(),
  servedAt: z.string(),
  reactionNote: z.string().nullable(),
  createdAt: z.string(),
  foods: z.array(exportMealFoodSchema),
});

export const exportFavoriteSchema = z.object({
  recipeId: z.string(),
  recipeSlug: z.string(),
  recipeTitle: z.string(),
  createdAt: z.string(),
});

/**
 * Every pantry row the account has ever had, `active` and closed alike —
 * `status` plus `statusChangedAt` is the history, so nothing is filtered out.
 */
export const exportPantryItemSchema = z.object({
  id: z.string(),
  foodId: z.string().nullable(),
  foodName: z.string().nullable(),
  recipeId: z.string().nullable(),
  recipeTitle: z.string().nullable(),
  label: z.string().nullable(),
  preparedAt: z.string(),
  location: z.string(),
  status: z.string(),
  statusChangedAt: z.string(),
  quantityNote: z.string().nullable(),
});

export const exportSymptomCheckSchema = z.object({
  id: z.string(),
  babyId: z.string(),
  survey: storedJson,
  windowHours: z.number(),
  foodsConsidered: storedJson,
  triageLevel: z.string(),
  result: storedJson,
  model: z.string().nullable(),
  createdAt: z.string(),
});

export const exportChatMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: storedJson,
  createdAt: z.string(),
});

/** Messages are nested under their thread rather than listed flat. */
export const exportChatThreadSchema = z.object({
  id: z.string(),
  babyId: z.string().nullable(),
  kind: z.string(),
  createdAt: z.string(),
  messages: z.array(exportChatMessageSchema),
});

/**
 * Status only. The stored Anthropic key is write-only across the entire API
 * and an export is no exception — the ciphertext never leaves the database
 * and the plaintext is never assembled here at all.
 */
export const exportAiKeySchema = z.object({
  configured: z.boolean(),
  last4: z.string().nullable(),
  lastValidatedAt: z.string().nullable(),
});

export const accountExportSchema = z.object({
  exportVersion: z.literal(ACCOUNT_EXPORT_VERSION),
  exportedAt: z.string(),
  profile: exportProfileSchema,
  babies: z.array(exportBabySchema),
  meals: z.array(exportMealSchema),
  favorites: z.array(exportFavoriteSchema),
  pantryItems: z.array(exportPantryItemSchema),
  symptomChecks: z.array(exportSymptomCheckSchema),
  chatThreads: z.array(exportChatThreadSchema),
  aiKey: exportAiKeySchema,
});

export type AccountExport = z.infer<typeof accountExportSchema>;
export type ExportProfile = z.infer<typeof exportProfileSchema>;
export type ExportBaby = z.infer<typeof exportBabySchema>;
export type ExportMeal = z.infer<typeof exportMealSchema>;
export type ExportMealFood = z.infer<typeof exportMealFoodSchema>;
export type ExportFavorite = z.infer<typeof exportFavoriteSchema>;
export type ExportPantryItem = z.infer<typeof exportPantryItemSchema>;
export type ExportSymptomCheck = z.infer<typeof exportSymptomCheckSchema>;
export type ExportChatThread = z.infer<typeof exportChatThreadSchema>;
export type ExportChatMessage = z.infer<typeof exportChatMessageSchema>;

// ---------------------------------------------------------------------------
// DELETE /api/account
// ---------------------------------------------------------------------------

/**
 * Typed verbatim into the delete form. A phrase the user has to read and
 * copy rules out the misclick that a lone "are you sure?" dialog invites,
 * and it is checked server-side too so a scripted request needs it as well.
 */
export const ACCOUNT_DELETE_CONFIRMATION = "DELETE MY ACCOUNT";

/**
 * `password` is required for any account that has a password set, and is
 * meaningless for OAuth-only accounts (those re-authenticate by having
 * signed in recently instead) — so the schema keeps it optional and the
 * server decides which proof this particular account owes.
 */
export const deleteAccountInputSchema = z.object({
  confirm: z.literal(ACCOUNT_DELETE_CONFIRMATION),
  password: z.string().min(1).max(128).optional(),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;

/**
 * How recently an OAuth-only account must have signed in for deletion to
 * count as freshly re-authenticated. Deliberately far shorter than
 * better-auth's one-day default `freshAge`: this is the one action with no
 * undo, so "signed in yesterday" is not good enough.
 */
export const ACCOUNT_REAUTH_MAX_AGE_MS = 10 * 60 * 1000;
