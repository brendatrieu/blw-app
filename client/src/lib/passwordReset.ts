// The password-reset screens' rules (ledger 820), kept out of the components
// so a native shell can reuse them unchanged (CLAUDE.md, native-ready).
import type { FormErrors } from "./forms.js";

/** The limits better-auth enforces (server/src/auth.ts, emailAndPassword). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export interface NewPasswordValues {
  password: string;
  confirm: string;
}

export type NewPasswordField = keyof NewPasswordValues;

/** Visual field order — what a failed submit focuses first. */
export const NEW_PASSWORD_FIELD_ORDER: readonly NewPasswordField[] = ["password", "confirm"];

/** Same rules as sign-up, plus the upper bound and the second copy. Never trims. */
export function validateNewPassword(values: NewPasswordValues): FormErrors<NewPasswordField> {
  const errors: FormErrors<NewPasswordField> = {};
  if (values.password.length === 0) errors.password = "Password is required";
  else if (values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Enter a password of at least ${PASSWORD_MIN_LENGTH} characters`;
  } else if (values.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Use ${PASSWORD_MAX_LENGTH} characters or fewer`;
  }
  if (values.confirm !== values.password) errors.confirm = "The passwords don't match";
  return errors;
}

/** Where the page parks the token once it is off the address bar. */
export interface ResetLinkState {
  resetToken: string;
}

/**
 * The token a reset link brought, or null when there is none to use.
 *
 * better-auth's link (`/api/auth/reset-password/<token>`) checks the token
 * and lands here with `?token=` when it is live, or `?error=INVALID_TOKEN`
 * when it expired, was used, or never existed. The page then moves the token
 * into history state (see `ResetPasswordPage`), which is read second so a
 * reload of the same tab still works.
 */
export function readResetToken(search: string, state: unknown): string | null {
  const fromQuery = new URLSearchParams(search).get("token");
  if (fromQuery) return fromQuery;
  const fromState = (state as Partial<ResetLinkState> | null)?.resetToken;
  return typeof fromState === "string" && fromState.length > 0 ? fromState : null;
}

/** better-auth's answer when the token is spent, expired, unknown, or its account is gone. */
export function isDeadLinkError(error: { code?: string | undefined } | null | undefined): boolean {
  return error?.code === "INVALID_TOKEN" || error?.code === "USER_NOT_FOUND";
}
