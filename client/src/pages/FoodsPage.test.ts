import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby, FoodListItem } from "@blw/shared";
import { RECIPES_TAB_PATH, addCustomFoodLabel } from "../features/catalog/constants.js";
import { babyKeys } from "../features/babies/api.js";
import { catalogKeys } from "../features/catalog/hooks.js";
import { trackingKeys } from "../features/tracking/hooks.js";
import { RatingSortGroup, withoutPill } from "../features/catalog/components/filters.js";
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
  type ExtraFoodFilters,
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
    // Item 332: the chip row is seven equal-width chips on a 360px phone, so
    // the spice category shows its SHORT label here. The long one belongs to
    // the custom-food select (pinned in CustomFoodForm.test.ts).
    expect(html).toContain(">Spices<");
    expect(html).not.toContain("Spices &amp; herbs");
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
    // Item 700: no description line under the title.
    expect(html).not.toContain("Iron-rich foods first");
    expect(html).not.toMatch(/<\/h1><\/div><p /);
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
    // The funnel's count badge agrees with the pill row (one filter, not
    // zero), and is the apricot dot with its ink number, not red (item 653).
    expect(html).toMatch(/class="[^"]*bg-\[var\(--color-apricot-graphic\)\][^"]*text-\[var\(--color-apricot-graphic-ink\)\][^"]*"[^>]*>1</);
    // The count is a figure, so it sits on tabular digits like every other count.
    expect(html).toMatch(/class="[^"]*tabular-nums[^"]*"[^>]*>1</);
    expect(html).not.toContain("--color-danger");
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
      allergen: ["egg"],
      ironLevel: ["high"],
      vitaminCLevel: ["moderate"],
      fiberLevel: ["high"],
      maxAgeMonths: 6,
      deleted: true,
    });
    expect(pills.map((p) => p.key)).toEqual([
      "allergen",
      "ironLevel",
      "vitaminCLevel",
      "fiberLevel",
      "maxAgeMonths",
      "deleted",
    ]);
    expect(pills.map((p) => p.label)).toEqual(["Egg", "High iron", "Moderate vitamin C", "High fiber", "6m+", "Deleted"]);
  });

  it("counts vitamin C on its own", () => {
    const pills = activeExtraFilters({ ...EMPTY_EXTRA_FILTERS, vitaminCLevel: ["low"] });
    expect(pills).toEqual([{ key: "vitaminCLevel", value: "low", label: "Low vitamin C" }]);
  });

  // Item 596: one pill per picked value, in chip order; the badge counts them.
  it("yields one pill per picked value in a pick-several group", () => {
    const pills = activeExtraFilters({
      ...EMPTY_EXTRA_FILTERS,
      vitaminCLevel: ["high", "moderate"],
      allergen: ["egg", "peanut"],
      maxAgeMonths: 9,
    });
    expect(pills).toEqual([
      { key: "allergen", value: "egg", label: "Egg" },
      { key: "allergen", value: "peanut", label: "Peanut" },
      { key: "vitaminCLevel", value: "high", label: "High vitamin C" },
      { key: "vitaminCLevel", value: "moderate", label: "Moderate vitamin C" },
      { key: "maxAgeMonths", label: "9m+" },
    ]);
  });

  it("removing one pill removes only that value; a pick-one pill clears its filter", () => {
    const filters: ExtraFoodFilters = {
      ...EMPTY_EXTRA_FILTERS,
      vitaminCLevel: ["high", "moderate"],
      allergen: ["egg"],
      maxAgeMonths: 9,
      deleted: true,
    };
    const pills = activeExtraFilters(filters);
    const pill = (label: string) => pills.find((p) => p.label === label)!;
    expect(withoutPill(filters, EMPTY_EXTRA_FILTERS, pill("High vitamin C"))).toEqual({
      ...filters,
      vitaminCLevel: ["moderate"],
    });
    expect(withoutPill(filters, EMPTY_EXTRA_FILTERS, pill("Egg"))).toEqual({ ...filters, allergen: [] });
    expect(withoutPill(filters, EMPTY_EXTRA_FILTERS, pill("9m+"))).toEqual({ ...filters, maxAgeMonths: undefined });
    expect(withoutPill(filters, EMPTY_EXTRA_FILTERS, pill("Deleted"))).toEqual({ ...filters, deleted: undefined });
  });

  // Item 279: fiber is a level filter like the other two, so every level —
  // not just "high" — gets its own pill and counts toward the funnel badge.
  it("counts fiber on its own, at every level", () => {
    expect(activeExtraFilters({ ...EMPTY_EXTRA_FILTERS, fiberLevel: ["high"] })).toEqual([
      { key: "fiberLevel", value: "high", label: "High fiber" },
    ]);
    expect(activeExtraFilters({ ...EMPTY_EXTRA_FILTERS, fiberLevel: ["moderate"] })).toEqual([
      { key: "fiberLevel", value: "moderate", label: "Moderate fiber" },
    ]);
    expect(activeExtraFilters({ ...EMPTY_EXTRA_FILTERS, fiberLevel: ["low"] })).toEqual([
      { key: "fiberLevel", value: "low", label: "Low fiber" },
    ]);
  });
});

