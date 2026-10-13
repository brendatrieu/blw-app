// The Serve sheet's "Add more" (MR2 boards, ledger 789), called as a plain
// function with its hooks mocked (the vi.hoisted store idiom), so ticking,
// searching, switching tabs and "Add" run in node. The markup is pinned by
// rendering the sheet's own children: the open Sheet portals to a
// document.body node lacks.
import { createElement, Fragment } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MealItem, StorageItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    storage: [] as unknown[],
    storageLoading: false,
    meals: [] as unknown[],
    mealsBaby: "" as string | undefined,
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
vi.mock("../../tracking/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMeals: (babyId: string | undefined, query: unknown) => {
    h.mealsBaby = babyId;
    expect(query).toEqual({ limit: 100 }); // Home's food-log key: already cached
    return { data: { items: h.meals }, isLoading: false };
  },
}));
vi.mock("../../catalog/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // The API orders foods by iron level, not by name.
  useFoods: () => ({
    data: {
      foods: [
        { id: "food-pear", slug: "pear", name: "Pear", category: "fruit", emoji: null, allergens: [] },
        { id: "food-oats", slug: "oats", name: "Oats", category: "grain", emoji: null, allergens: [] },
        { id: "food-banana", slug: "banana", name: "Banana", category: "fruit", emoji: null, allergens: [] },
      ],
    },
    isLoading: false,
  }),
  useRecipes: () => ({
    data: {
      recipes: [
        { id: "r-oat", title: "Oat Pancakes", isCustom: false, isFavorite: false },
        { id: "r-dal", title: "Red Lentil Dal", isCustom: true, isFavorite: false },
        { id: "r-apple", title: "Apple Oatmeal", isCustom: false, isFavorite: false },
        { id: "r-cod", title: "Baked Cod", isCustom: false, isFavorite: false },
        { id: "r-egg", title: "Egg Muffins", isCustom: false, isFavorite: false },
      ],
    },
    isLoading: false,
  }),
}));

import { ADD_MORE_SEARCH_TABS, ADD_MORE_TABS, AddMoreSheet, RECENT_LIMIT, addMoreStorageItems, recentIds, type AddMoreServing } from "./AddMoreSheet.js";
import { Button } from "../../../components/ui/Button.js";
import { Input } from "../../../components/ui/Input.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl.js";

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
  recipeTitle: "Salmon Oat Cakes",
  location: "freezer",
};
const PEAR: StorageItem = { ...BASE, id: "33333333-3333-3333-3333-333333333333", foods: [], label: "Pear purée cubes", recipeTitle: null };
const LABEL_ONLY: StorageItem = { ...BASE, id: "44444444-4444-4444-4444-444444444444", foods: [], label: "Mystery" };
const PEAR_FOODS: StorageItem = { ...PEAR, foods: [{ id: "food-pear", slug: "pear", name: "Pear", emoji: null }], servingsTotal: 12, servingsLeft: 10 };

type MealFoodish = { id: string; inRecipe?: boolean };
const meal = (id: string, recipes: string[], foods: MealFoodish[]): MealItem =>
  ({
    id,
    recipes: recipes.map((recipeId) => ({ id: recipeId, title: recipeId, rating: null })),
    recipeId: recipes[0] ?? null,
    recipeTitle: null,
    foods: foods.map((food) => ({ slug: food.id, name: food.id, category: "fruit", storageItemId: null, ...food })),
  }) as unknown as MealItem;

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
let serving: AddMoreServing = { itemIds: [BASE.id], recipeIds: [], foodIds: [] };
function render(): El {
  h.store.i = 0;
  return (AddMoreSheet as unknown as (props: unknown) => El)({
    babyId: "baby-1",
    serving,
    onAdd: (picks: unknown) => added.push(picks),
    onClose: () => {},
  });
}
function reset(storage: StorageItem[], meals: MealItem[] = [], listed: Partial<AddMoreServing> = {}) {
  serving = { itemIds: [BASE.id], recipeIds: [], foodIds: [], ...listed };
  h.store.states = [];
  h.storage = storage;
  h.storageLoading = false;
  h.meals = meals;
  added.length = 0;
}
/** The tickable rows, as elements (title, checked, onToggle). */
const rows = (tree: El) => findAll(tree, (element) => typeof element.props?.onToggle === "function");
const titles = (tree: El) => rows(tree).map((row) => row.props.title);
const tick = (title: string, checked = true) => {
  const row = rows(render()).find((entry) => entry.props.title === title);
  if (!row) throw new Error(`no row ${title}`);
  (row.props.onToggle as (checked: boolean) => void)(checked);
};
const goTo = (tab: string) => (one(render(), SegmentedControl).props.onChange as (value: string) => void)(tab);
const type = (text: string) => (one(render(), Input).props.onChange as (event: unknown) => void)({ target: { value: text } });
/** The scrolling list's key: a new one remounts it, back at the top. */
const listKey = (tree: El) =>
  (findAll(tree, (element) => String(element.props?.className ?? "").includes("overflow-y-auto"))[0] as unknown as { key: string }).key;
