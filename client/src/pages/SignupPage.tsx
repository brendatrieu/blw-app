import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthConfig } from "../features/babies/hooks.js";
import { authErrorMessage, signIn, signUp } from "../lib/auth.js";
import { Button } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { Field } from "../components/ui/Field.js";
import { Input } from "../components/ui/Input.js";

const MIN_PASSWORD_LENGTH = 8;

export function SignupPage() {
  const navigate = useNavigate();
  const authConfig = useAuthConfig();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const googleEnabled = authConfig.data?.googleEnabled ?? false;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await signUp.email({ name: name.trim(), email, password });
    setSubmitting(false);

    if (result.error) {
      setError(authErrorMessage(result.error));
      return;
    }
    void navigate("/", { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className="text-4xl leading-none">
          🌱
        </span>
        <h1 className="font-display text-[var(--color-text)]">Create your account</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          You will add your baby&rsquo;s details next. A nickname and birth date are all we ask for.
        </p>
      </div>

      <Card padding="md" className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field label="Your name" htmlFor="signup-name">
            <Input
              id="signup-name"
              type="text"
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>

          <Field label="Email" htmlFor="signup-email">
            <Input
              id="signup-email"
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

          <Field label="Password" htmlFor="signup-password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
            <Input
              id="signup-password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
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
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!googleEnabled}
            className="text-base"
            onClick={() => {
              void signIn.social({ provider: "google", callbackURL: "/" });
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
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-[var(--color-primary)] underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
