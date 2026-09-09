import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { RecipeCreatePage } from "./RecipeCreatePage.js";

function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: ["/recipes/new"] },
        createElement(RecipeCreatePage, null),
      ),
    ),
  );
}

describe("RecipeCreatePage", () => {
  it("is a full-screen action page: header X, no back chevron", () => {
    const html = render();
    expect(html).toContain("Add recipe");
    expect(html).toContain('aria-label="Close"');
    // Item 258: a page shows the X or the chevron, never both.
    expect(html).not.toContain('<span class="sr-only">Back</span>');
    // …and the X sits in the header's LEFT leading slot, before the title.
    expect(html.indexOf('aria-label="Close"')).toBeLessThan(html.indexOf("</h1>"));
  });

  // Item 235: Save is enabled from the first render — an empty form's Save
  // has to produce "Title is required", not silence.
  it("renders the empty custom-recipe form with Save enabled and nothing shouted yet", () => {
    const html = render();
    expect(html).toContain('id="recipe-new-title"');
    expect(html).toContain(">Ingredients<");
    // Steps are optional since item 240, and the label says so.
    expect(html).toMatch(/Steps(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Save</);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Save</);
    expect(html).not.toContain("Title is required");
  });
});
