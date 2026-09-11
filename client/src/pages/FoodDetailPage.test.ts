import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby, FoodDetail, MealItem } from "@blw/shared";
import { babyKeys } from "../features/babies/api.js";
import { trackingKeys } from "../features/tracking/hooks.js";
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
    fiberLevel: "low",
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
  fiberLevel: "low",
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

const BABY: Baby = {
  id: "baby-1",
  name: "Robin",
  birthDate: "2026-01-01",
  notes: null,
  archived: false,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Same render, but with a baby and meals in the cache, so the served-count
 * fact under the actions row has something to count (item 282). */
function renderFoodWithMeals(food: FoodDetail, servings: number) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(catalogKeys.food(food.slug), food);
  queryClient.setQueryData(babyKeys.list(false), [BABY]);
  const meals: MealItem[] = Array.from({ length: servings }, (_, i) => ({
    id: `meal-${i}`,
    babyId: BABY.id,
    servedAt: new Date(2026, 7, 26 - i, 12, 0).toISOString(),
    reactionNote: null,
    notes: null,
    recipeId: null,
    recipeTitle: null,
    foods: [{ id: food.id, slug: food.slug, name: food.name, category: food.category, storageItemId: null }],
  }));
  queryClient.setQueryData([...trackingKeys.meals(BABY.id), { limit: 100 }], { items: meals });
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

  // Item 279: the "High fiber" badge lives on the food PAGE only — the grid
  // tiles stay badge-free (see FoodTile.test.ts).
  it("badges a high-fiber catalog food, and says nothing at a lower level", () => {
    expect(renderFood(catalogFood({ fiberLevel: "high" }))).toContain(">High fiber<");
    expect(renderFood(catalogFood({ fiberLevel: "moderate" }))).not.toContain("High fiber");
    expect(renderFood(catalogFood({ fiberLevel: "low" }))).not.toContain("High fiber");
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
  it("badges it Custom and drops the iron / vitamin-C / fiber badges", () => {
    const html = renderFood(CUSTOM_FOOD);
    expect(html).toContain(">Custom<");
    expect(html).not.toContain("Iron ");
    expect(html).not.toContain("Vit C ");
    expect(html).not.toContain("High fiber");
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

// Item 282: the actions row is the Home pair — primary "Log meal" first,
// tonal "Add to storage" second — each carrying this food's id.
describe("FoodDetailPage — actions row (item 282)", () => {
  it("offers the pair in order, both linking with the food id", () => {
    const html = renderFood(catalogFood());
    const id = catalogFood().id;
    expect(html).toContain(`href="/log-meal?food=${id}"`);
    expect(html).toContain(`href="/storage/add?food=${id}"`);
    expect(html).toContain(">Log meal<");
    expect(html).toContain(">Add to storage<");
    expect(html.indexOf(">Log meal<")).toBeLessThan(html.indexOf(">Add to storage<"));
  });

  it("gives the pair the primary and tonal fills, each taking half the row", () => {
    const html = renderFood(catalogFood());
    const link = (label: string) => html.match(new RegExp(`<a[^>]*>${label}</a>`))?.[0] ?? "";
    expect(link("Log meal")).toContain("bg-[var(--color-primary)]");
    expect(link("Log meal")).toContain("flex-1");
    expect(link("Add to storage")).toContain("bg-[var(--color-success)]");
    expect(link("Add to storage")).toContain("flex-1");
  });

  // A food the parent added is served and stashed exactly like a catalog one.
  it("gives a custom food the same pair", () => {
    const html = renderFood(CUSTOM_FOOD);
    expect(html).toContain(`href="/log-meal?food=${CUSTOM_FOOD.id}"`);
    expect(html).toContain(`href="/storage/add?food=${CUSTOM_FOOD.id}"`);
  });

  // With no baby in the cache `useActiveBaby` resolves to none, so this also
  // pins that the pair is not gated on having one — the nudge sits under it.
  it("shows no I-prepped-this expander", () => {
    const html = renderFood(catalogFood());
    expect(html).not.toContain("I prepped this");
    expect(html).not.toContain("Where&#x27;s it stored?");
    expect(html).not.toContain("Where's it stored?");
  });

  // The fact stays, under the pair rather than beside one button.
  it("keeps the served-count fact, pluralised, naming the baby", () => {
    const two = renderFoodWithMeals(catalogFood(), 2);
    expect(two).toMatch(/Served (?:<!-- -->)?2(?:<!-- -->)? (?:<!-- -->)?times/);
    expect(two).toContain("Robin");
    const one = renderFoodWithMeals(catalogFood(), 1);
    expect(one).toMatch(/Served (?:<!-- -->)?1(?:<!-- -->)? (?:<!-- -->)?time/);
    // Nothing served, nothing claimed.
    expect(renderFoodWithMeals(catalogFood(), 0)).not.toContain("Served");
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
    expect(customFoodConflictMessage({ mealCount: 3, storageCount: 1 })).toBe(
      "Used in 3 meals and 1 storage item — remove those first.",
    );
    expect(customFoodConflictMessage({ mealCount: 0, storageCount: 2 })).toBe(
      "Used in 0 meals and 2 storage items — remove those first.",
    );
  });

  it("uses the singular at exactly one", () => {
    expect(customFoodConflictMessage({ mealCount: 1, storageCount: 1 })).toBe(
      "Used in 1 meal and 1 storage item — remove those first.",
    );
  });

  // Custom recipes can hold a custom food as an ingredient, so the server's
  // 409 gained a third count — named only when there is one to name.
  it("names the custom recipes the food is an ingredient of, when there are any", () => {
    expect(customFoodConflictMessage({ mealCount: 2, storageCount: 1, recipeCount: 3 })).toBe(
      "Used in 2 meals, 1 storage item and 3 recipes — remove those first.",
    );
    expect(customFoodConflictMessage({ mealCount: 0, storageCount: 0, recipeCount: 1 })).toBe(
      "Used in 0 meals, 0 storage items and 1 recipe — remove those first.",
    );
  });

  it("keeps the two-clause sentence when no recipe references it (or an older body omits the count)", () => {
    expect(customFoodConflictMessage({ mealCount: 1, storageCount: 0, recipeCount: 0 })).toBe(
      "Used in 1 meal and 0 storage items — remove those first.",
    );
    expect(customFoodConflictMessage({ mealCount: 1, storageCount: 0 })).toBe(
      "Used in 1 meal and 0 storage items — remove those first.",
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
