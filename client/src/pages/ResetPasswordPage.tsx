import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RESET_PASSWORD_PATH } from "@blw/shared";
import { authErrorMessage, resetPassword } from "../lib/auth.js";
import { useSubmitValidation } from "../lib/forms.js";
import {
  NEW_PASSWORD_FIELD_ORDER,
  PASSWORD_MIN_LENGTH,
  isDeadLinkError,
  readResetToken,
  validateNewPassword,
  type ResetLinkState,
} from "../lib/passwordReset.js";
import { Button, ButtonLink } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { Field } from "../components/ui/Field.js";
import { Input } from "../components/ui/Input.js";

/** What LoginPage reads to say the new password is in place. */
export interface PasswordResetDoneState {
  passwordReset: true;
}

/**
 * Where a password-reset link lands (ledger 820), from an email or from a
 * link the owner made on the admin page. Public, like /about: the person
 * here cannot sign in, and a signed-in visitor resetting is still allowed.
 *
 * Success sends them to sign in: better-auth's reset revokes every session
 * and does not sign anyone in.
 */
export function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = readResetToken(location.search, location.state);
  const tokenInQuery = new URLSearchParams(location.search).has("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deadLink, setDeadLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The token leaves the address bar at once: off the URL it cannot reach a
  // log line, a Referer, a screenshot or the history list. History state
  // keeps it for a reload of this tab, and the success navigate replaces it.
  useEffect(() => {
    if (tokenInQuery && token) {
      const state: ResetLinkState = { resetToken: token };
      void navigate(RESET_PASSWORD_PATH, { replace: true, state });
    }
  }, [tokenInQuery, token, navigate]);

  const { errors, attemptSubmit } = useSubmitValidation(
    { password, confirm },
    validateNewPassword,
    NEW_PASSWORD_FIELD_ORDER,
    { password: "reset-password", confirm: "reset-confirm" },
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || !token) return;
    if (!attemptSubmit()) return;
    setSubmitting(true);
    setError(null);

    const result = await resetPassword({ newPassword: password, token });
    setSubmitting(false);

    if (result.error) {
      if (isDeadLinkError(result.error)) setDeadLink(true);
      else setError(authErrorMessage(result.error));
      return;
    }
    const done: PasswordResetDoneState = { passwordReset: true };
    void navigate("/login", { replace: true, state: done });
  }

  if (!token || deadLink) {
    return (
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-[var(--color-text)]">This link no longer works</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Reset links work once and expire after an hour.</p>
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
        <h1 className="font-display text-[var(--color-text)]">Choose a new password</h1>
      </div>

      <Card padding="md" className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <Field
            label="New password"
            htmlFor="reset-password"
            error={errors.password}
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          >
            <Input
              id="reset-password"
              type="password"
              name="new-password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </Field>

          <Field label="Confirm new password" htmlFor="reset-confirm" error={errors.confirm}>
            <Input
              id="reset-confirm"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
              }}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting} className="text-base">
            {submitting ? "Saving…" : "Save new password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
