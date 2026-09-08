import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RecipeDetail } from "@blw/shared";
import { catalogKeys } from "../features/catalog/hooks.js";
import { customRecipeConflictMessage } from "../features/catalog/constants.js";
import { CustomRecipeActions, RecipeDetailPage } from "./RecipeDetailPage.js";

function catalogRecipe(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "iron-rich-puree",
    title: "Iron-rich purée",
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: true,
    imageUrl: null,
    fridgeHoursOverride: null,
    freezerDaysOverride: null,
    allergens: ["fish"],
    ingredients: [
      {
        foodId: "food-1",
        foodSlug: "salmon",
        foodName: "Salmon",
        isCustom: false,
        foodEmoji: null,
        quantityNote: "1 fillet",
      },
    ],
    extraIngredients: ["olive oil"],
    variants: [
      { ageStage: "6", textureNote: "Smooth purée", steps: ["Steam", "Blend"] },
      { ageStage: "9", textureNote: "Chunkier", steps: ["Steam", "Mash"] },
    ],
    isCustom: false,
    notes: null,
    ...overrides,
  };
}

const CUSTOM_RECIPE = catalogRecipe({
  id: "22222222-2222-4222-8222-222222222222",
  slug: "lentil-mash-k3f9q1",
  title: "Lentil mash",
  // Exactly what the server stores for a custom recipe: no prep claim, no
  // iron claim, and ONE variant with an empty texture note.
  prepMinutes: 0,
  ironFocus: false,
  allergens: [],
  ingredients: [
    {
      foodId: "food-2",
      foodSlug: "grandmas-loaf-k3f9q1",
      foodName: "Grandma's loaf",
      isCustom: true,
      foodEmoji: "🍞",
      quantityNote: "",
    },
  ],
  extraIngredients: [],
  variants: [{ ageStage: "6", textureNote: "", steps: ["Cook the lentils", "Mash together"] }],
  isCustom: true,
  notes: "Freezes well in ice-cube trays",
});

function renderRecipe(recipe: RecipeDetail) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(catalogKeys.recipe(recipe.id), recipe);
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [`/recipes/${recipe.id}`] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/recipes/:id", element: createElement(RecipeDetailPage, null) }),
        ),
      ),
    ),
  );
}

describe("RecipeDetailPage (catalog recipe)", () => {
  it("keeps its age tabs, texture note and prep badge", () => {
    const html = renderRecipe(catalogRecipe());
    expect(html).toContain(">6mo<");
    expect(html).toContain(">9mo<");
    expect(html).toContain("Smooth purée");
    expect(html).toMatch(/>15(?:<!-- -->)? min prep</);
    expect(html).toContain(">Iron focus<");
  });

  it("carries neither the Custom badge nor the owner's Edit/Delete controls", () => {
    const html = renderRecipe(catalogRecipe());
    expect(html).not.toContain(">Custom<");
    expect(html).not.toContain(">Delete<");
    expect(html).not.toMatch(/href="\/recipes\/[^"]*\/edit"/);
  });

  it("offers to log it, carrying the recipe id over to the log form", () => {
    const html = renderRecipe(catalogRecipe());
    expect(html).toContain(`href="/log-meal?recipe=${catalogRecipe().id}"`);
    expect(html).toContain(">Log meal<");
  });
});

describe("RecipeDetailPage (custom recipe)", () => {
  it("marks it Custom and shows a single Steps section instead of age tabs", () => {
    const html = renderRecipe(CUSTOM_RECIPE);
    expect(html).toContain(">Custom<");
    expect(html).toContain(">Steps<");
    expect(html).toContain("Cook the lentils");
    expect(html).toContain("Mash together");
    expect(html).not.toContain(">6mo<");
    expect(html).not.toContain(">9mo<");
  });

  it("hides the prep badge when no prep time was given (0 is 'not stated', not 'instant')", () => {
    expect(renderRecipe(CUSTOM_RECIPE)).not.toContain("min prep");
    expect(renderRecipe(catalogRecipe({ isCustom: true, prepMinutes: 20 }))).toMatch(/>20(?:<!-- -->)? min prep</);
  });

  it("shows the parent's own notes, and nothing when there are none", () => {
    expect(renderRecipe(CUSTOM_RECIPE)).toContain("Freezes well in ice-cube trays");
    expect(renderRecipe(catalogRecipe())).not.toContain(">Notes<");
  });

  it("offers Edit and Delete for a recipe the parent owns", () => {
    const html = renderRecipe(CUSTOM_RECIPE);
    expect(html).toContain(`href="/recipes/${CUSTOM_RECIPE.id}/edit"`);
    expect(html).toContain(">Edit<");
    expect(html).toContain(">Delete<");
  });
});

describe("RecipeDetailPage ingredients", () => {
  it("links each ingredient row to its food page, honoring a custom food's own emoji", () => {
    const html = renderRecipe(CUSTOM_RECIPE);
    expect(html).toContain('href="/foods/grandmas-loaf-k3f9q1"');
    expect(html).toContain("🍞");
  });

  it("falls back to the slug map for a catalog ingredient, and shows its quantity", () => {
    const html = renderRecipe(catalogRecipe());
    expect(html).toContain('href="/foods/salmon"');
    expect(html).toContain("1 fillet");
  });

  it("drops the dash when no quantity was given", () => {
    expect(renderRecipe(CUSTOM_RECIPE)).not.toContain("— </span>");
  });

  it("nests no interactive element inside an ingredient link", () => {
    const html = renderRecipe(catalogRecipe());
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
  });
});

describe("CustomRecipeActions", () => {
  it("renders Edit + Delete with no error banner until something fails", () => {
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        createElement(MemoryRouter, null, createElement(CustomRecipeActions, { recipe: { id: "recipe-9" } })),
      ),
    );
    expect(html).toContain('href="/recipes/recipe-9/edit"');
    expect(html).toContain(">Delete<");
    expect(html).not.toContain('role="alert"');
  });
});

describe("customRecipeConflictMessage", () => {
  it("names both places the recipe is still referenced (the 409 body's counts)", () => {
    expect(customRecipeConflictMessage({ mealCount: 3, pantryCount: 2 })).toBe(
      "Used in 3 meals and 2 pantry items — remove those first.",
    );
  });

  it("uses the singular at exactly one", () => {
    expect(customRecipeConflictMessage({ mealCount: 1, pantryCount: 1 })).toBe(
      "Used in 1 meal and 1 pantry item — remove those first.",
    );
  });

  it("still names a zero count rather than dropping the clause", () => {
    expect(customRecipeConflictMessage({ mealCount: 0, pantryCount: 4 })).toBe(
      "Used in 0 meals and 4 pantry items — remove those first.",
    );
  });
});
