import { useState } from "react";
import type { PantryLocation } from "@blw/shared";
import { useFavorites } from "../../tracking/hooks.js";
import { FoodPicker } from "../../catalog/components/FoodPicker.js";
import { useCreatePantryItem } from "../hooks.js";
import { LOCATIONS } from "../format.js";
import { Field } from "../../../components/ui/Field.js";
import { Input, Textarea } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { DateField } from "../../../components/ui/DateField.js";
import { Button } from "../../../components/ui/Button.js";
import { useSubmitValidation, type FormErrors } from "../../../lib/forms.js";

type Source = "food" | "recipe" | "label";

/** One key per source tab: only the visible tab's field can ever error. */
export type AddPantryItemField = Source;
export type AddPantryItemErrors = FormErrors<AddPantryItemField>;

/** Visual field order — what a failed submit focuses first (item 235). */
export const ADD_PANTRY_ITEM_FIELD_ORDER: readonly AddPantryItemField[] = ["food", "recipe", "label"];

export interface AddPantryItemValues {
  source: Source;
  foodIds: string[];
  recipeId: string;
  label: string;
}

/**
 * The add-to-pantry form's required-field rules (item 235). What is required
 * depends on the source tab, and only the tab on screen is judged — a food id
 * left over from a tab the parent has moved away from is not an error, and is
 * not sent either. Location defaults to "fridge" and Prepared is seeded with
 * the current minute, so neither can be empty.
 *
 * An empty object means valid — same reading as `validateCustomFood`.
 */
export function validateAddPantryItem(values: AddPantryItemValues): AddPantryItemErrors {
  const errors: AddPantryItemErrors = {};
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

const SOURCE_TABS: { value: Source; label: string }[] = [
  { value: "food", label: "From a food" },
  { value: "recipe", label: "From a recipe" },
  { value: "label", label: "Free-form" },
];

interface AddPantryItemFormProps {
  onDone: () => void;
}

/**
 * The pantry "add" form, byte-compatible with the one that used to live in
 * the inline AddPantryItemSheet: same source tabs, food combobox, recipe
 * select, location segments, wheel "Prepared" field, and quantity note.
 * Now rendered full-screen by PantryAddPage, which supplies `onDone` for
 * both a successful save and Cancel.
 */
export function AddPantryItemForm({ onDone }: AddPantryItemFormProps) {
  const [source, setSource] = useState<Source>("food");
  const [foodIds, setFoodIds] = useState<string[]>([]);
  const [recipeId, setRecipeId] = useState("");
  const [label, setLabel] = useState("");
  const [location, setLocation] = useState<PantryLocation>("fridge");
  const [preparedAt, setPreparedAt] = useState(() => nowAtMinute());
  const [quantityNote, setQuantityNote] = useState("");
  const [servingsTotal, setServingsTotal] = useState("");
  const [bestBy, setBestBy] = useState("");
  const [notes, setNotes] = useState("");

  // There's no standalone "list recipes" endpoint, so favorited recipes —
  // the set a parent has already chosen to come back to — double as the
  // recipe picker's source list.
  const { data: favoritesData, isLoading: favoritesLoading } = useFavorites();
  const createItem = useCreatePantryItem();

  const favorites = favoritesData?.items ?? [];

  // Item 235: "Add to pantry" stays enabled, the missing answer shows under
  // whichever source field is on screen, and a failed submit focuses it.
  const { errors: shownErrors, attemptSubmit } = useSubmitValidation(
    { source, foodIds, recipeId, label },
    validateAddPantryItem,
    ADD_PANTRY_ITEM_FIELD_ORDER,
    { food: "pantry-add-food", recipe: "pantry-add-recipe", label: "pantry-add-label" },
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
        <Field label="Food" htmlFor="pantry-add-food" error={shownErrors.food}>
          <FoodPicker id="pantry-add-food" value={foodIds} onChange={setFoodIds} />
        </Field>
      )}

      {source === "recipe" && (
        <Field label="Recipe" htmlFor="pantry-add-recipe" error={shownErrors.recipe}>
          {!favoritesLoading && favorites.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              No favorited recipes yet — favorite one from its recipe page first.
            </p>
          ) : (
            <Select id="pantry-add-recipe" required value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
              <option value="" disabled>
                {favoritesLoading ? "Loading recipes…" : "Select a recipe"}
              </option>
              {favorites.map((recipe) => (
                <option key={recipe.recipeId} value={recipe.recipeId}>
                  {recipe.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {source === "label" && (
        <Field label="What is it?" htmlFor="pantry-add-label" error={shownErrors.label}>
          <Input
            id="pantry-add-label"
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

      <Field label="Prepared" htmlFor="pantry-add-prepared">
        <DateTimeField id="pantry-add-prepared" value={preparedAt} onChange={setPreparedAt} />
      </Field>

      <Field label="Quantity note (optional)" htmlFor="pantry-add-note">
        <Input
          id="pantry-add-note"
          type="text"
          value={quantityNote}
          onChange={(e) => setQuantityNote(e.target.value)}
          placeholder="e.g. 6 ice-cube portions"
        />
      </Field>

      <Field label="Total servings (optional)" htmlFor="pantry-add-servings">
        <Input
          id="pantry-add-servings"
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={servingsTotal}
          onChange={(e) => setServingsTotal(e.target.value)}
          placeholder="e.g. 6"
        />
      </Field>

      <Field label="Best by (optional)" htmlFor="pantry-add-best-by">
        <DateField id="pantry-add-best-by" value={bestBy} onChange={setBestBy} allowFuture title="Best by" />
      </Field>

      <Field label="Notes (optional)" htmlFor="pantry-add-notes">
        <Textarea
          id="pantry-add-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. from the batch we made Sunday"
        />
      </Field>

      {createItem.isError && <p className="text-xs text-[var(--color-danger)]">Couldn't save that — try again.</p>}

      {/* Add only (item 257): the page's header X is the way out. */}
      <Button type="submit" disabled={createItem.isPending} className="w-full">
        {createItem.isPending ? "Adding…" : "Add to pantry"}
      </Button>
    </form>
  );
}
