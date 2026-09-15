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
    vitaminCHigh: false,
    fiberHigh: false,
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

  // The ordering table (item 353). Input is in the server's title order, as it
  // always is; the expectation is the three groups, each still alphabetical.
  // "Beetroot mash" is the case that decides the rule: it is BOTH the parent's
  // own recipe and a favorite, and own-recipes wins — a parent hunting for the
  // thing they typed in should not have to remember whether they starred it.
  it("orders own recipes first, then favorites, then the rest — alphabetical inside each group", () => {
    const options = recipePickerOptions([
      recipe({ id: "apple", title: "Apple mash" }),
      recipe({ id: "beans", title: "Beans on toast", isFavorite: true }),
      recipe({ id: "beetroot", title: "Beetroot mash", isCustom: true, isFavorite: true }),
      recipe({ id: "carrot", title: "Carrot sticks" }),
      recipe({ id: "dhal", title: "Dhal", isFavorite: true }),
      recipe({ id: "egg", title: "Egg fingers", isCustom: true }),
    ]);
    expect(options.map((option) => option.value)).toEqual([
      "beetroot",
      "egg", // own recipes, alphabetical
      "beans",
      "dhal", // favorites, alphabetical
      "apple",
      "carrot", // the rest, alphabetical
    ]);
  });

  it("marks exactly the own recipes with a Custom chip", () => {
    const options = recipePickerOptions([
      recipe({ id: "mine", isCustom: true }),
      recipe({ id: "starred", isFavorite: true }),
      recipe({ id: "catalog" }),
    ]);
    expect(options.map((option) => option.markers)).toEqual([[{ label: "Custom", tone: "neutral" }], undefined, undefined]);
  });

  it("keeps 💛 on every favorite, including a favorited own recipe", () => {
    const options = recipePickerOptions([
      recipe({ id: "mine", isCustom: true, isFavorite: true }),
      recipe({ id: "plain-mine", isCustom: true }),
      recipe({ id: "starred", isFavorite: true }),
      recipe({ id: "catalog" }),
    ]);
    expect(options.map((option) => option.emoji)).toEqual(["💛", undefined, "💛", undefined]);
    // The two marks say two different things and both survive on one row.
    expect(options[0]!.markers).toEqual([{ label: "Custom", tone: "neutral" }]);
  });

  it("never mutates the list it was given", () => {
    const recipes = [recipe({ id: "a", title: "Apple mash" }), recipe({ id: "b", isCustom: true })];
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

  // Single-select (item 230): a pick closes the menu, so the chevron is how a
  // reopened menu gets closed again without picking. Server-render can only
  // ever produce the closed field, so this pins the affordance, not the state.
  it("keeps the chevron toggle as its own close affordance", () => {
    const html = renderPicker([recipe()]);
    expect(html).toContain('aria-label="Show options"');
  });

  // The picker's `mode="single"` is what makes a pick close the menu (item
  // 230). A closed server render can't show the menu closing, but it CAN show
  // the multi-select count badge — which single mode doesn't render. So this
  // is the assertion that fails the moment `mode="single"` is dropped and the
  // recipe field silently goes back to behaving like a multi-select.
  it("asks for single-select mode: one recipe, so no 'N selected' count badge", () => {
    const html = renderPicker([recipe(), recipe({ id: "recipe-2", title: "Lentil mash" })], "recipe-2");
    expect(html).toContain('aria-label="Remove Lentil mash"');
    expect(html).not.toContain("selected</span>");
    expect(html).not.toContain('aria-describedby="log-food-recipe-count"');
  });

  // Markers render on the menu row AND on the selected chip; a server render
  // only ever produces the closed field, so the chip is where the Custom mark
  // is visible to this suite.
  it("carries the Custom mark onto the selected chip", () => {
    const html = renderPicker(
      [recipe({ id: "recipe-2", title: "Beef and bell pepper", isCustom: true })],
      "recipe-2",
    );
    expect(html).toContain("Custom");
  });

  it("leaves a catalog recipe's chip unmarked", () => {
    const html = renderPicker([recipe()], "recipe-1");
    expect(html).not.toContain("Custom");
  });

  it("disables itself while the list is still loading", () => {
    const html = renderPicker(undefined);
    expect(html).toMatch(/<input[^>]*disabled/);
    expect(html).toContain('placeholder="Loading recipes…"');
  });
});
