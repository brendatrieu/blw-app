import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FavoriteItem } from "@blw/shared";
import { trackingKeys } from "../features/tracking/hooks.js";
import { FavoritesPage } from "./FavoritesPage.js";

function favorite(overrides: Partial<FavoriteItem> = {}): FavoriteItem {
  return {
    recipeId: "recipe-1",
    title: "Banana porridge",
    minAgeMonths: 6,
    ironFocus: false,
    vitaminCHigh: false,
    fiberHigh: false,
    allergens: [],
    ...overrides,
  };
}

function renderPage(items?: FavoriteItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (items) queryClient.setQueryData(trackingKeys.favorites, { items });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, null, createElement(FavoritesPage, null)),
    ),
  );
}

describe("FavoritesPage", () => {
  it("badges high vitamin C beside iron focus, and neither when the item has neither", () => {
    const both = renderPage([favorite({ ironFocus: true, vitaminCHigh: true })]);
    expect(both).toContain(">Iron focus<");
    expect(both).toContain(">Vit C<");

    const neither = renderPage([favorite({ ironFocus: false, vitaminCHigh: false })]);
    expect(neither).not.toContain(">Iron focus<");
    expect(neither).not.toContain(">Vit C<");
  });

  // Item 637: every nutrient badge wears the one soft nutrient tint (never
  // solid sky); a tone swap reads fine by text alone, so pin the classes.
  it("gives the Vit C badge the one nutrient tint's classes (item 637), not just its text", () => {
    const html = renderPage([favorite({ vitaminCHigh: true })]);
    expect(html).toMatch(
      /class="[^"]*bg-\[var\(--color-primary-soft\)\][^"]*text-\[var\(--color-primary-soft-text\)\][^"]*"[^>]*>Vit C</,
    );
  });

  // Item 279: the third derived nutrition flag, badged "Fiber" on the row.
  it("badges high fiber after vitamin C, and only when the flag is on", () => {
    const on = renderPage([favorite({ ironFocus: true, vitaminCHigh: true, fiberHigh: true })]);
    expect(on).toContain(">Fiber<");
    expect(on.indexOf(">Fiber<")).toBeGreaterThan(on.indexOf(">Vit C<"));
    expect(renderPage([favorite({ fiberHigh: false })])).not.toContain(">Fiber<");
  });

  it("gives the Fiber badge the one nutrient tint's classes (item 637), not just its text", () => {
    const html = renderPage([favorite({ fiberHigh: true })]);
    expect(html).toMatch(
      /class="[^"]*bg-\[var\(--color-primary-soft\)\][^"]*text-\[var\(--color-primary-soft-text\)\][^"]*"[^>]*>Fiber</,
    );
  });

  // Items 636/637: Iron focus is the one nutrient tint (not solid sky) and
  // allergens are the plum pill (not solid red), via the shared AllergenChips.
  it("tints Iron focus as a nutrient and marks allergens with the plum pill", () => {
    const html = renderPage([favorite({ ironFocus: true, allergens: ["peanut"] })]);
    expect(html).toContain('bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]">Iron focus<');
    expect(html).toContain('bg-[var(--color-allergen-soft)] text-[var(--color-allergen-soft-text)]">Peanut<');
    expect(html).not.toContain("--color-danger)");
  });

  it("falls back to the empty state when there are no favorites", () => {
    const html = renderPage([]);
    expect(html).toContain("No favorites yet");
    expect(html).toContain('href="/foods"');
  });

  it("renders a card per favorite, linked to the recipe", () => {
    const html = renderPage([
      favorite(),
      favorite({ recipeId: "recipe-2", title: "Lentil mash", allergens: ["peanut"] }),
    ]);
    expect(html).toContain('href="/recipes/recipe-1"');
    expect(html).toContain('href="/recipes/recipe-2"');
    expect(html).toContain(">Peanut<");
  });
});
