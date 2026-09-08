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
    expect(html).not.toMatch(/>Back</);
  });

  it("renders the empty custom-recipe form, Save disabled until it's filled in", () => {
    const html = render();
    expect(html).toContain('id="recipe-new-title"');
    expect(html).toContain(">Ingredients<");
    expect(html).toContain(">Steps<");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled[^>]*>Save</);
  });
});
