import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby, MealItem, RecipeListItem } from "@blw/shared";
import { CelebrationProvider } from "../components/ui/Celebration.js";
import { babyKeys } from "../features/babies/api.js";
import { trackingKeys } from "../features/tracking/hooks.js";
import { catalogKeys } from "../features/catalog/hooks.js";
import { LogFoodPage, resolveEditState } from "./LogFoodPage.js";

describe("LogFoodPage", () => {
  it("renders without throwing and shows the page title with a Close control (no active baby yet)", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(LogFoodPage, null)),
      ),
    );
    expect(html).toContain("Log meal");
    expect(html).toContain('aria-label="Close"');
    // Create mode is a task: the X only, never a chevron too (items 196/258).
    expect(html).not.toContain('<span class="sr-only">Back</span>');
    // The X sits in the header's LEFT leading slot, before the title.
    expect(html.indexOf('aria-label="Close"')).toBeLessThan(html.indexOf("</h1>"));
  });

  it("shows a 'meal is gone' EmptyState (not a blank create form) when ?edit=<id> can't be found, title still 'Edit meal'", () => {
    const baby: Baby = {
      id: "baby-1",
      name: "Baby",
      birthDate: "2026-01-01",
      notes: null,
      archived: false,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [baby]);
    queryClient.setQueryData([...trackingKeys.meals(baby.id), { limit: 100 }], { items: [] as MealItem[] });

    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          { initialEntries: ["/log-meal?edit=missing-meal-id"] },
          createElement(LogFoodPage, null),
        ),
      ),
    );

    expect(html).toContain("Edit meal");
    // Edit mode is a drill-in: the chevron, no X (items 196/258).
    expect(html).toContain('<span class="sr-only">Back</span>');
    expect(html).not.toContain('aria-label="Close"');
    // Item 258: INLINE with the title now — inside the header row, before
    // the h1 closes, not on a line above it.
    expect(html.indexOf('<span class="sr-only">Back</span>')).toBeLessThan(html.indexOf("</h1>"));
    expect(html).toContain("That meal is gone");
    expect(html).not.toMatch(/<textarea[^>]*id="log-food-note"/);
  });
});

describe("LogFoodPage recipe prefill (item 213)", () => {
  const baby: Baby = {
    id: "baby-1",
    name: "Baby",
    birthDate: "2026-01-01",
    notes: null,
    archived: false,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const recipe: RecipeListItem = {
    id: "recipe-1",
    slug: "iron-rich-puree",
    title: "Iron-Rich Puree",
    minAgeMonths: 6,
    ironFocus: true,
    vitaminCHigh: false,
    fiberHigh: false,
    allergens: [],
    isCustom: true,
    isFavorite: false,
    ingredientNames: [],
  };

  function renderAt(url: string): string {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [baby]);
    queryClient.setQueryData(catalogKeys.recipesList({}), { recipes: [recipe] });
    return renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          CelebrationProvider,
          null,
          createElement(MemoryRouter, { initialEntries: [url] }, createElement(LogFoodPage, null)),
        ),
      ),
    );
  }

  it("attaches the recipe named by ?recipe= to the form's picker", () => {
    expect(renderAt("/log-meal?recipe=recipe-1")).toContain('aria-label="Remove Iron-Rich Puree"');
  });

  it("attaches nothing on a plain /log-meal", () => {
    expect(renderAt("/log-meal")).not.toContain('aria-label="Remove Iron-Rich Puree"');
  });
});

describe("resolveEditState", () => {
  const meal: MealItem = {
    id: "meal-1",
    babyId: "baby-1",
    servedAt: "2026-08-20T08:30:00.000Z",
    reactionNote: null,
    notes: null,
    recipeId: null,
    recipeTitle: null,
    foods: [{ id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", pantryItemId: null }],
  };

  it("reports 'loading' while still loading, regardless of items/error", () => {
    expect(resolveEditState(true, false, [], "meal-1")).toBe("loading");
    expect(resolveEditState(true, true, [meal], "meal-1")).toBe("loading");
  });

  it("reports 'found' once loaded when the id is present in items", () => {
    expect(resolveEditState(false, false, [meal], "meal-1")).toBe("found");
  });

  it("reports 'missing' once loaded when the id is absent from items", () => {
    expect(resolveEditState(false, false, [meal], "some-other-id")).toBe("missing");
  });

  it("reports 'missing' when the fetch errored, even if items happen to be present", () => {
    expect(resolveEditState(false, true, [meal], "meal-1")).toBe("missing");
  });

  it("reports 'missing' for an empty meals list", () => {
    expect(resolveEditState(false, false, [], "meal-1")).toBe("missing");
  });
});
