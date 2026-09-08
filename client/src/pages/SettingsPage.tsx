import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
import { getStoredTheme, setTheme, type ThemePreference } from "../theme.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Input, Textarea } from "../components/ui/Input.js";
import { Sheet } from "../components/ui/Sheet.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { SegmentedControl, type SegmentedControlOption } from "../components/ui/SegmentedControl.js";
import { useSubmitValidation, type FormErrors } from "../lib/forms.js";

// A quiet, bordered "danger" affordance for small inline actions (remove
// key, delete a baby, open the delete-account flow) — one step below the
// solid `Button variant="danger"` fill, which is reserved for the actual
// irreversible confirm buttons below.
const dangerGhostButtonClass =
  "min-h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-danger)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-60";

/** Local-time YYYY-MM-DD for the birth-date input's `max` — no future dates.
 * (Local date parts, not toISOString, so the cap is right near midnight.) */
function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export interface BabyFormValues {
  name: string;
  birthDate: string;
  notes: string;
}

export type BabyField = "name" | "birthDate";
export type BabyErrors = FormErrors<BabyField>;

/** Visual field order — what a failed submit focuses first (item 235). */
export const BABY_FIELD_ORDER: readonly BabyField[] = ["name", "birthDate"];

/** The ids of one baby form's controls, for `useSubmitValidation`'s focus. */
export function babyFieldIds(idPrefix: string): Record<BabyField, string> {
  return { name: `${idPrefix}-name`, birthDate: `${idPrefix}-birthdate` };
}

/**
 * The baby form's required-field rules (item 235), shared by `AddBabySheet`
 * and `BabyRow`'s edit form so the two can never drift apart. Per field, not
 * one form-level sentence: each message sits under the control that caused
 * it. Notes are optional and never error.
 *
 * An empty object means valid — same reading as `validateCustomFood`.
 */
export function validateBaby(values: BabyFormValues): BabyErrors {
  const errors: BabyErrors = {};
  if (values.name.trim().length === 0) errors.name = "Name is required";
  if (!values.birthDate) errors.birthDate = "Birth date is required";
  return errors;
}

/** Exported for render tests: the error slots below are the whole point
 * of item 235 and are otherwise only reachable through a real submit. */
