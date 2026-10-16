import { useState, type FormEvent } from "react";
import type { AdminResetLinkResponse, GrantCollaboratorInput } from "@blw/shared";
import { Button } from "../../components/ui/Button.js";
import { Field } from "../../components/ui/Field.js";
import { Input } from "../../components/ui/Input.js";
import { collaboratorErrorMessage } from "./AccessPanel.js";
import { useCreateResetLink } from "./hooks.js";
import { PASSWORD_REQUIRED, PasswordPrompt, passwordPromptError } from "./PasswordPrompt.js";

/**
 * Password help (ledger 821): the owner makes a one-time reset link for a
 * parent who cannot sign in, and sends it to them privately. No email is
 * involved, so this works the day it ships.
 *
 * The link is better-auth's own (single use, one hour, every session signed
 * out on use). It lives only in this component's state: it is not in the
 * query cache, not persisted, and gone once the page is left.
 *
 * An older session confirms the owner's password here first (ledger 830).
 */

export const RESET_LINK_PANEL_TITLE = "Password help";

export const RESET_LINK_PANEL_DESCRIPTION =
  "For a parent who can't sign in: make a one-time link and send it to them privately. It works once, for one hour.";

/** The server answers in machine codes; this panel answers in sentences. */
export function resetLinkErrorMessage(code: string): string {
  switch (code) {
    case "owner_only":
      return "Only the owner can make reset links.";
    case "unknown_user":
      return "No account uses that email.";
    case "no_password":
      return "This account signs in with Google, so there's no password to reset.";
    default:
      // reauth_required (an owner with no password), invalid_request,
      // rate_limited, not_found: the same sentences the Access panel uses.
      return collaboratorErrorMessage(code);
  }
}

/** "3:42 PM" in the owner's own locale. */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ResetLinkPanel() {
  const create = useCreateResetLink();

  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<(AdminResetLinkResponse & { email: string }) | null>(null);
  const [copied, setCopied] = useState(false);
  /** The address waiting on the owner's password, while the prompt shows. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  function send(input: GrantCollaboratorInput) {
    setMade(null);
    setCopied(false);
    create.mutate(input, {
      onSuccess: (link) => {
        setConfirming(null);
        setMade({ ...link, email: input.email });
        setEmail("");
      },
      onError: ({ message }) => {
        const inPrompt = input.password === undefined ? null : passwordPromptError(message);
        if (message === PASSWORD_REQUIRED) {
          setConfirming(input.email);
        } else if (inPrompt) {
          setPromptError(inPrompt);
        } else {
          setConfirming(null);
          setError(resetLinkErrorMessage(message));
        }
      },
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldError(undefined);
    if (create.isPending) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError("Enter the email address they signed up with");
      return;
    }
    setConfirming(null);
    setPromptError(null);
    send({ email: trimmed });
  }

  function handleConfirm(password: string) {
    if (!confirming || create.isPending) return;
    setPromptError(null);
    send({ email: confirming, password });
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard (an old browser, a denied permission): the link stays
      // in the box above, ready to select by hand.
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="admin-reset-link-heading">
      <div className="flex flex-col gap-1">
        <h2 id="admin-reset-link-heading" className="font-h2 text-[var(--color-text)]">
          {RESET_LINK_PANEL_TITLE}
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">{RESET_LINK_PANEL_DESCRIPTION}</p>
      </div>

      <form className="flex flex-col gap-2" onSubmit={handleSubmit} noValidate>
        <Field label="Their account email" htmlFor="admin-reset-email" error={fieldError}>
          <Input
            id="admin-reset-email"
            type="email"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="them@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
              setFieldError(undefined);
              // The prompt was for the address as it was.
              setConfirming(null);
            }}
          />
        </Field>
        <div>
          <Button type="submit" size="sm" disabled={create.isPending}>
            {create.isPending ? "Making…" : "Make reset link"}
          </Button>
        </div>
      </form>

      {confirming ? (
        <PasswordPrompt
          id="admin-reset-password"
          pending={create.isPending}
          error={promptError}
          onConfirm={handleConfirm}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {made ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <p className="text-sm font-medium break-all text-[var(--color-text)]">Link for {made.email}</p>
          <Input
            readOnly
            aria-label="Reset link"
            value={made.url}
            onFocus={(event) => {
              event.target.select();
            }}
          />
          <div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void handleCopy(made.url);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Works once, until {timeOf(made.expiresAt)}. It won't be shown again.
          </p>
        </div>
      ) : null}
    </section>
  );
}
