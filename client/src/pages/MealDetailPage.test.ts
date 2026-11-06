import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby, FoodListItem, MealItem } from "@blw/shared";
import { babyKeys } from "../features/babies/api.js";
import { catalogKeys } from "../features/catalog/hooks.js";
import { trackingKeys } from "../features/tracking/hooks.js";
import { MealDetailPage } from "./MealDetailPage.js";

// `MealDetailPage` reads `:id` via `useParams`, which only resolves inside a
// matching `<Route>` — see `StorageDetailPage.test.ts` for the same idiom.
function renderAtMealDetailRoute(mealId: string) {
  return createElement(
    MemoryRouter,
    { initialEntries: [`/meals/${mealId}`] },
    createElement(Routes, null, createElement(Route, { path: "/meals/:id", element: createElement(MealDetailPage, null) })),
  );
}

const BABY: Baby = {
  id: "baby-1",
  name: "Baby",
  birthDate: "2026-01-01",
  notes: null,
  archived: false,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MEAL: MealItem = {
  id: "22222222-2222-2222-2222-222222222222",
  babyId: BABY.id,
  servedAt: new Date(2026, 7, 20, 14, 5).toISOString(),
  reactionNote: null,
  notes: "ate the whole thing",
  recipeId: null,
  recipeTitle: null,
  foods: [
    { id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", storageItemId: "storage-1" },
    { id: "food-2", slug: "chicken", name: "Chicken", category: "protein", storageItemId: null },
  ],
};

function seededClient(meals: MealItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(babyKeys.list(false), [BABY]);
  queryClient.setQueryData([...trackingKeys.meals(BABY.id), { limit: 100 }], { items: meals });
  return queryClient;
}

function renderMeal(meal: MealItem, foodsList?: FoodListItem[]) {
  const queryClient = seededClient([meal]);
  if (foodsList) queryClient.setQueryData(catalogKeys.foodsList({}), { foods: foodsList });
  return renderToString(createElement(QueryClientProvider, { client: queryClient }, renderAtMealDetailRoute(meal.id)));
}

/** The page header's h1, React's SSR text separators removed. */
function headingOf(html: string): string {
  return /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1]!.replace(/<!-- -->/g, "");
}

const MUTED_MARK = '<span class="font-normal text-[var(--color-text-muted)]">\u00a0(deleted)</span>';

describe("MealDetailPage title", () => {
  it("uses the recipe title when the meal has one", () => {
    expect(headingOf(renderMeal({ ...MEAL, recipeId: "r1", recipeTitle: "Iron-Rich Purée" }))).toContain(
      "Iron-Rich Purée",
    );
  });

  // Ledger 761: "{A} + {B}" for two, "{A} + {n} more" for three or more.
  const titled = (titles: string[]) =>
    headingOf(
      renderMeal({
        ...MEAL,
        recipeId: "r0",
        recipeTitle: titles[0]!,
        recipes: titles.map((title, i) => ({ id: `r${i}`, title, rating: null })),
      }),
    );

  it("joins two recipes with ' + '", () => {
    expect(titled(["Lentil Patties", "Salmon Cakes"])).toContain("Lentil Patties + Salmon Cakes");
  });

  it("names the first recipe and counts the rest from three on", () => {
    expect(titled(["Lentil Patties", "Salmon Cakes", "Oat Bars"])).toContain("Lentil Patties + 2 more");
    expect(titled(["Lentil Patties", "Salmon Cakes", "Oat Bars", "Pea Mash"])).toContain("Lentil Patties + 3 more");
    expect(titled(["Lentil Patties", "Salmon Cakes", "Oat Bars"])).not.toContain("Salmon Cakes");
  });

  it("clamps the title to two lines with an ellipsis", () => {
    expect(titled(["Lentil Patties", "Salmon Cakes"])).toContain('<span class="line-clamp-2 min-w-0 break-words">');
    expect(headingOf(renderMeal(MEAL))).toContain('<span class="line-clamp-2 min-w-0 break-words">Avocado');
  });

  it("falls back to a comma-joined foods summary otherwise", () => {
    expect(headingOf(renderMeal(MEAL))).toContain("Avocado, Chicken");
  });

  // Ledger 555: the title and the food chip carry the ONE muted mark.
  it("marks a deleted food, muted, in the title", () => {
    const meal: MealItem = { ...MEAL, foods: [{ ...MEAL.foods[0]!, deleted: true }, MEAL.foods[1]!] };
    const html = renderMeal(meal);
    expect(headingOf(html)).toContain(`Avocado${MUTED_MARK}, Chicken`);
    expect(headingOf(html)).not.toContain(`Chicken${MUTED_MARK}`);
  });
});

describe("MealDetailPage", () => {
  it("renders the loading state (Back control, skeleton) while the baby/meals are still resolving", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, renderAtMealDetailRoute(MEAL.id)),
    );
    expect(html).toContain("Back");
    expect(html).not.toContain("Avocado");
  });

  it("renders the found meal's foods (in its title), served time and notes", () => {
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([MEAL]) }, renderAtMealDetailRoute(MEAL.id)),
    );

    expect(html).toContain("Avocado");
    expect(html).toContain("Chicken");
    // Item 673: the title leads with the FIRST food's 40px plate, in the h1.
    const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1]!;
    expect(heading).toMatch(/^<span aria-hidden="true" class="flex shrink-0 [^"]*" style="width:40px;height:40px;font-size:20px;background:var\(--color-plate-fruit\)">🥑<\/span>/);
    expect(html).toContain("ate the whole thing");
    expect(html).toMatch(/2:05\s?PM/);
    // A meal with no items yet (an older cached body) links nowhere in storage.
    expect(html).not.toContain('href="/storage/');
  });

  it("shows the recipe title and Reaction note, danger-styled, when present", () => {
    const withRecipeAndReaction: MealItem = {
      ...MEAL,
      recipeId: "r1",
      recipeTitle: "Iron-Rich Purée",
      reactionNote: "mild rash around mouth",
    };
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: seededClient([withRecipeAndReaction]) },
        renderAtMealDetailRoute(withRecipeAndReaction.id),
      ),
    );
    // Item 673: a recipe meal's title plate is the pan on the neutral tint.
    expect(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1]).toContain('style="width:40px;height:40px;font-size:20px;background:var(--color-plate-neutral)">🍳</span>');
    expect(html).toContain("Iron-Rich Purée");
    expect(html).toContain("Reaction: ");
    expect(html).toContain("mild rash around mouth");
    expect(html).toContain('text-[var(--color-danger)]">Reaction:');
  });

  it("redirects home when the id isn't among the resolved meals — even with OTHER meals cached", () => {
    // A non-empty cache is the load-bearing part: an "always resolve the
    // first meal" mutant renders MEAL here and fails these assertions.
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([MEAL]) }, renderAtMealDetailRoute("missing-id")),
    );
    expect(html).not.toContain("Avocado");
    expect(html).not.toContain("Back");
  });

  it("does not link its own summary back to /meals/:id (no self-link)", () => {
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([MEAL]) }, renderAtMealDetailRoute(MEAL.id)),
    );
    expect(html).not.toContain(`href="/meals/${MEAL.id}"`);
  });

  // Ledger 939: Edit and Delete are the Food log card's ⋮, not buttons of the page.
  it("offers Edit and Delete in the card's ⋮ (Actions) menu, with no bottom buttons", () => {
    const html = renderMeal(MEAL).replace(/<!-- -->/g, "");
    expect(html).toMatch(/<button[^>]*aria-label="Actions"[^>]*aria-haspopup="menu"|<button[^>]*aria-haspopup="menu"[^>]*aria-label="Actions"/);
    expect(html).not.toMatch(/<button[^>]*>Delete<\/button>/);
    expect(html).not.toMatch(/<a[^>]*>Edit<\/a>/);
  });
});

