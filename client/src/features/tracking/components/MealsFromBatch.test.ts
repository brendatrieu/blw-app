import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { MealItem } from "@blw/shared";
import { trackingKeys } from "../hooks.js";
import { MealsFromBatch } from "./MealsFromBatch.js";

const BABY_ID = "baby-1";
const FRIDGE_ITEM_ID = "fridge-1";

function meal(overrides: Partial<MealItem>): MealItem {
  return {
    id: "meal-1",
    babyId: BABY_ID,
    servedAt: "2026-08-20T10:00:00.000Z",
    reactionNote: null,
    notes: null,
    recipeId: null,
    recipeTitle: null,
    foods: [{ id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", fridgeItemId: FRIDGE_ITEM_ID }],
    ...overrides,
  };
}

function renderWithMeals(meals: MealItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData([...trackingKeys.meals(BABY_ID), { limit: 100 }], { items: meals });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, null, createElement(MealsFromBatch, { babyId: BABY_ID, fridgeItemId: FRIDGE_ITEM_ID })),
    ),
  );
}

describe("MealsFromBatch reactionNote (item 148)", () => {
  it("shows the reaction note distinctly, matching MealCard's 'Reaction:' idiom", () => {
    const html = renderWithMeals([meal({ reactionNote: "mild rash around mouth" })]);
    expect(html).toContain("Reaction: ");
    expect(html).toContain("mild rash around mouth");
  });

  it("omits the reaction note line when absent", () => {
    const html = renderWithMeals([meal({})]);
    expect(html).not.toContain("Reaction:");
  });

  it("shows both a general note and a reaction note distinctly, general note unprefixed", () => {
    const html = renderWithMeals([meal({ notes: "ate the whole thing", reactionNote: "mild rash" })]);
    expect(html).toContain("ate the whole thing");
    expect(html).toContain("Reaction: ");
    expect(html).toContain("mild rash");
    expect(html).not.toMatch(/Reaction:\s*ate the whole thing/);
  });
});

describe("MealsFromBatch tap-through link (item 164)", () => {
  it("links each row to /meals/:id", () => {
    const html = renderWithMeals([meal({ id: "meal-7" })]);
    expect(html).toContain('href="/meals/meal-7"');
  });
});
