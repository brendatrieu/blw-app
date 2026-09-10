import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { RECIPES_TAB_PATH, addCustomFoodLabel } from "../features/catalog/constants.js";
import {
  FoodsPage,
  FoodsRoute,
  NoFoodsEmptyState,
  legacyRecipesTabRedirect,
  activeExtraFilters,
  buildFoodsFilters,
  EMPTY_EXTRA_FILTERS,
  FoodFilterGroups,
  initialExtraFiltersFromSearch,
} from "./FoodsPage.js";

/** React's SSR escaping — the create label contains apostrophes. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;");
}

describe("FoodsPage", () => {
  it("renders the sticky filter bar with search input and grouped filter chips, without throwing", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(FoodsPage, null)),
      ),
    );

    // The sticky wrapper is pinned under the app header, independent of load state.
    expect(html).toContain("var(--header-height)");
    expect(html).toMatch(/class="[^"]*sticky[^"]*"/);
    expect(html).toContain('aria-label="Search foods"');
    expect(html).toContain('aria-label="Category"');
    // Allergen/iron/vitamin C/age move into the Filters sheet, closed by default.
    expect(html).toContain("Filters");
    expect(html).not.toContain('aria-label="Allergen"');
    // `Sheet` renders nothing while closed (see FoodPicker.test.ts), so the
    // Vitamin C group — like Iron — never reaches this static render either;
    // this only pins that it doesn't leak past the closed sheet.
    expect(html).not.toContain("Vitamin C");
    // Same for the Fiber group added in item 279.
    expect(html).not.toContain(">Fiber<");
  });

  // Item 179: adding a food of your own is a first-class action on this page,
  // not something buried behind an empty state.
  it("offers 'Add food' in the header, linking to the create page", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(FoodsPage, null)),
      ),
    );
    expect(html).toContain('href="/foods/new"');
    expect(html).toContain(">Add food<");
  });

  // Item 273: recipes moved to /recipes and their own nav tab, taking the
  // Foods | Recipes segmented control and the `?tab=` state with them.
  it("is the catalog alone — no segmented control, no recipe list", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(FoodsPage, null)),
      ),
    );
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain('aria-label="Catalog section"');
    expect(html).not.toContain(">Recipes<");
    expect(html).not.toContain('aria-label="Search recipes"');
    expect(html).not.toContain('aria-label="Recipe scope"');
    expect(html).not.toContain('href="/recipes/new"');
  });
});

/** The `/foods` route element at a given URL — `?tab=` no longer picks a
 * segment, it only decides whether you get redirected (item 273). */
function renderRouteAt(url: string): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: [url] }, createElement(FoodsRoute, null)),
    ),
  );
}

describe("legacyRecipesTabRedirect (item 273)", () => {
  it("sends the old ?tab=recipes links to the recipes route", () => {
    expect(legacyRecipesTabRedirect("recipes")).toBe("/recipes");
    // The one spelling of the destination, shared with every other caller.
    expect(legacyRecipesTabRedirect("recipes")).toBe(RECIPES_TAB_PATH);
  });

  it("leaves every other value on the catalog", () => {
    expect(legacyRecipesTabRedirect(null)).toBeNull();
    expect(legacyRecipesTabRedirect("")).toBeNull();
    expect(legacyRecipesTabRedirect("foods")).toBeNull();
    expect(legacyRecipesTabRedirect("Recipes")).toBeNull();
    expect(legacyRecipesTabRedirect("nonsense")).toBeNull();
  });
});

describe("FoodsRoute (what /foods actually renders)", () => {
  it("renders the catalog for a plain /foods, and for a stray ?tab= value", () => {
    expect(renderRouteAt("/foods")).toContain('aria-label="Search foods"');
    expect(renderRouteAt("/foods?tab=sandwiches")).toContain('aria-label="Search foods"');
  });

  // Item 280: the tummy article's constipation section links here, so the
  // funnel has to arrive already set — pill, funnel count and all.
  it("arrives with the fiber filter on from /foods?fiberLevel=high", () => {
    const html = renderRouteAt("/foods?fiberLevel=high");
    expect(html).toContain('aria-label="Remove High fiber filter"');
    // The funnel's count badge agrees with the pill row (one filter, not zero).
    expect(html).toMatch(/class="[^"]*color-danger[^"]*"[^>]*>1</);
  });

  it("ignores a hand-edited ?fiberLevel= value instead of filtering to nothing", () => {
    const html = renderRouteAt("/foods?fiberLevel=very-high");
    expect(html).not.toContain("Remove");
    expect(html).toContain('aria-label="Search foods"');
  });

  it("redirects /foods?tab=recipes instead of rendering the catalog", () => {
    // `Navigate` renders nothing and defers the redirect to an effect, which
    // a server render never runs — so "redirected" looks like empty output
    // here (same convention as RecipeEditPage.test.ts).
    expect(renderRouteAt("/foods?tab=recipes")).toBe("");
  });
});

