import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RecipeDetail } from "@blw/shared";
import { catalogKeys } from "../features/catalog/hooks.js";
import { RecipeEditPage } from "./RecipeEditPage.js";

const RECIPE_ID = "22222222-2222-4222-8222-222222222222";

function recipe(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: RECIPE_ID,
    slug: "lentil-mash-k3f9q1",
    title: "Lentil mash",
    minAgeMonths: 9,
    prepMinutes: 20,
    ironFocus: false,
    imageUrl: null,
    fridgeHoursOverride: null,
    freezerDaysOverride: null,
    allergens: [],
    ingredients: [
      {
        foodId: "food-1",
        foodSlug: "lentil",
        foodName: "Lentils",
        isCustom: false,
        foodEmoji: null,
        quantityNote: "half a cup",
      },
    ],
    extraIngredients: ["olive oil"],
    variants: [{ ageStage: "9", textureNote: "", steps: ["Cook", "Mash"] }],
    isCustom: true,
    notes: "Freezes well",
    ...overrides,
  };
}

function render(seeded?: RecipeDetail) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seeded) queryClient.setQueryData(catalogKeys.recipe(seeded.id), seeded);
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [`/recipes/${RECIPE_ID}/edit`] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/recipes/:id/edit", element: createElement(RecipeEditPage, null) }),
          // Redirect targets, so a <Navigate> resolves to something renderable.
          createElement(Route, { path: "/foods", element: createElement("p", null, "recipes list") }),
          createElement(Route, { path: "/recipes/:id", element: createElement("p", null, "recipe page") }),
        ),
      ),
    ),
  );
}

describe("RecipeEditPage", () => {
  it("preloads every field from the recipe being edited", () => {
    const html = render(recipe());
    expect(html).toContain("Edit recipe");
    expect(html).toContain('value="Lentil mash"');
    expect(html).toContain("Cook</textarea>");
    expect(html).toContain("Freezes well</textarea>");
    expect(html).toContain('value="20"');
    expect(html).toContain('aria-label="Remove olive oil"');
    expect(html).toContain(">Save<");
  });

  it("backs out to the recipe's own page", () => {
    expect(render(recipe())).toContain(">Back<");
    expect(render(recipe())).toContain('id="recipe-edit-title"');
  });

  it("shows a skeleton rather than an empty form while the recipe is still loading", () => {
    const html = render();
    expect(html).not.toContain(">Title<");
    expect(html).toContain("Edit recipe");
  });

  // `Navigate` renders nothing and defers the redirect to an effect, which a
  // server render never runs — so "redirected" looks like empty output here.
  it("redirects a CATALOG recipe away — nobody owns it, so the PATCH could only 404", () => {
    const html = render(recipe({ isCustom: false }));
    expect(html).not.toContain(">Title<");
    expect(html).not.toContain('value="Lentil mash"');
    expect(html).toBe("");
  });
});
