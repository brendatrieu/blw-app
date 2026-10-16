import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { RESET_PASSWORD_PATH } from "@blw/shared";
import { authErrorMessage, requestPasswordReset, useAuthConfig } from "../lib/auth.js";
import { useSubmitValidation } from "../lib/forms.js";
import { validateResetRequest } from "../lib/passwordReset.js";
import { Button, ButtonLink } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { Field } from "../components/ui/Field.js";
import { Input } from "../components/ui/Input.js";

/** What LoginPage hands over so the address is not typed twice. */
export interface ForgotPasswordState {
  email: string;
}

const EMAIL_FIELD_ORDER = ["email"] as const;

/**
 * "Forgot password?" (ledger 822): asks better-auth to email a reset link
 * that lands on /reset-password.
 *
 * Every accepted request gets the same answer, whether or not an account
 * uses the address — the server answers both identically too — so this page
 * cannot be used to find out who has an account. Reachable only while the
 * server says it can really send email; otherwise it returns to sign-in.
 */
export function ForgotPasswordPage() {
  const location = useLocation();
  const config = useAuthConfig();

  const [email, setEmail] = useState(() => (location.state as Partial<ForgotPasswordState> | null)?.email ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { errors, attemptSubmit } = useSubmitValidation({ email }, validateResetRequest, EMAIL_FIELD_ORDER, {
    email: "forgot-email",
  });

  // Only a server that says it can send email gets the form. Email off, or
  // the server couldn't say: back to sign-in. Still asking: nothing yet.
  if (config.data?.emailEnabled !== true) {
    return config.data || config.isError ? <Navigate to="/login" replace /> : null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!attemptSubmit()) return;
    setSubmitting(true);
    setError(null);

    const result = await requestPasswordReset({ email: email.trim(), redirectTo: RESET_PASSWORD_PATH });
    setSubmitting(false);

    // Only a request that never landed (offline, rate limited) is an error;
    // known and unknown addresses are the same success.
    if (result.error) {
      setError(authErrorMessage(result.error));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-[var(--color-text)]">Check your email</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            If an account uses that email, we've sent it a link to reset your password. The link works for one hour.
          </p>
        </div>
        <ButtonLink to="/login" variant="secondary" className="text-base">
          Back to sign in
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-[var(--color-text)]">Reset your password</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Enter the email you signed up with and we'll send you a link.
        </p>
      </div>

      <Card padding="md" className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <Field label="Email" htmlFor="forgot-email" error={errors.email}>
            <Input
              id="forgot-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting} className="text-base">
            {submitting ? "Sending…" : "Send link"}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm">
        <Link to="/login" className="font-medium text-[var(--color-accent)] underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
