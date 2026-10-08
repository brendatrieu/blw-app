import { useMemo, useState } from "react";
import type { FoodListItem, StorageItem } from "@blw/shared";
import { Button } from "../../../components/ui/Button.js";
import { MultiCombobox } from "../../../components/ui/MultiCombobox.js";
import { SegmentedControl, type SegmentedControlOption } from "../../../components/ui/SegmentedControl.js";
import { Sheet } from "../../../components/ui/Sheet.js";
import { FoodPicker } from "../../catalog/components/FoodPicker.js";
import { FoodPlate } from "../../catalog/components/FoodPlate.js";
import { recipePickerOptions } from "../../catalog/components/RecipePicker.js";
import { useFoods, useRecipes } from "../../catalog/hooks.js";
import { isLabelOnly, servePartHint, storageItemTitle } from "../format.js";
import { useStorageItems } from "../hooks.js";
import { storageItemCluster } from "./StorageItemCard.js";

type AddMoreTab = "storage" | "food" | "recipe";

/** Owner-approved segments (2026-10-07). */
export const ADD_MORE_TABS: SegmentedControlOption<AddMoreTab>[] = [
  { value: "storage", label: "From storage", icon: null },
  { value: "food", label: "A food", icon: null },
  { value: "recipe", label: "A recipe", icon: null },
];

/** What Add more hands back: containers, and fresh foods and recipes. */
export interface AddMorePicks {
  items: StorageItem[];
  foods: FoodListItem[];
  recipes: { id: string; title: string }[];
}

/**
 * The containers "From storage" lists (items 730/760): active, servable (a
 * Free-form label has nothing to log) and not already in the Serving list.
 */
export function addMoreStorageItems(items: readonly StorageItem[], servingIds: readonly string[]): StorageItem[] {
  return items.filter((item) => item.status === "active" && !isLabelOnly(item) && !servingIds.includes(item.id));
}

/** The picks in the order they were made, resolved against what is loaded. */
function resolvePicks<T extends { id: string }>(ids: readonly string[], list: readonly T[]): T[] {
  return ids.flatMap((id) => list.find((entry) => entry.id === id) ?? []);
}

interface AddMoreSheetProps {
  /** The containers already in the Serving list. */
  servingIds: readonly string[];
  onAdd: (picks: AddMorePicks) => void;
  onClose: () => void;
}

/**
 * The Serve sheet's "Add more" (MR-Add-More, ledger 760): tick containers
 * "From storage", or pick "A food" or "A recipe" that was made fresh, then
 * "Add". Picks on every segment are kept until Add, so a parent can tick a
 * container and pick a fresh food in one go. Rendered only while open, so
 * every opening starts empty.
 */
export function AddMoreSheet({ servingIds, onAdd, onClose }: AddMoreSheetProps) {
  const [tab, setTab] = useState<AddMoreTab>("storage");
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [foodIds, setFoodIds] = useState<string[]>([]);
  const [recipeIds, setRecipeIds] = useState<string[]>([]);
  const storage = useStorageItems("active");
  const foods = useFoods();
  // `fresh` like Log meal's picker (item 353): a recipe written moments ago
  // must be pickable now.
  const recipes = useRecipes({}, { fresh: true });
  const recipeOptions = useMemo(() => recipePickerOptions(recipes.data?.recipes ?? []), [recipes.data]);
  const available = addMoreStorageItems(storage.data?.items ?? [], servingIds);
  const pickedCount = itemIds.length + foodIds.length + recipeIds.length;

  return (
    <Sheet open onClose={onClose} title="Add more" showClose>
      <SegmentedControl aria-label="Add more" options={ADD_MORE_TABS} value={tab} onChange={setTab} />

      {tab === "storage" &&
        (available.length > 0 ? (
          <ul className="flex flex-col">
            {available.map((item) => (
              <li key={item.id} className="border-t border-[var(--color-divider)] first:border-t-0">
                <label className="flex min-h-14 cursor-pointer items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    checked={itemIds.includes(item.id)}
                    onChange={(event) =>
                      setItemIds((current) =>
                        event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                      )
                    }
                    className="size-6 shrink-0 accent-[var(--color-accent)]"
                  />
                  <FoodPlate {...storageItemCluster(item).plates[0]!} size={40} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold text-[var(--color-text)]">{storageItemTitle(item)}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{servePartHint(item)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : storage.isLoading ? null : (
          <p className="text-sm text-[var(--color-text-muted)]">Nothing else in storage to add.</p>
        ))}

      {/* Inline: a floating list would be clipped by this scrolling sheet
          (the delete question's "Replace with…" does the same, item 610). */}
      {tab === "food" && <FoodPicker id="add-more-food" value={foodIds} onChange={setFoodIds} inline />}

      {tab === "recipe" && (
        <MultiCombobox
          id="add-more-recipe"
          inline
          options={recipeOptions}
          value={recipeIds}
          onChange={setRecipeIds}
          disabled={recipes.isLoading}
          placeholder={recipes.isLoading ? "Loading recipes…" : "Search recipes…"}
          emptyMessage="No recipes match"
        />
      )}

      <Button
        type="button"
        className="w-full"
        disabled={pickedCount === 0}
        onClick={() =>
          onAdd({
            items: resolvePicks(itemIds, available),
            foods: resolvePicks(foodIds, foods.data?.foods ?? []),
            recipes: resolvePicks(recipeIds, recipes.data?.recipes ?? []).map(({ id, title }) => ({ id, title })),
          })
        }
      >
        Add
      </Button>
    </Sheet>
  );
}
