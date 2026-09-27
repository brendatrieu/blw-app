// Drives RecipesSegment's own sort state without a DOM (item 576) — the
// recipes twin of FoodsPage.handlers.test.ts.
import { describe, expect, it, vi } from "vitest";
import type { RatingSummary, RecipeListItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const reported: object[] = [];
  return {
    store,
    reported,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useMemo: (factory: () => unknown) => factory() };
});

const recipe = (id: string, title: string) => ({ id, title, ingredientNames: [], allergens: [] }) as unknown as RecipeListItem;
const summary = (average: number, day: number): RatingSummary => ({
  average,
  count: 1,
  latest: average,
  lastRatedAt: `2026-09-${day}T12:00:00.000Z`,
});

vi.mock("../hooks.js", () => ({
  useFoods: () => ({ data: { foods: [] } }),
  // Title order — the server's usual order for recipes.
  useRecipes: () => ({ data: { recipes: [recipe("a", "Apple mash"), recipe("b", "Beef stew"), recipe("c", "Congee")] } }),
}));
vi.mock("../../babies/useActiveBaby.js", () => ({ useActiveBaby: () => ({ activeBaby: { id: "baby-1" } }) }));
vi.mock("../../tracking/hooks.js", () => ({
  useRatings: () => ({ data: { foods: {}, recipes: { b: summary(2, 25), c: summary(4, 5) } } }),
}));
vi.mock("../../../lib/usage/useCatalogFiltered.js", () => ({
  useCatalogFilteredEvent: ({ filters }: { filters: object }) => h.reported.push(filters),
}));

import { EMPTY_RECIPE_FILTERS, RecipeCard, RecipeFilterGroups, RecipesSegment } from "./RecipesSegment.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function all(node: unknown, type: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((child) => all(child, type, out));
  else if (node && typeof node === "object" && "props" in node) {
    const el = node as El;
    if (el.type === type) out.push(el);
    all(el.props.children, type, out);
  }
  return out;
}
function render(): El {
  h.store.i = 0;
  return (RecipesSegment as unknown as () => El)();
}
const order = (tree: El) => all(tree, RecipeCard).map((card) => (card.props.recipe as RecipeListItem).title);
const pickSort = (sort: string) =>
  (all(render(), RecipeFilterGroups)[0]!.props.onChange as (next: object) => void)({ ...EMPTY_RECIPE_FILTERS, sort });

describe("RecipesSegment rating sort (item 576)", () => {
  it("reorders the list by the chosen sort, never-rated last in title order, and reports the sort key", () => {
    expect(order(render())).toEqual(["Apple mash", "Beef stew", "Congee"]);

    pickSort("highest");
    expect(order(render())).toEqual(["Congee", "Beef stew", "Apple mash"]);
    expect(h.reported.at(-1)).toMatchObject({ sort: "highest" });

    pickSort("recent");
    expect(order(render())).toEqual(["Beef stew", "Congee", "Apple mash"]);
  });
});
