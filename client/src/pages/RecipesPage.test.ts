import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { RecipesPage } from "./RecipesPage.js";

function render(): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: ["/recipes"] }, createElement(RecipesPage, null)),
    ),
  );
}

describe("RecipesPage (item 273)", () => {
  it("heads the page with the recipes title and its 'Add recipe' action", () => {
    const html = render();
    expect(html).toMatch(/<h1[^>]*>.*Recipes<\/h1>/s);
    expect(html).toContain("🍳");
    expect(html).toContain('href="/recipes/new"');
    expect(html).toContain(">Add recipe<");
  });

  it("carries the recipe list's own controls — search, scope chips and the funnel", () => {
    const html = render();
    expect(html).toContain('aria-label="Search recipes"');
    expect(html).toContain('aria-label="Recipe scope"');
    expect(html).toContain(">All<");
    expect(html).toContain(">Favorites<");
    expect(html).toContain(">Custom<");
    expect(html).toContain("Filters");
  });

  it("is the recipe list alone — the foods catalog stayed on /foods", () => {
    const html = render();
    expect(html).not.toContain('aria-label="Search foods"');
    expect(html).not.toContain('aria-label="Category"');
    expect(html).not.toContain('href="/foods/new"');
    // No segmented control any more: /recipes is a route, not a tab of /foods.
    expect(html).not.toContain('role="radiogroup"');
  });
});
