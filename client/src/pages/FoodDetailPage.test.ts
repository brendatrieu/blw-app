import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby, FoodDetail, FoodListItem, MealItem } from "@blw/shared";
import { babyKeys } from "../features/babies/api.js";
import { trackingKeys } from "../features/tracking/hooks.js";
import { catalogKeys } from "../features/catalog/hooks.js";
import { CUSTOM_FOOD_SOFT_NOTE, usedInPhrase } from "../features/catalog/constants.js";
import { CustomFoodActions, FoodDetailPage, RESTORE_HINT, sameNameFood } from "./FoodDetailPage.js";

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

function renderFood(food: FoodDetail, babies?: Baby[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(catalogKeys.food(food.slug), food);
  if (babies) queryClient.setQueryData(babyKeys.list(false), babies);
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

  it("spaces its sections 24px apart (item 649)", () => {
    expect(renderFood(catalogFood())).toContain('<div class="flex flex-col gap-6 p-4">');
    expect(renderFood(catalogFood())).toMatch(/<section class="flex flex-col gap-2\.5"><h2 class="font-h2[^"]*">Notes<\/h2>/);
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
    // Delete only asks (item 599): no question is on screen yet.
    expect(html).not.toContain("Delete this");
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
    // Item 638: the shared red-outline Delete, last in its row.
    expect(html).toMatch(/<button[^>]*class="[^"]*border-\[var\(--color-danger\)\][^"]*text-\[var\(--color-danger\)\][^"]*"[^>]*>Delete<\/button>/);
    expect(html.indexOf(">Edit<")).toBeLessThan(html.indexOf(">Delete<"));
  });
});

// Ledger 542: the delete prompt names where a food is used, never "0 meals".
describe("usedInPhrase", () => {
  it("names only the places that hold the food, singular at one", () => {
    expect(usedInPhrase({ mealCount: 0, storageCount: 1, recipeCount: 0 })).toBe("Used in 1 storage item");
    expect(usedInPhrase({ mealCount: 3, storageCount: 1, recipeCount: 0 })).toBe("Used in 3 meals and 1 storage item");
    expect(usedInPhrase({ mealCount: 2, storageCount: 1, recipeCount: 3 })).toBe(
      "Used in 2 meals, 1 storage item and 3 recipes",
    );
    expect(usedInPhrase({ mealCount: 0, storageCount: 0, recipeCount: 1 })).toBe("Used in 1 recipe");
  });

  it("is null when nothing uses it — the plain-confirm branch", () => {
    expect(usedInPhrase({ mealCount: 0, storageCount: 0, recipeCount: 0 })).toBeNull();
    expect(usedInPhrase({ mealCount: 0, storageCount: 0 })).toBeNull();
  });
});

describe("sameNameFood (Replace with… preselect)", () => {
  const listed = (overrides: Partial<FoodListItem>): FoodListItem => ({
    id: "33333333-3333-4333-8333-333333333333",
    slug: "cauliflower",
    name: "Cauliflower",
    category: "veg",
    ironLevel: "low",
    vitaminCLevel: "high",
    fiberLevel: "moderate",
    chokingRisk: "low",
    minAgeMonths: 6,
    allergens: [],
    isCustom: false,
    emoji: null,
    ...overrides,
  });
  const mine = { id: "22222222-2222-4222-8222-222222222222", name: "cauliflower " };

  it("picks the catalog food of the same name, ignoring case and stray spaces", () => {
    const own = listed({ id: "44444444-4444-4444-8444-444444444444", slug: "cauliflower-x1", isCustom: true });
    expect(sameNameFood([own, listed({})], mine)?.slug).toBe("cauliflower");
  });

  it("falls back to another own food of that name, never the food itself, else nothing", () => {
    const own = listed({ id: "44444444-4444-4444-8444-444444444444", slug: "cauliflower-x1", isCustom: true });
    expect(sameNameFood([own], mine)?.slug).toBe("cauliflower-x1");
    expect(sameNameFood([listed({ id: mine.id, isCustom: true })], mine)).toBeUndefined();
    expect(sameNameFood([listed({ name: "Broccoli" })], mine)).toBeUndefined();
  });
});

