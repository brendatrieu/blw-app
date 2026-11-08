import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { MealItem } from "@blw/shared";
import { trackingKeys } from "../hooks.js";
import { MealsFromBatch } from "./MealsFromBatch.js";

const BABY_ID = "baby-1";
const STORAGE_ITEM_ID = "storage-1";

function meal(overrides: Partial<MealItem>): MealItem {
  return {
    id: "meal-1",
    babyId: BABY_ID,
    servedAt: "2026-08-20T10:00:00.000Z",
    reactionNote: null,
    notes: null,
    recipeId: null,
    recipeTitle: null,
    foods: [{ id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", storageItemId: STORAGE_ITEM_ID }],
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
      createElement(MemoryRouter, null, createElement(MealsFromBatch, { babyId: BABY_ID, storageItemId: STORAGE_ITEM_ID })),
    ),
  );
}

describe("MealsFromBatch heading (item 704)", () => {
  it("is exactly 'Meals from this batch', with no '(recent meals)' qualifier", () => {
    const html = renderWithMeals([meal({})]);
    expect(html).toContain('<h2 class="font-h2 text-[var(--color-text)]">Meals from this batch</h2>');
    expect(html).not.toContain("recent meals");
  });
});

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

describe("MealsFromBatch cards (ledger 966): the Food log's own card", () => {
  it("each meal is a Food log card: the whole card opens its Edit, ⋮ Actions above it, never the old meal page", () => {
    const html = renderWithMeals([meal({ id: "meal-7" })]);
    expect(html).toContain('href="/log-meal?edit=meal-7"');
    expect(html).not.toContain('href="/meals/meal-7"');
    expect(html).toContain('aria-label="Actions"');
    expect(html).toMatch(/<li class="relative flex flex-col rounded-\[var\(--radius-lg\)\] border/);
    expect(html).toMatch(/📦 (?:<!-- -->)?From storage/);
  });

  it("shows each rated item's stars, read-only, as the Food log does", () => {
    const html = renderWithMeals([
      meal({
        items: [
          {
            kind: "storage",
            storageItemId: STORAGE_ITEM_ID,
            label: null,
            location: "fridge",
            servings: 1,
            parts: [{ kind: "food", id: "item-1", food: { id: "food-1", slug: "avocado", name: "Avocado", category: "fruit" }, rating: 4 }],
          },
        ],
      }),
    ]);
    expect(html).toContain('role="img" aria-label="Rated 4 stars"');
    expect(html).not.toContain('role="radio"');
  });
});

describe("MealsFromBatch deleted food (ledger 543/555)", () => {
  it("marks a food its owner deleted with the one muted mark, and only that one", () => {
    const html = renderWithMeals([
      meal({
        foods: [
          { id: "food-9", slug: "banana-bread-k3f9q1", name: "Banana bread", category: "grain", storageItemId: STORAGE_ITEM_ID, deleted: true },
          { id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", storageItemId: STORAGE_ITEM_ID },
        ],
      }),
    ]).replace(/<!-- -->/g, "");
    expect(html).toContain('Banana bread<span class="font-normal text-[var(--color-text-muted)]">\u00a0(deleted)</span></span>');
    expect(html).toContain(">Avocado</span>");
    expect(html.match(/\(deleted\)/g)).toHaveLength(1);
  });
});
