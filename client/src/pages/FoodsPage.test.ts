import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { addCustomFoodLabel } from "../features/catalog/constants.js";
import { FoodsPage, NoFoodsEmptyState } from "./FoodsPage.js";

/** React's SSR escaping — the create label contains apostrophes. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;");
}

describe("FoodsPage", () => {
  it("renders the sticky filter bar with search input and grouped filter chips, without throwing", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(FoodsPage, null)),
      ),
    );

    // The sticky wrapper is pinned under the app header, independent of load state.
    expect(html).toContain("var(--header-height)");
    expect(html).toMatch(/class="[^"]*sticky[^"]*"/);
    expect(html).toContain('aria-label="Search foods"');
    expect(html).toContain('aria-label="Category"');
    // Allergen/iron/age move into the Filters sheet, closed by default.
    expect(html).toContain("Filters");
    expect(html).not.toContain('aria-label="Allergen"');
  });

  // Item 179: adding a food of your own is a first-class action on this page,
  // not something buried behind an empty state.
  it("offers 'Add food' in the header, linking to the create page", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(FoodsPage, null)),
      ),
    );
    expect(html).toContain('href="/foods/new"');
    expect(html).toContain(">Add food<");
  });
});

describe("NoFoodsEmptyState", () => {
  it("offers to create the searched-for food, carrying the query over as ?name=", () => {
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(NoFoodsEmptyState, { query: "Kale chips" })),
    );
    expect(html).toContain(escapeHtml(addCustomFoodLabel("Kale chips")));
    expect(html).toContain('href="/foods/new?name=Kale%20chips"');
  });

  it("trims the query before both quoting and encoding it", () => {
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(NoFoodsEmptyState, { query: "  Kale chips  " })),
    );
    expect(html).toContain('href="/foods/new?name=Kale%20chips"');
    expect(html).toContain(escapeHtml(addCustomFoodLabel("Kale chips")));
  });

  it("falls back to 'clear a filter' advice when there is no query to name a food after", () => {
    const html = renderToString(createElement(MemoryRouter, null, createElement(NoFoodsEmptyState, { query: "   " })));
    expect(html).toContain("Try clearing a filter or two.");
    expect(html).not.toContain("/foods/new?name=");
    expect(html).not.toContain("as a custom food");
  });
});
