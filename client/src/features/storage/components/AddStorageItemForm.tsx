import { useState } from "react";
import type { StorageLocation } from "@blw/shared";
import { FoodPicker } from "../../catalog/components/FoodPicker.js";
import { RecipePicker } from "../../catalog/components/RecipePicker.js";
import { useCreateStorageItem } from "../hooks.js";
import { LOCATIONS } from "../format.js";
import { Field } from "../../../components/ui/Field.js";
import { Input, Textarea } from "../../../components/ui/Input.js";
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { DateField } from "../../../components/ui/DateField.js";
import { Button } from "../../../components/ui/Button.js";
import { useSubmitValidation, type FormErrors } from "../../../lib/forms.js";

type Source = "food" | "recipe" | "label";

/** One key per source tab: only the visible tab's field can ever error. */
export type AddStorageItemField = Source;
export type AddStorageItemErrors = FormErrors<AddStorageItemField>;

/** Visual field order — what a failed submit focuses first (item 235). */
export const ADD_STORAGE_ITEM_FIELD_ORDER: readonly AddStorageItemField[] = ["food", "recipe", "label"];

export interface AddStorageItemValues {
  source: Source;
  foodIds: string[];
  recipeId: string;
  label: string;
}

/**
 * The add-to-storage form's required-field rules (item 235). What is required
 * depends on the source tab, and only the tab on screen is judged — a food id
 * left over from a tab the parent has moved away from is not an error, and is
 * not sent either. Location defaults to "fridge" and Prepared is seeded with
 * the current minute, so neither can be empty.
 *
 * An empty object means valid — same reading as `validateCustomFood`.
 */
export function validateAddStorageItem(values: AddStorageItemValues): AddStorageItemErrors {
  const errors: AddStorageItemErrors = {};
  if (values.source === "food") {
    if (values.foodIds.length === 0) errors.food = "Add at least one food";
  } else if (values.source === "recipe") {
    if (!values.recipeId) errors.recipe = "Recipe is required";
  } else if (values.label.trim().length === 0) {
    // The field asks "What is it?", so the answer is phrased as the ask
    // rather than as "<Field> is required" (item 238).
    errors.label = "Enter what it is";
  }
  return errors;
}

/**
 * What `/storage/add?food=<id>` / `?recipe=<id>` asks the form to open with
 * (item 284) — the same query-param idiom `/log-meal?food=<id>` uses, so
 * "Add to storage" from a food or recipe page lands on the right tab with the
 * right thing already chosen.
 *
 * `source: null` means "open the form as if nobody asked for anything": a
 * missing param, a blank one (`?food=`), or whitespace. Ids are NOT checked
 * for existence here — this is pure and knows nothing about the catalog. An
 * id that doesn't resolve simply leaves its picker showing nothing selected,
 * exactly as a hand-typed URL should.
 *
 * `?food=` wins when both are given: a storage item comes from one source,
 * and the food tab is the form's own default, so the tie breaks toward it.
 */
export interface StoragePrefill {
  source: "food" | "recipe" | null;
  foodId?: string;
  recipeId?: string;
}

export function resolveStoragePrefill(params: URLSearchParams): StoragePrefill {
  const foodId = params.get("food")?.trim();
  if (foodId) return { source: "food", foodId };
  const recipeId = params.get("recipe")?.trim();
  if (recipeId) return { source: "recipe", recipeId };
  return { source: null };
}

const SOURCE_TABS: { value: Source; label: string }[] = [
  { value: "food", label: "From a food" },
  { value: "recipe", label: "From a recipe" },
  { value: "label", label: "Free-form" },
];

interface AddStorageItemFormProps {
  onDone: () => void;
  /** From the page's query string — see `resolveStoragePrefill`. */
  prefill?: StoragePrefill;
}

/**
 * The storage "add" form, byte-compatible with the one that used to live in
 * the inline AddStorageItemSheet: same source tabs, food combobox, recipe
 * select, location segments, wheel "Prepared" field, and quantity note.
 * Now rendered full-screen by StorageAddPage, which supplies `onDone` for
 * both a successful save and Cancel, plus the `prefill` it read off the
 * query string. The prefill seeds the INITIAL state only — after that the
 * tabs and pickers are the parent's to change, and re-rendering never drags
 * them back to where the link pointed.
 */
