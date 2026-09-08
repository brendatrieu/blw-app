import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RecipeListItem } from "@blw/shared";
import { catalogKeys } from "../hooks.js";
import { RecipePicker, recipePickerOptions } from "./RecipePicker.js";

function recipe(overrides: Partial<RecipeListItem> = {}): RecipeListItem {
  return {
    id: "recipe-1",
    slug: "banana-porridge",
    title: "Banana porridge",
    minAgeMonths: 6,
    ironFocus: false,
    allergens: [],
    isCustom: false,
    isFavorite: false,
    ingredientNames: [],
    ...overrides,
  };
}

describe("recipePickerOptions", () => {
  it("selects by recipe id and labels with the title", () => {
    expect(recipePickerOptions([recipe()])).toEqual([{ value: "recipe-1", label: "Banana porridge" }]);
  });

  it("floats favorites to the top, keeping each group in the server's title order", () => {
    const options = recipePickerOptions([
      recipe({ id: "a", title: "Apple mash" }),
      recipe({ id: "b", title: "Beans on toast", isFavorite: true }),
      recipe({ id: "c", title: "Carrot sticks" }),
      recipe({ id: "d", title: "Dhal", isFavorite: true }),
    ]);
    expect(options.map((option) => option.value)).toEqual(["b", "d", "a", "c"]);
  });

  it("marks exactly the favorited rows, so the reordering reads as intentional", () => {
    const options = recipePickerOptions([recipe({ isFavorite: true }), recipe({ id: "recipe-2" })]);
    expect(options[0]!.emoji).toBe("💛");
    expect(options[1]!.emoji).toBeUndefined();
  });

  it("never mutates the list it was given", () => {
    const recipes = [recipe({ id: "a", title: "Apple mash" }), recipe({ id: "b", isFavorite: true })];
    recipePickerOptions(recipes);
    expect(recipes.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("is empty for an empty list", () => {
    expect(recipePickerOptions([])).toEqual([]);
  });
});

function renderPicker(recipes: RecipeListItem[] | undefined, value = "") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (recipes) queryClient.setQueryData(catalogKeys.recipesList({}), { recipes });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(RecipePicker, { id: "log-food-recipe", value, onChange: () => {} }),
    ),
  );
}

describe("RecipePicker (render)", () => {
  it("is a searchable combobox, not a native select", () => {
    const html = renderPicker([recipe()]);
    expect(html).toContain('id="log-food-recipe"');
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain("<select");
  });

  it("shows the selected recipe as its one removable chip", () => {
    const html = renderPicker([recipe(), recipe({ id: "recipe-2", title: "Lentil mash" })], "recipe-2");
    expect(html).toContain('aria-label="Remove Lentil mash"');
    expect(html).not.toContain('aria-label="Remove Banana porridge"');
  });

  it("holds nothing when no recipe is attached", () => {
    const html = renderPicker([recipe()]);
    expect(html).not.toMatch(/aria-label="Remove /);
    expect(html).toContain('placeholder="Search recipes…"');
  });

  it("disables itself while the list is still loading", () => {
    const html = renderPicker(undefined);
    expect(html).toMatch(/<input[^>]*disabled/);
    expect(html).toContain('placeholder="Loading recipes…"');
  });
});
