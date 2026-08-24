import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthConfig } from "../features/babies/hooks.js";
import { authErrorMessage, signIn, signUp } from "../lib/auth.js";
import { Button } from "../components/ui/Button.js";

const MIN_PASSWORD_LENGTH = 8;

const fieldClass = "w-full rounded-lg border px-3 py-2 text-base";
const fieldStyle = {
  backgroundColor: "var(--color-bg)",
  borderColor: "var(--color-border)",
  color: "var(--color-text)",
};

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
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>
          Create your account
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          You will add your baby&rsquo;s details next. A nickname and birth date are all we ask for.
        </p>
      </header>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text)" }}>
          Your name
          <input
            type="text"
            name="name"
            autoComplete="name"
            required
            maxLength={80}
            className={fieldClass}
            style={fieldStyle}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>

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
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            className={fieldClass}
            style={fieldStyle}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            At least {MIN_PASSWORD_LENGTH} characters.
          </span>
        </label>

        {error ? (
          <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
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
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Google sign-in is not configured on this server.
          </p>
        ) : null}
      </div>

      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Already have an account?{" "}
        <Link to="/login" className="underline" style={{ color: "var(--color-primary)" }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
