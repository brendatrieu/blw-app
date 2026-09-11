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
    vitaminCHigh: false,
    fiberHigh: false,
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
    extraIngredients: [
      { name: "olive oil", quantityNote: "a drizzle" },
      { name: "cinnamon", quantityNote: "" },
    ],
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

  it("badges high vitamin C beside Iron focus, and neither when the recipe has neither", () => {
    const both = renderRecipe(catalogRecipe({ ironFocus: true, vitaminCHigh: true }));
    expect(both).toContain(">Iron focus<");
    expect(both).toContain(">Vit C<");

    const neither = renderRecipe(catalogRecipe({ ironFocus: false, vitaminCHigh: false }));
    expect(neither).not.toContain(">Iron focus<");
    expect(neither).not.toContain(">Vit C<");
  });

  // The Vit C badge must carry the SUNSHINE tone specifically — a tone swap
  // to "primary" (Iron focus's tone) reads fine by text alone, so this pins
  // the actual class the tone maps to.
  it("gives the Vit C badge the sunshine tone's classes, not just its text", () => {
    const html = renderRecipe(catalogRecipe({ vitaminCHigh: true }));
    expect(html).toMatch(
      /class="[^"]*bg-\[var\(--color-caution-soft\)\][^"]*text-\[var\(--color-caution-soft-text\)\][^"]*"[^>]*>Vit C</,
    );
  });

  // Item 279: the third derived nutrition flag, badged "Fiber" in the header.
  it("badges high fiber after Vit C in the header, and only when the flag is on", () => {
    const on = renderRecipe(catalogRecipe({ ironFocus: true, vitaminCHigh: true, fiberHigh: true }));
    expect(on).toContain(">Fiber<");
    expect(on.indexOf(">Fiber<")).toBeGreaterThan(on.indexOf(">Vit C<"));
    expect(renderRecipe(catalogRecipe({ fiberHigh: false }))).not.toContain(">Fiber<");
  });

  it("gives the Fiber badge the success tone's classes, not just its text", () => {
    const html = renderRecipe(catalogRecipe({ fiberHigh: true }));
    expect(html).toMatch(
      /class="[^"]*bg-\[var\(--color-success-soft\)\][^"]*text-\[var\(--color-success-soft-text\)\][^"]*"[^>]*>Fiber</,
    );
  });

  it("carries neither the Custom badge nor the owner's Edit/Delete controls", () => {
    const html = renderRecipe(catalogRecipe());
    expect(html).not.toContain(">Custom<");
    expect(html).not.toContain(">Delete<");
    expect(html).not.toMatch(/href="\/recipes\/[^"]*\/edit"/);
  });

  // Item 283: the actions row is the Home pair — primary "Log meal" first,
  // tonal "Add to storage" second — each carrying this recipe's id.
  it("offers the Log meal / Add to storage pair, in that order, both carrying the recipe id", () => {
    const html = renderRecipe(catalogRecipe());
    const id = catalogRecipe().id;
    expect(html).toContain(`href="/log-meal?recipe=${id}"`);
    expect(html).toContain(`href="/storage/add?recipe=${id}"`);
    expect(html).toContain(">Log meal<");
    expect(html).toContain(">Add to storage<");
    expect(html.indexOf(">Log meal<")).toBeLessThan(html.indexOf(">Add to storage<"));
  });

  it("gives the pair the primary and tonal fills, each taking half the row", () => {
    const html = renderRecipe(catalogRecipe());
    const link = (label: string) => html.match(new RegExp(`<a[^>]*>${label}</a>`))?.[0] ?? "";
    expect(link("Log meal")).toContain("bg-[var(--color-primary)]");
    expect(link("Log meal")).toContain("flex-1");
    expect(link("Add to storage")).toContain("bg-[var(--color-success)]");
    expect(link("Add to storage")).toContain("flex-1");
  });

  // The thin location-only "I prepped this" expander is gone with it — the
  // full add form at /storage/add is the one way to stash a prepped recipe.
  it("no longer offers the I-prepped-this expander", () => {
    const html = renderRecipe(catalogRecipe());
    expect(html).not.toContain("I prepped this");
    expect(html).not.toContain("Where&#x27;s it stored?");
    expect(html).not.toContain("Where's it stored?");
    expect(html).not.toContain(">Not now<");
  });

  // A recipe need not carry all three stages: shrimp is held to 9 months on
  // the allergen ladder (item 253), so `simple-shrimp` has no 6-month
  // variant. The page used to open on "6" regardless — highlighting a
  // DISABLED 6mo tab above the 9-month prep, i.e. labelling shellfish as
  // 6-month food. The highlighted tab must name the prep shown below it.
  it("opens a 9-month-only recipe on its earliest real stage, not a disabled 6mo tab", () => {
    const html = renderRecipe(
      catalogRecipe({
        slug: "simple-shrimp",
        title: "Simple shrimp",
        minAgeMonths: 9,
        allergens: ["shellfish"],
        variants: [
          { ageStage: "9", textureNote: "Finely chopped", steps: ["Cook through", "Chop small"] },
          { ageStage: "12", textureNote: "Bite-size pieces", steps: ["Cook through", "Cut bite-size"] },
        ],
      }),
    );
    const tab = (label: string) => html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0] ?? "";
    const ACTIVE = "bg-[var(--color-primary)]";

    // `disabled=""` is the attribute; `disabled:` prefixes in the class list
    // are Tailwind variants and say nothing about the button's state.
    expect(tab("6mo")).toContain('disabled=""');
    expect(tab("6mo")).not.toContain(ACTIVE);
    expect(tab("9mo")).toContain(ACTIVE);
    expect(tab("9mo")).not.toContain('disabled=""');
    // ...and the panel below is the 9-month one it now points at.
    expect(html).toContain("Finely chopped");
    expect(html).toContain("Chop small");
    expect(html).not.toContain("Bite-size pieces");
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

  // Item 240: steps are optional. A recipe saved with none keeps its single
  // variant row (with empty steps) — the shape the server always returns —
  // and the page shows no Steps heading and no empty box for it.
  it("hides the Steps section entirely when the parent wrote none", () => {
    const html = renderRecipe(
      catalogRecipe({
        ...CUSTOM_RECIPE,
        variants: [{ ageStage: "6", textureNote: "", steps: [] }],
      }),
    );
    expect(html).toContain(">Custom<");
    expect(html).not.toContain(">Steps<");
    // The rest of the recipe is untouched.
    expect(html).toContain("Lentil mash");
    expect(html).toContain("Freezes well in ice-cube trays");
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

  // Item 299: an extra now carries its own quantity, and reads quantity-first
  // — "a drizzle of olive oil" is how a recipe says it, not "olive oil — a
  // drizzle". An extra with no quantity is just its name.
  it("prints an extra ingredient as 'quantity name', and as the name alone when there is none", () => {
    const html = renderRecipe(catalogRecipe());
    expect(html).toContain("a drizzle olive oil");
    expect(html).toContain("cinnamon");
    expect(html).not.toContain("olive oil — ");
  });

  it("keeps extras in the muted tone a real ingredient's quantity note gets", () => {
    const html = renderRecipe(catalogRecipe());
    const row = /<li[^>]*>(?:(?!<\/li>).)*a drizzle olive oil/s.exec(html)?.[0] ?? "";
    expect(row).toContain("text-[var(--color-text-muted)]");
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
    expect(customRecipeConflictMessage({ mealCount: 3, storageCount: 2 })).toBe(
      "Used in 3 meals and 2 storage items — remove those first.",
    );
  });

  it("uses the singular at exactly one", () => {
    expect(customRecipeConflictMessage({ mealCount: 1, storageCount: 1 })).toBe(
      "Used in 1 meal and 1 storage item — remove those first.",
    );
  });

  it("still names a zero count rather than dropping the clause", () => {
    expect(customRecipeConflictMessage({ mealCount: 0, storageCount: 4 })).toBe(
      "Used in 0 meals and 4 storage items — remove those first.",
    );
  });
});

// Item 255: the same derived marker as the recipe rows, on the page header.
describe("RecipeDetailPage — Basic badge", () => {
  it("badges a single-ingredient recipe Basic", () => {
    // The default catalog fixture is built on one food.
    expect(renderRecipe(catalogRecipe())).toContain(">Basic<");
  });

  it("drops the badge once a recipe has a second ingredient", () => {
    const twoFoods = catalogRecipe({
      ingredients: [
        ...catalogRecipe().ingredients,
        {
          foodId: "food-9",
          foodSlug: "broccoli",
          foodName: "Broccoli",
          isCustom: false,
          foodEmoji: null,
          quantityNote: "2 florets",
        },
      ],
    });
    expect(renderRecipe(twoFoods)).not.toContain(">Basic<");
  });

  it("gives the badge the neutral tone", () => {
    expect(renderRecipe(catalogRecipe())).toMatch(/class="[^"]*color-neutral-soft[^"]*"[^>]*>Basic</);
  });
});

describe("RecipeDetailPage actions pair on a custom recipe (item 283)", () => {
  it("gives a custom recipe the same Log meal / Add to storage pair, in that order", () => {
    const html = renderRecipe(CUSTOM_RECIPE);
    const logAt = html.indexOf(`href="/log-meal?recipe=${CUSTOM_RECIPE.id}"`);
    const storageAt = html.indexOf(`href="/storage/add?recipe=${CUSTOM_RECIPE.id}"`);
    expect(logAt).toBeGreaterThan(-1);
    expect(storageAt).toBeGreaterThan(logAt);
  });
});
