// Pins the read policy `useRecipes` hands to `useQuery` (item 353), which a
// renderToString suite cannot see at all: staleness is invisible in HTML, so
// dropping `fresh` — or splitting it onto its own query key — would leave the
// whole client suite green while the Log meal picker went back to showing a
// five-minute-old recipe list, the exact bug this item is fixing.
//
// Harness idiom: the vi.hoisted store from TourDialog.handlers.test.ts, with
// `useQuery` itself as the seam. Mocked out, `useRecipes` is a plain function
// call and needs no React and no QueryClientProvider; rendering RecipePicker
// through the same mock is what pins the CALLER, end to end.
import { describe, expect, it, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    reset: () => {
      calls.length = 0;
    },
  };
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useQuery: (options: Record<string, unknown>) => {
      h.calls.push(options);
      return { data: undefined, isLoading: true, isError: false, status: "pending" };
    },
  };
});

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { catalogKeys, useRecipes } from "./hooks.js";
import { RecipePicker } from "./components/RecipePicker.js";

function lastQueryOptions(): Record<string, unknown> {
  expect(h.calls.length).toBeGreaterThan(0);
  return h.calls[h.calls.length - 1]!;
}

beforeEach(() => {
  h.reset();
});

describe("useRecipes read policy", () => {
  it("caches for five minutes by default — the Recipes tab is browsing, not lookup", () => {
    useRecipes();
    const options = lastQueryOptions();
    expect(options.staleTime).toBe(5 * 60 * 1000);
    expect(options.refetchOnMount).not.toBe("always");
    expect(options.queryKey).toEqual(catalogKeys.recipesList({}));
  });

  it("with fresh, treats the cache as stale and always refetches on mount", () => {
    useRecipes({}, { fresh: true });
    const options = lastQueryOptions();
    expect(options.staleTime).toBe(0);
    expect(options.refetchOnMount).toBe("always");
  });

  // The whole point of an options bag rather than a second query key: one
  // cache entry, so the fresh reader's refetch also updates the browsing list
  // instead of fetching the same 122 recipes into a second copy.
  it("keeps the SAME query key whether or not fresh is asked for", () => {
    useRecipes({ scope: "custom" });
    const cached = lastQueryOptions().queryKey;
    useRecipes({ scope: "custom" }, { fresh: true });
    expect(lastQueryOptions().queryKey).toEqual(cached);
    expect(lastQueryOptions().queryKey).toEqual(catalogKeys.recipesList({ scope: "custom" }));
  });

  it("passes an explicit fresh: false through as the cached policy", () => {
    useRecipes({}, { fresh: false });
    expect(lastQueryOptions().staleTime).toBe(5 * 60 * 1000);
  });
});

describe("RecipePicker read policy", () => {
  it("reads the unfiltered list fresh, so a recipe just written elsewhere is pickable", () => {
    renderToString(createElement(RecipePicker, { id: "log-food-recipe", value: "", onChange: () => {} }));
    const options = lastQueryOptions();
    expect(options.queryKey).toEqual(catalogKeys.recipesList({}));
    expect(options.staleTime).toBe(0);
    expect(options.refetchOnMount).toBe("always");
  });
});