describe("FoodDetailPage — a deleted food (ledger 543)", () => {
  const DELETED = { ...CUSTOM_FOOD, deletedAt: "2026-09-25T10:00:00.000Z" };

  it("is read-only: no Log meal, Add to storage, Edit or Delete", () => {
    const html = renderFood(DELETED);
    expect(html).not.toContain(">Log meal<");
    expect(html).not.toContain(">Add to storage<");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain(">Delete<");
  });

  it("says so in one line and offers Restore", () => {
    const html = renderFood(DELETED);
    expect(html).toContain("You deleted this food.");
    expect(html).toContain(">Restore<");
    // Still the food's own page: its name and notes are history too.
    expect(html).toContain("Banana bread");
    expect(html).toContain("Cut into finger strips");
  });

  it("keeps a live custom food's actions (deletedAt null)", () => {
    const html = renderFood({ ...CUSTOM_FOOD, deletedAt: null });
    expect(html).toContain(">Delete<");
    expect(html).not.toContain("You deleted this food.");
  });
});

describe("RESTORE_HINT", () => {
  it("points at the Deleted filter in the agreed wording", () => {
    expect(RESTORE_HINT).toBe("You can restore it from Foods › Deleted.");
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

  it("badges each recipe row's age in the outline tone (item 637)", () => {
    // The food's own header carries a 6m+ outline badge too: look below it.
    const html = renderFood(WITH_RECIPES);
    expect(html.slice(html.search(/Recipes with/))).toMatch(
      /class="[^"]*inset-ring-\[var\(--color-border\)\][^"]*"[^>]*>6(?:<!-- -->)?m\+</,
    );
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

describe("FoodDetailPage — pins from the color pass (items 637, 639)", () => {
  it("gives the pairing card's Vit C badge the one nutrient tint", () => {
    const html = renderFood(
      catalogFood({
        pairings: [
          { food: { slug: "mango", name: "Mango", ironLevel: "low", vitaminCLevel: "high" }, reason: "Vitamin C helps iron." },
        ],
      }),
    );
    expect(html).toMatch(
      /class="[^"]*bg-\[var\(--color-primary-soft\)\][^"]*text-\[var\(--color-primary-soft-text\)\][^"]*"[^>]*>Vit C (?:<!-- -->)?High</,
    );
  });

  it("draws the 'Add a baby' link in the accent text color, never the CTA fill color", () => {
    const html = renderFood(catalogFood(), []);
    const link = html.match(/<a [^>]*>Add a baby<\/a>/)?.[0] ?? "";
    expect(link).toContain("text-[var(--color-accent)]");
    expect(link).not.toContain("--color-primary");
  });
});

describe("FoodDetailPage rating history (item 575)", () => {
  function renderWithHistory(points: { servedAt: string; rating: number }[]) {
    const food = catalogFood({ recipes: [{ id: "r-simple", title: "Simple salmon", minAgeMonths: 6, ingredientCount: 1 }] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(catalogKeys.food(food.slug), food);
    queryClient.setQueryData(babyKeys.list(false), [BABY]);
    queryClient.setQueryData(trackingKeys.ratingHistory(BABY.id, { foodId: food.id }), { points });
    return renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          { initialEntries: [`/foods/${food.slug}`] },
          createElement(Routes, null, createElement(Route, { path: "/foods/:slug", element: createElement(FoodDetailPage, null) })),
        ),
      ),
    );
  }

  it("puts the active baby's average under the badges and the graph at the very bottom (item 585)", () => {
    const html = renderWithHistory([
      { servedAt: "2026-09-20T12:00:00.000Z", rating: 2 },
      { servedAt: "2026-09-25T12:00:00.000Z", rating: 4 },
    ]);
    const average = html.indexOf("★</span> 3.0 (2)");
    const graph = html.indexOf(`${escapeHtml(BABY.name)}&#x27;s rating history</h2>`);
    // A subtitle: after the last badge, inside the header, before the buttons.
    expect(average).toBeGreaterThan(html.indexOf(">Fish<"));
    expect(average).toBeLessThan(html.indexOf(">Log meal<"));
    expect(html).not.toContain(`${escapeHtml(BABY.name)}&#x27;s ratings<`);
    // After the last section, and the page's last child: the graph section
    // closes and so does the page, with nothing in between.
    expect(graph).toBeGreaterThan(html.indexOf("Simple salmon"));
    expect(html.indexOf('stroke="var(--chart-1)"')).toBeGreaterThan(graph);
    expect(html.endsWith("</figure></section></div>")).toBe(true);
  });

  it("shows neither before the first rating", () => {
    const html = renderWithHistory([]);
    expect(html).not.toContain("★");
    expect(html).not.toContain("rating history");
  });
});
