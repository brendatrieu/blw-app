import { useState, type FormEvent } from "react";
import type { AdminCollaborator } from "@blw/shared";
import { Button } from "../../components/ui/Button.js";
import { Field } from "../../components/ui/Field.js";
import { Input } from "../../components/ui/Input.js";
import { Skeleton } from "../../components/ui/Skeleton.js";
import { useCollaborators, useGrantCollaborator, useRevokeCollaborator } from "./hooks.js";

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
 * `reauth_required` and this panel translates it, the same way the
 * delete-account flow does, so there is exactly one place the freshness rule
 * lives.
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
    grant.mutate(trimmed, {
      onSuccess: () => {
        setEmail("");
      },
      onError: (mutationError) => {
        setError(collaboratorErrorMessage(mutationError.message));
      },
    });
  }

  function handleRevoke(userId: string) {
    setError(null);
    if (revoke.isPending) return;
    revoke.mutate(userId, {
      onError: (mutationError) => {
        setError(collaboratorErrorMessage(mutationError.message));
      },
    });
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
                <span className="flex items-center gap-1.5 text-sm font-semibold break-all text-[var(--color-text)]">
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
            }}
          />
        </Field>
        <div>
          <Button type="submit" size="sm" disabled={grant.isPending}>
            {grant.isPending ? "Granting…" : "Grant access"}
          </Button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
