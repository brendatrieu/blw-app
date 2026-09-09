import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FoodDetail } from "@blw/shared";
import { catalogKeys } from "../features/catalog/hooks.js";
import { CUSTOM_FOOD_SOFT_NOTE, customFoodConflictMessage } from "../features/catalog/constants.js";
import { CustomFoodActions, FoodDetailPage } from "./FoodDetailPage.js";

/** React's SSR escaping, so a copy assertion can be made against the exact
 * constant rather than a hand-escaped copy of it that could drift. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;");
}

function catalogFood(overrides: Partial<FoodDetail> = {}): FoodDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "salmon",
    name: "Salmon",
    category: "protein",
    ironLevel: "high",
    vitaminCLevel: "low",
    chokingRisk: "moderate",
    minAgeMonths: 6,
    allergens: ["fish"],
    isCustom: false,
    emoji: null,
    prep6m: "Flake it off the skin.",
    prep9m: "Small flakes.",
    prep12m: "Bite-size pieces.",
    chokingNotes: "Check for bones.",
    notes: "Iron-rich.",
    imageUrl: null,
    pairings: [],
    recipes: [],
    ...overrides,
  };
}

const CUSTOM_FOOD = catalogFood({
  id: "22222222-2222-4222-8222-222222222222",
  slug: "banana-bread-k3f9q1",
  name: "Banana bread",
  category: "grain",
  // Exactly what the server stores for a custom food: neutral placeholders
  // in the NOT NULL columns, empty prep text.
  ironLevel: "low",
  vitaminCLevel: "low",
  chokingRisk: "low",
  allergens: ["wheat", "egg"],
  isCustom: true,
  emoji: "🍞",
  prep6m: "",
  prep9m: "",
  prep12m: "",
  chokingNotes: null,
  notes: "Cut into finger strips",
});

function renderFood(food: FoodDetail) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(catalogKeys.food(food.slug), food);
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [`/foods/${food.slug}`] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/foods/:slug", element: createElement(FoodDetailPage, null) }),
        ),
      ),
    ),
  );
}

describe("FoodDetailPage — catalog food (unchanged)", () => {
  it("still shows the curated prep, choking and nutrition content", () => {
    const html = renderFood(catalogFood());
    expect(html).toContain("Prep by age");
    expect(html).toContain("Flake it off the skin.");
    expect(html).toContain("Choking notes");
    expect(html).toContain("Check for bones.");
    expect(html).toMatch(/Iron(?:<!-- -->)?\s*(?:<!-- -->)?High/);
  });

  it("offers no Custom badge, no soft note, and no Edit/Delete — nobody owns it", () => {
    const html = renderFood(catalogFood());
    expect(html).not.toContain(">Custom<");
    expect(html).not.toContain(escapeHtml(CUSTOM_FOOD_SOFT_NOTE));
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain(">Delete<");
  });
});

describe("FoodDetailPage — custom food (item 181)", () => {
  it("badges it Custom and drops the iron / vitamin-C badges", () => {
    const html = renderFood(CUSTOM_FOOD);
    expect(html).toContain(">Custom<");
    expect(html).not.toContain("Iron ");
    expect(html).not.toContain("Vit C ");
    // The parent's own allergen ticks stay — they're what allergen tracking counts.
    expect(html).toContain(">Wheat<");
    expect(html).toContain(">Egg<");
  });

  it("hides the Prep-by-age and choking sections rather than showing empty ones", () => {
    const html = renderFood(CUSTOM_FOOD);
    expect(html).not.toContain("Prep by age");
    expect(html).not.toContain("6-8 months");
    expect(html).not.toContain("Choking notes");
  });

  it("says why, in the agreed wording", () => {
    // Literal, not the constant: the constant is what's under test.
    expect(CUSTOM_FOOD_SOFT_NOTE).toBe(
      "Added by you — there's no curated prep or choking guidance for this food. Check serving safety with your pediatrician.",
    );
    expect(renderFood(CUSTOM_FOOD)).toContain(escapeHtml(CUSTOM_FOOD_SOFT_NOTE));
  });

  it("does not show the placeholder min-age badge (the server stores 6 for every custom food)", () => {
    expect(renderFood(CUSTOM_FOOD)).not.toMatch(/\d+m\+/);
  });

  it("uses the food's own emoji in the hero and keeps the parent's notes", () => {
    const html = renderFood(CUSTOM_FOOD);
    expect(html).toContain("🍞");
    expect(html).toContain("Cut into finger strips");
  });

  it("offers Edit and Delete", () => {
    const html = renderFood(CUSTOM_FOOD);
    expect(html).toContain(`href="/foods/${CUSTOM_FOOD.slug}/edit"`);
    expect(html).toContain(">Edit<");
    expect(html).toContain(">Delete<");
    // Delete is two-step: the destructive confirm isn't on screen yet.
    expect(html).not.toContain("Delete for good");
  });
});

describe("CustomFoodActions", () => {
  it("renders Edit + Delete with no error banner before anything is attempted", () => {
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        createElement(MemoryRouter, null, createElement(CustomFoodActions, { food: CUSTOM_FOOD })),
      ),
    );
    expect(html).toContain(">Edit<");
    expect(html).toContain(">Delete<");
    expect(html).not.toContain('role="alert"');
  });
});

describe("customFoodConflictMessage", () => {
  it("names both places the food is still referenced (the 409 body's counts)", () => {
    expect(customFoodConflictMessage({ mealCount: 3, pantryCount: 1 })).toBe(
      "Used in 3 meals and 1 pantry item — remove those first.",
    );
    expect(customFoodConflictMessage({ mealCount: 0, pantryCount: 2 })).toBe(
      "Used in 0 meals and 2 pantry items — remove those first.",
    );
  });

  it("uses the singular at exactly one", () => {
    expect(customFoodConflictMessage({ mealCount: 1, pantryCount: 1 })).toBe(
      "Used in 1 meal and 1 pantry item — remove those first.",
    );
  });

  // Custom recipes can hold a custom food as an ingredient, so the server's
  // 409 gained a third count — named only when there is one to name.
  it("names the custom recipes the food is an ingredient of, when there are any", () => {
    expect(customFoodConflictMessage({ mealCount: 2, pantryCount: 1, recipeCount: 3 })).toBe(
      "Used in 2 meals, 1 pantry item and 3 recipes — remove those first.",
    );
    expect(customFoodConflictMessage({ mealCount: 0, pantryCount: 0, recipeCount: 1 })).toBe(
      "Used in 0 meals, 0 pantry items and 1 recipe — remove those first.",
    );
  });

  it("keeps the two-clause sentence when no recipe references it (or an older body omits the count)", () => {
    expect(customFoodConflictMessage({ mealCount: 1, pantryCount: 0, recipeCount: 0 })).toBe(
      "Used in 1 meal and 0 pantry items — remove those first.",
    );
    expect(customFoodConflictMessage({ mealCount: 1, pantryCount: 0 })).toBe(
      "Used in 1 meal and 0 pantry items — remove those first.",
    );
  });
});

// Item 255: "Recipes with <food>" leads with the single-food basic and marks
// it, so the plainest way to serve this food is the first thing offered.
describe("FoodDetailPage — Recipes with <food> (item 255)", () => {
  const WITH_RECIPES = catalogFood({
    recipes: [
      { id: "r-stew", title: "Salmon & pea stew", minAgeMonths: 6, ingredientCount: 3 },
      { id: "r-simple", title: "Simple salmon", minAgeMonths: 6, ingredientCount: 1 },
    ],
  });

  it("lists the single-ingredient recipe first, ahead of the multi-ingredient one", () => {
    const html = renderFood(WITH_RECIPES);
    // SSR splits the interpolation with a comment node.
    expect(html).toMatch(/Recipes with (?:<!-- -->)?salmon/);
    expect(html.indexOf("Simple salmon")).toBeLessThan(html.indexOf("Salmon &amp; pea stew"));
  });

  it("badges only the single-ingredient card Basic", () => {
    const html = renderFood(WITH_RECIPES);
    expect(html).toContain(">Basic<");
    // One card, one badge.
    expect(html.split(">Basic<")).toHaveLength(2);
  });

  it("badges nothing when the count is absent (an older API body)", () => {
    const html = renderFood(
      catalogFood({ recipes: [{ id: "r-old", title: "Salmon oat patties", minAgeMonths: 6 }] }),
    );
    expect(html).toContain("Salmon oat patties");
    expect(html).not.toContain(">Basic<");
  });
});
