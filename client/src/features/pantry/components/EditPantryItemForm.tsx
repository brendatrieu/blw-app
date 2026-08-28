import { useState } from "react";
import type { PantryItem, PantryLocation } from "@blw/shared";
import { useUpdatePantryItem } from "../hooks.js";
import { LOCATIONS } from "../format.js";
import { Field } from "../../../components/ui/Field.js";
import { Input, Textarea } from "../../../components/ui/Input.js";
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { DateField } from "../../../components/ui/DateField.js";
import { Button } from "../../../components/ui/Button.js";

interface EditPantryItemFormProps {
  item: PantryItem;
  onDone: () => void;
}

/**
 * The pantry "edit" form, byte-compatible with the one that used to live in
 * the inline EditPantryItemSheet: location segments, wheel "Prepared" field
 * preset from the item's stored value, and quantity note. Now rendered
 * full-screen by PantryEditPage, which supplies `onDone` for both a
 * successful save and Cancel.
 */
export function EditPantryItemForm({ item, onDone }: EditPantryItemFormProps) {
  const [location, setLocation] = useState<PantryLocation>(item.location);
  const [preparedAt, setPreparedAt] = useState(() => nowAtMinute(new Date(item.preparedAt)));
  const [quantityNote, setQuantityNote] = useState(item.quantityNote ?? "");
  const [servingsTotal, setServingsTotal] = useState(item.servingsTotal != null ? String(item.servingsTotal) : "");
  const [bestBy, setBestBy] = useState(item.bestBy ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const updateItem = useUpdatePantryItem();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    updateItem.mutate(
      {
        id: item.id,
        input: {
          location,
          preparedAt: preparedAt.toISOString(),
          quantityNote: quantityNote.trim() || null,
          servingsTotal: servingsTotal.trim() ? Number(servingsTotal) : null,
          bestBy: bestBy || null,
          notes: notes.trim() || null,
        },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
        <DateTimeField id="pantry-edit-prepared" value={preparedAt} onChange={setPreparedAt} />
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

      <Field label="Total servings (optional)" htmlFor="pantry-edit-servings">
        <Input
          id="pantry-edit-servings"
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={servingsTotal}
          onChange={(e) => setServingsTotal(e.target.value)}
          placeholder="e.g. 6"
        />
      </Field>

      <Field label="Best by (optional)" htmlFor="pantry-edit-best-by">
        <DateField id="pantry-edit-best-by" value={bestBy} onChange={setBestBy} allowFuture title="Best by" />
      </Field>

      <Field label="Notes (optional)" htmlFor="pantry-edit-notes">
        <Textarea
          id="pantry-edit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. from the batch we made Sunday"
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
    </form>
  );
}
