import { useState, type FormEvent } from "react";
import type { Baby } from "@blw/shared";
import { ageInMonths } from "@blw/shared";
import { useBabies, useCreateBaby, useDeleteBaby, useUpdateBaby } from "../features/babies/hooks.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useSession } from "../lib/auth.js";

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

function AccountSection() {
  const { data: session } = useSession();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
        Account
      </h2>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Signed in as {session?.user.email}
      </p>

      <div className="flex flex-wrap gap-2">
        {/* Both land in a later phase; shown disabled so the account page
            does not pretend the data is unexportable or undeletable. */}
        <button
          type="button"
          disabled
          className="rounded-lg border px-3 py-1.5 text-sm opacity-50"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
        >
          Export my data
        </button>
        <button
          type="button"
          disabled
          className="rounded-lg border px-3 py-1.5 text-sm opacity-50"
          style={{ borderColor: "var(--color-border)", color: "var(--color-danger)" }}
        >
          Delete account
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        Export and account deletion are coming soon.
      </p>
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
      <AccountSection />
    </div>
  );
}
