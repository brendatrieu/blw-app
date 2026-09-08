import { useMemo, useState } from "react";
import type { FoodListItem } from "@blw/shared";
import { addCustomFoodLabel } from "../constants.js";
import { getFoodEmoji } from "../foodEmoji.js";
import { useFoods } from "../hooks.js";
import { CustomFoodForm } from "./CustomFoodForm.js";
import {
  MultiCombobox,
  resolveSingleSelection,
  type MultiComboboxOption,
} from "../../../components/ui/MultiCombobox.js";
import { Sheet } from "../../../components/ui/Sheet.js";

/**
 * One food as the picker shows it: the id is what meals and pantry items are
 * saved against, and the emoji is the food's own when it has one (item 177).
 * Exported so the callers that still need the same option shape for their
 * OTHER controls (LogFoodForm's "which food did the leftovers come from?"
 * select) build it identically instead of re-deriving it.
 */
export function foodPickerOption(food: FoodListItem): MultiComboboxOption {
  return { value: food.id, label: food.name, emoji: getFoodEmoji(food.slug, food.category, food.emoji) };
}

interface FoodPickerProps {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * The app's one food multi-select (item 180): the `MultiCombobox` over every
 * visible food, plus the inline "this doesn't exist yet — add it" escape
 * hatch that a search matching nothing offers.
 *
 * Creating from here deliberately never navigates. The surrounding form (log
 * a meal, add a pantry item) can be half-filled with a time, notes and other
 * foods; sending someone to `/foods/new` and back would cost all of it. So
 * the form opens in a `Sheet` over the page, and on save `useCreateCustomFood`
 * has already written the new food into the foods cache — which is what
 * `useFoods()` here reads — so appending its id to `value` selects a food the
 * option list can already resolve to a chip, with no refetch in between.
 */
export function FoodPicker({ id, value, onChange }: FoodPickerProps) {
  const { data, isLoading } = useFoods();
  // null = the sheet is closed; a string (possibly "") = it's open with that
  // name prefilled. Not a boolean + separate query, so the two can't disagree.
  const [createQuery, setCreateQuery] = useState<string | null>(null);

  const foods = data?.foods ?? [];
  const options = useMemo(() => foods.map(foodPickerOption), [foods]);

  return (
    <>
      <MultiCombobox
        id={id}
        options={options}
        value={value}
        onChange={onChange}
        disabled={isLoading}
        placeholder={isLoading ? "Loading foods…" : "Search foods…"}
        onCreate={setCreateQuery}
        createLabel={addCustomFoodLabel}
      />
      <Sheet open={createQuery !== null} onClose={() => setCreateQuery(null)} title="Add a custom food">
        <CustomFoodForm
          idPrefix={`${id}-custom`}
          initialName={createQuery ?? ""}
          onSaved={(food) => {
            setCreateQuery(null);
            // Additive, and guarded: a re-save of an already-selected food
            // must not put its id in the list twice.
            onChange(value.includes(food.id) ? value : [...value, food.id]);
          }}
          onCancel={() => setCreateQuery(null)}
        />
      </Sheet>
    </>
  );
}

interface SingleFoodPickerProps {
  id: string;
  /** "" = nothing picked. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

/**
 * The same searchable food list as `FoodPicker`, holding at most ONE food —
 * the Recipes segment's "Contains ingredient" filter (item 210). There's no
 * create row here on purpose: filtering by a food that doesn't exist yet
 * could only ever match nothing.
 */
export function SingleFoodPicker({ id, value, onChange, placeholder }: SingleFoodPickerProps) {
  const { data, isLoading } = useFoods();
  const foods = data?.foods ?? [];
  const options = useMemo(() => foods.map(foodPickerOption), [foods]);

  return (
    <MultiCombobox
      id={id}
      options={options}
      value={value ? [value] : []}
      onChange={(next) => onChange(resolveSingleSelection(next))}
      disabled={isLoading}
      placeholder={isLoading ? "Loading foods…" : (placeholder ?? "Search foods…")}
    />
  );
}
