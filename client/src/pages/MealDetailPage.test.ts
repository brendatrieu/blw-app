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

/** The "Counted as tried" chips (CD-Meal-Page): `meal.foods`. */
const COUNTED = 'aria-labelledby="meal-counted"';

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
  it("marks a deleted food, muted, in the title and on its chip", () => {
    const meal: MealItem = { ...MEAL, foods: [{ ...MEAL.foods[0]!, deleted: true }, MEAL.foods[1]!] };
    const html = renderMeal(meal);
    expect(headingOf(html)).toContain(`Avocado${MUTED_MARK}, Chicken`);
    const chipRow = html.slice(html.indexOf(COUNTED)).replace(/<!-- -->/g, "");
    expect(chipRow).toContain(`Avocado${MUTED_MARK}`);
    expect(chipRow).not.toContain(`Chicken${MUTED_MARK}`);
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

  it("renders the found meal's counted foods, served time and notes", () => {
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([MEAL]) }, renderAtMealDetailRoute(MEAL.id)),
    );

    expect(html).toContain("Avocado");
    expect(html).toContain("Chicken");
    // Item 673: the title leads with the FIRST food's 40px plate, in the h1.
    const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1]!;
    expect(heading).toMatch(/^<span aria-hidden="true" class="flex shrink-0 [^"]*" style="width:40px;height:40px;font-size:20px;background:var\(--color-plate-fruit\)">🥑<\/span>/);
    // CD-Meal-Page: the counted chips carry the name (and allergen badges), no plate.
    const chips = html.slice(html.indexOf(COUNTED));
    expect(chips).toMatch(/^aria-labelledby="meal-counted" class="mt-1.5 flex flex-wrap gap-1.5"><li class="[^"]*">Avocado/);
    expect(chips).not.toContain("width:24px");
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

  it("offers Edit (to /log-meal?edit=:id) and Delete actions", () => {
    const html = renderToString(
      createElement(QueryClientProvider, { client: seededClient([MEAL]) }, renderAtMealDetailRoute(MEAL.id)),
    );
    expect(html).toContain(`href="/log-meal?edit=${MEAL.id}"`);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Delete<\/button>/);
  });
});

