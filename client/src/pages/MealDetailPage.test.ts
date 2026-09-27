import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby, FoodListItem, MealItem } from "@blw/shared";
import { babyKeys } from "../features/babies/api.js";
import { catalogKeys } from "../features/catalog/hooks.js";
import { trackingKeys } from "../features/tracking/hooks.js";
import { MealDetailPage } from "./MealDetailPage.js";

// `MealDetailPage` reads `:id` via `useParams`, which only resolves inside a
// matching `<Route>` — see `StorageDetailPage.test.ts` for the same idiom.
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
    { id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", storageItemId: "storage-1" },
    { id: "food-2", slug: "chicken", name: "Chicken", category: "protein", storageItemId: null },
  ],
};

function seededClient(meals: MealItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(babyKeys.list(false), [BABY]);
  queryClient.setQueryData([...trackingKeys.meals(BABY.id), { limit: 100 }], { items: meals });
  return queryClient;
}

function renderMeal(meal: MealItem, foodsList?: FoodListItem[]) {
  const queryClient = seededClient([meal]);
  if (foodsList) queryClient.setQueryData(catalogKeys.foodsList({}), { foods: foodsList });
  return renderToString(createElement(QueryClientProvider, { client: queryClient }, renderAtMealDetailRoute(meal.id)));
}

/** The page header's h1, React's SSR text separators removed. */
function headingOf(html: string): string {
  return /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1]!.replace(/<!-- -->/g, "");
}

const MUTED_MARK = '<span class="font-normal text-[var(--color-text-muted)]">\u00a0(deleted)</span>';

describe("MealDetailPage title", () => {
  it("uses the recipe title when the meal has one", () => {
    expect(headingOf(renderMeal({ ...MEAL, recipeId: "r1", recipeTitle: "Iron-Rich Purée" }))).toContain(
      "Iron-Rich Purée",
    );
  });

  it("falls back to a comma-joined foods summary otherwise", () => {
    expect(headingOf(renderMeal(MEAL))).toContain("Avocado, Chicken");
  });

  // Ledger 555: the title and the food chip carry the ONE muted mark.
  it("marks a deleted food, muted, in the title and on its chip", () => {
    const meal: MealItem = { ...MEAL, foods: [{ ...MEAL.foods[0]!, deleted: true }, MEAL.foods[1]!] };
    const html = renderMeal(meal);
    expect(headingOf(html)).toContain(`Avocado${MUTED_MARK}, Chicken`);
    const chipRow = html.slice(html.indexOf('class="flex flex-wrap items-center gap-1.5"')).replace(/<!-- -->/g, "");
    expect(chipRow).toContain(`Avocado${MUTED_MARK}`);
    expect(chipRow).not.toContain(`Chicken${MUTED_MARK}`);
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

  it("renders the found meal's foods, served time, notes, and a storage provenance link", () => {
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([MEAL]) }, renderAtMealDetailRoute(MEAL.id)),
    );

    expect(html).toContain("Avocado");
    expect(html).toContain("Chicken");
    expect(html).toContain("ate the whole thing");
    expect(html).toMatch(/2:05\s?PM/);
    expect(html).toContain(`href="/storage/${MEAL.foods[0]!.storageItemId}"`);
    // Only the first food is storage-linked; the second has no provenance link.
    expect((html.match(/href="\/storage\//g) ?? []).length).toBe(1);
  });

  it("omits the storage provenance link when no food in the meal has a storageItemId", () => {
    const noBatch: MealItem = { ...MEAL, foods: MEAL.foods.map((food) => ({ ...food, storageItemId: null })) };
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([noBatch]) }, renderAtMealDetailRoute(noBatch.id)),
    );
    expect(html).not.toContain('href="/storage/');
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

// Item 334: the report was "salmon isn't triggering the fish badge", and the
// person who made it had "added it to a meal" — this page (and the picker)
// is where they would have looked. Ledger 554: the allergens ride on the
// meal's own foods, NOT the foods list, which hides a deleted food.
describe("MealDetailPage allergen marks (item 334, ledger 554)", () => {
  const FISH_MEAL: MealItem = {
    ...MEAL,
    foods: [
      { id: "food-1", slug: "salmon", name: "Salmon", category: "protein", storageItemId: null, allergens: ["fish"] },
      { id: "food-2", slug: "pear", name: "Pear", category: "fruit", storageItemId: null, allergens: [] },
    ],
  };

  it("marks the food that carries an allergen, and only that one", () => {
    const html = renderMeal(FISH_MEAL);
    // Scoped to the food-chip row: the page title is "Salmon, Pear" too, so
    // a whole-document index comparison would be meaningless.
    const chipRow = html.slice(html.indexOf('class="flex flex-wrap items-center gap-1.5"'));
    expect(chipRow).toContain("Fish");
    expect(chipRow.indexOf("Fish")).toBeGreaterThan(chipRow.indexOf("Salmon"));
    expect(chipRow.indexOf("Fish")).toBeLessThan(chipRow.indexOf("Pear"));
    // `--color-danger-contrast` is the badge tone and nothing else on the
    // page (the Delete control only uses `--color-danger` on hover).
    expect((html.match(/var\(--color-danger-contrast\)/g) ?? []).length).toBe(1);
  });

  it("shows the meal exactly as before when an older cached body carries no allergens", () => {
    const html = renderMeal({ ...FISH_MEAL, foods: FISH_MEAL.foods.map(({ allergens: _a, ...food }) => food) });
    expect(html).toContain("Salmon");
    expect(html).toContain("Pear");
    expect(html).not.toContain("var(--color-danger-contrast)");
    expect(html).not.toContain("Fish");
  });

  it("keeps a DELETED food's allergen chip, though the foods list no longer has it", () => {
    const meal: MealItem = {
      ...MEAL,
      foods: [
        {
          id: "food-9",
          slug: "nans-omelette-k3f9q1",
          name: "Nan's omelette",
          category: "protein",
          storageItemId: null,
          deleted: true,
          allergens: ["egg"],
        },
      ],
    };
    // The cached list is what the pickers see: the deleted food is absent.
    const html = renderMeal(meal, []);
    const chipRow = html.slice(html.indexOf('class="flex flex-wrap items-center gap-1.5"'));
    expect(chipRow).toContain("Egg");
  });
});

describe("MealDetailPage ratings (item 574)", () => {
  it("shows one star row per food ABOVE the reaction note", () => {
    const html = renderMeal({
      ...MEAL,
      reactionNote: "rash",
      foods: [{ ...MEAL.foods[0]!, rating: 5 }, MEAL.foods[1]!],
    });
    const stars = html.indexOf("Rating (optional)");
    expect(stars).toBeGreaterThan(-1);
    expect(stars).toBeLessThan(html.indexOf("Reaction:"));
    expect(html).toContain('aria-label="Rating for Avocado"');
    expect(html).toContain('aria-label="Rating for Chicken"');
    expect(html).toMatch(/aria-checked="true" aria-label="5 stars"/);
  });

  it("shows one row, for the recipe, on a recipe meal", () => {
    const html = renderMeal({ ...MEAL, recipeId: "r1", recipeTitle: "Iron-Rich Purée", recipeRating: 3 });
    expect(html.match(/role="radiogroup"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Rating for Iron-Rich Purée"');
    expect(html).toMatch(/aria-checked="true" aria-label="3 stars"/);
  });
});
