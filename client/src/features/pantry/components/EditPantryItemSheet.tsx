import { useState } from "react";
import type { PantryItem, PantryLocation } from "@blw/shared";
import { useUpdatePantryItem } from "../hooks.js";
import { LOCATIONS, toDateTimeLocal } from "../format.js";
import { Field } from "../../../components/ui/Field.js";
import { Input } from "../../../components/ui/Input.js";
import { Button } from "../../../components/ui/Button.js";
import { Card } from "../../../components/ui/Card.js";

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
    <Card as="form" onSubmit={handleSubmit} padding="sm" className="flex flex-col gap-3">
      <p className="font-h2 text-[var(--color-text)]">✏️ Edit item</p>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-sm font-semibold text-[var(--color-text)]">Location</span>
        <div className="flex gap-1.5">
          {LOCATIONS.map((loc) => (
            <button
              key={loc.value}
              type="button"
              onClick={() => setLocation(loc.value)}
              aria-pressed={location === loc.value}
              className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium transition-colors ${
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

      <Field label="Prepared" htmlFor="pantry-edit-prepared">
        <Input
          id="pantry-edit-prepared"
          type="datetime-local"
          value={preparedAt}
          max={toDateTimeLocal(new Date())}
          onChange={(e) => setPreparedAt(e.target.value)}
        />
      </Field>

      <Field label="Quantity note (optional)" htmlFor="pantry-edit-note">
        <Input
          id="pantry-edit-note"
          type="text"
          value={quantityNote}
          onChange={(e) => setQuantityNote(e.target.value)}
          placeholder="e.g. 2 cubes left"
        />
      </Field>

      {updateItem.isError && <p className="text-xs text-[var(--color-danger)]">Couldn't save that — try again.</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={updateItem.isPending} className="flex-1">
          {updateItem.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
