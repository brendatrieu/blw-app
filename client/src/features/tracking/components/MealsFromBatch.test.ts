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

describe("MealsFromBatch reaction (items 148, 1146)", () => {
  it("labels a reaction meal 'Reaction' on its row; the note itself waits in the sheet", () => {
    const html = renderWithMeals([meal({ reactionNote: "mild rash around mouth" })]);
    expect(html).toContain(">Reaction</span>");
    expect(html).not.toContain("mild rash around mouth");
  });

  it("no label when there is no reaction", () => {
    expect(renderWithMeals([meal({})])).not.toContain("Reaction");
  });

  it("never shows the general note on the row", () => {
    expect(renderWithMeals([meal({ notes: "ate the whole thing" })])).not.toContain("ate the whole thing");
  });
});

describe("MealsFromBatch rows (ledgers 966, 1146): the Food log's own one-line row", () => {
  it("each meal is a Food log row: a tap opens its sheet (no edit link), ⋮ Actions above it, never the old meal page", () => {
    const html = renderWithMeals([meal({ id: "meal-7" })]);
    expect(html).toContain('<button type="button" aria-haspopup="dialog"');
    expect(html).not.toContain('href="/log-meal?edit=meal-7"');
    expect(html).not.toContain('href="/meals/meal-7"');
    // Ledger 1152a: named after the meal, as on Home.
    expect(html).toMatch(/aria-label="[^"]+ actions"/);
    expect(html).not.toContain('aria-label="Actions"');
    expect(html).toMatch(/<li class="app-card relative flex flex-col rounded-\[var\(--radius-lg\)\] border /); // the card glass (ledger 1083)
    expect(html).toMatch(/title="From storage"[^>]*>📦/);
    expect(html).toContain('<span class="flex h-[34px] items-center gap-2">');
  });

  it("no stars on the row, even for a rated item (the sheet has them)", () => {
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
    expect(html).not.toContain("Rated 4 stars");
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
    expect(html).toContain('Banana bread<span class="font-normal text-[var(--color-text-muted)]">\u00a0(deleted)</span>, Avocado</span>');
    expect(html.match(/\(deleted\)/g)).toHaveLength(1);
  });
});
