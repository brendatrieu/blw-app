// Drives FoodsPage's own sort state without a DOM (item 576): the Filters
// sheet's `onChange` is called by hand, and the grid's tile order and the
// analytics payload are read off the re-rendered tree. Idiom from
// FoodDetailPage.handlers.test.ts (a tiny `useState` store).
import { describe, expect, it, vi } from "vitest";
import type { FoodListItem, RatingSummary } from "@blw/shared";

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

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useSearchParams: () => [new URLSearchParams()] };
});

const food = (id: string, name: string) => ({ id, slug: name.toLowerCase(), name, category: "fruit" }) as FoodListItem;
const summary = (average: number, day: number): RatingSummary => ({
  average,
  count: 1,
  latest: average,
  lastRatedAt: `2026-09-${day}T12:00:00.000Z`,
});

vi.mock("../features/catalog/hooks.js", () => ({
  // The server's usual order.
  useFoods: () => ({ data: { foods: [food("a", "Apple"), food("b", "Beef"), food("c", "Carrot"), food("d", "Date")] } }),
}));
vi.mock("../features/babies/useActiveBaby.js", () => ({ useActiveBaby: () => ({ activeBaby: { id: "baby-1" } }) }));
vi.mock("../features/tracking/hooks.js", () => ({
  useRatings: () => ({ data: { foods: { b: summary(3, 20), d: summary(5, 10) }, recipes: {} } }),
}));
vi.mock("../lib/usage/useCatalogFiltered.js", () => ({
  useCatalogFilteredEvent: ({ filters }: { filters: object }) => h.reported.push(filters),
}));

import { EMPTY_EXTRA_FILTERS, FoodFilterGroups, FoodsPage } from "./FoodsPage.js";
import { FoodTile } from "../features/catalog/components/FoodTile.js";

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
  return (FoodsPage as unknown as () => El)();
}
const order = (tree: El) => all(tree, FoodTile).map((tile) => (tile.props.food as FoodListItem).name);
const pickSort = (sort: string) =>
  (all(render(), FoodFilterGroups)[0]!.props.onChange as (next: object) => void)({ ...EMPTY_EXTRA_FILTERS, sort });

describe("FoodsPage rating sort (item 576)", () => {
  it("reorders the grid by the chosen sort, never-rated last in the usual order, and reports the sort key", () => {
    expect(order(render())).toEqual(["Apple", "Beef", "Carrot", "Date"]);

    pickSort("highest");
    expect(order(render())).toEqual(["Date", "Beef", "Apple", "Carrot"]);
    expect(h.reported.at(-1)).toMatchObject({ sort: "highest" });

    pickSort("recent");
    expect(order(render())).toEqual(["Beef", "Date", "Apple", "Carrot"]);
  });
});
