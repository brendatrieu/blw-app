import { useEffect, useRef } from "react";
import type { UsageEvent } from "@blw/shared";
import { resultsBucket } from "./properties.js";
import { track } from "./track.js";

/**
 * `catalog_filtered` — which controls a parent reached for on Foods and
 * Recipes, and whether the list came back empty.
 *
 * The question behind it is narrow: are the nutrition filters worth their
 * space, and which filter COMBINATIONS produce zero results (a gap in the
 * catalog, not a mistake by the parent). So the event carries the filter
 * KEYS, a results bucket, and a boolean for whether a search box had
 * anything in it. It never carries the search text, the chosen category, the
 * allergen, or the ingredient id — a search box is the one field in this app
 * a parent might type a child's name into.
 */

type CatalogFilteredProps = Extract<UsageEvent, { name: "catalog_filtered" }>["props"];
export type CatalogFilterKey = CatalogFilteredProps["filters"][number];

/**
 * Long enough that typing "sweet potato" is one event rather than twelve,
 * and short enough that the parent is still looking at the result when it
 * fires. Also debounces rapid chip taps, which is the same win.
 */
export const CATALOG_FILTER_DEBOUNCE_MS = 800;

/**
 * Filter-state field → the shared enum key. Restated per field rather than
 * derived by a camel→snake helper, so adding a filter to a page without
 * deciding what it is called in the data is a type error, not a silent gap.
 */
const FILTER_KEY_BY_FIELD: Readonly<Record<string, CatalogFilterKey>> = {
  category: "category",
  allergen: "allergen",
  ironLevel: "iron_level",
  vitaminCLevel: "vitamin_c_level",
  fiberLevel: "fiber_level",
  maxAgeMonths: "max_age_months",
  scope: "scope",
  ironFocus: "iron_focus",
  vitaminCHigh: "vitamin_c_high",
  fiberHigh: "fiber_high",
  ingredientFoodId: "ingredient_food_id",
};

/** Ceiling from the shared schema — more keys than either page has controls. */
const MAX_FILTER_KEYS = 12;

/**
 * Which filters were ACTIVE, as keys.
 *
 * `q` is skipped outright: it is represented by `has_query`, so the text has
 * nowhere to go. A `scope` of "all" is the default rather than a filter, and
 * an off toggle (`false`, `""`, `undefined`) is not a filter either.
 */
export function catalogFilterKeys(filters: object): CatalogFilterKey[] {
  const keys: CatalogFilterKey[] = [];
  // `object` rather than `Record<string, unknown>`: the pages pass their own
  // interfaces (`RecipeFilters`), which TypeScript will not widen into an
  // index signature, and this only ever READS entries.
  for (const [field, value] of Object.entries(filters as Record<string, unknown>)) {
    const key = FILTER_KEY_BY_FIELD[field];
    if (!key) continue;
    if (value === undefined || value === null || value === false || value === "") continue;
    if (field === "scope" && value === "all") continue;
    keys.push(key);
  }
  return keys.slice(0, MAX_FILTER_KEYS);
}

/** Whether the search box had anything in it. Never what. */
export function hasCatalogQuery(filters: object): boolean {
  const q = (filters as { q?: unknown }).q;
  return typeof q === "string" && q.trim().length > 0;
}

export interface CatalogFilteredInput {
  catalog: CatalogFilteredProps["catalog"];
  /** The exact filter object the query was keyed on. */
  filters: object;
  /** Rows the resolved query returned; `undefined` while it is loading or errored. */
  resultCount: number | undefined;
}

/**
 * Fires once per settled filter change, after the results for that change
 * have actually arrived.
 *
 * The filter state the page MOUNTED with is never reported — a deep link
 * into `/foods?fiberLevel=high` is a page view, not a filter interaction —
 * and a change whose query has not resolved yet waits, so `results` is
 * always the answer to the filters it is sent with.
 */
export function useCatalogFilteredEvent({ catalog, filters, resultCount }: CatalogFilteredInput): void {
  const signature = JSON.stringify(filters);
  // `useRef` keeps its first argument: this is the page's starting point.
  const lastReported = useRef(signature);

  useEffect(() => {
    if (resultCount === undefined) return;
    if (lastReported.current === signature) return;

    const timer = setTimeout(() => {
      lastReported.current = signature;
      track("catalog_filtered", {
        catalog,
        filters: catalogFilterKeys(filters),
        has_query: hasCatalogQuery(filters),
        results: resultsBucket(resultCount),
        zero_results: resultCount === 0,
      });
    }, CATALOG_FILTER_DEBOUNCE_MS);

    // A further keystroke or tap lands here first, so a typed query is one
    // event rather than one per character.
    return () => clearTimeout(timer);
    // Keyed on the filters' SIGNATURE rather than the object: the pages
    // memoize it, but a signature is what "changed" actually means here.
  }, [catalog, signature, filters, resultCount]);
}
