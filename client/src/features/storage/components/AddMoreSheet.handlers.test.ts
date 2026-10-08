// The Serve sheet's "Add more" (MR-Add-More, ledger 760), called as a plain
// function with its hooks mocked (the vi.hoisted store idiom), so ticking,
// picking and "Add" run in node. The markup is pinned by rendering the
// sheet's own children: the open Sheet portals to a document.body node lacks.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { StorageItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    storage: [] as unknown[],
    storageLoading: false,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] =
          typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useMemo: (fn: () => unknown) => fn() };
});
vi.mock("../hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useStorageItems: () => ({ data: { items: h.storage }, isLoading: h.storageLoading }),
}));
vi.mock("../../catalog/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useFoods: () => ({
    data: {
      foods: [
        { id: "food-banana", slug: "banana", name: "Banana", category: "fruit", emoji: null, allergens: [] },
        { id: "food-pear", slug: "pear", name: "Pear", category: "fruit", emoji: null, allergens: [] },
      ],
    },
    isLoading: false,
  }),
  useRecipes: () => ({
    data: {
      recipes: [
        { id: "r-oat", title: "Oat Pancakes", isCustom: false, isFavorite: false },
        { id: "r-dal", title: "Red Lentil Dal", isCustom: true, isFavorite: false },
      ],
    },
    isLoading: false,
  }),
}));

import { ADD_MORE_TABS, AddMoreSheet, addMoreStorageItems } from "./AddMoreSheet.js";
import { Button } from "../../../components/ui/Button.js";
import { MultiCombobox } from "../../../components/ui/MultiCombobox.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl.js";
import { FoodPicker } from "../../catalog/components/FoodPicker.js";

const BASE: StorageItem = {
  id: "11111111-1111-1111-1111-111111111111",
  label: null,
  foods: [{ id: "food-1", slug: "avocado", name: "Avocado", emoji: null }],
  recipeId: null,
  recipeTitle: null,
  preparedAt: "2026-08-20T10:00:00.000Z",
  location: "fridge",
  status: "active",
  statusChangedAt: "2026-08-20T10:00:00.000Z",
  expiresAt: "2026-08-23T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: 6,
  servingsLeft: 6,
  bestBy: null,
  notes: null,
};
const SALMON: StorageItem = {
  ...BASE,
  id: "22222222-2222-2222-2222-222222222222",
  foods: [],
  recipeId: "aaaaaaaa-0000-0000-0000-000000000002",
  recipeTitle: "Salmon Cakes",
  location: "freezer",
};
const PEAR: StorageItem = { ...BASE, id: "33333333-3333-3333-3333-333333333333", foods: [], label: "Pear purée cubes", recipeTitle: null };
const LABEL_ONLY: StorageItem = { ...BASE, id: "44444444-4444-4444-4444-444444444444", foods: [], label: "Mystery" };
const PEAR_FOODS: StorageItem = { ...PEAR, foods: [{ id: "food-pear", slug: "pear", name: "Pear", emoji: null }], servingsTotal: 12, servingsLeft: 10 };

interface El {
  type: unknown;
  props: Record<string, unknown>;
}
function findAll(node: unknown, match: (element: El) => boolean, out: El[] = []): El[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, match, out);
    return out;
  }
  const element = node as El;
  if (match(element)) out.push(element);
  for (const value of Object.values(element.props ?? {})) findAll(value, match, out);
  return out;
}
const one = (tree: El, type: unknown) => {
  const [found] = findAll(tree, (element) => element.type === type);
  if (!found) throw new Error("missing element");
  return found;
};

const added: unknown[] = [];
function render(servingIds: string[] = [BASE.id]): El {
  h.store.i = 0;
  return (AddMoreSheet as unknown as (props: unknown) => El)({ servingIds, onAdd: (picks: unknown) => added.push(picks), onClose: () => {} });
}
function reset(storage: StorageItem[]) {
  h.store.states = [];
  h.storage = storage;
  h.storageLoading = false;
  added.length = 0;
}
const checkboxes = (tree: El) => findAll(tree, (element) => element.type === "input" && element.props.type === "checkbox");

describe("addMoreStorageItems — what 'From storage' offers (items 730, 760)", () => {
  it("lists active containers that have something to serve and are not already in the list", () => {
    const finished = { ...SALMON, id: "55555555-5555-5555-5555-555555555555", status: "finished" as const };
    expect(addMoreStorageItems([BASE, SALMON, LABEL_ONLY, finished, PEAR_FOODS], [BASE.id]).map((item) => item.id)).toEqual([
      SALMON.id,
      PEAR_FOODS.id,
    ]);
  });

  it("leaves out a tracked container with no servings left: the server would refuse the whole serve (409)", () => {
    const empty = { ...PEAR_FOODS, id: "66666666-6666-6666-6666-666666666666", servingsTotal: 2, servingsLeft: 0 };
    const untracked = { ...SALMON, id: "77777777-7777-7777-7777-777777777777", servingsTotal: null, servingsLeft: null };
    expect(addMoreStorageItems([empty, untracked, PEAR_FOODS], []).map((item) => item.id)).toEqual([untracked.id, PEAR_FOODS.id]);
  });
});

