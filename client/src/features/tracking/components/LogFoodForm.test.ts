import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FavoriteItem, FoodListItem, MealItem } from "@blw/shared";
import { CelebrationProvider } from "../../../components/ui/Celebration.js";
import { trackingKeys } from "../hooks.js";
import {
  buildLeftoverPantryInput,
  LeftoversFields,
  LogFoodForm,
  resolveLeftoverSource,
  resolveMealSubmit,
  type MealSubmitInput,
  type ResolvedLeftoverSource,
  resolveSubmitAction,
} from "./LogFoodForm.js";

function renderWithProviders(element: ReactElement, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return renderToString(
    createElement(QueryClientProvider, { client: queryClient }, createElement(CelebrationProvider, null, element)),
  );
}

describe("LogFoodForm (render)", () => {
  it("renders the same fields the quick-log form always has", () => {
    const html = renderWithProviders(createElement(LogFoodForm, { babyId: "baby-1", onDone: () => {} }));
    expect(html).toContain(">Food<");
    expect(html).toContain(">When<");
    expect(html).toMatch(/Reaction note(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/Notes(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toContain(">Save<");
    expect(html).toContain(">Cancel<");
  });

  it("disables the submit (Save) button while zero foods are selected", () => {
    const html = renderWithProviders(createElement(LogFoodForm, { babyId: "baby-1", onDone: () => {} }));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled[^>]*>Save</);
  });

  // Item 152/154: create mode always renders the collapsed "+ Save leftovers
  // to pantry" toggle (disabled at zero selected foods — the edge case none
  // of the three `resolveLeftoverSource` branches can resolve usefully), and
  // never renders any of the expanded fields until it's tapped open.
  it("renders the collapsed leftovers toggle, disabled while no foods are selected, with no expanded fields", () => {
    const html = renderWithProviders(createElement(LogFoodForm, { babyId: "baby-1", onDone: () => {} }));
    // A borderless switch row — disabled until a food is picked.
    expect(html).toMatch(/role="switch"[^>]*aria-checked="false"[^>]*disabled/);
    expect(html).toContain("Save leftovers to pantry");
    expect(html).not.toContain("Total servings");
    expect(html).not.toContain("Best by");
    expect(html).not.toContain("Which food?");
  });

  // Item 152: the toggle is create-mode only — edit mode (a `meal` prop
  // present) must never offer to save leftovers for an already-logged meal.
  it("renders NO leftovers toggle at all in edit mode", () => {
    const meal: MealItem = {
      id: "meal-1",
      babyId: "baby-1",
      servedAt: new Date(2026, 7, 20, 8, 30).toISOString(),
      reactionNote: null,
      notes: null,
      recipeId: null,
      recipeTitle: null,
      foods: [{ id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", pantryItemId: null }],
    };
    const html = renderWithProviders(createElement(LogFoodForm, { babyId: "baby-1", meal, onDone: () => {} }));
    expect(html).not.toContain("Save leftovers to pantry");
  });

  it("pins the 'Recipe (optional)' select as always present", () => {
    const html = renderWithProviders(createElement(LogFoodForm, { babyId: "baby-1", onDone: () => {} }));
    expect(html).toMatch(/Recipe(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
  });

  it("prefills edit mode from the meal fixture: food chips, note text, and recipe selection", () => {
    const food1: FoodListItem = {
      id: "food-1",
      slug: "avocado",
      name: "Avocado",
      category: "fruit",
      ironLevel: "low",
      vitaminCLevel: "moderate",
      chokingRisk: "moderate",
      minAgeMonths: 6,
      allergens: [],
      isCustom: false,
      emoji: null,
    };
    const food2: FoodListItem = {
      id: "food-2",
      slug: "chicken",
      name: "Chicken",
      category: "protein",
      ironLevel: "high",
      vitaminCLevel: "low",
      chokingRisk: "moderate",
      minAgeMonths: 6,
      allergens: [],
      isCustom: false,
      emoji: null,
    };
    const favorite: FavoriteItem = {
      recipeId: "recipe-1",
      title: "Iron-Rich Purée",
      minAgeMonths: 6,
      ironFocus: true,
      allergens: [],
    };
    const meal: MealItem = {
      id: "meal-1",
      babyId: "baby-1",
      servedAt: new Date(2026, 7, 20, 8, 30).toISOString(),
      reactionNote: "mild rash around mouth",
      notes: "NOTES-FIXTURE distinct from any placeholder",
      recipeId: favorite.recipeId,
      recipeTitle: favorite.title,
      foods: [
        { id: food1.id, slug: food1.slug, name: food1.name, category: food1.category, pantryItemId: null },
        { id: food2.id, slug: food2.slug, name: food2.name, category: food2.category, pantryItemId: null },
      ],
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["foods", {}], { foods: [food1, food2] });
    queryClient.setQueryData(trackingKeys.favorites, { items: [favorite] });

    const html = renderWithProviders(
      createElement(LogFoodForm, { babyId: "baby-1", meal, onDone: () => {} }),
      queryClient,
    );

    // Selected food chips (emoji + name), matched against the seeded foods cache.
    expect(html).toContain(food1.name);
    expect(html).toContain(food2.name);
    // Reaction note and general note both prefilled verbatim, into distinct fields.
    expect(html).toContain(meal.reactionNote as string);
    expect(html).toContain(meal.notes as string);
    // Recipe select shows the meal's recipe as the chosen <option> (node-env
    // SSR renders the matching option with a `selected` attribute).
    expect(html).toMatch(new RegExp(`<option[^>]*value="${favorite.recipeId}"[^>]*selected[^>]*>${favorite.title}<`));
  });
});

describe("resolveMealSubmit", () => {
  const input: MealSubmitInput = {
    foodIds: ["food-1"],
    recipeId: null,
    servedAt: "2026-08-20T08:30:00.000Z",
    reactionNote: null,
    notes: null,
  };

  it("resolves to create when no meal id is given", () => {
    expect(resolveMealSubmit(undefined, input)).toEqual({ kind: "create", input });
  });

  it("resolves to update, carrying the id and the input verbatim, when a meal id is given", () => {
    expect(resolveMealSubmit("meal-1", input)).toEqual({ kind: "update", id: "meal-1", input });
  });

  // Guards against a handler that collapses to "always create": with a real
  // meal id present, the result must be the "update" branch, not "create".
  it("never resolves to create when a meal id is present (kills an always-create mutant)", () => {
    const result = resolveMealSubmit("some-id", input);
    expect(result.kind).not.toBe("create");
    expect(result.kind).toBe("update");
  });
});

describe("resolveLeftoverSource", () => {
  it("resolves to the recipe when one is selected, regardless of how many foods are also selected", () => {
    expect(resolveLeftoverSource("recipe-1", ["food-1", "food-2", "food-3"])).toEqual({ kind: "recipe" });
  });

  it("resolves to the single food when no recipe is selected and exactly one food is", () => {
    expect(resolveLeftoverSource(null, ["food-1"])).toEqual({ kind: "food", foodId: "food-1" });
  });

  it("resolves to 'choose' when no recipe is selected and several foods are", () => {
    expect(resolveLeftoverSource(null, ["food-1", "food-2"])).toEqual({ kind: "choose" });
  });

  // Edge case backing the toggle's disabled-at-zero-foods state: there is no
  // sensible source to infer, so it falls through to "choose" (which the
  // component never actually renders a picker for, since the toggle itself
  // is disabled — see the LogFoodForm render test above).
  it("resolves to 'choose' at zero selected foods and no recipe (the disabled-toggle edge case)", () => {
    expect(resolveLeftoverSource(null, [])).toEqual({ kind: "choose" });
  });

  // Kills a mutant that ignores recipeId and branches on foodIds alone.
  it("never resolves to 'food' or 'choose' when a recipe is selected, even with zero foods", () => {
    const result = resolveLeftoverSource("recipe-1", []);
    expect(result.kind).toBe("recipe");
  });

  // Kills a mutant that always returns "choose" regardless of foodIds.length.
  it("never resolves to 'choose' when exactly one food is selected and no recipe", () => {
    const result = resolveLeftoverSource(null, ["food-1"]);
    expect(result.kind).not.toBe("choose");
    expect(result).toEqual({ kind: "food", foodId: "food-1" });
  });
});

describe("buildLeftoverPantryInput", () => {
  const preparedAt = new Date(2026, 7, 26, 10, 36);

  it("builds a recipe-sourced payload: recipeId present, foodIds absent", () => {
    const source: ResolvedLeftoverSource = { kind: "recipe", recipeId: "recipe-1" };
    const result = buildLeftoverPantryInput(source, "freezer", "", "", preparedAt);
    expect(result).toEqual({
      recipeId: "recipe-1",
      location: "freezer",
      preparedAt: preparedAt.toISOString(),
      servingsTotal: undefined,
      bestBy: undefined,
    });
    expect(result).not.toHaveProperty("foodIds");
  });

  it("builds a food-sourced payload: foodIds: [foodId] present, recipeId absent", () => {
    const source: ResolvedLeftoverSource = { kind: "food", foodId: "food-1" };
    const result = buildLeftoverPantryInput(source, "fridge", "", "", preparedAt);
    expect(result).toEqual({
      foodIds: ["food-1"],
      location: "fridge",
      preparedAt: preparedAt.toISOString(),
      servingsTotal: undefined,
      bestBy: undefined,
    });
    expect(result).not.toHaveProperty("recipeId");
  });

  it("parses a non-blank servingsTotal to a number and passes bestBy through", () => {
    const source: ResolvedLeftoverSource = { kind: "food", foodId: "food-1" };
    const result = buildLeftoverPantryInput(source, "counter", "6", "2026-09-10", preparedAt);
    expect(result.servingsTotal).toBe(6);
    expect(result.bestBy).toBe("2026-09-10");
  });

  it("treats a blank/whitespace servingsTotal as omitted, not zero or NaN", () => {
    const source: ResolvedLeftoverSource = { kind: "food", foodId: "food-1" };
    const result = buildLeftoverPantryInput(source, "fridge", "   ", "", preparedAt);
    expect(result.servingsTotal).toBeUndefined();
  });

  // notes/quantityNote are never auto-copied from the meal — kills a mutant
  // that sends them as "" or null instead of omitting the keys entirely.
  it("never includes notes or quantityNote", () => {
    const source: ResolvedLeftoverSource = { kind: "recipe", recipeId: "recipe-1" };
    const result = buildLeftoverPantryInput(source, "fridge", "", "", preparedAt);
    expect(result).not.toHaveProperty("notes");
    expect(result).not.toHaveProperty("quantityNote");
  });
});

describe("LeftoversFields (render)", () => {
  const baseProps = {
    selectedFoodOptions: [
      { value: "food-1", label: "Avocado", emoji: "🥑" },
      { value: "food-2", label: "Chicken", emoji: "🍗" },
    ],
    chosenFoodId: "food-1",
    onChosenFoodIdChange: () => {},
    location: "fridge" as const,
    onLocationChange: () => {},
    servingsTotal: "",
    onServingsTotalChange: () => {},
    bestBy: "",
    onBestByChange: () => {},
  };

  it("renders the location segments, servings, and best-by fields for every source kind", () => {
    const html = renderToString(createElement(LeftoversFields, { ...baseProps, source: { kind: "recipe" } }));
    expect(html).toContain("Location");
    expect(html).toMatch(/Total servings(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/Best by(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
  });

  it("hides the 'Which food?' select when the source is a recipe", () => {
    const html = renderToString(createElement(LeftoversFields, { ...baseProps, source: { kind: "recipe" } }));
    expect(html).not.toContain("Which food?");
  });

  it("hides the 'Which food?' select when the source is a single resolved food", () => {
    const html = renderToString(
      createElement(LeftoversFields, { ...baseProps, source: { kind: "food", foodId: "food-1" } }),
    );
    expect(html).not.toContain("Which food?");
  });

  it("shows the 'Which food?' select, with each selected food's emoji and name, when the source is ambiguous", () => {
    const html = renderToString(createElement(LeftoversFields, { ...baseProps, source: { kind: "choose" } }));
    expect(html).toContain("Which food?");
    expect(html).toMatch(/<option[^>]*value="food-1"[^>]*>🥑\s*(?:<!-- -->)?\s*Avocado</);
    expect(html).toMatch(/<option[^>]*value="food-2"[^>]*>🍗\s*(?:<!-- -->)?\s*Chicken</);
  });
});

describe("resolveSubmitAction (no-double-meal guard)", () => {
  it("allows create only before any meal has been saved", () => {
    expect(resolveSubmitAction(false, false)).toBe("create");
    expect(resolveSubmitAction(false, true)).toBe("create");
  });

  it("NEVER returns create once the meal is saved (kills the double-meal mutant)", () => {
    expect(resolveSubmitAction(true, true)).toBe("retry-pantry");
    expect(resolveSubmitAction(true, false)).toBe("noop");
  });
});

describe("buildLeftoverPantryInput default preparedAt", () => {
  it("minute-truncates the default preparedAt (seconds and ms are zero)", () => {
    const input = buildLeftoverPantryInput({ kind: "food", foodId: "f-1" }, "fridge", "", "");
    const prepared = new Date(input.preparedAt!);
    expect(prepared.getSeconds()).toBe(0);
    expect(prepared.getMilliseconds()).toBe(0);
  });
});

describe("initialFoodIds prefill (log meal from a food page)", () => {
  const avocado: FoodListItem = { id: "food-1", slug: "avocado", name: "Avocado", category: "fruit" } as FoodListItem;
  const banana: FoodListItem = { id: "food-2", slug: "banana", name: "Banana", category: "fruit" } as FoodListItem;

  function seededClient() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["foods", {}], { foods: [avocado, banana] });
    return queryClient;
  }

  it("seeds the picker with the given food as a removable chip", () => {
    const html = renderWithProviders(
      createElement(LogFoodForm, { babyId: "baby-1", initialFoodIds: [avocado.id], onDone: () => {} }),
      seededClient(),
    );
    expect(html).toContain('aria-label="Remove Avocado"');
  });

  it("edit mode ignores initialFoodIds — the meal's own foods win", () => {
    const meal: MealItem = {
      id: "meal-1",
      babyId: "baby-1",
      servedAt: new Date(2026, 7, 20, 8, 30).toISOString(),
      reactionNote: null,
      notes: null,
      recipeId: null,
      recipeTitle: null,
      foods: [{ id: avocado.id, slug: avocado.slug, name: avocado.name, category: avocado.category, pantryItemId: null }],
    };
    const html = renderWithProviders(
      createElement(LogFoodForm, { babyId: "baby-1", meal, initialFoodIds: [banana.id], onDone: () => {} }),
      seededClient(),
    );
    expect(html).toContain('aria-label="Remove Avocado"');
    expect(html).not.toContain('aria-label="Remove Banana"');
  });
});
