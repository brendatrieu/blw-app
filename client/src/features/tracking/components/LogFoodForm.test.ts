import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FavoriteItem, FoodListItem, MealItem } from "@blw/shared";
import { CelebrationProvider } from "../../../components/ui/Celebration.js";
import { trackingKeys } from "../hooks.js";
import { LogFoodForm, resolveMealSubmit, type MealSubmitInput } from "./LogFoodForm.js";

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
    expect(html).toContain("Reaction note (optional)");
    expect(html).toContain("Notes (optional)");
    expect(html).toContain(">Save<");
    expect(html).toContain(">Cancel<");
  });

  it("disables the submit (Save) button while zero foods are selected", () => {
    const html = renderWithProviders(createElement(LogFoodForm, { babyId: "baby-1", onDone: () => {} }));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled[^>]*>Save</);
  });

  it("pins the 'Recipe (optional)' select as always present", () => {
    const html = renderWithProviders(createElement(LogFoodForm, { babyId: "baby-1", onDone: () => {} }));
    expect(html).toContain("Recipe (optional)");
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
