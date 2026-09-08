import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RecipeListItem } from "@blw/shared";
import { catalogKeys } from "../hooks.js";
import { NoRecipesEmptyState, RecipeCard, RecipesSegment } from "./RecipesSegment.js";

function recipe(overrides: Partial<RecipeListItem> = {}): RecipeListItem {
  return {
    id: "recipe-1",
    slug: "banana-porridge",
    title: "Banana porridge",
    minAgeMonths: 6,
    ironFocus: false,
    allergens: [],
    isCustom: false,
    isFavorite: false,
    ingredientNames: ["Banana", "Oats"],
    ...overrides,
  };
}

function renderCard(item: RecipeListItem) {
  return renderToString(createElement(MemoryRouter, null, createElement(RecipeCard, { recipe: item })));
}

/** The recipes list as the segment's default (unfiltered) query holds it. */
function renderSegment(recipes?: RecipeListItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (recipes) queryClient.setQueryData(catalogKeys.recipesList({ scope: "all" }), { recipes });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, null, createElement(RecipesSegment, null)),
    ),
  );
}

describe("RecipeCard", () => {
  it("links the whole row to the recipe and names its ingredients", () => {
    const html = renderCard(recipe());
    expect(html).toContain('href="/recipes/recipe-1"');
    expect(html).toContain("Banana porridge");
    expect(html).toContain("Banana, Oats");
  });

  it("always carries the minimum-age badge", () => {
    // SSR splits the interpolation with a comment node.
    expect(renderCard(recipe({ minAgeMonths: 9 }))).toMatch(/>9(?:<!-- -->)?m\+</);
  });

  it("badges iron focus, custom ownership and each allergen", () => {
    const html = renderCard(recipe({ ironFocus: true, isCustom: true, allergens: ["peanut", "milk"] }));
    expect(html).toContain(">Iron<");
    expect(html).toContain(">Custom<");
    expect(html).toContain(">Peanut<");
    expect(html).toContain(">Milk<");
  });

  it("carries none of those badges when the recipe has none of those properties", () => {
    const html = renderCard(recipe());
    expect(html).not.toContain(">Iron<");
    expect(html).not.toContain(">Custom<");
  });

  it("marks a favorite decoratively, and only when it is one", () => {
    expect(renderCard(recipe({ isFavorite: true }))).toContain("♥");
    expect(renderCard(recipe())).not.toContain("♥");
  });

  // The row IS the link, so the favorite mark has to stay a span: an
  // interactive element inside an anchor is invalid and untappable.
  it("nests no interactive element inside the card's anchor", () => {
    const html = renderCard(recipe({ isFavorite: true, isCustom: true, allergens: ["milk"] }));
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
  });
});

describe("NoRecipesEmptyState", () => {
  it("offers to write a recipe rather than dead-ending", () => {
    const html = renderToString(createElement(MemoryRouter, null, createElement(NoRecipesEmptyState, null)));
    expect(html).toContain("No recipes match those filters");
    expect(html).toContain('href="/recipes/new"');
    expect(html).toContain(">Add a recipe<");
  });
});

describe("RecipesSegment", () => {
  it("renders the sticky search bar, the scope chips and a closed Filters sheet", () => {
    const html = renderSegment([]);
    expect(html).toContain("var(--header-height)");
    expect(html).toMatch(/class="[^"]*sticky[^"]*"/);
    expect(html).toContain('aria-label="Search recipes"');
    expect(html).toContain('aria-label="Recipe scope"');
    expect(html).toContain(">All<");
    expect(html).toContain(">Favorites<");
    expect(html).toContain(">Custom<");
    expect(html).toContain("Filters");
    // The funnel's contents live in the sheet, closed on arrival.
    expect(html).not.toContain("Contains ingredient");
  });

  it("defaults to the All scope, with nothing else pressed", () => {
    const html = renderSegment([]);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>All</);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Favorites</);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Custom</);
  });

  it("shows skeletons while the list is still loading", () => {
    const html = renderSegment();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading"');
  });

  it("renders a card per recipe once the list resolves", () => {
    const html = renderSegment([recipe(), recipe({ id: "recipe-2", title: "Lentil mash", isCustom: true })]);
    expect(html).toContain('href="/recipes/recipe-1"');
    expect(html).toContain('href="/recipes/recipe-2"');
    expect(html).toContain(">Custom<");
    expect(html).not.toContain("No recipes match those filters");
  });

  it("falls back to the empty state when the list comes back empty", () => {
    const html = renderSegment([]);
    expect(html).toContain("No recipes match those filters");
    expect(html).toContain('href="/recipes/new"');
  });

  it("shows no active-filter pills until a funnel filter is set", () => {
    const html = renderSegment([]);
    expect(html).not.toContain("filter\"");
    expect(html).not.toMatch(/aria-label="Remove [^"]* filter"/);
  });
});
