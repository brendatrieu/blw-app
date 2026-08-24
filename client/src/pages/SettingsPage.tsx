import { useState, type FormEvent } from "react";
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

const fieldClass = "w-full rounded-lg border px-3 py-2 text-base";
const fieldStyle = {
  backgroundColor: "var(--color-bg)",
  borderColor: "var(--color-border)",
  color: "var(--color-text)",
};

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
}: {
  values: BabyFormValues;
  onChange: (values: BabyFormValues) => void;
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text)" }}>
        Nickname
        <input
          type="text"
          required
          maxLength={60}
          className={fieldClass}
          style={fieldStyle}
          value={values.name}
          onChange={(event) => {
            onChange({ ...values, name: event.target.value });
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text)" }}>
        Birth date
        <input
          type="date"
          required
          max={today()}
          className={fieldClass}
          style={fieldStyle}
          value={values.birthDate}
          onChange={(event) => {
            onChange({ ...values, birthDate: event.target.value });
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text)" }}>
        Notes (optional)
        <textarea
          rows={2}
          maxLength={500}
          className={fieldClass}
          style={fieldStyle}
          value={values.notes}
          onChange={(event) => {
            onChange({ ...values, notes: event.target.value });
          }}
        />
      </label>
    </>
  );
}

function AddBabyForm() {
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
        },
        onError: (mutationError) => {
          setError(mutationError.message);
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border p-3"
      style={{ borderColor: "var(--color-border)" }}
      onSubmit={handleSubmit}
    >
      <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
        Add a baby
      </h3>
      <BabyFields values={values} onChange={setValues} />
      {error ? (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={createBaby.isPending}
        className="self-start rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
        style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-contrast)" }}
      >
        {createBaby.isPending ? "Adding…" : "Add baby"}
      </button>
    </form>
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

  if (editing) {
    return (
      <form
        className="flex flex-col gap-3 rounded-xl border p-3"
        style={{ borderColor: "var(--color-border)" }}
        onSubmit={handleSave}
      >
        <BabyFields values={values} onChange={setValues} />
        {error ? (
          <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={updateBaby.isPending}
            className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            style={{
              backgroundColor: "var(--color-primary)",
              color: "var(--color-primary-contrast)",
            }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setValues({ name: baby.name, birthDate: baby.birthDate, notes: baby.notes ?? "" });
            }}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border p-3"
      style={{ borderColor: "var(--color-border)", opacity: baby.archived ? 0.6 : 1 }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium" style={{ color: "var(--color-text)" }}>
          {baby.name}
        </span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {ageInMonths(baby.birthDate)} months
          {baby.archived ? " · archived" : ""}
        </span>
      </div>

      {baby.notes ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {baby.notes}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setEditing(true);
          }}
          className="rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
        >
          Edit
        </button>
        <button
          type="button"
          disabled={updateBaby.isPending}
          onClick={() => {
            updateBaby.mutate({ id: baby.id, input: { archived: !baby.archived } });
          }}
          className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
        >
          {baby.archived ? "Restore" : "Archive"}
        </button>
        <button
          type="button"
          disabled={deleteBaby.isPending}
          onClick={handleDelete}
          className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
          style={{ borderColor: "var(--color-border)", color: "var(--color-danger)" }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function BabiesSection() {
  const babies = useBabies(true);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
        Babies
      </h2>

      {babies.isPending ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading…
        </p>
      ) : null}

      {babies.isError ? (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          Could not load your babies. {babies.error.message}
        </p>
      ) : null}

      {babies.data?.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No babies yet. Add one to start tracking foods and allergens.
        </p>
      ) : null}

      {babies.data?.map((baby) => <BabyRow key={baby.id} baby={baby} />)}

      <AddBabyForm />
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
      <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
        AI features (optional)
      </h2>

      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        A few extras — the symptom helper and the recipe and weaning chats — run on Anthropic&apos;s
        Claude. They use <strong>your own</strong> Anthropic API key, so the usage is billed to you
        and nothing goes through a shared account. Everything else in this app works fully without
        a key.
      </p>

      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Your key is encrypted before it is stored, is never shown again, and is deleted with your
        account. What we send Claude is limited to your baby&apos;s age in months, food names,
        symptoms and pantry items — never their name, your email, or any account id.{" "}
        <a
          href={ANTHROPIC_CONSOLE_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="underline"
          style={{ color: "var(--color-primary)" }}
        >
          Get a key from the Anthropic console
        </a>
        .
      </p>

      {status.isPending ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading…
        </p>
      ) : null}

      {status.isError ? (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          Could not check whether a key is set up. {status.error.message}
        </p>
      ) : null}

      {configured ? (
        <div
          className="flex flex-col gap-2 rounded-xl border p-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span className="font-medium" style={{ color: "var(--color-text)" }}>
            Key on file: {maskAiKey(status.data?.last4 ?? "")}
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {validatedAt ? `Checked with Anthropic on ${validatedAt}` : "Not yet checked"}
          </span>
          <button
            type="button"
            disabled={removeKey.isPending}
            onClick={handleRemove}
            className="self-start rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
            style={{ borderColor: "var(--color-border)", color: "var(--color-danger)" }}
          >
            {removeKey.isPending ? "Removing…" : "Remove key"}
          </button>
        </div>
      ) : null}

      <form
        className="flex flex-col gap-3 rounded-xl border p-3"
        style={{ borderColor: "var(--color-border)" }}
        onSubmit={handleSubmit}
      >
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          {configured ? "Replace key" : "Add your key"}
        </h3>

        <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text)" }}>
          Anthropic API key
          <input
            type="password"
            required
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            name="anthropic-api-key"
            placeholder="sk-ant-…"
            className={fieldClass}
            style={fieldStyle}
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setError(null);
              setSaved(false);
            }}
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        ) : null}

        {saved ? (
          <p role="status" className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Key checked with Anthropic and saved. AI features are on.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saveKey.isPending || apiKey.trim().length === 0}
          className="self-start rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-contrast)" }}
        >
          {saveKey.isPending ? "Checking key…" : "Save key"}
        </button>
      </form>
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

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border p-3"
      style={{ borderColor: "var(--color-danger)" }}
      onSubmit={handleSubmit}
    >
      <h3 className="text-sm font-semibold" style={{ color: "var(--color-danger)" }}>
        Delete this account
      </h3>

      <p className="text-sm" style={{ color: "var(--color-text)" }}>
        This permanently deletes your account and everything in it — every baby profile, the whole
        food log, your allergen progress, favourites, pantry, symptom checks, chats, and your
        Anthropic key. <strong>It cannot be undone and there is no backup we can restore from.</strong>
      </p>

      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        If you might want this data later, export it first — the button above saves everything as a
        JSON file.
      </p>

      <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text)" }}>
        Type <strong>{ACCOUNT_DELETE_CONFIRMATION}</strong> to confirm
        <input
          type="text"
          required
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={fieldClass}
          style={fieldStyle}
          value={phrase}
          onChange={(event) => {
            setPhrase(event.target.value);
            setError(null);
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text)" }}>
        Your password
        <input
          type="password"
          required
          autoComplete="current-password"
          name="current-password"
          className={fieldClass}
          style={fieldStyle}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ backgroundColor: "var(--color-danger)", color: "var(--color-primary-contrast)" }}
        >
          {deleteAccount.isPending ? "Deleting…" : "Delete my account forever"}
        </button>
        <button
          type="button"
          disabled={deleteAccount.isPending}
          onClick={onCancel}
          className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function AccountSection() {
  const { data: session } = useSession();
  const exportData = useExportAccount();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
        Account
      </h2>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Signed in as {session?.user.email}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={exportData.isPending}
          onClick={() => {
            exportData.mutate();
          }}
          className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
        >
          {exportData.isPending ? "Preparing…" : "Export my data"}
        </button>
        {confirmingDelete ? null : (
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(true);
            }}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--color-border)", color: "var(--color-danger)" }}
          >
            Delete account
          </button>
        )}
      </div>

      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        The export is a single JSON file with everything on your account: babies, food log,
        favourites, pantry, symptom checks and chats. It never contains your API key.
      </p>

      {exportData.isError ? (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          Could not build your export. {accountErrorMessage(exportData.error.message)}
        </p>
      ) : null}

      {exportData.isSuccess ? (
        <p role="status" className="text-sm" style={{ color: "var(--color-text-muted)" }}>
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
      <h1 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>
        Settings
      </h1>
      <BabiesSection />
      <AiSection />
      <AccountSection />
    </div>
  );
}