describe("AddMoreSheet (MR-Add-More, ledger 760)", () => {
  it("is titled 'Add more' with the three approved segments, From storage first", () => {
    reset([BASE, SALMON]);
    const tree = render();
    expect(tree.props.title).toBe("Add more");
    expect(tree.props.showClose).toBe(true);
    expect(ADD_MORE_TABS.map((tab) => tab.label)).toEqual(["From storage", "A food", "A recipe"]);
    expect(one(tree, SegmentedControl).props.value).toBe("storage");
    expect(one(tree, SegmentedControl).props["aria-label"]).toBe("Add more");
  });

  it("keeps Add disabled until something is picked", () => {
    reset([BASE, SALMON]);
    expect(one(render(), Button).props.disabled).toBe(true);
  });

  it("ticks containers, a fresh food and a fresh recipe across segments, and adds them all at once, in the order picked", () => {
    reset([BASE, SALMON, PEAR_FOODS]);
    const boxes = checkboxes(render());
    expect(boxes).toHaveLength(2); // Avocado is already being served
    (boxes[1]!.props.onChange as (event: unknown) => void)({ target: { checked: true } }); // Pear purée cubes
    (checkboxes(render())[0]!.props.onChange as (event: unknown) => void)({ target: { checked: true } }); // Salmon Cakes
    expect(checkboxes(render()).map((box) => box.props.checked)).toEqual([true, true]);

    (one(render(), SegmentedControl).props.onChange as (value: string) => void)("food");
    expect(findAll(render(), (element) => element.type === "input")).toHaveLength(0);
    const picker = one(render(), FoodPicker);
    expect(picker.props.inline).toBe(true);
    (picker.props.onChange as (ids: string[]) => void)(["food-banana"]);

    (one(render(), SegmentedControl).props.onChange as (value: string) => void)("recipe");
    const combobox = one(render(), MultiCombobox);
    expect(combobox.props.inline).toBe(true);
    expect(combobox.props.placeholder).toBe("Search recipes…");
    expect((combobox.props.options as { label: string }[]).map((option) => option.label)).toEqual(["Red Lentil Dal", "Oat Pancakes"]);
    (combobox.props.onChange as (ids: string[]) => void)(["r-oat"]);

    const add = one(render(), Button);
    expect(add.props.disabled).toBe(false);
    (add.props.onClick as () => void)();
    expect(added).toEqual([
      {
        items: [PEAR_FOODS, SALMON],
        foods: [expect.objectContaining({ id: "food-banana", name: "Banana" })],
        recipes: [{ id: "r-oat", title: "Oat Pancakes" }],
      },
    ]);
  });

  it("enables Add for a fresh food alone, or a fresh recipe alone — no container needed", () => {
    reset([BASE, SALMON]);
    (one(render(), SegmentedControl).props.onChange as (value: string) => void)("food");
    (one(render(), FoodPicker).props.onChange as (ids: string[]) => void)(["food-pear"]);
    expect(one(render(), Button).props.disabled).toBe(false);

    reset([BASE, SALMON]);
    (one(render(), SegmentedControl).props.onChange as (value: string) => void)("recipe");
    (one(render(), MultiCombobox).props.onChange as (ids: string[]) => void)(["r-dal"]);
    const add = one(render(), Button);
    expect(add.props.disabled).toBe(false);
    (add.props.onClick as () => void)();
    expect(added).toEqual([{ items: [], foods: [], recipes: [{ id: "r-dal", title: "Red Lentil Dal" }] }]);
  });

  it("unticking takes a container back out", () => {
    reset([BASE, SALMON]);
    (checkboxes(render())[0]!.props.onChange as (event: unknown) => void)({ target: { checked: true } });
    (checkboxes(render())[0]!.props.onChange as (event: unknown) => void)({ target: { checked: false } });
    expect(one(render(), Button).props.disabled).toBe(true);
  });

  it("each row shows the container's plate, name and where it is with what is left", () => {
    reset([BASE, SALMON, PEAR_FOODS]);
    const tree = render();
    const html = renderToString(
      createElement(QueryClientProvider, { client: new QueryClient() }, tree.props.children as never),
    );
    expect(html).toContain(">Salmon Cakes</span>");
    expect(html).toContain(">Freezer · 6 of 6 left</span>");
    expect(html).toContain(">Pear purée cubes</span>");
    expect(html).toContain(">Fridge · 10 of 12 left</span>");
    expect(html).toContain(">🍲</span>");
    // A whole row is the checkbox's label: the tap target is the row.
    expect(html).toMatch(/<label class="flex min-h-14 cursor-pointer[^"]*"><input type="checkbox"/);
    expect(html).toContain(">Add</button>");
  });

  it("says so when there is nothing else in storage, and nothing at all while it loads", () => {
    reset([BASE]);
    const html = () =>
      renderToString(createElement(QueryClientProvider, { client: new QueryClient() }, render().props.children as never));
    expect(html()).toContain("Nothing else in storage to add.");
    h.storageLoading = true;
    h.storage = [];
    expect(html()).not.toContain("Nothing else in storage to add.");
  });
});
