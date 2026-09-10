import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby, MealItem } from "@blw/shared";
import { babyKeys } from "../features/babies/api.js";
import { trackingKeys } from "../features/tracking/hooks.js";
import { MealDetailPage, mealTitle } from "./MealDetailPage.js";

// `MealDetailPage` reads `:id` via `useParams`, which only resolves inside a
// matching `<Route>` — see `FridgeDetailPage.test.ts` for the same idiom.
function renderAtMealDetailRoute(mealId: string) {
  return createElement(
    MemoryRouter,
    { initialEntries: [`/meals/${mealId}`] },
    createElement(Routes, null, createElement(Route, { path: "/meals/:id", element: createElement(MealDetailPage, null) })),
  );
}

const BABY: Baby = {
  id: "baby-1",
  name: "Baby",
  birthDate: "2026-01-01",
  notes: null,
  archived: false,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MEAL: MealItem = {
  id: "22222222-2222-2222-2222-222222222222",
  babyId: BABY.id,
  servedAt: new Date(2026, 7, 20, 14, 5).toISOString(),
  reactionNote: null,
  notes: "ate the whole thing",
  recipeId: null,
  recipeTitle: null,
  foods: [
    { id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", fridgeItemId: "fridge-1" },
    { id: "food-2", slug: "chicken", name: "Chicken", category: "protein", fridgeItemId: null },
  ],
};

function seededClient(meals: MealItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(babyKeys.list(false), [BABY]);
  queryClient.setQueryData([...trackingKeys.meals(BABY.id), { limit: 100 }], { items: meals });
  return queryClient;
}

describe("mealTitle", () => {
  it("uses the recipe title when the meal has one", () => {
    expect(mealTitle({ ...MEAL, recipeId: "r1", recipeTitle: "Iron-Rich Purée" })).toBe("Iron-Rich Purée");
  });

  it("falls back to a comma-joined foods summary otherwise", () => {
    expect(mealTitle(MEAL)).toBe("Avocado, Chicken");
  });
});

describe("MealDetailPage", () => {
  it("renders the loading state (Back control, skeleton) while the baby/meals are still resolving", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, renderAtMealDetailRoute(MEAL.id)),
    );
    expect(html).toContain("Back");
    expect(html).not.toContain("Avocado");
  });

  it("renders the found meal's foods, served time, notes, and a fridge provenance link", () => {
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([MEAL]) }, renderAtMealDetailRoute(MEAL.id)),
    );

    expect(html).toContain("Avocado");
    expect(html).toContain("Chicken");
    expect(html).toContain("ate the whole thing");
    expect(html).toMatch(/2:05\s?PM/);
    expect(html).toContain(`href="/fridge/${MEAL.foods[0]!.fridgeItemId}"`);
    // Only the first food is fridge-linked; the second has no provenance link.
    expect((html.match(/href="\/fridge\//g) ?? []).length).toBe(1);
  });

  it("omits the fridge provenance link when no food in the meal has a fridgeItemId", () => {
    const noBatch: MealItem = { ...MEAL, foods: MEAL.foods.map((food) => ({ ...food, fridgeItemId: null })) };
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([noBatch]) }, renderAtMealDetailRoute(noBatch.id)),
    );
    expect(html).not.toContain('href="/fridge/');
  });

  it("shows the recipe title and Reaction note, danger-styled, when present", () => {
    const withRecipeAndReaction: MealItem = {
      ...MEAL,
      recipeId: "r1",
      recipeTitle: "Iron-Rich Purée",
      reactionNote: "mild rash around mouth",
    };
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: seededClient([withRecipeAndReaction]) },
        renderAtMealDetailRoute(withRecipeAndReaction.id),
      ),
    );
    expect(html).toContain("🍳");
    expect(html).toContain("Iron-Rich Purée");
    expect(html).toContain("Reaction: ");
    expect(html).toContain("mild rash around mouth");
    expect(html).toContain('text-[var(--color-danger)]">Reaction:');
  });

  it("redirects home when the id isn't among the resolved meals — even with OTHER meals cached", () => {
    // A non-empty cache is the load-bearing part: an "always resolve the
    // first meal" mutant renders MEAL here and fails these assertions.
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([MEAL]) }, renderAtMealDetailRoute("missing-id")),
    );
    expect(html).not.toContain("Avocado");
    expect(html).not.toContain("Back");
  });

  it("does not link its own summary back to /meals/:id (no self-link)", () => {
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([MEAL]) }, renderAtMealDetailRoute(MEAL.id)),
    );
    expect(html).not.toContain(`href="/meals/${MEAL.id}"`);
  });

  it("offers Edit (to /log-meal?edit=:id) and Delete actions", () => {
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([MEAL]) }, renderAtMealDetailRoute(MEAL.id)),
    );
    expect(html).toContain(`href="/log-meal?edit=${MEAL.id}"`);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Delete<\/button>/);
  });
});