describe("FoodFilterGroups (the sheet's chip groups, rendered open)", () => {
  it("renders a Vitamin C group right after Iron with its three chips, the chosen one pressed", () => {
    const html = renderToString(
      createElement(FoodFilterGroups, {
        ...EMPTY_EXTRA_FILTERS,
        vitaminCLevel: ["high"],
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
        fiberLevel: ["moderate"],
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

// Ledger 544: Foods › Deleted is the first chip of a "Show" group at the end
// of the sheet — the category row has no room at 390 px.
describe("FoodFilterGroups — Show › Deleted", () => {
  it("renders a Show group after Age with a Deleted chip, pressed only when on", () => {
    const off = renderToString(createElement(FoodFilterGroups, { ...EMPTY_EXTRA_FILTERS, onChange: () => {} }));
    expect(off.indexOf(">Show<")).toBeGreaterThan(off.indexOf(">Age<"));
    expect(off).toMatch(/aria-pressed="false"[^>]*>Deleted</);
    const on = renderToString(
      createElement(FoodFilterGroups, { ...EMPTY_EXTRA_FILTERS, deleted: true, onChange: () => {} }),
    );
    expect(on).toMatch(/aria-pressed="true"[^>]*>Deleted</);
  });

  it("toggles the filter on, then off again", () => {
    expect(tapChip(EMPTY_EXTRA_FILTERS, "Deleted")).toEqual({ ...EMPTY_EXTRA_FILTERS, deleted: true });
    expect(tapChip({ ...EMPTY_EXTRA_FILTERS, deleted: true }, "Deleted")).toEqual(EMPTY_EXTRA_FILTERS);
  });
});

/** The `onChange` payload of tapping the chip labelled `label` in the sheet. */
function tapChip(filters: ExtraFoodFilters, label: string): ExtraFoodFilters {
  let changed: ExtraFoodFilters | undefined;
  const found: Array<{ props: { label?: string; onClick?: () => void } }> = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object" || node === null || !("props" in node)) return;
    const element = node as { props: { label?: string; children?: unknown; onClick?: () => void } };
    if (element.props.label === label) found.push(element);
    walk(element.props.children);
  };
  walk(FoodFilterGroups({ ...filters, onChange: (next) => (changed = next) }));
  found[0]!.props.onClick!();
  return changed!;
}

// Item 592: Allergen, Iron, Vitamin C and Fiber are pick-several; Age,
// Deleted and the sort stay pick-one.
describe("FoodFilterGroups — pick-several vs pick-one", () => {
  it("adds a second pick in a group instead of replacing the first, in chip order", () => {
    const one = tapChip(EMPTY_EXTRA_FILTERS, "Moderate vitamin C");
    expect(one.vitaminCLevel).toEqual(["moderate"]);
    const two = tapChip(one, "High vitamin C");
    expect(two.vitaminCLevel).toEqual(["high", "moderate"]);
    // Tapping a picked chip removes only that one.
    expect(tapChip(two, "Moderate vitamin C").vitaminCLevel).toEqual(["high"]);

    expect(tapChip(tapChip(EMPTY_EXTRA_FILTERS, "Peanut"), "Egg").allergen).toEqual(["egg", "peanut"]);
    expect(tapChip(tapChip(EMPTY_EXTRA_FILTERS, "Low iron"), "High iron").ironLevel).toEqual(["high", "low"]);
    expect(tapChip(tapChip(EMPTY_EXTRA_FILTERS, "High fiber"), "Low fiber").fiberLevel).toEqual(["high", "low"]);
  });

  it("presses every picked chip", () => {
    const html = renderToString(
      createElement(FoodFilterGroups, { ...EMPTY_EXTRA_FILTERS, vitaminCLevel: ["high", "moderate"], onChange: () => {} }),
    );
    expect(html).toMatch(/aria-pressed="true"[^>]*>High vitamin C</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Moderate vitamin C</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Low vitamin C</);
  });

  // The sort's own chip is pinned pick-one in "offers the one rating sort".
  it("keeps Age pick-one", () => {
    expect(tapChip(tapChip(EMPTY_EXTRA_FILTERS, "6m+"), "9m+").maxAgeMonths).toBe(9);
    expect(tapChip({ ...EMPTY_EXTRA_FILTERS, maxAgeMonths: 9 }, "6m+").maxAgeMonths).toBe(6);
    expect(tapChip({ ...EMPTY_EXTRA_FILTERS, maxAgeMonths: 9 }, "9m+").maxAgeMonths).toBeUndefined();
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
    expect(from("?fiberLevel=high").fiberLevel).toEqual(["high"]);
    expect(activeExtraFilters(from("?fiberLevel=high"))).toEqual([
      { key: "fiberLevel", value: "high", label: "High fiber" },
    ]);
  });

  it("reads ?ironLevel=, ?vitaminCLevel= and ?allergen= the same way, together", () => {
    expect(from("?ironLevel=high&vitaminCLevel=moderate&fiberLevel=low&allergen=egg")).toEqual({
      ...EMPTY_EXTRA_FILTERS,
      allergen: ["egg"],
      ironLevel: ["high"],
      vitaminCLevel: ["moderate"],
      fiberLevel: ["low"],
    });
  });

  // Item 595: a link can preselect several chips by repeating the param.
  it("reads a repeated param as several picks, in chip order", () => {
    expect(from("?vitaminCLevel=moderate&vitaminCLevel=high&allergen=peanut&allergen=egg")).toEqual({
      ...EMPTY_EXTRA_FILTERS,
      vitaminCLevel: ["high", "moderate"],
      allergen: ["egg", "peanut"],
    });
    // A bad value among good ones drops only the bad one.
    expect(from("?ironLevel=high&ironLevel=HUGE&ironLevel=low").ironLevel).toEqual(["high", "low"]);
  });

  it("ignores values the chips don't have rather than presetting a filter that matches nothing", () => {
    expect(from("?fiberLevel=HIGH").fiberLevel).toEqual([]);
    expect(from("?fiberLevel=").fiberLevel).toEqual([]);
    expect(from("?fiberLevel=very-high").fiberLevel).toEqual([]);
    expect(from("?ironLevel=nonsense").ironLevel).toEqual([]);
    expect(from("?vitaminCLevel=1").vitaminCLevel).toEqual([]);
    expect(from("?allergen=kiwi").allergen).toEqual([]);
    // A bad value alongside a good one drops only the bad one.
    expect(from("?fiberLevel=high&allergen=kiwi")).toEqual({ ...EMPTY_EXTRA_FILTERS, fiberLevel: ["high"] });
  });

  it("leaves the age chips alone — no link in the app asks for one", () => {
    expect(from("?maxAgeMonths=9").maxAgeMonths).toBeUndefined();
  });
});

describe("buildFoodsFilters (what the grid actually requests)", () => {
  it("passes every funnel filter through to the request, vitamin C and fiber included, and trims the search", () => {
    const filters = buildFoodsFilters("  beef ", ["protein", "veg"], {
      allergen: ["egg"],
      ironLevel: ["high"],
      vitaminCLevel: ["high", "low"],
      fiberLevel: ["high"],
      maxAgeMonths: 9,
      deleted: true,
    });
    expect(filters).toEqual({
      q: "beef",
      category: ["protein", "veg"],
      allergen: ["egg"],
      ironLevel: ["high"],
      vitaminCLevel: ["high", "low"],
      fiberLevel: ["high"],
      maxAgeMonths: 9,
      deleted: true,
    });
    expect(buildFoodsFilters("   ", [], EMPTY_EXTRA_FILTERS).q).toBeUndefined();
  });

  it("Clear all's payload switches every funnel filter off", () => {
    expect(Object.keys(EMPTY_EXTRA_FILTERS).sort()).toEqual([
      "allergen",
      "deleted",
      "fiberLevel",
      "ironLevel",
      "maxAgeMonths",
      "sort",
      "vitaminCLevel",
    ]);
    // Every filter off: pick-several groups empty, the rest unset.
    expect(Object.values(EMPTY_EXTRA_FILTERS).every((v) => v === undefined || (Array.isArray(v) && v.length === 0))).toBe(
      true,
    );
    expect(activeExtraFilters(EMPTY_EXTRA_FILTERS)).toEqual([]);
  });
});

describe("ratings on the Foods grid (items 575-576)", () => {
  const BABY: Baby = {
    id: "baby-1",
    name: "Robin",
    birthDate: "2026-01-01",
    notes: null,
    archived: false,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const food = (id: string, name: string): FoodListItem => ({
    id,
    slug: name.toLowerCase(),
    name,
    category: "fruit",
    ironLevel: "low",
    vitaminCLevel: "low",
    fiberLevel: "low",
    chokingRisk: "low",
    minAgeMonths: 6,
    allergens: [],
    isCustom: false,
    emoji: null,
  });

  it("shows the active baby's average on rated tiles only", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [BABY]);
    queryClient.setQueryData(catalogKeys.foodsList({}), { foods: [food("f1", "Apple"), food("f2", "Banana")] });
    queryClient.setQueryData(trackingKeys.ratings(BABY.id), {
      foods: { f2: { average: 4.2, count: 5, latest: 4, lastRatedAt: "2026-09-27T12:00:00.000Z" } },
      recipes: {},
    });
    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, createElement(MemoryRouter, null, createElement(FoodsPage, null))),
    );
    expect(html.match(/★<\/span> 4\.2 \(5\)/g)).toHaveLength(1);
    // On Banana's tile, not Apple's.
    expect(html.indexOf("★</span> 4.2 (5)")).toBeGreaterThan(html.indexOf("Banana"));
  });

  it("offers the one rating sort: a tap turns it on, a second tap goes back to the usual order (item 586)", () => {
    const picked: unknown[] = [];
    const chips = (value: "highest" | undefined) =>
      (
        RatingSortGroup({ value, onChange: (sort) => picked.push(sort) }) as unknown as {
          props: { children: [unknown, { props: { children: { props: { label: string; onClick: () => void } }[] } }] };
        }
      ).props.children[1].props.children;
    expect(chips(undefined).map((chip) => chip.props.label)).toEqual(["Average rating"]);
    chips(undefined)[0]!.props.onClick();
    chips("highest")[0]!.props.onClick();
    expect(picked).toEqual(["highest", undefined]);
  });

  it("offers the average rating sort in the Filters sheet, and a pill names it", () => {
    const html = renderToString(createElement(FoodFilterGroups, { ...EMPTY_EXTRA_FILTERS, sort: "highest", onChange: () => {} }));
    expect(html).toContain(">Sort<");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Average rating</);
    expect(html).not.toContain("Most recent");
    expect(activeExtraFilters({ ...EMPTY_EXTRA_FILTERS, sort: "highest" })).toEqual([{ key: "sort", label: "Average rating" }]);
    // The sort is not a server filter: the request is unchanged by it.
    expect(buildFoodsFilters("", [], { ...EMPTY_EXTRA_FILTERS, sort: "highest" })).toEqual(
      buildFoodsFilters("", [], EMPTY_EXTRA_FILTERS),
    );
  });
});
