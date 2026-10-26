// Add more's ticks as plain data (ledger 878, native-ready): what opens
// ticked, when Done may apply, and the change Done hands back. The plate
// (features/plate/plate.ts) applies that change; the sheet only holds state
// and renders.
import type { FoodListItem, StorageItem } from "@blw/shared";
import { storageItemTitle } from "./format.js";

/** A fresh food: what its row and the request need. */
export type FreshFood = Pick<FoodListItem, "id" | "slug" | "name" | "category" | "emoji">;

/** A fresh recipe (owner 2026-10-07): made now, not from storage. */
export interface FreshRecipe {
  id: string;
  title: string;
}

/** Ticked rows in Add more, by kind: containers, fresh recipes, fresh foods.
 * It opens with everything on the plate ticked (ledger 878). */
export interface AddMoreIds {
  itemIds: readonly string[];
  recipeIds: readonly string[];
  foodIds: readonly string[];
}

/** What Done applies: the ticks taken off, and the new picks resolved. */
export interface AddMoreChange {
  removed: AddMoreIds;
  items: StorageItem[];
  foods: FreshFood[];
  recipes: FreshRecipe[];
}

/** A container's recipes: every recipe of a leftovers container (ledger 753), else its one recipe. */
export function containerRecipes(item: StorageItem): FreshRecipe[] {
  if (item.recipes && item.recipes.length > 0) return item.recipes;
  return item.recipeId ? [{ id: item.recipeId, title: item.recipeTitle ?? storageItemTitle(item) }] : [];
}

const minus = (a: readonly string[], b: readonly string[]) => a.filter((id) => !b.includes(id));

/** The ticks added and taken off since Add more opened. */
export function addMoreDiff(serving: AddMoreIds, ticks: AddMoreIds): { added: AddMoreIds; removed: AddMoreIds } {
  const diff = (from: AddMoreIds, to: AddMoreIds) => ({
    itemIds: minus(to.itemIds, from.itemIds),
    recipeIds: minus(to.recipeIds, from.recipeIds),
    foodIds: minus(to.foodIds, from.foodIds),
  });
  return { added: diff(serving, ticks), removed: diff(ticks, serving) };
}

/** No container ticked: Serve needs one, so there Done waits and says why (ledger 878b). */
export const addMoreNeedsContainer = (ticks: AddMoreIds): boolean => ticks.itemIds.length === 0;

/**
 * Done is enabled only when it would change the plate, so it never looks
 * like it did something it didn't; and, on Serve (`requireContainer`), only
 * while a container stays ticked (`addMoreNeedsContainer`).
 */
export function addMoreCanApply(serving: AddMoreIds, ticks: AddMoreIds, requireContainer: boolean): boolean {
  const { added, removed } = addMoreDiff(serving, ticks);
  const changed = [added, removed].some((ids) => ids.itemIds.length + ids.recipeIds.length + ids.foodIds.length > 0);
  return changed && !(requireContainer && addMoreNeedsContainer(ticks));
}
