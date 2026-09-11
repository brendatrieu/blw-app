import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FoodListItem, RecipeListItem } from "@blw/shared";
import { catalogKeys } from "../features/catalog/hooks.js";
import { StorageAddPage } from "./StorageAddPage.js";

const FOOD: FoodListItem = {
  id: "food-1",
  slug: "banana",
  name: "Banana",
  category: "fruit",
  ironLevel: "low",
  vitaminCLevel: "moderate",
  fiberLevel: "low",
  chokingRisk: "moderate",
  minAgeMonths: 6,
  allergens: [],
  isCustom: false,
  emoji: null,
};

const RECIPE: RecipeListItem = {
  id: "recipe-1",
  slug: "banana-porridge",
  title: "Banana porridge",
  minAgeMonths: 6,
  ironFocus: false,
  vitaminCHigh: false,
  fiberHigh: false,
  allergens: [],
  isCustom: false,
  isFavorite: false,
  ingredientNames: [],
};

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(catalogKeys.foodsList({}), { foods: [FOOD] });
  queryClient.setQueryData(catalogKeys.recipesList({}), { recipes: [RECIPE] });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(StorageAddPage, null)),
    ),
  );
}

/** The tab strip marks the open tab with aria-pressed. */
function pressedTab(html: string): string | undefined {
  return html.match(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)<\/button>/)?.[1];
}

describe("StorageAddPage", () => {
  it("renders the page title, a Close control, and the add-item form", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(StorageAddPage, null)),
      ),
    );
    expect(html).toContain("Add to storage");
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain("From a food");
    expect(html).toContain(">Location<");
  });
});

// Item 284: the page reads ?food= / ?recipe= off its own URL and hands the
// answer to the form as its initial state.
describe("StorageAddPage — prefill from the query string", () => {
  it("opens the food tab with that food chosen for /storage/add?food=<id>", () => {
    const html = renderAt(`/storage/add?food=${FOOD.id}`);
    expect(pressedTab(html)).toBe("From a food");
    expect(html).toContain('aria-label="Remove Banana"');
  });

  it("opens the recipe tab with that recipe chosen for /storage/add?recipe=<id>", () => {
    const html = renderAt(`/storage/add?recipe=${RECIPE.id}`);
    expect(pressedTab(html)).toBe("From a recipe");
    expect(html).toContain('aria-label="Remove Banana porridge"');
  });

  it("opens the plain food tab with nothing chosen when no id is carried", () => {
    const html = renderAt("/storage/add");
    expect(pressedTab(html)).toBe("From a food");
    expect(html).not.toMatch(/aria-label="Remove /);
  });

  // An id nothing resolves to is ignored by the picker, not fatal: the tab
  // opens, the field simply holds no chip.
  it("survives an id that matches nothing", () => {
    const html = renderAt("/storage/add?food=not-a-real-food");
    expect(pressedTab(html)).toBe("From a food");
    expect(html).not.toMatch(/aria-label="Remove /);
    expect(html).toContain("Add to storage");
  });

  // The X stays a history-aware close with /storage as its fallback, whatever
  // the query string carried.
  it("keeps the Close control on a prefilled visit", () => {
    expect(renderAt(`/storage/add?food=${FOOD.id}`)).toContain('aria-label="Close"');
  });
});
