import { useState } from "react";
import type { PantryLocation } from "@blw/shared";
import { useFoods } from "../../catalog/hooks.js";
import { useFavorites } from "../../tracking/hooks.js";
import { useCreatePantryItem } from "../hooks.js";
import { LOCATIONS, toDateTimeLocal } from "../format.js";

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
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
    >
      <div className="flex gap-1.5">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSource(tab.value)}
            aria-pressed={source === tab.value}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">Food</span>
          <select
            required
            value={foodId}
            onChange={(e) => setFoodId(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
          >
            <option value="" disabled>
              {foodsLoading ? "Loading foods…" : "Select a food"}
            </option>
            {foods.map((food) => (
              <option key={food.id} value={food.id}>
                {food.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {source === "recipe" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">Recipe</span>
          {!favoritesLoading && favorites.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              No favorited recipes yet — favorite one from its recipe page first.
            </p>
          ) : (
            <select
              required
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
            >
              <option value="" disabled>
                {favoritesLoading ? "Loading recipes…" : "Select a recipe"}
              </option>
              {favorites.map((recipe) => (
                <option key={recipe.recipeId} value={recipe.recipeId}>
                  {recipe.title}
                </option>
              ))}
            </select>
          )}
        </label>
      )}

      {source === "label" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">What is it?</span>
          <input
            type="text"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Leftover lentil soup"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
          />
        </label>
      )}

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
                  : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
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
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Quantity note (optional)</span>
        <input
          type="text"
          value={quantityNote}
          onChange={(e) => setQuantityNote(e.target.value)}
          placeholder="e.g. 6 ice-cube portions"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
        />
      </label>

      {createItem.isError && <p className="text-xs text-[var(--color-danger)]">Couldn't save that — try again.</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit || createItem.isPending}
          className="flex-1 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createItem.isPending ? "Adding…" : "Add to pantry"}
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
