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

  // The Vit C badge must carry the SUNSHINE tone specifically — a tone swap
  // to "primary" (Iron focus's tone) reads fine by text alone, so this pins
  // the actual class the tone maps to.
  it("gives the Vit C badge the sunshine tone's classes, not just its text", () => {
    const html = renderPage([favorite({ vitaminCHigh: true })]);
    expect(html).toMatch(
      /class="[^"]*bg-\[var\(--color-caution-soft\)\][^"]*text-\[var\(--color-caution-soft-text\)\][^"]*"[^>]*>Vit C</,
    );
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
