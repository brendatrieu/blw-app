import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Baby } from "@blw/shared";
import { ACCOUNT_DELETE_CONFIRMATION, ANTHROPIC_CONSOLE_URL, ageInMonths, maskAiKey } from "@blw/shared";
import { useDeleteAccount, useExportAccount } from "../features/account/hooks.js";
import { useAiKeyStatus, useDeleteAiKey, useSaveAiKey } from "../features/ai/hooks.js";
import { useBabies, useCreateBaby, useDeleteBaby, useUpdateBaby } from "../features/babies/hooks.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useSession } from "../lib/auth.js";
import { createSignOutDeps, performSignOut } from "../lib/signout.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Input, Textarea } from "../components/ui/Input.js";
import { Sheet } from "../components/ui/Sheet.js";
import { EmptyState } from "../components/ui/EmptyState.js";

// A quiet, bordered "danger" affordance for small inline actions (remove
// key, delete a baby, open the delete-account flow) — one step below the
// solid `Button variant="danger"` fill, which is reserved for the actual
// irreversible confirm buttons below.
const dangerGhostButtonClass =
  "min-h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-danger)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-60";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface BabyFormValues {
  name: string;
  birthDate: string;
  notes: string;
}

function BabyFields({
  values,
  onChange,
  idPrefix,
}: {
  values: BabyFormValues;
  onChange: (values: BabyFormValues) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field label="Nickname" htmlFor={`${idPrefix}-name`}>
        <Input
          id={`${idPrefix}-name`}
          type="text"
          required
          maxLength={60}
          value={values.name}
          onChange={(event) => {
            onChange({ ...values, name: event.target.value });
          }}
        />
      </Field>

      <Field label="Birth date" htmlFor={`${idPrefix}-birthdate`}>
        <Input
          id={`${idPrefix}-birthdate`}
          type="date"
          required
          max={today()}
          value={values.birthDate}
          onChange={(event) => {
            onChange({ ...values, birthDate: event.target.value });
          }}
        />
      </Field>

      <Field label="Notes (optional)" htmlFor={`${idPrefix}-notes`}>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={2}
          maxLength={500}
          value={values.notes}
          onChange={(event) => {
            onChange({ ...values, notes: event.target.value });
          }}
        />
      </Field>
    </>
  );
}

function AddBabySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createBaby = useCreateBaby();
  const [values, setValues] = useState<BabyFormValues>({ name: "", birthDate: "", notes: "" });
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    createBaby.mutate(
      { name: values.name.trim(), birthDate: values.birthDate, notes: values.notes.trim() || null },
      {
        onSuccess: () => {
          setValues({ name: "", birthDate: "", notes: "" });
          onClose();
        },
        onError: (mutationError) => {
          setError(mutationError.message);
        },
      },
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add a baby 🍼">
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <BabyFields values={values} onChange={setValues} idPrefix="new-baby" />
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={createBaby.isPending}>
            {createBaby.isPending ? "Adding…" : "Add baby"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function BabyRow({ baby }: { baby: Baby }) {
  const updateBaby = useUpdateBaby();
  const deleteBaby = useDeleteBaby();
  const { activeBaby, setActiveBabyId } = useActiveBaby();

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<BabyFormValues>({
    name: baby.name,
    birthDate: baby.birthDate,
    notes: baby.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  function openEdit() {
    setValues({ name: baby.name, birthDate: baby.birthDate, notes: baby.notes ?? "" });
    setError(null);
    setEditing(true);
  }

  function handleSave(event: FormEvent) {
    event.preventDefault();
    setError(null);
    updateBaby.mutate(
      {
        id: baby.id,
        input: {
          name: values.name.trim(),
          birthDate: values.birthDate,
          notes: values.notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setEditing(false);
        },
        onError: (mutationError) => {
          setError(mutationError.message);
        },
      },
    );
  }

  function handleDelete() {
    // Deleting a baby cascades to their whole log on the server, so make the
    // parent confirm rather than offering an undo that cannot restore it.
    const confirmed = window.confirm(
      `Delete ${baby.name}? This also removes their food log and cannot be undone.`,
    );
    if (!confirmed) return;
    if (activeBaby?.id === baby.id) setActiveBabyId(null);
    deleteBaby.mutate(baby.id);
  }

  return (
    <>
      <Card className={`flex flex-col gap-2 ${baby.archived ? "opacity-60" : ""}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <span aria-hidden="true">👶</span>
            {baby.name}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {ageInMonths(baby.birthDate)} months
            {baby.archived ? " · archived" : ""}
          </span>
        </div>

        {baby.notes ? <p className="text-sm text-[var(--color-text-muted)]">{baby.notes}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={openEdit}>
            Edit
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={updateBaby.isPending}
            onClick={() => {
              updateBaby.mutate({ id: baby.id, input: { archived: !baby.archived } });
            }}
          >
            {baby.archived ? "Restore" : "Archive"}
          </Button>
          <button type="button" disabled={deleteBaby.isPending} onClick={handleDelete} className={dangerGhostButtonClass}>
            Delete
          </button>
        </div>
      </Card>

      <Sheet open={editing} onClose={() => setEditing(false)} title={`Edit ${baby.name}`}>
        <form className="flex flex-col gap-3" onSubmit={handleSave}>
          <BabyFields values={values} onChange={setValues} idPrefix={`baby-${baby.id}`} />
          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={updateBaby.isPending}>
              {updateBaby.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}

function BabiesSection() {
  const babies = useBabies(true);
  const [addingOpen, setAddingOpen] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-h2 flex items-center gap-2 text-[var(--color-text)]">
          <span aria-hidden="true">👶</span> Babies
        </h2>
        <Button type="button" size="sm" onClick={() => setAddingOpen(true)}>
          + Add baby
        </Button>
      </div>

      {babies.isPending ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}

      {babies.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          Could not load your babies. {babies.error.message}
        </p>
      ) : null}

      {babies.data?.length === 0 ? (
        <EmptyState icon="👶" title="No babies yet" description="Add one to start tracking foods and allergens." />
      ) : null}

      <div className="flex flex-col gap-2">{babies.data?.map((baby) => <BabyRow key={baby.id} baby={baby} />)}</div>

      <AddBabySheet open={addingOpen} onClose={() => setAddingOpen(false)} />
    </section>
  );
}

/**
 * The server answers with machine codes; parents get sentences. Anything
 * unrecognised falls through to the raw code rather than a wrong guess.
 */
function aiKeyErrorMessage(code: string): string {
  switch (code) {
    case "invalid_key":
      return "That key was not accepted. Check you copied the whole key from the Anthropic console — it starts with sk-ant- — and that it has not been revoked.";
    case "validation_unavailable":
      return "Could not reach Anthropic to check the key just now. Nothing was saved — please try again in a moment.";
    case "rate_limited":
      return "Too many attempts. Wait an hour before trying another key.";
    case "unauthorized":
      return "Your session expired. Sign in again and retry.";
    default:
      return code;
  }
}

function formatValidatedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function AiSection() {
  const status = useAiKeyStatus();
  const saveKey = useSaveAiKey();
  const removeKey = useDeleteAiKey();

  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const configured = status.data?.configured === true;
  const validatedAt = formatValidatedAt(status.data?.lastValidatedAt);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    saveKey.mutate(apiKey.trim(), {
      onSuccess: () => {
        // Drop the plaintext from component state the moment it is stored.
        setApiKey("");
        setSaved(true);
      },
      onError: (mutationError) => {
        setError(aiKeyErrorMessage(mutationError.message));
      },
    });
  }

  function handleRemove() {
    const confirmed = window.confirm(
      "Remove your Anthropic key? AI features switch off; everything else keeps working.",
    );
    if (!confirmed) return;
    setError(null);
    setSaved(false);
    removeKey.mutate(undefined, {
      onError: (mutationError) => {
        setError(aiKeyErrorMessage(mutationError.message));
      },
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-h2 flex items-center gap-2 text-[var(--color-text)]">
        <span aria-hidden="true">✨</span> AI features (optional)
      </h2>

      <p className="text-sm text-[var(--color-text-muted)]">
        A few extras — the symptom helper and the recipe and weaning chats — run on Anthropic&apos;s
        Claude. They use <strong>your own</strong> Anthropic API key, so the usage is billed to you
        and nothing goes through a shared account. Everything else in this app works fully without
        a key.
      </p>

      <p className="text-sm text-[var(--color-text-muted)]">
        Your key is encrypted before it is stored, is never shown again, and is deleted with your
        account. What we send Claude is limited to your baby&apos;s age in months, food names,
        symptoms and pantry items — never their name, your email, or any account id.{" "}
        <a
          href={ANTHROPIC_CONSOLE_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-[var(--color-primary)] underline underline-offset-2"
        >
          Get a key from the Anthropic console
        </a>
        .
      </p>

      {status.isPending ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}

      {status.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          Could not check whether a key is set up. {status.error.message}
        </p>
      ) : null}

      {configured ? (
        <Card className="flex flex-col gap-2">
          <span className="font-semibold text-[var(--color-text)]">
            Key on file: {maskAiKey(status.data?.last4 ?? "")}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {validatedAt ? `Checked with Anthropic on ${validatedAt}` : "Not yet checked"}
          </span>
          <button type="button" disabled={removeKey.isPending} onClick={handleRemove} className={`w-fit ${dangerGhostButtonClass}`}>
            {removeKey.isPending ? "Removing…" : "Remove key"}
          </button>
        </Card>
      ) : null}

      <Card>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{configured ? "Replace key" : "Add your key"}</h3>

          <Field label="Anthropic API key" htmlFor="anthropic-api-key">
            <Input
              id="anthropic-api-key"
              type="password"
              required
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              name="anthropic-api-key"
              placeholder="sk-ant-…"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setError(null);
                setSaved(false);
              }}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}

          {saved ? (
            <p role="status" className="text-sm text-[var(--color-text-muted)]">
              Key checked with Anthropic and saved. AI features are on.
            </p>
          ) : null}

          <Button type="submit" disabled={saveKey.isPending || apiKey.trim().length === 0} className="w-fit">
            {saveKey.isPending ? "Checking key…" : "Save key"}
          </Button>
        </form>
      </Card>
    </section>
  );
}

/**
 * The server answers with machine codes; parents get sentences. Anything
 * unrecognised falls through to the raw code rather than a wrong guess.
 */
function accountErrorMessage(code: string): string {
  switch (code) {
    case "invalid_password":
      return "That password is not right. Nothing has been deleted.";
    case "reauth_required":
      return "For your safety this needs a fresh sign-in. Sign out, sign back in, and try again.";
    case "invalid_request":
      return "Please type the confirmation phrase exactly as shown.";
    case "rate_limited":
      return "Too many attempts. Wait a few minutes and try again.";
    case "unauthorized":
      return "Your session expired. Sign in again and retry.";
    default:
      return code;
  }
}

function DeleteAccountForm({ onCancel }: { onCancel: () => void }) {
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const phraseMatches = phrase.trim() === ACCOUNT_DELETE_CONFIRMATION;
  const canSubmit = phraseMatches && password.length > 0 && !deleteAccount.isPending;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    deleteAccount.mutate(password, {
      onSuccess: async () => {
        // The server already revoked the session and cleared the cookie;
        // this clears the client's copy of the session state so the guarded
        // routes do not briefly believe the user is still signed in.
        setPassword("");
        try {
          await performSignOut(createSignOutDeps(queryClient));
        } catch {
          // The account is gone either way — never block the redirect on it.
        }
        void navigate("/login", { replace: true });
      },
      onError: (mutationError) => {
        setPassword("");
        setError(accountErrorMessage(mutationError.message));
      },
    });
  }

  const confirmLabel: ReactNode = (
    <>
      Type <strong>{ACCOUNT_DELETE_CONFIRMATION}</strong> to confirm
    </>
  );

  return (
    <Card className="border-2 border-[var(--color-danger)]">
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <h3 className="text-sm font-bold text-[var(--color-danger)]">Delete this account</h3>

        <p className="text-sm text-[var(--color-text)]">
          This permanently deletes your account and everything in it — every baby profile, the whole
          food log, your allergen progress, favourites, pantry, symptom checks, chats, and your
          Anthropic key. <strong>It cannot be undone and there is no backup we can restore from.</strong>
        </p>

        <p className="text-sm text-[var(--color-text-muted)]">
          If you might want this data later, export it first — the button above saves everything as a
          JSON file.
        </p>

        <Field label={confirmLabel} htmlFor="delete-confirm-phrase">
          <Input
            id="delete-confirm-phrase"
            type="text"
            required
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={phrase}
            onChange={(event) => {
              setPhrase(event.target.value);
              setError(null);
            }}
          />
        </Field>

        <Field label="Your password" htmlFor="delete-confirm-password">
          <Input
            id="delete-confirm-password"
            type="password"
            required
            autoComplete="current-password"
            name="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
          />
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="danger" disabled={!canSubmit}>
            {deleteAccount.isPending ? "Deleting…" : "Delete my account forever"}
          </Button>
          <Button type="button" variant="secondary" disabled={deleteAccount.isPending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AccountSection() {
  const { data: session } = useSession();
  const exportData = useExportAccount();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-h2 flex items-center gap-2 text-[var(--color-text)]">
        <span aria-hidden="true">🔐</span> Account
      </h2>
      <p className="text-sm text-[var(--color-text-muted)]">Signed in as {session?.user.email}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={exportData.isPending}
          onClick={() => {
            exportData.mutate();
          }}
        >
          {exportData.isPending ? "Preparing…" : "Export my data"}
        </Button>
        {confirmingDelete ? null : (
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(true);
            }}
            className={dangerGhostButtonClass}
          >
            Delete account
          </button>
        )}
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        The export is a single JSON file with everything on your account: babies, food log,
        favourites, pantry, symptom checks and chats. It never contains your API key.
      </p>

      {exportData.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          Could not build your export. {accountErrorMessage(exportData.error.message)}
        </p>
      ) : null}

      {exportData.isSuccess ? (
        <p role="status" className="text-sm text-[var(--color-text-muted)]">
          Export saved to your downloads.
        </p>
      ) : null}

      {confirmingDelete ? (
        <DeleteAccountForm
          onCancel={() => {
            setConfirmingDelete(false);
          }}
        />
      ) : null}
    </section>
  );
}

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 p-4">
      <PageHeader title="Settings" emoji="⚙️" />
      <BabiesSection />
      <AiSection />
      <AccountSection />
    </div>
  );
}
