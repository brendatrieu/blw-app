import { useState, type FormEvent } from "react";
import type { AdminCollaborator } from "@blw/shared";
import { Button } from "../../components/ui/Button.js";
import { Field } from "../../components/ui/Field.js";
import { Input } from "../../components/ui/Input.js";
import { Skeleton } from "../../components/ui/Skeleton.js";
import { useCollaborators, useGrantCollaborator, useRevokeCollaborator } from "./hooks.js";
import { PASSWORD_REQUIRED, PasswordPrompt, passwordPromptError } from "./PasswordPrompt.js";

/**
 * Who else can open this dashboard.
 *
 * The one panel on this page that shows people rather than aggregates, and
 * deliberately so: the emails here are the admins', shown to an admin, which
 * is the only place on the metrics surface where knowing *who* is the point.
 * No parent's address can reach this list — the server builds it from
 * `user.role` and `ADMIN_EMAILS`, never from a search.
 *
 * Grant and revoke both need a session younger than ten minutes. That is not
 * a client rule and is not checked here: the server answers
 * `password_required` and this panel asks for the admin's password and sends
 * the action again (ledger 830), or `reauth_required` (an admin with no
 * password) and it says to sign in again. There is exactly one place the
 * freshness rule lives.
 */

export const ACCESS_PANEL_TITLE = "Access";

export const ACCESS_PANEL_DESCRIPTION =
  "Who can open this dashboard. A collaborator signs up as a parent first, then gets access here — they see these aggregates, never anybody's data.";

/** The server answers in machine codes; this panel answers in sentences. */
export function collaboratorErrorMessage(code: string): string {
  switch (code) {
    case "reauth_required":
      return "For your safety this needs a fresh sign-in. Sign out, sign back in, and try again.";
    case "unknown_user":
      return "No account uses that address yet. Ask them to sign up first, then grant access.";
    case "cannot_demote_self":
      return "You can't remove your own access. Ask another admin to do it.";
    case "env_admin":
      return "This address is set in the server's environment, so it can only be removed there.";
    case "invalid_request":
      return "That doesn't look like an email address.";
    case "rate_limited":
      return "Too many changes just now. Wait a few minutes and try again.";
    case "not_found":
      return "You no longer have access to this page.";
    default:
      return "Something went wrong. Try again in a moment.";
  }
}

/** A grant or revoke held back until the admin confirms their password. */
type PendingAction = { kind: "grant"; email: string } | { kind: "revoke"; userId: string };

/** How somebody got access, in words rather than a raw enum. */
export function collaboratorSourceLabel(collaborator: AdminCollaborator): string {
  return collaborator.source === "env" ? "Set in the server environment" : "Granted from this page";
}

/** The same, plus who did the granting when the audit trail knows. One
 * string rather than two spliced nodes, so the row reads as one sentence. */
export function collaboratorProvenance(collaborator: AdminCollaborator): string {
  const source = collaboratorSourceLabel(collaborator);
  return collaborator.grantedBy ? `${source} by ${collaborator.grantedBy}` : source;
}

export function AccessPanel() {
  const collaborators = useCollaborators();
  const grant = useGrantCollaborator();
  const revoke = useRevokeCollaborator();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  /** The action waiting on the admin's password, while the prompt shows. */
  const [confirming, setConfirming] = useState<PendingAction | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  /** Where a refusal goes: the prompt opens, stays with a sentence, or closes. */
  function refused(action: PendingAction, sentPassword: boolean) {
    return ({ message }: Error) => {
      const inPrompt = sentPassword ? passwordPromptError(message) : null;
      if (message === PASSWORD_REQUIRED) {
        setConfirming(action);
      } else if (inPrompt) {
        setPromptError(inPrompt);
      } else {
        setConfirming(null);
        setError(collaboratorErrorMessage(message));
      }
    };
  }

  function grantAccess(email: string, password?: string) {
    grant.mutate(password === undefined ? { email } : { email, password }, {
      onSuccess: () => {
        setConfirming(null);
        setEmail("");
      },
      onError: refused({ kind: "grant", email }, password !== undefined),
      // Let go of the request (and the password in it) once it has answered.
      onSettled: () => {
        grant.reset();
      },
    });
  }

  function revokeAccess(userId: string, password?: string) {
    revoke.mutate(password === undefined ? { userId } : { userId, password }, {
      onSuccess: () => {
        setConfirming(null);
      },
      onError: refused({ kind: "revoke", userId }, password !== undefined),
      onSettled: () => {
        revoke.reset();
      },
    });
  }

  function handleGrant(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldError(undefined);
    if (grant.isPending) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError("Enter the email address they signed up with");
      return;
    }
    setConfirming(null);
    setPromptError(null);
    grantAccess(trimmed);
  }

  function handleRevoke(userId: string) {
    setError(null);
    if (revoke.isPending) return;
    setConfirming(null);
    setPromptError(null);
    revokeAccess(userId);
  }

  function handleConfirm(password: string) {
    if (!confirming || grant.isPending || revoke.isPending) return;
    setPromptError(null);
    if (confirming.kind === "grant") grantAccess(confirming.email, password);
    else revokeAccess(confirming.userId, password);
  }

  const rows = collaborators.data?.collaborators ?? [];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="admin-access-heading">
      <div className="flex flex-col gap-1">
        <h2 id="admin-access-heading" className="font-h2 text-[var(--color-text)]">
          {ACCESS_PANEL_TITLE}
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">{ACCESS_PANEL_DESCRIPTION}</p>
      </div>

      {collaborators.isLoading ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : null}

      {collaborators.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          Couldn't load who has access.
        </p>
      ) : null}

      {!collaborators.isLoading && !collaborators.isError ? (
        <ul className="flex flex-col gap-2">
          {rows.map((collaborator) => (
            <li
              key={collaborator.userId ?? collaborator.email}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium break-all text-[var(--color-text)]">
                  {collaborator.email}
                  {collaborator.isSelf ? (
                    <span className="rounded-full bg-[var(--color-primary-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-primary-soft-text)]">
                      you
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {collaboratorProvenance(collaborator)}
                </span>
              </span>
              {collaborator.canRevoke && collaborator.userId ? (
                <button
                  type="button"
                  onClick={() => {
                    handleRevoke(collaborator.userId!);
                  }}
                  disabled={revoke.isPending}
                  className="min-h-11 shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-danger)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Revoke
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <form className="flex flex-col gap-2" onSubmit={handleGrant} noValidate>
        <Field label="Grant access by email" htmlFor="admin-grant-email" error={fieldError}>
          <Input
            id="admin-grant-email"
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
              setConfirming(null);
            }}
          />
        </Field>
        <div>
          <Button type="submit" size="sm" disabled={grant.isPending}>
            {grant.isPending ? "Granting…" : "Grant access"}
          </Button>
        </div>
      </form>

      {confirming ? (
        <PasswordPrompt
          id="admin-access-password"
          pending={grant.isPending || revoke.isPending}
          error={promptError}
          onConfirm={handleConfirm}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