export function BabyFields({
  values,
  onChange,
  idPrefix,
  errors,
}: {
  values: BabyFormValues;
  onChange: (values: BabyFormValues) => void;
  idPrefix: string;
  errors: BabyErrors;
}) {
  return (
    <>
      <Field label="Nickname" htmlFor={`${idPrefix}-name`} error={errors.name}>
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

      <Field label="Birth date" htmlFor={`${idPrefix}-birthdate`} error={errors.birthDate}>
        {/* Deliberately the native calendar input, not the wheel picker: a
            birth date is a single known faraway date — the wheels are for
            recent-past log entries. */}
        <Input
          id={`${idPrefix}-birthdate`}
          type="date"
          required
          max={todayYmd()}
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
  // Server failures only — the required fields answer for themselves inline.
  const [error, setError] = useState<string | null>(null);
  const { errors, attemptSubmit } = useSubmitValidation(
    values,
    validateBaby,
    BABY_FIELD_ORDER,
    babyFieldIds("new-baby"),
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (createBaby.isPending) return;
    if (!attemptSubmit()) return;
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
      <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        <BabyFields values={values} onChange={setValues} idPrefix="new-baby" errors={errors} />
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
  // Server failures only — the required fields answer for themselves inline.
  const [error, setError] = useState<string | null>(null);
  const { errors, attemptSubmit } = useSubmitValidation(
    values,
    validateBaby,
    BABY_FIELD_ORDER,
    babyFieldIds(`baby-${baby.id}`),
  );

  function openEdit() {
    setValues({ name: baby.name, birthDate: baby.birthDate, notes: baby.notes ?? "" });
    setError(null);
    setEditing(true);
  }

  function handleSave(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (updateBaby.isPending) return;
    if (!attemptSubmit()) return;
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
        <form className="flex flex-col gap-3" onSubmit={handleSave} noValidate>
          <BabyFields values={values} onChange={setValues} idPrefix={`baby-${baby.id}`} errors={errors} />
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

export type AiKeyField = "apiKey";
export type AiKeyErrors = FormErrors<AiKeyField>;

/** Visual field order — what a failed submit focuses first (item 235). */
export const AI_KEY_FIELD_ORDER: readonly AiKeyField[] = ["apiKey"];

/**
 * The AI key form's required-field rule (item 235). Deliberately only
 * "is there a key at all": the shape of a key is Anthropic's business, and
 * the server checks it for real before storing anything.
 *
 * An empty object means valid — same reading as `validateCustomFood`.
 */
export function validateAiKey(values: { apiKey: string }): AiKeyErrors {
  const errors: AiKeyErrors = {};
  if (values.apiKey.trim().length === 0) errors.apiKey = "API key is required";
  return errors;
}

/** Exported for render tests — see `BabyFields`. */
export function AiSection() {
  const status = useAiKeyStatus();
  const saveKey = useSaveAiKey();
  const removeKey = useDeleteAiKey();

  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const configured = status.data?.configured === true;
  const validatedAt = formatValidatedAt(status.data?.lastValidatedAt);

  const { errors, attemptSubmit } = useSubmitValidation({ apiKey }, validateAiKey, AI_KEY_FIELD_ORDER, {
    apiKey: "anthropic-api-key",
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (saveKey.isPending) return;
    if (!attemptSubmit()) return;
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
          className="font-medium text-[var(--color-accent)] underline underline-offset-2"
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
        <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{configured ? "Replace key" : "Add your key"}</h3>

          <Field label="Anthropic API key" htmlFor="anthropic-api-key" error={errors.apiKey}>
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

          <Button type="submit" disabled={saveKey.isPending} className="w-fit">
            {saveKey.isPending ? "Checking key…" : "Save key"}
          </Button>
        </form>
      </Card>
    </section>
  );
}

const themeIconProps = {
  viewBox: "0 0 24 24",
  width: 18,
  height: 18,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function SunIcon() {
  return (
    <svg {...themeIconProps}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.9-1.9M17.5 6.5l1.9-1.9" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg {...themeIconProps}>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...themeIconProps}>
      <path d="M19.5 14.4A8.2 8.2 0 0 1 9.6 4.5a8.6 8.6 0 1 0 9.9 9.9z" />
    </svg>
  );
}

const THEME_OPTIONS: Array<SegmentedControlOption<ThemePreference>> = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "system", label: "System", icon: <SystemIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
];

function AppearanceSection() {
  const [preference, setPreference] = useState<ThemePreference>(() => getStoredTheme());

  // Pick up the stored preference on mount in case it changed elsewhere
  // (e.g. another tab) since the component's initial state was captured.
  useEffect(() => {
    setPreference(getStoredTheme());
  }, []);

  function handleChange(next: ThemePreference) {
    setTheme(next);
    setPreference(next);
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-h2 flex items-center gap-2 text-[var(--color-text)]">
        <span aria-hidden="true">🎨</span> Appearance
      </h2>
      <p className="text-sm text-[var(--color-text-muted)]">Choose how BLW looks on this device.</p>
      <SegmentedControl
        options={THEME_OPTIONS}
        value={preference}
        onChange={handleChange}
        aria-label="Appearance"
      />
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

export type DeleteAccountField = "phrase" | "password";
export type DeleteAccountErrors = FormErrors<DeleteAccountField>;

/** Visual field order — what a failed submit focuses first (item 235). */
export const DELETE_ACCOUNT_FIELD_ORDER: readonly DeleteAccountField[] = ["phrase", "password"];

/**
 * The delete-account form's rules (item 235). The confirm button is enabled
 * like every other submit in the app — the guard is that this helper has to
 * pass before the mutation is reached, so a mistyped phrase gets a sentence
 * saying so instead of a button that silently does nothing.
 *
 * An empty object means valid — same reading as `validateCustomFood`.
 */
export function validateDeleteAccount(values: { phrase: string; password: string }): DeleteAccountErrors {
  const errors: DeleteAccountErrors = {};
  if (values.phrase.trim() !== ACCOUNT_DELETE_CONFIRMATION) errors.phrase = "Type the confirmation phrase exactly";
  if (values.password.length === 0) errors.password = "Password is required";
  return errors;
}

/** Exported for render tests — see `BabyFields`. */
export function DeleteAccountForm({ onCancel }: { onCancel: () => void }) {
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { errors, attemptSubmit } = useSubmitValidation(
    { phrase, password },
    validateDeleteAccount,
    DELETE_ACCOUNT_FIELD_ORDER,
    { phrase: "delete-confirm-phrase", password: "delete-confirm-password" },
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (deleteAccount.isPending) return;
    // The account is only ever deleted once BOTH answers are right.
    if (!attemptSubmit()) return;
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
      <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
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

        <Field label={confirmLabel} htmlFor="delete-confirm-phrase" error={errors.phrase}>
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

        <Field label="Your password" htmlFor="delete-confirm-password" error={errors.password}>
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
          <Button type="submit" variant="danger" disabled={deleteAccount.isPending}>
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
      <AppearanceSection />
      <AccountSection />
    </div>
  );
}
