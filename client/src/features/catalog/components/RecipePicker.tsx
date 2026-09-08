import { useMemo } from "react";
import type { RecipeListItem } from "@blw/shared";
import { useRecipes } from "../hooks.js";
import {
  MultiCombobox,
  resolveSingleSelection,
  type MultiComboboxOption,
} from "../../../components/ui/MultiCombobox.js";

/**
 * The recipe list as picker options, favorites first (item 213).
 *
 * The server already returns recipes by title; sorting only on `isFavorite`
 * — a stable sort — therefore floats the favorited ones to the top while
 * leaving both groups alphabetical, without a second comparison. The 💛
 * marks exactly the rows that got moved, so the reordering reads as
 * intentional rather than random. Pure, and exported so the ordering rule is
 * pinned by a test rather than by a `.sort()` buried in a component.
 */
export function recipePickerOptions(recipes: RecipeListItem[]): MultiComboboxOption[] {
  return [...recipes]
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))
    .map((recipe) => ({
      value: recipe.id,
      label: recipe.title,
      ...(recipe.isFavorite ? { emoji: "💛" } : {}),
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
 * Single-select is `MultiCombobox` in `mode="single"`, driven through
 * `resolveSingleSelection`: picking a second recipe replaces the first, and
 * toggling the current one off clears the field (the "None" option the old
 * select needed). Single mode is also what closes the menu on a pick (item
 * 230) — there is no second recipe to type.
 */
export function RecipePicker({ id, value, onChange }: RecipePickerProps) {
  const { data, isLoading } = useRecipes();
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
