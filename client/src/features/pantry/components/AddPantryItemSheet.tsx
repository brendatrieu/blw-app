import { useState } from "react";
import type { PantryLocation } from "@blw/shared";
import { useFoods } from "../../catalog/hooks.js";
import { useFavorites } from "../../tracking/hooks.js";
import { getFoodEmoji } from "../../catalog/foodEmoji.js";
import { useCreatePantryItem } from "../hooks.js";
import { LOCATIONS, toDateTimeLocal } from "../format.js";
import { Field } from "../../../components/ui/Field.js";
import { Input } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Button } from "../../../components/ui/Button.js";
import { Card } from "../../../components/ui/Card.js";

type Source = "food" | "recipe" | "label";

const SOURCE_TABS: { value: Source; label: string }[] = [
  { value: "food", label: "From a food" },
  { value: "recipe", label: "From a recipe" },
  { value: "label", label: "Free-form" },
];

interface AddPantryItemSheetProps {
  onDone: () => void;
}

export function AddPantryItemSheet({ onDone }: AddPantryItemSheetProps) {
  const [source, setSource] = useState<Source>("food");
  const [foodId, setFoodId] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [label, setLabel] = useState("");
  const [location, setLocation] = useState<PantryLocation>("fridge");
  const [preparedAt, setPreparedAt] = useState(() => toDateTimeLocal(new Date()));
  const [quantityNote, setQuantityNote] = useState("");

  const { data: foodsData, isLoading: foodsLoading } = useFoods();
  // There's no standalone "list recipes" endpoint, so favorited recipes —
  // the set a parent has already chosen to come back to — double as the
  // recipe picker's source list.
  const { data: favoritesData, isLoading: favoritesLoading } = useFavorites();
  const createItem = useCreatePantryItem();

  const foods = foodsData?.foods ?? [];
  const favorites = favoritesData?.items ?? [];

  const canSubmit = source === "food" ? Boolean(foodId) : source === "recipe" ? Boolean(recipeId) : label.trim().length > 0;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    createItem.mutate(
      {
        foodId: source === "food" ? foodId : undefined,
        recipeId: source === "recipe" ? recipeId : undefined,
        label: source === "label" ? label.trim() : undefined,
        preparedAt: new Date(preparedAt).toISOString(),
        location,
        quantityNote: quantityNote.trim() || undefined,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <Card as="form" onSubmit={handleSubmit} padding="sm" className="flex flex-col gap-3">
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
          <Select id="pantry-add-food" required value={foodId} onChange={(e) => setFoodId(e.target.value)}>
            <option value="" disabled>
              {foodsLoading ? "Loading foods…" : "Select a food"}
            </option>
            {foods.map((food) => (
              <option key={food.id} value={food.id}>
                {getFoodEmoji(food.slug, food.category)} {food.name}
              </option>
            ))}
          </Select>
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
        <Input
          id="pantry-add-prepared"
          type="datetime-local"
          value={preparedAt}
          max={toDateTimeLocal(new Date())}
          onChange={(e) => setPreparedAt(e.target.value)}
        />
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
    </Card>
  );
}