describe("NoFoodsEmptyState", () => {
  it("offers to create the searched-for food, carrying the query over as ?name=", () => {
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(NoFoodsEmptyState, { query: "Kale chips" })),
    );
    expect(html).toContain(escapeHtml(addCustomFoodLabel("Kale chips")));
    expect(html).toContain('href="/foods/new?name=Kale%20chips"');
  });

  it("trims the query before both quoting and encoding it", () => {
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(NoFoodsEmptyState, { query: "  Kale chips  " })),
    );
    expect(html).toContain('href="/foods/new?name=Kale%20chips"');
    expect(html).toContain(escapeHtml(addCustomFoodLabel("Kale chips")));
  });

  it("falls back to 'clear a filter' advice when there is no query to name a food after", () => {
    const html = renderToString(createElement(MemoryRouter, null, createElement(NoFoodsEmptyState, { query: "   " })));
    expect(html).toContain("Try clearing a filter or two.");
    expect(html).not.toContain("/foods/new?name=");
    expect(html).not.toContain("as a custom food");
  });
});

describe("activeExtraFilters (funnel count + pill row share this)", () => {
  it("yields one labelled pill per set filter, in display order, and nothing when none are set", () => {
    expect(activeExtraFilters(EMPTY_EXTRA_FILTERS)).toEqual([]);
    const pills = activeExtraFilters({
      allergen: "egg",
      ironLevel: "high",
      vitaminCLevel: "moderate",
      fiberLevel: "high",
      maxAgeMonths: 6,
    });
    expect(pills.map((p) => p.key)).toEqual(["allergen", "ironLevel", "vitaminCLevel", "fiberLevel", "maxAgeMonths"]);
    expect(pills.map((p) => p.label)).toEqual(["Egg", "High iron", "Moderate vitamin C", "High fiber", "6m+"]);
  });

  it("counts vitamin C on its own", () => {
    const pills = activeExtraFilters({ ...EMPTY_EXTRA_FILTERS, vitaminCLevel: "low" });
    expect(pills).toEqual([{ key: "vitaminCLevel", label: "Low vitamin C" }]);
  });

  // Item 279: fiber is a level filter like the other two, so every level —
  // not just "high" — gets its own pill and counts toward the funnel badge.
  it("counts fiber on its own, at every level", () => {
    expect(activeExtraFilters({ ...EMPTY_EXTRA_FILTERS, fiberLevel: "high" })).toEqual([
      { key: "fiberLevel", label: "High fiber" },
    ]);
    expect(activeExtraFilters({ ...EMPTY_EXTRA_FILTERS, fiberLevel: "moderate" })).toEqual([
      { key: "fiberLevel", label: "Moderate fiber" },
    ]);
    expect(activeExtraFilters({ ...EMPTY_EXTRA_FILTERS, fiberLevel: "low" })).toEqual([
      { key: "fiberLevel", label: "Low fiber" },
    ]);
  });
});

