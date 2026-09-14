// Drives the catalog_filtered hook without a DOM: React's `useRef`/`useEffect`
// are replaced with a tiny store so the hook can be called as a function, its
// effect run by hand and its debounce advanced with fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { refs: [] as { current: unknown }[], r: 0, effects: [] as (() => void | (() => void))[] };
  return {
    store,
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    useEffect: (effect: () => void | (() => void)) => {
      store.effects.push(effect);
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useRef: h.useRef, useEffect: h.useEffect };
});

const tracked: Array<[string, Record<string, unknown>]> = [];
vi.mock("./track.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, track: (...args: unknown[]) => tracked.push(args as [string, Record<string, unknown>]) };
});

import {
  CATALOG_FILTER_DEBOUNCE_MS,
  catalogFilterKeys,
  hasCatalogQuery,
  useCatalogFilteredEvent,
  type CatalogFilteredInput,
} from "./useCatalogFiltered.js";

let cleanup: (() => void) | null = null;

/** One render of the hook plus the effect it queued. */
function render(input: CatalogFilteredInput): void {
  h.store.r = 0;
  h.store.effects = [];
  cleanup?.();
  cleanup = null;
  useCatalogFilteredEvent(input);
  for (const effect of h.store.effects) {
    const teardown = effect();
    if (typeof teardown === "function") cleanup = teardown;
  }
}

beforeEach(() => {
  tracked.length = 0;
  h.store.refs = [];
  h.store.r = 0;
  h.store.effects = [];
  cleanup = null;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("catalogFilterKeys — which controls, never what they were set to", () => {
  it("maps the foods page's filter state onto the shared enum keys", () => {
    expect(
      catalogFilterKeys({
        q: "sweet potato",
        category: "vegetable",
        allergen: "peanut",
        ironLevel: "high",
        vitaminCLevel: undefined,
        fiberLevel: undefined,
        maxAgeMonths: 9,
      }),
    ).toEqual(["category", "allergen", "iron_level", "max_age_months"]);
  });

  it("maps the recipes segment's filter state the same way", () => {
    expect(
      catalogFilterKeys({
        q: "",
        scope: "favorites",
        maxAgeMonths: undefined,
        allergen: undefined,
        ironFocus: true,
        vitaminCHigh: undefined,
        fiberHigh: undefined,
        ingredientFoodId: "food-1",
      }),
    ).toEqual(["scope", "iron_focus", "ingredient_food_id"]);
  });

  it("never emits the search box's contents, under any key", () => {
    const keys = catalogFilterKeys({ q: "priya peanut rash" });
    expect(keys).toEqual([]);
    expect(JSON.stringify(keys)).not.toContain("priya");
  });

  it("does not count the default scope as a filter, nor an off toggle", () => {
    expect(catalogFilterKeys({ scope: "all", ironFocus: false, allergen: "" })).toEqual([]);
  });

  it("ignores fields nobody has decided a name for", () => {
    expect(catalogFilterKeys({ somethingNew: "value" })).toEqual([]);
  });

  it("answers has_query as a boolean and nothing more", () => {
    expect(hasCatalogQuery({ q: "oat" })).toBe(true);
    expect(hasCatalogQuery({ q: "   " })).toBe(false);
    expect(hasCatalogQuery({})).toBe(false);
  });
});

describe("useCatalogFilteredEvent", () => {
  const foods = (filters: object, resultCount: number | undefined): CatalogFilteredInput => ({
    catalog: "foods",
    filters,
    resultCount,
  });

  it("says nothing about the filters a page MOUNTED with — that is a page view", () => {
    render(foods({ q: undefined, fiberLevel: "high" }, 8));
    vi.advanceTimersByTime(CATALOG_FILTER_DEBOUNCE_MS * 2);
    expect(tracked).toEqual([]);
  });

  it("reports a settled change once its results have landed", () => {
    render(foods({ q: undefined }, 40));
    render(foods({ q: undefined, ironLevel: "high" }, undefined)); // loading
    vi.advanceTimersByTime(CATALOG_FILTER_DEBOUNCE_MS * 2);
    expect(tracked).toEqual([]);

    render(foods({ q: undefined, ironLevel: "high" }, 12));
    vi.advanceTimersByTime(CATALOG_FILTER_DEBOUNCE_MS - 1);
    expect(tracked).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(tracked).toEqual([
      [
        "catalog_filtered",
        { catalog: "foods", filters: ["iron_level"], has_query: false, results: "6-20", zero_results: false },
      ],
    ]);
  });

  it("turns a typed query into ONE event rather than one per keystroke", () => {
    render(foods({ q: undefined }, 40));
    for (const q of ["o", "oa", "oat", "oats"]) {
      render(foods({ q }, 3));
      vi.advanceTimersByTime(200);
    }
    expect(tracked).toEqual([]);
    vi.advanceTimersByTime(CATALOG_FILTER_DEBOUNCE_MS);
    expect(tracked).toHaveLength(1);
    expect(tracked[0]![1]).toEqual({
      catalog: "foods",
      filters: [],
      has_query: true,
      results: "1-5",
      zero_results: false,
    });
  });

  it("flags a zero-result combination, which is the answer the plan actually wants", () => {
    render(foods({ q: undefined }, 40));
    render(foods({ q: undefined, ironLevel: "high", allergen: "peanut" }, 0));
    vi.advanceTimersByTime(CATALOG_FILTER_DEBOUNCE_MS);
    expect(tracked[0]![1]).toMatchObject({ filters: ["iron_level", "allergen"], results: "0", zero_results: true });
  });

  it("reports the same filters again if the parent comes back to them", () => {
    render(foods({ q: undefined }, 40));
    render(foods({ q: undefined, ironLevel: "high" }, 12));
    vi.advanceTimersByTime(CATALOG_FILTER_DEBOUNCE_MS);
    render(foods({ q: undefined }, 40));
    vi.advanceTimersByTime(CATALOG_FILTER_DEBOUNCE_MS);
    expect(tracked).toHaveLength(2);
  });

  it("stays silent while a query is erroring — `results` must answer the filters it is sent with", () => {
    render(foods({ q: undefined }, 40));
    render(foods({ q: undefined, category: "fruit" }, undefined));
    vi.advanceTimersByTime(CATALOG_FILTER_DEBOUNCE_MS * 3);
    expect(tracked).toEqual([]);
  });
});
