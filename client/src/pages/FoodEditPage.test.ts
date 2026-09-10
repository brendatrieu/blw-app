import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FoodDetail } from "@blw/shared";
import { catalogKeys } from "../features/catalog/hooks.js";
import { FoodEditPage } from "./FoodEditPage.js";

function food(overrides: Partial<FoodDetail> = {}): FoodDetail {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "banana-bread-k3f9q1",
    name: "Banana bread",
    category: "grain",
    ironLevel: "low",
    vitaminCLevel: "low",
    fiberLevel: "low",
    chokingRisk: "low",
    minAgeMonths: 6,
    allergens: ["wheat"],
    isCustom: true,
    emoji: "🍞",
    prep6m: "",
    prep9m: "",
    prep12m: "",
    chokingNotes: null,
    notes: "Cut into finger strips",
    imageUrl: null,
    pairings: [],
    recipes: [],
    ...overrides,
  };
}

function render(seeded?: FoodDetail) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seeded) queryClient.setQueryData(catalogKeys.food(seeded.slug), seeded);
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: ["/foods/banana-bread-k3f9q1/edit"] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/foods/:slug/edit", element: createElement(FoodEditPage, null) }),
          // Redirect targets, so a <Navigate> resolves to something renderable.
          createElement(Route, { path: "/foods", element: createElement("p", null, "foods list") }),
          createElement(Route, { path: "/foods/:slug", element: createElement("p", null, "food page") }),
        ),
      ),
    ),
  );
}

describe("FoodEditPage", () => {
  it("preloads every field from the food being edited", () => {
    const html = render(food());
    expect(html).toContain("Edit food");
    expect(html).toContain('value="Banana bread"');
    expect(html).toContain('value="🍞"');
    expect(html).toContain("Cut into finger strips");
    // The food's own allergen is pre-ticked, and only that one.
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect(html).toContain(">Save<");
  });

  it("backs out to the food's own page, not the grid", () => {
    expect(render(food())).toContain('<span class="sr-only">Back</span>');
    expect(render(food())).toContain('id="food-edit-name"');
  });

  it("shows a skeleton rather than an empty form while the food is still loading", () => {
    const html = render();
    expect(html).not.toContain(">Name<");
    expect(html).toContain("Edit food");
  });

  // `Navigate` renders nothing and defers the redirect to an effect, which a
  // server render never runs — so "redirected" looks like empty output here.
  // Asserting on that is still the point: the form must NOT be rendered.
  it("redirects a CATALOG food away — nobody owns it, so the PATCH could only 404", () => {
    const html = render(food({ isCustom: false }));
    expect(html).not.toContain(">Name<");
    expect(html).not.toContain('value="Banana bread"');
    expect(html).toBe("");
  });
});