describe("FoodFilterGroups (the sheet's chip groups, rendered open)", () => {
  it("renders a Vitamin C group right after Iron with its three chips, the chosen one pressed", () => {
    const html = renderToString(
      createElement(FoodFilterGroups, {
        ...EMPTY_EXTRA_FILTERS,
        vitaminCLevel: "high",
        onChange: () => {},
      }),
    );
    const iron = html.indexOf(">Iron<");
    const vitC = html.indexOf(">Vitamin C<");
    const age = html.indexOf(">Age<");
    expect(iron).toBeGreaterThan(-1);
    expect(vitC).toBeGreaterThan(iron);
    expect(age).toBeGreaterThan(vitC);
    expect(html).toMatch(/aria-pressed="true"[^>]*>High vitamin C</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Moderate vitamin C</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Low vitamin C</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>High iron</);
  });

  // Item 279: Fiber sits between Vitamin C and Age, with the same three
  // chips the other level groups have.
  it("renders a Fiber group right after Vitamin C with its three chips, the chosen one pressed", () => {
    const html = renderToString(
      createElement(FoodFilterGroups, {
        ...EMPTY_EXTRA_FILTERS,
        fiberLevel: "moderate",
        onChange: () => {},
      }),
    );
    const vitC = html.indexOf(">Vitamin C<");
    const fiber = html.indexOf(">Fiber<");
    const age = html.indexOf(">Age<");
    expect(fiber).toBeGreaterThan(vitC);
    expect(age).toBeGreaterThan(fiber);
    expect(html).toMatch(/aria-pressed="false"[^>]*>High fiber</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Moderate fiber</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Low fiber</);
    // The other groups' chips stay unpressed — fiber is its own filter.
    expect(html).toMatch(/aria-pressed="false"[^>]*>Moderate vitamin C</);
  });
});

// Item 280: an article can link straight at a filtered catalog
// (`/foods?fiberLevel=high` from the tummy article's constipation section).
describe("initialExtraFiltersFromSearch (what a link into /foods presets)", () => {
  const from = (search: string) => initialExtraFiltersFromSearch(new URLSearchParams(search));

  it("presets nothing for a plain /foods", () => {
    expect(from("")).toEqual(EMPTY_EXTRA_FILTERS);
    expect(activeExtraFilters(from(""))).toEqual([]);
  });

  it("reads ?fiberLevel=, the link the constipation section actually uses", () => {
    expect(from("?fiberLevel=high").fiberLevel).toBe("high");
    expect(activeExtraFilters(from("?fiberLevel=high"))).toEqual([{ key: "fiberLevel", label: "High fiber" }]);
  });

  it("reads ?ironLevel=, ?vitaminCLevel= and ?allergen= the same way, together", () => {
    expect(from("?ironLevel=high&vitaminCLevel=moderate&fiberLevel=low&allergen=egg")).toEqual({
      allergen: "egg",
      ironLevel: "high",
      vitaminCLevel: "moderate",
      fiberLevel: "low",
      maxAgeMonths: undefined,
    });
  });

  it("ignores values the chips don't have rather than presetting a filter that matches nothing", () => {
    expect(from("?fiberLevel=HIGH").fiberLevel).toBeUndefined();
    expect(from("?fiberLevel=").fiberLevel).toBeUndefined();
    expect(from("?fiberLevel=very-high").fiberLevel).toBeUndefined();
    expect(from("?ironLevel=nonsense").ironLevel).toBeUndefined();
    expect(from("?vitaminCLevel=1").vitaminCLevel).toBeUndefined();
    expect(from("?allergen=kiwi").allergen).toBeUndefined();
    // A bad value alongside a good one drops only the bad one.
    expect(from("?fiberLevel=high&allergen=kiwi")).toEqual({ ...EMPTY_EXTRA_FILTERS, fiberLevel: "high" });
  });

  it("leaves the age chips alone — no link in the app asks for one", () => {
    expect(from("?maxAgeMonths=9").maxAgeMonths).toBeUndefined();
  });
});

describe("buildFoodsFilters (what the grid actually requests)", () => {
  it("passes every funnel filter through to the request, vitamin C and fiber included, and trims the search", () => {
    const filters = buildFoodsFilters("  beef ", "protein", {
      allergen: "egg",
      ironLevel: "high",
      vitaminCLevel: "low",
      fiberLevel: "high",
      maxAgeMonths: 9,
    });
    expect(filters).toEqual({
      q: "beef",
      category: "protein",
      allergen: "egg",
      ironLevel: "high",
      vitaminCLevel: "low",
      fiberLevel: "high",
      maxAgeMonths: 9,
    });
    expect(buildFoodsFilters("   ", undefined, EMPTY_EXTRA_FILTERS).q).toBeUndefined();
  });

  it("Clear all's payload switches every funnel filter off", () => {
    expect(Object.keys(EMPTY_EXTRA_FILTERS).sort()).toEqual([
      "allergen",
      "fiberLevel",
      "ironLevel",
      "maxAgeMonths",
      "vitaminCLevel",
    ]);
    expect(Object.values(EMPTY_EXTRA_FILTERS).every((v) => v === undefined)).toBe(true);
    expect(activeExtraFilters(EMPTY_EXTRA_FILTERS)).toEqual([]);
  });
});