// Item 334: the report was "salmon isn't triggering the fish badge", and the
// person who made it had "added it to a meal" — this page (and the picker)
// is where they would have looked. Ledger 554: the allergens ride on the
// meal's own foods, NOT the foods list, which hides a deleted food.
describe("MealDetailPage allergen marks (item 334, ledger 554)", () => {
  const FISH_MEAL: MealItem = {
    ...MEAL,
    foods: [
      { id: "food-1", slug: "salmon", name: "Salmon", category: "protein", storageItemId: null, allergens: ["fish"] },
      { id: "food-2", slug: "pear", name: "Pear", category: "fruit", storageItemId: null, allergens: [] },
    ],
  };

  it("marks the food that carries an allergen, and only that one", () => {
    const html = renderMeal(FISH_MEAL);
    // Scoped to the food-chip row: the page title is "Salmon, Pear" too, so
    // a whole-document index comparison would be meaningless.
    const chipRow = html.slice(html.indexOf(COUNTED));
    expect(chipRow).toContain("Fish");
    expect(chipRow.indexOf("Fish")).toBeGreaterThan(chipRow.indexOf("Salmon"));
    expect(chipRow.indexOf("Fish")).toBeLessThan(chipRow.indexOf("Pear"));
    // Item 636: the allergen pill is the soft plum, one per allergen, never
    // a solid red fill.
    expect((html.match(/bg-\[var\(--color-allergen-soft\)\]/g) ?? []).length).toBe(1);
    expect(html).not.toContain("var(--color-danger-contrast)");
  });

  it("draws Delete as the shared red-outline button, last in the Edit/Delete row (item 638)", () => {
    const html = renderMeal(FISH_MEAL);
    const row = html.slice(html.lastIndexOf('<div class="flex items-center gap-2">'));
    const del = /<button[^>]*>Delete<\/button>/.exec(row)?.[0] ?? "";
    expect(del).toContain("border-[var(--color-danger)]");
    expect(del).toContain("text-[var(--color-danger)]");
    expect(row.indexOf(">Edit<")).toBeLessThan(row.indexOf(">Delete<"));
  });

  it("shows the meal exactly as before when an older cached body carries no allergens", () => {
    const html = renderMeal({ ...FISH_MEAL, foods: FISH_MEAL.foods.map(({ allergens: _a, ...food }) => food) });
    expect(html).toContain("Salmon");
    expect(html).toContain("Pear");
    expect(html).not.toContain("var(--color-allergen-soft)");
    expect(html).not.toContain("Fish");
  });

  it("keeps a DELETED food's allergen chip, though the foods list no longer has it", () => {
    const meal: MealItem = {
      ...MEAL,
      foods: [
        {
          id: "food-9",
          slug: "nans-omelette-k3f9q1",
          name: "Nan's omelette",
          category: "protein",
          storageItemId: null,
          deleted: true,
          allergens: ["egg"],
        },
      ],
    };
    // The cached list is what the pickers see: the deleted food is absent.
    const html = renderMeal(meal, []);
    const chipRow = html.slice(html.indexOf(COUNTED));
    expect(chipRow).toContain("Egg");
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

// Plan SPEC §5 / CD-Meal-Page: the items on the plate, then "Counted as tried".
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
  const plate = () => /<ul aria-label="On the plate"[^>]*>([\s\S]*?)<\/ul><span id="meal-counted"/.exec(html())![1]!;
  const items = () => plate().split(/<li class="@container/).slice(1);

  it("lists every item in plate order, each its own card, before Counted as tried", () => {
    const titles = items().map((item) => /<p class="font-semibold[^"]*">([^<]*)<\/p>/.exec(item)![1]!.replace(/&amp;/g, "&"));
    expect(titles).toEqual(["Creamy Cashew & Broccoli Pasta", "Broccoli, Carrot", "Broccoli Cheese Egg Muffins", "Salmon Oat Patties"]);
    expect(html().indexOf('aria-label="On the plate"')).toBeLessThan(html().indexOf(">Counted as tried<"));
    // A recipe wears the pot, as on the plate.
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
    // One thing in it: its stars sit right under the title, no part line.
    expect([...oldServe!.matchAll(/role="radiogroup" aria-label="([^"]+)"/g)].map((m) => m[1])).toEqual([
      "Rating for Broccoli Cheese Egg Muffins",
    ]);
    expect(oldServe).toContain('class="mt-0.5 ml-[43px] @max-[262px]:-ml-[9px]"');
  });

  it("no ×, stepper or Ingredients: the page edits only the stars", () => {
    expect(plate()).not.toContain('aria-label="Remove');
    expect(plate()).not.toContain("servings");
    expect(plate()).not.toContain("Ingredients");
  });

  it("Counted as tried is the meal's foods: a left-out food is not there", () => {
    const counted = html().slice(html().indexOf(COUNTED));
    expect([...counted.split("</ul>")[0]!.matchAll(/<li [^>]*>([^<]+)/g)].map((m) => m[1])).toEqual(["Broccoli", "Carrot", "Garlic"]);
    expect(counted.split("</ul>")[0]).not.toContain("Cashews");
  });

  it("Counted as tried leaves out an info food (whole milk), as foods tried does (VERIFY-p2-c1 #4)", () => {
    const milk = { id: uuid(5), slug: "milk", name: "Whole Milk", category: "dairy" as const, storageItemId: null };
    const butter = { id: uuid(6), slug: "unsalted_butter", name: "Unsalted Butter", category: "dairy" as const, storageItemId: null };
    const out = renderMeal({
      ...PASTA_MEAL,
      foods: [{ ...butter, kind: "ingredient" }, { ...milk, kind: "info" }, { ...BROCCOLI, storageItemId: null }],
    }).replace(/<!-- -->/g, "");
    const counted = out.slice(out.indexOf(COUNTED)).split("</ul>")[0]!;
    expect([...counted.matchAll(/<li [^>]*>([^<]+)/g)].map((m) => m[1])).toEqual(["Unsalted Butter", "Broccoli"]);
  });
});
