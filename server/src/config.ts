import { z } from "zod";

/**
 * Development-only fallback signing secret. Production refuses to boot
 * without a real BETTER_AUTH_SECRET (see the superRefine below), so this
 * value can never protect real sessions.
 */
const DEV_AUTH_SECRET = "dev-only-insecure-secret-set-BETTER_AUTH_SECRET-in-prod";

/**
 * Development-only fallback for the key-encryption secret. Same deal as
 * DEV_AUTH_SECRET: production refuses to boot without a real
 * KEY_ENCRYPTION_SECRET, so this can never protect a real user's API key.
 */
const DEV_KEY_ENCRYPTION_SECRET = "dev-only-insecure-set-KEY_ENCRYPTION_SECRET-in-prod";

/** Treats an unset variable and an empty one as the same thing. */
const optionalNonEmpty = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const csvList = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

const baseEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // --- auth -----------------------------------------------------------
  /** Signing secret for session cookies and tokens. Required in production. */
  BETTER_AUTH_SECRET: optionalNonEmpty,
  /** Public origin the app is served from; used to build links in emails. */
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  /** Extra origins allowed to send credentialed requests, comma separated. */
  TRUSTED_ORIGINS: csvList,

  // --- optional Google OAuth ------------------------------------------
  GOOGLE_CLIENT_ID: optionalNonEmpty,
  GOOGLE_CLIENT_SECRET: optionalNonEmpty,

  // --- transactional email ---------------------------------------------
  /** When unset, verification/reset links are logged instead of emailed. */
  RESEND_API_KEY: optionalNonEmpty,
  EMAIL_FROM: optionalNonEmpty.transform(
    (value) => value ?? "Baby-Led Weaning <onboarding@resend.dev>",
  ),

  // --- AI (bring-your-own key) -----------------------------------------
  /**
   * Master secret the per-user Anthropic API keys are encrypted with
   * (AES-256-GCM, key derived via scrypt). Required in production; rotating
   * it makes every stored key undecryptable, so users would have to re-enter
   * theirs.
   */
  KEY_ENCRYPTION_SECRET: optionalNonEmpty,

  // --- rate limiting ----------------------------------------------------
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /** Per-user hourly budget for `/api/ai/*` — protects the user's own bill. */
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  /** Per-user hourly budget for `PUT /api/account/ai-key` (live validation). */
  AI_KEY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
});

const envSchema = baseEnvSchema
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.BETTER_AUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BETTER_AUTH_SECRET"],
        message: "BETTER_AUTH_SECRET is required when NODE_ENV=production",
      });
    }
    if (value.BETTER_AUTH_SECRET && value.BETTER_AUTH_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BETTER_AUTH_SECRET"],
        message: "BETTER_AUTH_SECRET must be at least 32 characters",
      });
    }
    if (value.NODE_ENV === "production" && !value.KEY_ENCRYPTION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["KEY_ENCRYPTION_SECRET"],
        message: "KEY_ENCRYPTION_SECRET is required when NODE_ENV=production",
      });
    }
    if (value.KEY_ENCRYPTION_SECRET && value.KEY_ENCRYPTION_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["KEY_ENCRYPTION_SECRET"],
        message: "KEY_ENCRYPTION_SECRET must be at least 32 characters",
      });
    }
    // A half-configured OAuth provider fails at redirect time with an opaque
    // Google error, so refuse to start instead.
    const hasId = Boolean(value.GOOGLE_CLIENT_ID);
    const hasSecret = Boolean(value.GOOGLE_CLIENT_SECRET);
    if (hasId !== hasSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_CLIENT_ID"],
        message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
      });
    }
  })
  .transform((value) => ({
    ...value,
    BETTER_AUTH_SECRET: value.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET,
    KEY_ENCRYPTION_SECRET: value.KEY_ENCRYPTION_SECRET ?? DEV_KEY_ENCRYPTION_SECRET,
  }));

export type Env = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

/** True when the server has everything it needs to offer Google sign-in. */
export function isGoogleEnabled(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
