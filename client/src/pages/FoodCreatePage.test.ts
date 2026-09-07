import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { FoodCreatePage } from "./FoodCreatePage.js";

function render(entry: string) {
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(MemoryRouter, { initialEntries: [entry] }, createElement(FoodCreatePage, null)),
    ),
  );
}

describe("FoodCreatePage", () => {
  it("renders the full-screen add-food page with back navigation and the form", () => {
    const html = render("/foods/new");
    expect(html).toContain(">Back<");
    expect(html).toContain("Add food");
    expect(html).toContain(">Name<");
    expect(html).toContain(">Category<");
    expect(html).toContain(">Save<");
    expect(html).toContain(">Cancel<");
  });

  it("prefills the name from ?name=, the way the no-results empty state links here", () => {
    expect(render("/foods/new?name=Kale%20chips")).toContain('value="Kale chips"');
  });

  it("starts with an empty name when no ?name= was passed", () => {
    expect(render("/foods/new")).toContain('value=""');
  });

  it("scopes its control ids so nothing collides with another form", () => {
    const html = render("/foods/new");
    expect(html).toContain('id="food-new-name"');
    expect(html).toContain('for="food-new-name"');
  });
});
