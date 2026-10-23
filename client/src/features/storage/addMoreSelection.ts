// The Serve sheet's Serving list and its "Add more" ticks as plain data
// (ledger 878, native-ready): what opens ticked, when Done may apply, and the
// change Done makes to the list. The components only hold state and render.
import type { FoodListItem, StorageItem } from "@blw/shared";
import { storageItemTitle } from "./format.js";

/** One container in the Serving list and how many servings it gives. */
export interface ServePart {
  item: StorageItem;
  servings: number;
}

/** A fresh food: what its row and the request need. */
export type FreshFood = Pick<FoodListItem, "id" | "slug" | "name" | "category" | "emoji">;

/** A fresh recipe (owner 2026-10-07): made now, not from storage. */
export interface FreshRecipe {
  id: string;
  title: string;
}

/** The Serving list: containers, then fresh foods and fresh recipes. */
export interface ServingList {
  parts: ServePart[];
  freshFoods: FreshFood[];
  freshRecipes: FreshRecipe[];
}

/** Ticked rows in Add more, by kind: containers, fresh recipes, fresh foods. */
export interface AddMoreIds {
  itemIds: readonly string[];
  recipeIds: readonly string[];
  foodIds: readonly string[];
}

/**
 * What Add more opens with (ledger 878): the Serving list's containers, fresh
 * recipes and fresh foods, all ticked; and what the listed containers already
 * hold, which is never offered as a row (ledger 793), so a container's recipe
 * cannot be added fresh beside it.
 */
export interface AddMoreServing extends AddMoreIds {
  covered: { recipeIds: readonly string[]; foodIds: readonly string[] };
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

/**
 * What the containers already serve: their recipes, and the foods of a
 * container with no recipe. A recipe container's foods are its ingredients,
 * so they stay addable as fresh foods.
 */
function coveredBy(parts: readonly ServePart[]): AddMoreServing["covered"] {
  return {
    recipeIds: parts.flatMap((part) => containerRecipes(part.item).map((recipe) => recipe.id)),
    foodIds: parts.filter((part) => containerRecipes(part.item).length === 0).flatMap((part) => part.item.foods.map((food) => food.id)),
  };
}

export function addMoreServing({ parts, freshFoods, freshRecipes }: ServingList): AddMoreServing {
  return {
    itemIds: parts.map((part) => part.item.id),
    recipeIds: freshRecipes.map((recipe) => recipe.id),
    foodIds: freshFoods.map((food) => food.id),
    covered: coveredBy(parts),
  };
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

/**
 * Done is enabled only when it would change the Serving list, so it never
 * looks like it did something it didn't; and only while a container stays
 * ticked, since a serve needs one (the server's `parts.min(1)`).
 */
export function addMoreCanApply(serving: AddMoreIds, ticks: AddMoreIds): boolean {
  const { added, removed } = addMoreDiff(serving, ticks);
  const changed = [added, removed].some((ids) => ids.itemIds.length + ids.recipeIds.length + ids.foodIds.length > 0);
  return changed && ticks.itemIds.length > 0;
}

/**
 * Done on the Serving list: unticked things come off (as the list's own ✕
 * takes them), new picks go on as Add put them (a container at 1 serving,
 * after the ones listed), and the rest is untouched, servings included. A
 * listed container replaces the same thing fresh, whichever came first
 * (ledger 793).
 */
export function applyAddMore(list: ServingList, change: AddMoreChange): ServingList {
  const merge = <T extends { id: string }>(current: readonly T[], removed: readonly string[], added: readonly T[]) => [
    ...current.filter((entry) => !removed.includes(entry.id)),
    ...added.filter((entry) => !current.some((existing) => existing.id === entry.id)),
  ];
  const kept = list.parts.filter((part) => !change.removed.itemIds.includes(part.item.id));
  const parts = [
    ...kept,
    ...change.items.filter((item) => !list.parts.some((part) => part.item.id === item.id)).map((item) => ({ item, servings: 1 })),
  ];
  const covered = coveredBy(parts);
  return {
    parts,
    freshFoods: merge(list.freshFoods, change.removed.foodIds, change.foods).filter((food) => !covered.foodIds.includes(food.id)),
    freshRecipes: merge(list.freshRecipes, change.removed.recipeIds, change.recipes).filter(
      (recipe) => !covered.recipeIds.includes(recipe.id),
    ),
  };
}