export function AddStorageItemForm({ onDone, prefill }: AddStorageItemFormProps) {
  const [source, setSource] = useState<Source>(prefill?.source ?? "food");
  const [foodIds, setFoodIds] = useState<string[]>(prefill?.foodId ? [prefill.foodId] : []);
  const [recipeId, setRecipeId] = useState(prefill?.recipeId ?? "");
  const [label, setLabel] = useState("");
  const [location, setLocation] = useState<StorageLocation>("fridge");
  const [preparedAt, setPreparedAt] = useState(() => nowAtMinute());
  const [quantityNote, setQuantityNote] = useState("");
  const [servingsTotal, setServingsTotal] = useState("");
  const [bestBy, setBestBy] = useState("");
  const [notes, setNotes] = useState("");

  const createItem = useCreateStorageItem();

  // Item 235: "Add to storage" stays enabled, the missing answer shows under
  // whichever source field is on screen, and a failed submit focuses it.
  const { errors: shownErrors, attemptSubmit } = useSubmitValidation(
    { source, foodIds, recipeId, label },
    validateAddStorageItem,
    ADD_STORAGE_ITEM_FIELD_ORDER,
    { food: "storage-add-food", recipe: "storage-add-recipe", label: "storage-add-label" },
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (createItem.isPending) return;
    if (!attemptSubmit()) return;
    createItem.mutate(
      {
        foodIds: source === "food" ? foodIds : undefined,
        recipeId: source === "recipe" ? recipeId : undefined,
        label: source === "label" ? label.trim() : undefined,
        preparedAt: preparedAt.toISOString(),
        location,
        quantityNote: quantityNote.trim() || undefined,
        servingsTotal: servingsTotal.trim() ? Number(servingsTotal) : undefined,
        bestBy: bestBy || undefined,
        notes: notes.trim() || undefined,
      },
      { onSuccess: onDone },
    );
  }

  return (
    // `noValidate`: the required answer is reported inline by this form, not
    // by the browser's native bubble (item 236).
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSource(tab.value)}
            aria-pressed={source === tab.value}
            className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium transition-colors ${
              source === tab.value
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {source === "food" && (
        <Field label="Food" htmlFor="storage-add-food" error={shownErrors.food}>
          <FoodPicker id="storage-add-food" value={foodIds} onChange={setFoodIds} />
        </Field>
      )}

      {/* The same searchable picker the log form uses, over EVERY recipe.
          It replaced a native select of favorited recipes only, which could
          not show a recipe arriving via `?recipe=<id>` unless it happened to
          be favorited — the prefill would have set a recipe the field then
          rendered as blank. */}
      {source === "recipe" && (
        <Field label="Recipe" htmlFor="storage-add-recipe" error={shownErrors.recipe}>
          <RecipePicker id="storage-add-recipe" value={recipeId} onChange={setRecipeId} />
        </Field>
      )}

      {source === "label" && (
        <Field label="What is it?" htmlFor="storage-add-label" error={shownErrors.label}>
          <Input
            id="storage-add-label"
            type="text"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Leftover lentil soup"
          />
        </Field>
      )}

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
                  : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
              }`}
            >
              {loc.label}
            </button>
          ))}
        </div>
      </label>

      <Field label="Prepared" htmlFor="storage-add-prepared">
        <DateTimeField id="storage-add-prepared" value={preparedAt} onChange={setPreparedAt} />
      </Field>

      <Field label="Quantity note (optional)" htmlFor="storage-add-note">
        <Input
          id="storage-add-note"
          type="text"
          value={quantityNote}
          onChange={(e) => setQuantityNote(e.target.value)}
          placeholder="e.g. 6 ice-cube portions"
        />
      </Field>

      <Field label="Total servings (optional)" htmlFor="storage-add-servings">
        <Input
          id="storage-add-servings"
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={servingsTotal}
          onChange={(e) => setServingsTotal(e.target.value)}
          placeholder="e.g. 6"
        />
      </Field>

      <Field label="Best by (optional)" htmlFor="storage-add-best-by">
        <DateField id="storage-add-best-by" value={bestBy} onChange={setBestBy} allowFuture title="Best by" />
      </Field>

      <Field label="Notes (optional)" htmlFor="storage-add-notes">
        <Textarea
          id="storage-add-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. from the batch we made Sunday"
        />
      </Field>

      {createItem.isError && <p className="text-xs text-[var(--color-danger)]">Couldn't save that — try again.</p>}

      {/* Add only (item 257): the page's header X is the way out. */}
      <Button type="submit" disabled={createItem.isPending} className="w-full">
        {createItem.isPending ? "Adding…" : "Add to storage"}
      </Button>
    </form>
  );
}
