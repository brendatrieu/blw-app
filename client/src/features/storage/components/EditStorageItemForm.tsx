import { useState } from "react";
import type { StorageItem, StorageLocation } from "@blw/shared";
import { useUpdateStorageItem } from "../hooks.js";
import { LOCATIONS } from "../format.js";
import { Field } from "../../../components/ui/Field.js";
import { Input, Textarea } from "../../../components/ui/Input.js";
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { DateField } from "../../../components/ui/DateField.js";
import { Button } from "../../../components/ui/Button.js";

interface EditStorageItemFormProps {
  item: StorageItem;
  onDone: () => void;
}

/**
 * The storage "edit" form, byte-compatible with the one that used to live in
 * the inline EditStorageItemSheet: location segments, wheel "Prepared" field
 * preset from the item's stored value, and quantity note. Now rendered
 * full-screen by StorageEditPage, which supplies `onDone` for both a
 * successful save and Cancel.
 */
export function EditStorageItemForm({ item, onDone }: EditStorageItemFormProps) {
  const [location, setLocation] = useState<StorageLocation>(item.location);
  const [preparedAt, setPreparedAt] = useState(() => nowAtMinute(new Date(item.preparedAt)));
  const [quantityNote, setQuantityNote] = useState(item.quantityNote ?? "");
  const [servingsTotal, setServingsTotal] = useState(item.servingsTotal != null ? String(item.servingsTotal) : "");
  const [bestBy, setBestBy] = useState(item.bestBy ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const updateItem = useUpdateStorageItem();

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

      <Field label="Prepared" htmlFor="storage-edit-prepared">
        <DateTimeField id="storage-edit-prepared" value={preparedAt} onChange={setPreparedAt} />
      </Field>

      <Field label="Quantity note (optional)" htmlFor="storage-edit-note">
        <Input
          id="storage-edit-note"
          type="text"
          value={quantityNote}
          onChange={(e) => setQuantityNote(e.target.value)}
          placeholder="e.g. 2 cubes left"
        />
      </Field>

      <Field label="Total servings (optional)" htmlFor="storage-edit-servings">
        <Input
          id="storage-edit-servings"
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={servingsTotal}
          onChange={(e) => setServingsTotal(e.target.value)}
          placeholder="e.g. 6"
        />
      </Field>

      <Field label="Best by (optional)" htmlFor="storage-edit-best-by">
        <DateField id="storage-edit-best-by" value={bestBy} onChange={setBestBy} allowFuture title="Best by" />
      </Field>

      <Field label="Notes (optional)" htmlFor="storage-edit-notes">
        <Textarea
          id="storage-edit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. from the batch we made Sunday"
        />
      </Field>

      {updateItem.isError && <p className="text-xs text-[var(--color-danger)]">Couldn't save that — try again.</p>}

      {/* Save only (item 257): the page's header X is the way out. */}
      <Button type="submit" disabled={updateItem.isPending} className="w-full">
        {updateItem.isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
