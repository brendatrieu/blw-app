import { useMemo } from "react";
import type { RecipeListItem } from "@blw/shared";
import { useRecipes } from "../hooks.js";
import {
  MultiCombobox,
  resolveSingleSelection,
  type MultiComboboxOption,
} from "../../../components/ui/MultiCombobox.js";

/**
 * Where a recipe sits in the picker: the parent's own recipes first, then
 * their favorites, then the rest of the catalog (item 353).
 *
 * The complaint this answers was "you can't look up custom recipes when you
 * log a meal" — they were always in the list, just sunk alphabetically among
 * 123 catalog titles with nothing marking them. Own recipes are the ones a
 * parent typed in themselves and therefore the ones they come looking for, so
 * they outrank even a favorite; a custom recipe that is ALSO favorited is
 * still a custom recipe and stays in the first group.
 */
function recipePickerRank(recipe: RecipeListItem): number {
  if (recipe.isCustom) return 0;
  if (recipe.isFavorite) return 1;
  return 2;
}

/**
 * The recipe list as picker options: own recipes, then favorites, then the
 * rest (items 213, 353).
 *
 * The server already returns recipes by title, and `Array.prototype.sort` is
 * stable, so sorting on the group rank ALONE leaves every group in
 * alphabetical order without a second comparison — do not add a title
 * tiebreak, it would only re-derive what the input already guarantees.
 *
 * Each group carries its own mark, so the reordering reads as intentional
 * rather than random: `markers: ["Custom"]` on the parent's own recipes (the
 * chip `MultiCombobox` renders in both the menu row and the selected chip),
 * the 💛 emoji on favorites — including a favorited custom recipe, where the
 * two marks say two different things. Pure, and exported so the ordering rule
 * is pinned by a test rather than by a `.sort()` buried in a component.
 */
export function recipePickerOptions(recipes: RecipeListItem[]): MultiComboboxOption[] {
  return [...recipes]
    .sort((a, b) => recipePickerRank(a) - recipePickerRank(b))
    .map((recipe) => ({
      value: recipe.id,
      label: recipe.title,
      ...(recipe.isFavorite ? { emoji: "💛" } : {}),
      ...(recipe.isCustom ? { markers: [{ label: "Custom", tone: "neutral" as const }] } : {}),
    }));
}

interface RecipePickerProps {
  id: string;
  /** "" = no recipe attached. */
  value: string;
  onChange: (next: string) => void;
}

/**
 * Searchable single-select over every recipe the parent can see — the
 * catalog plus their own (item 213). It replaced a native `<select>` of
 * *favorited* recipes only, which quietly made a just-written custom recipe
 * unloggable until it had been favorited first.
 *
 * The list is read with `fresh: true` (item 353): a recipe written moments
 * ago on another device must be pickable the moment this sheet opens, and the
 * shared five-minute `staleTime` could otherwise hide it for five minutes.
 * Same query key, so the Recipes tab keeps its cache — only this observer
 * refetches on mount.
 *
 * Single-select is `MultiCombobox` in `mode="single"`, driven through
 * `resolveSingleSelection`: picking a second recipe replaces the first, and
 * toggling the current one off clears the field (the "None" option the old
 * select needed). Single mode is also what closes the menu on a pick (item
 * 230) — there is no second recipe to type.
 */
export function RecipePicker({ id, value, onChange }: RecipePickerProps) {
  const { data, isLoading } = useRecipes({}, { fresh: true });
  const recipes = data?.recipes ?? [];
  const options = useMemo(() => recipePickerOptions(recipes), [recipes]);

  return (
    <MultiCombobox
      id={id}
      mode="single"
      options={options}
      value={value ? [value] : []}
      onChange={(next) => onChange(resolveSingleSelection(next))}
      disabled={isLoading}
      placeholder={isLoading ? "Loading recipes…" : "Search recipes…"}
      emptyMessage="No recipes match"
    />
  );
}
