import { useMemo, useState } from "react";
import type { PantryLocation } from "@blw/shared";
import { useFoods } from "../../catalog/hooks.js";
import { useFavorites } from "../../tracking/hooks.js";
import { getFoodEmoji } from "../../catalog/foodEmoji.js";
import { useCreatePantryItem } from "../hooks.js";
import { LOCATIONS } from "../format.js";
import { Field } from "../../../components/ui/Field.js";
import { Input } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { MultiCombobox, type MultiComboboxOption } from "../../../components/ui/MultiCombobox.js";
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { Button } from "../../../components/ui/Button.js";

type Source = "food" | "recipe" | "label";

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

  const { data: foodsData, isLoading: foodsLoading } = useFoods();
  // There's no standalone "list recipes" endpoint, so favorited recipes —
  // the set a parent has already chosen to come back to — double as the
  // recipe picker's source list.
  const { data: favoritesData, isLoading: favoritesLoading } = useFavorites();
  const createItem = useCreatePantryItem();

  const foods = foodsData?.foods ?? [];
  const favorites = favoritesData?.items ?? [];

  const foodOptions: MultiComboboxOption[] = useMemo(
    () => foods.map((food) => ({ value: food.id, label: food.name, emoji: getFoodEmoji(food.slug, food.category) })),
    [foods],
  );

  const canSubmit =
    source === "food" ? foodIds.length > 0 : source === "recipe" ? Boolean(recipeId) : label.trim().length > 0;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    createItem.mutate(
      {
        foodIds: source === "food" ? foodIds : undefined,
        recipeId: source === "recipe" ? recipeId : undefined,
        label: source === "label" ? label.trim() : undefined,
        preparedAt: preparedAt.toISOString(),
        location,
        quantityNote: quantityNote.trim() || undefined,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
        <Field label="Food" htmlFor="pantry-add-food">
          <MultiCombobox
            id="pantry-add-food"
            options={foodOptions}
            value={foodIds}
            onChange={setFoodIds}
            disabled={foodsLoading}
            placeholder={foodsLoading ? "Loading foods…" : "Search foods…"}
          />
        </Field>
      )}

      {source === "recipe" && (
        <Field label="Recipe" htmlFor="pantry-add-recipe">
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
        <Field label="What is it?" htmlFor="pantry-add-label">
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

      {createItem.isError && <p className="text-xs text-[var(--color-danger)]">Couldn't save that — try again.</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={!canSubmit || createItem.isPending} className="flex-1">
          {createItem.isPending ? "Adding…" : "Add to pantry"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
