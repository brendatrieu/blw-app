import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthConfig } from "../features/babies/hooks.js";
import { authErrorMessage, signIn } from "../lib/auth.js";
import { Button } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { Field } from "../components/ui/Field.js";
import { Input } from "../components/ui/Input.js";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const authConfig = useAuthConfig();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";
  const googleEnabled = authConfig.data?.googleEnabled ?? false;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn.email({ email, password });
    setSubmitting(false);

    if (result.error) {
      setError(authErrorMessage(result.error));
      return;
    }
    void navigate(redirectTo, { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className="text-4xl leading-none">
          👋
        </span>
        <h1 className="font-display text-[var(--color-text)]">Welcome back</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Sign in to pick up where you left off.</p>
      </div>

      <Card padding="md" className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field label="Email" htmlFor="login-email">
            <Input
              id="login-email"
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

          <Field label="Password" htmlFor="login-password">
            <Input
              id="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting} className="text-base">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!googleEnabled}
            className="text-base"
            onClick={() => {
              void signIn.social({ provider: "google", callbackURL: redirectTo });
            }}
          >
            Continue with Google
          </Button>
          {!googleEnabled && authConfig.isSuccess ? (
            <p className="text-xs text-[var(--color-text-muted)]">Google sign-in is not configured on this server.</p>
          ) : null}
        </div>
      </Card>

      <p className="text-center text-sm text-[var(--color-text-muted)]">
        New here?{" "}
        <Link to="/signup" className="font-semibold text-[var(--color-accent)] underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
