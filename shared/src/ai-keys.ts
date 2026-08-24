import { z } from "zod";

/**
 * Bring-your-own Anthropic API key.
 *
 * The key itself is write-only across the whole API: it is submitted once on
 * `PUT /api/account/ai-key`, stored encrypted, and never returned by any
 * endpoint. Everything the UI needs to render the "configured" state lives in
 * `AiKeyStatus` — the last four characters and the last validation time.
 */

/** Every Anthropic key issued by the console carries this prefix. */
export const ANTHROPIC_KEY_PREFIX = "sk-ant-";

/** Where a parent goes to mint a key. Rendered as a link in Settings. */
export const ANTHROPIC_CONSOLE_URL = "https://console.anthropic.com/";

/**
 * Shape check only — a key that looks right can still be revoked or belong to
 * a different account, so the server always follows this with a live
 * `models.retrieve` call before storing anything.
 *
 * The bounds are deliberately loose (real keys are ~100 chars) so a future
 * key format does not lock existing users out, while still rejecting the
 * pasted-the-wrong-thing cases (empty, a URL, a whole .env file).
 */
export const anthropicApiKeySchema = z
  .string()
  .trim()
  .min(24, "That does not look like a full API key")
  .max(300, "That is too long to be an API key")
  .refine((value) => value.startsWith(ANTHROPIC_KEY_PREFIX), {
    message: `An Anthropic API key starts with "${ANTHROPIC_KEY_PREFIX}"`,
  })
  .refine((value) => /^[A-Za-z0-9_-]+$/.test(value), {
    message: "An API key contains only letters, digits, dashes and underscores",
  });

// ---------------------------------------------------------------------------
// PUT /api/account/ai-key
// ---------------------------------------------------------------------------

export const saveAiKeyInputSchema = z.object({
  apiKey: anthropicApiKeySchema,
});
export type SaveAiKeyInput = z.infer<typeof saveAiKeyInputSchema>;

export const saveAiKeyResponseSchema = z.object({
  last4: z.string().length(4),
});
export type SaveAiKeyResponse = z.infer<typeof saveAiKeyResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/account/ai-key
// ---------------------------------------------------------------------------

/** Never carries key material — `last4` is a display hint, not a secret. */
export const aiKeyStatusSchema = z.object({
  configured: z.boolean(),
  last4: z.string().length(4).optional(),
  lastValidatedAt: z.string().datetime().nullable().optional(),
});
export type AiKeyStatus = z.infer<typeof aiKeyStatusSchema>;

/** Masked rendering of a stored key, e.g. `sk-ant-…a1b2`. */
export function maskAiKey(last4: string): string {
  return `${ANTHROPIC_KEY_PREFIX}…${last4}`;
}