describe("MealDetailPage is the Food log card (ledger 939)", () => {
  it("one bordered card: the date line first, then the lines, then the notes", () => {
    const html = renderMeal(MEAL).replace(/<!-- -->/g, "");
    const card = /<li class="relative flex flex-col rounded-\[var\(--radius-lg\)\] border [^"]*">([\s\S]*)<\/li><\/ul>/.exec(html)![1]!;
    expect(card).toMatch(/^<div class="flex flex-wrap items-center justify-between gap-x-2"><span class="text-xs text-\[var\(--color-text-muted\)\]">[^<]*2:05\s?PM<\/span>/);
    expect(card.indexOf('aria-label="On the plate"')).toBeLessThan(card.indexOf("ate the whole thing"));
    // An item with a container shows the Food log's badge.
    expect(card).toContain("📦 From storage");
  });
});

describe("MealDetailPage ratings (item 574, ledger 902)", () => {
  const RATED: MealItem = {
    ...MEAL,
    reactionNote: "rash",
    items: [
      { kind: "food", id: "33333333-3333-4333-8333-333333333331", food: MEAL.foods[0]!, rating: 5 },
      { kind: "food", id: "33333333-3333-4333-8333-333333333332", food: MEAL.foods[1]!, rating: null },
    ],
  };

  it("shows one star line per item ABOVE the reaction note, with no Rating heading (CD-Meal-Page)", () => {
    const html = renderMeal(RATED);
    const stars = html.indexOf('aria-label="Rating for Avocado"');
    expect(stars).toBeGreaterThan(-1);
    expect(stars).toBeLessThan(html.indexOf("Reaction:"));
    expect(html).not.toContain("Rating<!-- --> <span");
    expect(html).toContain('aria-label="Rating for Avocado"');
    expect(html).toContain('aria-label="Rating for Chicken"');
    expect(html).toMatch(/aria-checked="true" aria-label="5 stars"/);
  });

  it("shows one line, for the recipe, on a meal of one recipe", () => {
    const html = renderMeal({
      ...MEAL,
      recipeId: "r1",
      recipeTitle: "Iron-Rich Purée",
      recipeRating: 3,
      items: [
        {
          kind: "recipe",
          id: "33333333-3333-4333-8333-333333333333",
          recipe: { id: "44444444-4444-4444-8444-444444444444", title: "Iron-Rich Purée" },
          leftOut: [],
          inferred: true,
          rating: 3,
        },
      ],
    });
    expect(html.match(/role="radiogroup"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Rating for Iron-Rich Purée"');
    expect(html).toMatch(/aria-checked="true" aria-label="3 stars"/);
  });
});

describe("MealDetailPage, several recipes (ledger 761)", () => {
  const SEVERAL: MealItem = {
    ...MEAL,
    recipeId: "r1",
    recipeTitle: "Lentil Patties",
    recipeRating: 4,
    recipes: [
      { id: "r1", title: "Lentil Patties", rating: 4 },
      { id: "r2", title: "Salmon Cakes", rating: 5 },
    ],
    foods: [
      { id: "f-egg", slug: "egg", name: "Egg", category: "protein", storageItemId: null, rating: null, inRecipe: true },
      { id: "f-brc", slug: "broccoli", name: "Broccoli", category: "veg", storageItemId: null, rating: 3, inRecipe: false },
      { id: "f-oat", slug: "oats", name: "Oats", category: "grain", storageItemId: null, rating: 2, inRecipe: true },
      { id: "f-ban", slug: "banana", name: "Banana", category: "fruit", storageItemId: null, rating: null, inRecipe: false },
    ],
  };

  it("keeps the 🍳 title plate, and lists the recipes as items, not 🍳 lines", () => {
    const html = renderMeal(SEVERAL).replace(/<!-- -->/g, "");
    expect(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1]).toContain(">🍳</span>");
    expect(html).not.toContain("🍳 Lentil Patties");
  });

  // Ledger 902: each item rates itself; an ingredient of a recipe has no line
  // of its own unless it was put on the plate on its own too.
  it("rates each item in plate order: the recipes, then the foods put on the plate on their own", () => {
    const item = (n: number) => `55555555-5555-4555-8555-55555555555${n}`;
    const html = renderMeal({
      ...SEVERAL,
      items: [
        { kind: "recipe", id: item(1), recipe: { id: item(5), title: "Lentil Patties" }, leftOut: [], inferred: true, rating: 4 },
        { kind: "recipe", id: item(2), recipe: { id: item(6), title: "Salmon Cakes" }, leftOut: [], inferred: true, rating: 5 },
        { kind: "food", id: item(3), food: SEVERAL.foods[1]!, rating: 3 },
        { kind: "food", id: item(4), food: SEVERAL.foods[3]!, rating: null },
      ],
    });
    const labels = [...html.matchAll(/role="radiogroup" aria-label="Rating for ([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["Lentil Patties", "Salmon Cakes", "Broccoli", "Banana"]);
  });
});

describe("MealDetailPage title plate for a custom food (item 673)", () => {
  it("uses the food's own emoji and category, not just its slug", () => {
    const html = renderMeal(
      {
        ...MEAL,
        foods: [
          { id: "food-c", slug: "grandmas-congee-x1y2z3", name: "Grandma's congee", category: "grain", storageItemId: null, emoji: "🥘" },
        ],
      },
      [],
    );
    expect(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1]).toMatch(
      /^<span aria-hidden="true" class="flex shrink-0 [^"]*" style="[^"]*background:var\(--color-plate-grain\)">🥘<\/span>/,
    );
  });
});

// Plan SPEC §5 / CD-Meal-Page: the items on the plate ("Counted as tried" gone, ledger 928).
describe("MealDetailPage items (CD-Meal-Page, ledger 902)", () => {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const BROCCOLI = { id: uuid(1), slug: "broccoli", name: "Broccoli", category: "veg" as const };
  const CARROT = { id: uuid(2), slug: "carrot", name: "Carrot", category: "veg" as const };
  const CASHEWS = { id: uuid(3), slug: "cashew", name: "Cashews", category: "legume" as const };
  const PASTA_MEAL: MealItem = {
    ...MEAL,
    recipeId: uuid(20),
    recipeTitle: "Creamy Cashew & Broccoli Pasta",
    foods: [
      { ...BROCCOLI, storageItemId: uuid(30) },
      { ...CARROT, storageItemId: uuid(30) },
      { id: uuid(4), slug: "garlic", name: "Garlic", category: "veg", storageItemId: null },
    ],
    items: [
      { kind: "recipe", id: uuid(10), recipe: { id: uuid(20), title: "Creamy Cashew & Broccoli Pasta" }, leftOut: [CASHEWS], inferred: false, rating: 5 },
      {
        kind: "storage",
        storageItemId: uuid(30),
        label: null,
        location: "fridge",
        servings: 1,
        parts: [
          { kind: "food", id: uuid(11), food: BROCCOLI, rating: 4 },
          { kind: "food", id: uuid(12), food: CARROT, rating: 2 },
        ],
      },
      {
        kind: "storage",
        storageItemId: uuid(31),
        label: null,
        location: "freezer",
        servings: null,
        parts: [{ kind: "recipe", id: uuid(13), recipe: { id: uuid(21), title: "Broccoli Cheese Egg Muffins" }, rating: null }],
      },
      { kind: "recipe", id: uuid(14), recipe: { id: uuid(22), title: "Salmon Oat Patties" }, leftOut: [CASHEWS], inferred: true, rating: null },
    ],
  };
  const html = () => renderMeal(PASTA_MEAL).replace(/<!-- -->/g, "");
  const plate = () => /<ul aria-label="On the plate"[^>]*>([\s\S]*)<\/ul><\/div><p class="mt-1 text-xs text-\[var\(--color-text-muted\)\]">ate the whole thing/.exec(html())![1]!;
  const items = () => plate().split(/<li class="py-\[3px\]/).slice(1);

  it("lists every item in plate order, a Food log line each (ledger 939)", () => {
    const titles = items().map((item) => /<p class="text-sm leading-\[1.3\] font-medium[^"]*">([^<]*)<\/p>/.exec(item)![1]!.replace(/&amp;/g, "&"));
    expect(titles).toEqual(["Creamy Cashew & Broccoli Pasta", "Broccoli, Carrot", "Broccoli Cheese Egg Muffins", "Salmon Oat Patties"]);
    // A recipe wears the pot, as on the plate, at the Food log's 28px.
    expect(items()[0]).toContain("width:28px;height:28px");
    expect(items()[0]).toContain("background:var(--color-plate-neutral)\">🍲</span>");
  });

  it("says what a recipe left out, but not on one rebuilt from a meal logged before the plate (chair §10.1)", () => {
    expect(items()[0]).toContain("Left out: Cashews");
    expect(items()[3]).not.toContain("Left out");
  });

  it("a container says From storage, linking to its batch (the traceback), and rates each food it held", () => {
    const [, container, oldServe] = items();
    expect(container).toMatch(/<a [^>]*href="\/storage\/00000000-0000-4000-8000-000000000030"[^>]*>From storage<\/a>/);
    expect(oldServe).toContain('href="/storage/00000000-0000-4000-8000-000000000031"');
    expect((html().match(/href="\/storage\//g) ?? []).length).toBe(2);
    expect([...container!.matchAll(/role="radiogroup" aria-label="Rating for ([^"]+)"/g)].map((m) => m[1])).toEqual([
      "Broccoli",
      "Carrot",
    ]);
    // Several things: each named over its stars. One thing: just its stars, under the name.
    expect(container).toContain('<p class="mt-1 ml-[9px] text-[13px] leading-[1.35] text-[var(--color-text-muted)]">Broccoli</p>');
    expect([...oldServe!.matchAll(/role="radiogroup" aria-label="([^"]+)"/g)].map((m) => m[1])).toEqual([
      "Rating for Broccoli Cheese Egg Muffins",
    ]);
    expect(oldServe).not.toContain('class="mt-1 ml-[9px]');
    expect(oldServe).toContain('class="relative z-10 ml-[27px] @max-[246px]:-ml-[9px]"');
  });

  it("no ×, stepper or Ingredients: the page edits only the stars", () => {
    expect(plate()).not.toContain('aria-label="Remove');
    expect(plate()).not.toContain("servings");
    expect(plate()).not.toContain("Ingredients");
  });

  it("has no Counted as tried (ledger 928): no heading, no food chips, no allergen chips; the plate's items still render", () => {
    const out = html();
    expect(out).not.toContain("Counted as tried");
    expect(out).not.toContain("meal-counted");
    expect(out).not.toContain("var(--color-allergen-soft)");
    // Garlic is one of the meal's foods but on no plate item: only a food list could show it.
    expect(PASTA_MEAL.foods.map((food) => food.name)).toContain("Garlic");
    expect(out).not.toContain("Garlic");
    expect(items()).toHaveLength(4);
    expect(out).toContain("Left out: Cashews");
    // Edit is the card's ⋮ (ledger 939), closed until tapped.
    expect(out).toContain('aria-label="Actions"');
  });
});
