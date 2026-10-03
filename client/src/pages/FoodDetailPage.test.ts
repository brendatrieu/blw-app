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

/** Same render, but with a baby and meals (and optionally ratings) in the
 * cache, so the hero's stats line has something to count (items 282, 666). */
function renderFoodWithMeals(food: FoodDetail, servings: number, ratings?: number[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(catalogKeys.food(food.slug), food);
  queryClient.setQueryData(babyKeys.list(false), [BABY]);
  if (ratings) {
    const points = ratings.map((rating, i) => ({ servedAt: new Date(2026, 7, 20 + i, 12, 0).toISOString(), rating }));
    queryClient.setQueryData(trackingKeys.ratingHistory(BABY.id, { foodId: food.id }), { points });
  }
  const meals: MealItem[] = Array.from({ length: servings }, (_, i) => ({
    id: `meal-${i}`,
    babyId: BABY.id,
    servedAt: new Date(2026, 7, 26 - i, 12, 0).toISOString(),
    reactionNote: null,
    notes: null,
    recipeId: null,
    recipeTitle: null,
    // The first meal lists this food second, so the count can't key on foods[0].
    foods: [
      ...(i === 0 ? [{ id: "other-food", slug: "kiwi", name: "Kiwi", category: "fruit" as const, storageItemId: null }] : []),
      { id: food.id, slug: food.slug, name: food.name, category: food.category, storageItemId: null },
    ],
  }));
  // A meal of something else, which must not count toward this food.
  const other: MealItem = {
    id: "meal-other",
    babyId: BABY.id,
    servedAt: new Date(2026, 7, 1, 12, 0).toISOString(),
    reactionNote: null,
    notes: null,
    recipeId: null,
    recipeTitle: null,
    foods: [{ id: "other-food", slug: "kiwi", name: "Kiwi", category: "fruit", storageItemId: null }],
  };
  queryClient.setQueryData([...trackingKeys.meals(BABY.id), { limit: 100 }], { items: [...meals, other] });
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

  it("spaces its sections 18px apart (item 649)", () => {
    expect(renderFood(catalogFood())).toContain('<div class="flex flex-col gap-[18px] p-4">');
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
    expect(html).not.toContain("6–8 mo");
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
    // Item 659: the 104px hero plate (A-Salmon), tinted by the custom food's category.
    expect(html).toContain("width:104px;height:104px;font-size:52px;background:var(--color-plate-grain)");
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
    // Item 676: the same 48px 16px/700 "lg" pair as Home.
    for (const href of [`/log-meal?food=${id}`, `/storage/add?food=${id}`]) {
      const tag = new RegExp(`<a [^>]*href="${href.replace("?", "\\?")}"[^>]*>`).exec(html)?.[0] ?? "";
      expect(tag).toContain("min-h-12 px-4 py-2.5 text-base font-bold");
    }
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

  // Item 666: the count moved up into the hero's stats line, above the pair.
  it("keeps the served-count fact, pluralized, in the hero above the pair", () => {
    const two = renderFoodWithMeals(catalogFood(), 2);
    expect(two).toContain('<p class="text-sm tabular-nums text-[var(--color-text-muted)]">Served 2 times</p>');
    expect(two.indexOf("Served 2 times")).toBeGreaterThan(two.indexOf(">Fish<"));
    expect(two.indexOf("Served 2 times")).toBeLessThan(two.indexOf(">Log meal<"));
    // The header names the baby; the line no longer does.
    expect(two).not.toContain("to Robin");
    expect(renderFoodWithMeals(catalogFood(), 1)).toContain(">Served 1 time</p>");
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
    // Item 659: the pairing's emoji sits on a plate too (pairings carry no category; the slug map tints it).
    expect(html).toContain("width:32px;height:32px;font-size:16px;background:var(--color-plate-fruit)");
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
    const average = html.indexOf("★</span> <strong");
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

describe("FoodDetailPage hero stats line (item 666)", () => {
  it("merges the average (semibold, item 719), the rating count and the served count into one line", () => {
    const html = renderFoodWithMeals(catalogFood(), 3, [2, 4]);
    expect(html).toContain(
      '<span aria-hidden="true"><span class="text-[var(--color-apricot-graphic)]">★</span> <strong class="font-semibold text-[var(--color-text)]">3.0</strong> · 2 ratings · served 3 times</span>',
    );
    expect(html).toContain('<span class="sr-only">Rated 3.0 out of 5, 2 ratings, served 3 times</span>');
    // One line: no second served fact anywhere else on the page.
    expect(html).not.toContain("Served");
  });

  it("leaves out a part with nothing to say, and keeps singulars", () => {
    const ratedOnly = renderFoodWithMeals(catalogFood(), 0, [5]);
    expect(ratedOnly).toContain(
      '<strong class="font-semibold text-[var(--color-text)]">5.0</strong> · 1 rating</span>',
    );
    expect(ratedOnly).toContain('<span class="sr-only">Rated 5.0 out of 5, 1 rating</span>');
    expect(ratedOnly).not.toMatch(/served/i);
    const servedOnce = renderFoodWithMeals(catalogFood(), 1, [3, 4]);
    expect(servedOnce).toContain(" · 2 ratings · served 1 time</span>");
    expect(servedOnce).toContain("Rated 3.5 out of 5, 2 ratings, served 1 time</span>");
  });

  it("renders nothing with no baby, or with neither ratings nor servings", () => {
    for (const html of [renderFood(catalogFood()), renderFoodWithMeals(catalogFood(), 0, [])]) {
      expect(html).not.toContain("★");
      expect(html).not.toMatch(/served/i);
      expect(html).not.toContain("tabular-nums");
    }
  });
});

describe("FoodDetailPage choking notes callout (item 667)", () => {
  const callout = (html: string) => /<div[^>]*danger-callout-bg[^>]*>.*?Check for bones\.<\/p><\/div>/s.exec(html)?.[0] ?? "";

  it("is a calm tinted callout: 1px border, 16px radius, the callout tokens", () => {
    const box = callout(renderFood(catalogFood()));
    expect(box).toContain(
      'class="flex flex-col gap-1.5 rounded-2xl border border-[var(--color-danger-callout-border)] bg-[var(--color-danger-callout-bg)] px-4 py-3.5"',
    );
    expect(box).not.toContain("border-2");
    expect(box).not.toContain("var(--color-danger)");
    expect(box).not.toContain("⚠️");
  });

  it("titles it in the callout red with a hidden triangle icon, the body in ink", () => {
    const box = callout(renderFood(catalogFood()));
    expect(box).toMatch(
      /<p class="[^"]*text-\[var\(--color-danger-callout-text\)\]"><svg[^>]*aria-hidden="true"[^>]*><path d="M12 4 2\.5 20h19z"><\/path>.*<\/svg>Choking notes<\/p>/s,
    );
    expect(box).toContain('<p class="text-[15px] leading-[1.45] text-[var(--color-text)]">Check for bones.</p>');
  });
});

describe("FoodDetailPage prep by age (item 668)", () => {
  /** A baby born on the 1st, `months` months before today, so its stage never drifts. */
  function babyAged(months: number): Baby {
    const born = new Date();
    born.setUTCDate(1);
    born.setUTCMonth(born.getUTCMonth() - months);
    return { ...BABY, birthDate: born.toISOString().slice(0, 10) };
  }
  const checked = (html: string) => /role="radio" aria-checked="true"[^>]*>([^<]*)</.exec(html)?.[1];

  it("is a three-way Age segmented control, in age order", () => {
    const html = renderFood(catalogFood());
    expect(html).toContain('role="radiogroup" aria-label="Age"');
    const labels = [...html.matchAll(/role="radio"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(labels).toEqual(["6–8 mo", "9–11 mo", "12+ mo"]);
    expect(html).toMatch(/Prep by age<\/h2><div role="radiogroup"/);
  });

  it("shows one stage's text at a time, the earliest with no baby", () => {
    const html = renderFood(catalogFood());
    expect(checked(html)).toBe("6–8 mo");
    expect(html).toContain('<p class="text-base text-[var(--color-text)]">Flake it off the skin.</p>');
    expect(html).not.toContain("Small flakes.");
    expect(html).not.toContain("Bite-size pieces.");
  });

  it("defaults to the baby's current stage", () => {
    const cases: Array<[number, string, string]> = [
      [7, "6–8 mo", "Flake it off the skin."],
      [8, "6–8 mo", "Flake it off the skin."],
      [9, "9–11 mo", "Small flakes."],
      [10, "9–11 mo", "Small flakes."],
      [12, "12+ mo", "Bite-size pieces."],
      [13, "12+ mo", "Bite-size pieces."],
    ];
    for (const [months, label, prep] of cases) {
      const html = renderFood(catalogFood(), [babyAged(months)]);
      expect(checked(html)).toBe(label);
      expect(html).toContain(`>${prep}</p>`);
      expect(html.match(/(Flake it off the skin|Small flakes|Bite-size pieces)\./g)).toHaveLength(1);
    }
  });
});
