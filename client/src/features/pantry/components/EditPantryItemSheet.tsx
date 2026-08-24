import { useState } from "react";
import type { PantryItem, PantryLocation } from "@blw/shared";
import { useUpdatePantryItem } from "../hooks.js";
import { LOCATIONS, toDateTimeLocal } from "../format.js";

interface EditPantryItemSheetProps {
  item: PantryItem;
  onDone: () => void;
}

export function EditPantryItemSheet({ item, onDone }: EditPantryItemSheetProps) {
  const [location, setLocation] = useState<PantryLocation>(item.location);
  const [preparedAt, setPreparedAt] = useState(() => toDateTimeLocal(new Date(item.preparedAt)));
  const [quantityNote, setQuantityNote] = useState(item.quantityNote ?? "");
  const updateItem = useUpdatePantryItem();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    updateItem.mutate(
      {
        id: item.id,
        input: {
          location,
          preparedAt: new Date(preparedAt).toISOString(),
          quantityNote: quantityNote.trim() || null,
        },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
    >
      <p className="text-xs font-semibold text-[var(--color-text)]">Edit item</p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Location</span>
        <div className="flex gap-1.5">
          {LOCATIONS.map((loc) => (
            <button
              key={loc.value}
              type="button"
              onClick={() => setLocation(loc.value)}
              aria-pressed={location === loc.value}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                location === loc.value
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                  : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text)]"
              }`}
            >
              {loc.label}
            </button>
          ))}
        </div>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Prepared</span>
        <input
          type="datetime-local"
          value={preparedAt}
          max={toDateTimeLocal(new Date())}
          onChange={(e) => setPreparedAt(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm text-[var(--color-text)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Quantity note (optional)</span>
        <input
          type="text"
          value={quantityNote}
          onChange={(e) => setQuantityNote(e.target.value)}
          placeholder="e.g. 2 cubes left"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm text-[var(--color-text)]"
        />
      </label>

      {updateItem.isError && <p className="text-xs text-[var(--color-danger)]">Couldn't save that — try again.</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={updateItem.isPending}
          className="flex-1 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-contrast)] disabled:opacity-60"
        >
          {updateItem.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