/** The tab row as shown: its labels and the highlighted one. */
const tabRow = (tree: El) => {
  const control = one(tree, SegmentedControl).props as { options: { value: string; label: string }[]; value: string };
  return { labels: control.options.map((option) => option.label), value: control.value };
};
const html = (tree: El) => renderToString(createElement(Fragment, null, tree.props.children as never));

describe("addMoreStorageItems — what 'In storage' offers (items 730, 760)", () => {
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

describe("recentIds — this baby's recent recipes and foods (ledger 789)", () => {
  it("newest meal first, each once, recipes in pick order; a recipe's ingredients are not recent foods", () => {
    const meals = [
      meal("m3", ["r-dal", "r-oat"], [{ id: "food-oats", inRecipe: true }, { id: "food-banana", inRecipe: false }]),
      meal("m2", [], [{ id: "food-pear" }, { id: "food-banana" }]),
      meal("m1", ["r-oat", "r-cod"], [{ id: "food-egg", inRecipe: true }]),
    ];
    expect(recentIds(meals)).toEqual({ recipeIds: ["r-dal", "r-oat", "r-cod"], foodIds: ["food-banana", "food-pear"] });
  });

  it("reads an older cached meal's single legacy recipe", () => {
    const legacy = { ...meal("m1", [], [{ id: "food-pear" }]), recipes: undefined, recipeId: "r-egg" } as MealItem;
    expect(recentIds([legacy]).recipeIds).toEqual(["r-egg"]);
  });
});

describe("AddMoreSheet (MR2 boards, ledger 789)", () => {
  it("is a fixed-height 'Add more' sheet: one search box, then the three approved tabs, In storage first", () => {
    reset([BASE, SALMON]);
    const tree = render();
    expect(tree.props.title).toBe("Add more");
    expect(tree.props.showClose).toBe(true);
    expect(tree.props.fixedHeight).toBe(true);
    expect(ADD_MORE_TABS.map((tab) => tab.label)).toEqual(["In storage", "Recipes", "Foods"]);
    expect(one(tree, SegmentedControl).props.value).toBe("storage");
    expect(one(tree, SegmentedControl).props["aria-label"]).toBe("Add more");
    const search = one(tree, Input);
    expect(search.props.type).toBe("search");
    expect(search.props.placeholder).toBe("Search storage, recipes, foods…");
    expect(h.mealsBaby).toBe("baby-1");
    // The search box, the tabs and the Add footer never shrink; only the
    // list between them scrolls.
    const out = html(tree);
    expect(out).toMatch(/<div class="scroll-momentum scroll-thin -mx-4 min-h-0 flex-1 overflow-y-auto px-4">/);
    expect(out).toMatch(/<div class="-mx-4 shrink-0 border-t [^"]*"><button[^>]*>Add<\/button><\/div>$/);
  });

  it("keeps a plain Add, disabled until something is picked", () => {
    reset([BASE, SALMON]);
    const add = one(render(), Button);
    expect(add.props.disabled).toBe(true);
    expect(add.props.children).toBe("Add");
  });

  it("Recipes opens with this baby's recent ones (at most three, ones the list still has), then every recipe A–Z", () => {
    const meals = [
      meal("m3", ["r-gone", "r-dal"], []),
      meal("m2", ["r-egg"], []),
      meal("m1", ["r-dal", "r-cod", "r-oat"], []),
    ];
    reset([BASE], meals);
    goTo("recipe");
    const tree = render();
    expect(titles(tree)).toEqual([
      "Red Lentil Dal",
      "Egg Muffins",
      "Baked Cod",
      "Apple Oatmeal",
      "Baked Cod",
      "Egg Muffins",
      "Oat Pancakes",
      "Red Lentil Dal",
    ]);
    expect(RECENT_LIMIT).toBe(3);
    const out = html(tree);
    expect(out.indexOf(">Recent</h3>")).toBeLessThan(out.indexOf(">All recipes</h3>"));
    expect(out).toContain(">🍲</span>");
  });

  it("Foods opens with recent loose foods, then every food A–Z; no Recent heading without a history", () => {
    reset([BASE], [meal("m1", [], [{ id: "food-pear" }])]);
    goTo("food");
    expect(titles(render())).toEqual(["Pear", "Banana", "Oats", "Pear"]);
    expect(html(render())).toContain(">All foods</h3>");

    reset([BASE]);
    goTo("food");
    const out = html(render());
    expect(out).not.toContain(">Recent</h3>");
    expect(titles(render())).toEqual(["Banana", "Oats", "Pear"]);
  });

  it("typing searches all three at once, grouped In storage, Recipes, Foods, under a highlighted All (ledger 794)", () => {
    reset([BASE, SALMON, PEAR_FOODS]);
    goTo("recipe");
    expect(listKey(render())).toBe("recipe");
    type("oat");
    const tree = render();
    expect(tabRow(tree)).toEqual({ labels: ["All", "In storage", "Recipes", "Foods"], value: "all" });
    expect(ADD_MORE_SEARCH_TABS.slice(1)).toEqual(ADD_MORE_TABS); // the only new label is "All"
    expect(listKey(tree)).toBe("search-all");
    expect(titles(tree)).toEqual(["Salmon Oat Cakes", "Apple Oatmeal", "Oat Pancakes", "Oats"]);
    const out = html(tree);
    expect(out.indexOf(">In storage</h3>")).toBeLessThan(out.indexOf(">Recipes</h3>"));
    expect(out.indexOf(">Recipes</h3>")).toBeLessThan(out.indexOf(">Foods</h3>"));
    expect(out).not.toContain(">Recent</h3>");
    expect(out).not.toContain("opacity-45"); // nothing dims: the highlight says what is shown
    // Measured live: at 320 px the four labels need the slimmer padding and
    // no wrapping, or "In storage" breaks in two and the list drops 12 px.
    expect(out).toContain('<div class="shrink-0 [&amp;_[role=radio]]:px-2 [&amp;_[role=radio]]:whitespace-nowrap"><div role="radiogroup"');

    type("OAT  ");
    expect(titles(render())).toHaveLength(4); // case and trailing spaces ignored

    type("zzz");
    expect(titles(render())).toEqual([]);
    expect(html(render())).toContain("No matches");

    type("   "); // only spaces is no search: the usual tabs, on the one open before
    expect(tabRow(render())).toEqual({ labels: ["In storage", "Recipes", "Foods"], value: "recipe" });
  });

  it("a kind tapped while searching narrows to it and keeps the text; All goes back to grouped (ledger 794)", () => {
    reset([BASE, SALMON, PEAR_FOODS]);
    type("oat");
    const kinds = [
      ["storage", ["Salmon Oat Cakes"], ">In storage</h3>"],
      ["recipe", ["Apple Oatmeal", "Oat Pancakes"], ">Recipes</h3>"],
      ["food", ["Oats"], ">Foods</h3>"],
    ] as const;
    for (const [kind, shown, heading] of kinds) {
      goTo(kind);
      const tree = render();
      expect(one(tree, Input).props.value).toBe("oat");
      expect(tabRow(tree).value).toBe(kind);
      expect(titles(tree)).toEqual(shown);
      const out = html(tree);
      expect(out.match(/<h3/g)).toHaveLength(1); // only that kind's group
      expect(out).toContain(heading);
      expect(listKey(tree)).toBe(`search-${kind}`); // a new view starts at the top
    }

    type("oats"); // typing more keeps the narrowing
    expect(tabRow(render()).value).toBe("food");
    expect(titles(render())).toEqual(["Oats"]);
    type("salmon"); // a narrowed kind with nothing matching is not a dead end
    expect(titles(render())).toEqual([]);
    expect(html(render())).toContain("No matches");

    goTo("all");
    expect(tabRow(render()).value).toBe("all");
    expect(titles(render())).toEqual(["Salmon Oat Cakes"]);
    expect(one(render(), Input).props.value).toBe("salmon");
  });

  it("clearing the search brings back the three tabs on the one open before it; the next search starts on All (ledger 794)", () => {
    reset([BASE, SALMON, PEAR_FOODS]);
    goTo("food");
    type("o");
    goTo("recipe"); // narrowing a search never moves the tab underneath
    type("");
    let tree = render();
    expect(tabRow(tree)).toEqual({ labels: ["In storage", "Recipes", "Foods"], value: "food" });
    expect(titles(tree)).toEqual(["Banana", "Oats", "Pear"]);
    expect(listKey(tree)).toBe("food");

    type("p");
    tree = render();
    expect(tabRow(tree).value).toBe("all");
    expect(titles(tree)).toEqual(["Pear purée cubes", "Apple Oatmeal", "Oat Pancakes", "Pear"]);
  });

  it("keeps picks across tabs and searches, and adds them all at once, in the order picked", () => {
    reset([BASE, SALMON, PEAR_FOODS]);
    expect(titles(render())).toEqual(["Salmon Oat Cakes", "Pear purée cubes"]); // Avocado is already being served
    tick("Pear purée cubes");
    type("salmon");
    tick("Salmon Oat Cakes");
    type("");
    expect(rows(render()).map((row) => row.props.checked)).toEqual([true, true]);

    goTo("food");
    tick("Banana");
    goTo("recipe");
    tick("Oat Pancakes");
    type("banana"); // the food picked on another tab shows ticked in a search
    expect(rows(render()).map((row) => [row.props.title, row.props.checked])).toEqual([["Banana", true]]);
    goTo("food"); // and when the search is narrowed to it
    expect(rows(render()).map((row) => [row.props.title, row.props.checked])).toEqual([["Banana", true]]);
    type("");
    goTo("storage");
    expect(rows(render()).map((row) => row.props.checked)).toEqual([true, true]);

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

  it("a recipe ticked under Recent is the same pick as under All recipes; unticking takes it back out", () => {
    reset([BASE], [meal("m1", ["r-dal"], [])]);
    goTo("recipe");
    tick("Red Lentil Dal");
    expect(rows(render()).filter((row) => row.props.title === "Red Lentil Dal").map((row) => row.props.checked)).toEqual([true, true]);
    tick("Red Lentil Dal", false);
    expect(one(render(), Button).props.disabled).toBe(true);
  });

  it("each storage row shows the container's plate, name and where it is with what is left; the row is the tap target", () => {
    reset([BASE, SALMON, PEAR_FOODS]);
    const out = html(render());
    expect(out).toContain(">Salmon Oat Cakes</span>");
    expect(out).toContain(">Freezer · 6 of 6 left</span>");
    expect(out).toContain(">Pear purée cubes</span>");
    expect(out).toContain(">Fridge · 10 of 12 left</span>");
    expect(out).toMatch(/<label class="flex min-h-14 cursor-pointer[^"]*"><input type="checkbox"/);
  });

  it("never offers a recipe or food already in the Serving list: not under Recent, All or a search, and Recent still fills up (ledger 793)", () => {
    const meals = [meal("m2", ["r-dal", "r-egg"], [{ id: "food-banana" }]), meal("m1", ["r-cod", "r-oat"], [{ id: "food-pear" }])];
    reset([BASE], meals, { recipeIds: ["r-dal"], foodIds: ["food-banana"] });
    goTo("recipe");
    expect(titles(render())).toEqual(["Egg Muffins", "Baked Cod", "Oat Pancakes", "Apple Oatmeal", "Baked Cod", "Egg Muffins", "Oat Pancakes"]);
    goTo("food");
    expect(titles(render())).toEqual(["Pear", "Oats", "Pear"]);
    type("a"); // matches Banana, Red Lentil Dal and the rest
    expect(titles(render())).not.toContain("Banana");
    expect(titles(render())).not.toContain("Red Lentil Dal");
    type("banana");
    expect(html(render())).toContain("No matches");
  });

  it("says so when there is nothing else in storage, and nothing at all while it loads", () => {
    reset([BASE]);
    expect(html(render())).toContain("Nothing else in storage to add.");
    h.storageLoading = true;
    h.storage = [];
    expect(html(render())).not.toContain("Nothing else in storage to add.");
  });
});
