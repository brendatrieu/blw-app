// Item 694: Home's ‹ › paging driven through the real components. Hooks are
// a slot store (idiom from MealDeleteDialog.handlers / Menu.handlers), the
// components are called as plain functions, and the element tree is read by
// hand — so "click ›", "items shrink" and "delete the last row" run in node.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    meals: [] as unknown[],
    storage: [] as unknown[],
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states))
        store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      return [store.states[i], (value: unknown) => (store.states[i] = value)];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useMemo: (fn: () => unknown) => fn() };
});
vi.mock("../features/tracking/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMeals: () => ({ data: { items: h.meals }, isLoading: false, isError: false }),
  useDeleteMeal: () => ({ isPending: false, isError: false, mutate: () => {} }),
}));
vi.mock("../features/storage/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useStorageItems: () => ({ data: { items: h.storage }, isLoading: false }),
}));

import { Card } from "../components/ui/Card.js";
import { Pager, type PageWindow } from "../components/ui/Pager.js";
import { MealCard, ServeLogList } from "../features/tracking/components/ServeLogList.js";
import { StorageItemRow } from "../features/storage/components/StorageItemCard.js";
import { StorageSection } from "./DashboardPage.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function find(node: unknown, type: unknown): El | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const el = node as El;
  return el.type === type ? el : find(el.props.children, type);
}

function view(render: () => unknown, row: unknown) {
  h.store.i = 0;
  const tree = render();
  const pager = find(tree, Pager);
  const rows = ((find(tree, Card)?.props.children ?? []) as El[]).filter((el) => el.type === row);
  return {
    pages: pager?.props.pages as PageWindow | undefined,
    next: () =>
      (pager!.props.onPage as (p: number) => void)((pager!.props.pages as PageWindow).page + 1),
    ids: rows.map((el) => ((el.props.meal ?? el.props.item) as { id: string }).id),
    tree,
  };
}

const meal = (i: number) => ({
  id: `meal-${i}`,
  foods: [],
  servedAt: "2026-09-20T12:00:00.000Z",
  notes: null,
  reactionNote: null,
});
const item = (i: number) => ({ id: `item-${i}`, foods: [] });
const foodLog = () =>
  view(
    () =>
      (ServeLogList as unknown as (p: unknown) => unknown)({
        babyId: "b",
        limit: 3,
        seeAllHref: "/meals",
        grouped: true,
      }),
    MealCard,
  );
const storage = () =>
  view(
    () => (StorageSection as unknown as (p: unknown) => unknown)({ babyId: "b" }),
    StorageItemRow,
  );

beforeEach(() => {
  h.store.states = [];
  h.meals = Array.from({ length: 8 }, (_, i) => meal(i));
  h.storage = Array.from({ length: 8 }, (_, i) => item(i));
});

describe("Food log paging", () => {
  it("› shows the next three", () => {
    expect(foodLog().ids).toEqual(["meal-0", "meal-1", "meal-2"]);
    foodLog().next();
    const v = foodLog();
    expect(v.ids).toEqual(["meal-3", "meal-4", "meal-5"]);
    expect(v.pages).toMatchObject({ page: 1, start: 3, end: 6, total: 8 });
  });

  it("deleting the last page's only meal lands on the new last page, not an empty one", () => {
    h.meals = h.meals.slice(0, 7);
    foodLog().next();
    foodLog().next();
    expect(foodLog().ids).toEqual(["meal-6"]);
    h.meals = h.meals.slice(0, 6);
    const v = foodLog();
    expect(v.ids).toEqual(["meal-3", "meal-4", "meal-5"]);
    expect(v.pages?.page).toBe(1);
    // › from the clamped page steps from what's shown, not the stale state.
    v.next();
    expect(foodLog().ids).toEqual(["meal-3", "meal-4", "meal-5"]);
  });

  it("drops the pager once three or fewer are left; See all stays", () => {
    h.meals = h.meals.slice(0, 3);
    const v = foodLog();
    expect(v.pages?.last).toBe(0);
    expect(Pager(find(v.tree, Pager)!.props as unknown as Parameters<typeof Pager>[0])).toBeNull();
    expect(JSON.stringify(v.tree, (k, val) => (k === "_owner" ? undefined : val))).toContain(
      '"to":"/meals"',
    );
  });

  it("says 100+ when the fetch came back full", () => {
    h.meals = Array.from({ length: 100 }, (_, i) => meal(i));
    h.store.i = 0;
    const pager = find(
      (ServeLogList as unknown as (p: unknown) => unknown)({
        babyId: "b",
        limit: 3,
        seeAllHref: "/meals",
        grouped: true,
      }),
      Pager,
    );
    expect(pager!.props.capped).toBe(true);
    h.meals = h.meals.slice(0, 99);
    h.store.i = 0;
    expect(
      find(
        (ServeLogList as unknown as (p: unknown) => unknown)({
          babyId: "b",
          limit: 3,
          grouped: true,
        }),
        Pager,
      )!.props.capped,
    ).toBe(false);
  });
});

describe("Storage paging", () => {
  it("› shows the next three, and using items up clamps to the new last page", () => {
    storage().next();
    storage().next();
    expect(storage().ids).toEqual(["item-6", "item-7"]);
    h.storage = h.storage.slice(0, 5);
    const v = storage();
    expect(v.ids).toEqual(["item-3", "item-4"]);
    expect(v.pages).toMatchObject({ page: 1, last: 1 });
  });

  it("has no pager at three items", () => {
    h.storage = h.storage.slice(0, 3);
    const v = storage();
    expect(v.ids).toHaveLength(3);
    expect(v.pages?.last).toBe(0);
    expect(Pager(find(v.tree, Pager)!.props as unknown as Parameters<typeof Pager>[0])).toBeNull();
  });
});

describe("Food log paging resets per baby", () => {
  it("keys Home's ServeLogList by the active baby, so switching babies starts at page one", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
    expect(src).toContain("<ServeLogList key={activeBaby.id} babyId={activeBaby.id}");
  });
});
