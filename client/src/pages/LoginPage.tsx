import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthConfig } from "../features/babies/hooks.js";
import { authErrorMessage, signIn } from "../lib/auth.js";

const fieldClass = "w-full rounded-lg border px-3 py-2 text-base";
const fieldStyle = {
  backgroundColor: "var(--color-bg)",
  borderColor: "var(--color-border)",
  color: "var(--color-text)",
};

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
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>
          Welcome back
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Sign in to pick up where you left off.
        </p>
      </header>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text)" }}>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className={fieldClass}
            style={fieldStyle}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text)" }}>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className={fieldClass}
            style={fieldStyle}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg px-4 py-2 text-base font-medium disabled:opacity-60"
          style={{
            backgroundColor: "var(--color-primary)",
            color: "var(--color-primary-contrast)",
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!googleEnabled}
          onClick={() => {
            void signIn.social({ provider: "google", callbackURL: redirectTo });
          }}
          className="rounded-lg border px-4 py-2 text-base font-medium disabled:opacity-50"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
        >
          Continue with Google
        </button>
        {!googleEnabled && authConfig.isSuccess ? (
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Google sign-in is not configured on this server.
          </p>
        ) : null}
      </div>

      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        New here?{" "}
        <Link to="/signup" className="underline" style={{ color: "var(--color-primary)" }}>
          Create an account
        </Link>
      </p>
    </div>
  );
}
