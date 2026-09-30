// Drives the custom-food delete question's real handlers without a DOM
// (ledger 542, items 599-600). It only exists after a click, which a renderToString
// suite never makes, so `useState` is replaced with a tiny store and the
// component is called as a plain function, its element tree walked and its
// callbacks invoked against fake mutations. Idiom from FeedbackPage.handlers.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodDetail, FoodListItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const calls = { deletes: [] as unknown[], replaces: [] as unknown[], restores: [] as unknown[], navigations: [] as unknown[] };
  const foods = { list: [] as unknown[] };
  // What the delete question's own (fresh) food read returns.
  const fresh = {
    data: undefined as unknown,
    isFetchedAfterMount: true,
    isError: false,
    refetches: 0,
    options: [] as unknown[],
  };
  const pending = { delete: false, replace: false, deleteError: false, replaceError: false };
  return {
    store,
    calls,
    foods,
    fresh,
    pending,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] =
          typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    reset: () => {
      store.states = [];
      store.i = 0;
      calls.deletes = [];
      calls.replaces = [];
      calls.restores = [];
      calls.navigations = [];
      fresh.data = undefined;
      fresh.isFetchedAfterMount = true;
      fresh.isError = false;
      fresh.refetches = 0;
      fresh.options = [];
      pending.delete = false;
      pending.replace = false;
      pending.deleteError = false;
      pending.replaceError = false;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useNavigate: () => (to: unknown) => h.calls.navigations.push(to) };
});

interface MutateOptions {
  onSuccess?: (result: unknown) => void;
}

vi.mock("../features/catalog/hooks.js", () => ({
  useFood: (slug: unknown, options: unknown) => {
    h.fresh.options.push([slug, options]);
    return {
      data: h.fresh.data,
      isFetchedAfterMount: h.fresh.isFetchedAfterMount,
      isError: h.fresh.isError,
      refetch: () => {
        h.fresh.refetches += 1;
        return Promise.resolve();
      },
    };
  },
  useFoods: () => ({ data: { foods: h.foods.list } }),
  useDeleteCustomFood: () => ({
    isPending: h.pending.delete,
    isError: h.pending.deleteError,
    mutate: (food: unknown) => h.calls.deletes.push(food),
  }),
  useRestoreCustomFood: () => ({ isPending: false, isError: false, mutate: (food: unknown) => h.calls.restores.push(food) }),
  useReplaceCustomFood: () => ({
    isPending: h.pending.replace,
    isError: h.pending.replaceError,
    mutate: (input: unknown, options?: MutateOptions) => {
      h.calls.replaces.push(input);
      options?.onSuccess?.({ replacement: { id: "c", slug: "cauliflower", name: "Cauliflower" } });
    },
  }),
}));

import { Button } from "../components/ui/Button.js";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.js";
import { SingleFoodPicker } from "../features/catalog/components/FoodPicker.js";
import { CustomFoodActions, DeleteFoodQuestion, DeletedFoodNotice, RESTORE_HINT } from "./FoodDetailPage.js";

interface Rendered {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}

function isElement(node: unknown): node is Rendered {
  return typeof node === "object" && node !== null && "props" in node;
}

function collect(node: unknown, match: (element: Rendered) => boolean, out: Rendered[] = []): Rendered[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, match, out);
    return out;
  }
  if (!isElement(node)) return out;
  if (match(node)) out.push(node);
  collect(node.props.children, match, out);
  return out;
}

function text(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const child of node) text(child, out);
  else if (isElement(node)) text(node.props.children, out);
  return out;
}

const FOOD: FoodDetail = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "cauliflower-k3f9q1",
  name: "cauliflower",
  category: "veg",
  ironLevel: "low",
  vitaminCLevel: "low",
  fiberLevel: "low",
  chokingRisk: "low",
  minAgeMonths: 6,
  allergens: [],
  isCustom: true,
  emoji: null,
  prep6m: "",
  prep9m: "",
  prep12m: "",
  chokingNotes: null,
  notes: null,
  imageUrl: null,
  pairings: [],
  recipes: [],
  deletedAt: null,
  usage: { mealCount: 0, storageCount: 1, recipeCount: 0 },
};

const CATALOG_CAULIFLOWER: FoodListItem = {
  id: "33333333-3333-4333-8333-333333333333",
  slug: "cauliflower",
  name: "Cauliflower",
  category: "veg",
  ironLevel: "low",
  vitaminCLevel: "high",
  fiberLevel: "moderate",
  chokingRisk: "low",
  minAgeMonths: 6,
  allergens: [],
  isCustom: false,
  emoji: null,
};

const UNUSED = { mealCount: 0, storageCount: 0, recipeCount: 0 };

function actions(food: FoodDetail): Rendered {
  h.store.i = 0;
  return (CustomFoodActions as unknown as (props: { food: FoodDetail }) => Rendered)({ food });
}

/** The question as it renders now; `cached` is the page's (possibly stale) detail. */
function question(cached: FoodDetail): Rendered {
  h.store.i = 0;
  return (DeleteFoodQuestion as unknown as (props: { food: FoodDetail; onClose: () => void }) => Rendered)({
    food: cached,
    onClose: () => {},
  });
}

function button(tree: Rendered, label: string): Rendered | undefined {
  return collect(tree, (element) => element.type === Button && text(element.props.children).join("") === label)[0];
}

beforeEach(() => {
  h.reset();
  h.foods.list = [CATALOG_CAULIFLOWER];
});

describe("CustomFoodActions", () => {
  it("Delete opens the question instead of deleting", () => {
    expect(collect(actions(FOOD), (element) => element.type === DeleteFoodQuestion)).toEqual([]);
    (button(actions(FOOD), "Delete")!.props.onClick as () => void)();
    const [asked] = collect(actions(FOOD), (element) => element.type === DeleteFoodQuestion);
    expect(asked!.props.food).toBe(FOOD);
    expect(h.calls.deletes).toEqual([]);
  });
});

describe("the delete question's usage check (item 600)", () => {
  it("reads the food fresh, never trusting the cached detail", () => {
    h.fresh.data = FOOD;
    question(FOOD);
    expect(h.fresh.options).toEqual([[FOOD.slug, { fresh: true }]]);
  });

  it("says it is checking, and offers nothing to commit, until a fetch since opening answers", () => {
    h.fresh.data = { ...FOOD, usage: UNUSED };
    h.fresh.isFetchedAfterMount = false;
    const tree = question({ ...FOOD, usage: UNUSED });
    expect(tree.type).toBe(ConfirmDialog);
    expect(tree.props.title).toBe("Delete cauliflower?");
    expect(text(tree).join(" ")).toContain("Checking where it's used…");
    expect(tree.props.onConfirm).toBeUndefined();
    expect(collect(tree, (element) => element.type === SingleFoodPicker)).toEqual([]);
  });

  it("offers Replace when the cached detail said unused but the fresh answer says used (the stale-cache bug)", () => {
    h.fresh.data = { ...FOOD, usage: { mealCount: 1, storageCount: 1, recipeCount: 0 } };
    const tree = question({ ...FOOD, usage: UNUSED });
    const words = text(tree).join(" ");
    expect(words).toContain("Used in 1 meal and 1 storage item");
    expect(words).not.toContain(RESTORE_HINT);
    expect(button(tree, "Replace")).toBeDefined();
    expect(tree.props.confirmLabel).toBe("Delete anyway");
  });

  it("says why it can't check, with a retry, and offers nothing to commit", () => {
    h.fresh.data = FOOD;
    h.fresh.isError = true;
    const tree = question(FOOD);
    expect(text(tree).join(" ")).toContain("Couldn't check where it's used — try again.");
    expect(tree.props.onConfirm).toBeUndefined();
    (button(tree, "Try again")!.props.onClick as () => void)();
    expect(h.fresh.refetches).toBe(1);
  });
});

describe("an unused custom food", () => {
  const FRESH_UNUSED = { ...FOOD, usage: UNUSED };

  it("says only that it can be restored (item 607: one short line), with no Replace", () => {
    h.fresh.data = FRESH_UNUSED;
    const tree = question(FOOD);
    expect(text(tree).join(" ")).toBe(RESTORE_HINT);
    expect(collect(tree, (element) => element.type === SingleFoodPicker)).toEqual([]);
    expect(button(tree, "Replace")).toBeUndefined();
    expect(tree.props.confirmLabel).toBe("Delete");
    expect(tree.props.pendingLabel).toBe("Deleting…");
  });

  it("soft-deletes only on the red button, and stays on the page", () => {
    h.fresh.data = FRESH_UNUSED;
    const tree = question(FOOD);
    expect(h.calls.deletes).toEqual([]);
    (tree.props.onConfirm as () => void)();
    expect(h.calls.deletes).toEqual([FRESH_UNUSED]);
    expect(h.calls.navigations).toEqual([]);
  });
});

describe("a custom food still in use", () => {
  beforeEach(() => {
    h.fresh.data = FOOD;
  });

  it("names where, without zero counts, and offers Replace with the same-name catalog food preselected", () => {
    const tree = question(FOOD);
    const words = text(tree).join(" ");
    expect(words).toContain("Used in 1 storage item");
    expect(words).not.toContain("0 meals");

    const [picker] = collect(tree, (element) => element.type === SingleFoodPicker);
    expect(picker!.props.value).toBe(CATALOG_CAULIFLOWER.id);
    // The food being replaced is never offered as its own replacement.
    expect(picker!.props.excludeId).toBe(FOOD.id);
    // Its list opens in flow inside the pop-up, so the pop-up grows to hold
    // it instead of clipping it (item 610: fits a 390x844 screen).
    expect(picker!.props.inline).toBe(true);
  });

  it("backs out (Cancel, overlay, Escape) through onClose alone, deleting and replacing nothing (item 610)", () => {
    h.store.i = 0;
    const closed: string[] = [];
    const tree = (DeleteFoodQuestion as unknown as (props: { food: FoodDetail; onClose: () => void }) => Rendered)({
      food: FOOD,
      onClose: () => closed.push("closed"),
    });
    (tree.props.onClose as () => void)();
    expect(closed).toEqual(["closed"]);
    expect(h.calls.deletes).toEqual([]);
    expect(h.calls.replaces).toEqual([]);
  });

  it("replaces with the picked food and lands on its page", () => {
    (button(question(FOOD), "Replace")!.props.onClick as () => void)();
    expect(h.calls.replaces).toEqual([{ food: FOOD, replacementId: CATALOG_CAULIFLOWER.id }]);
    expect(h.calls.navigations).toEqual(["/foods/cauliflower"]);
    expect(h.calls.deletes).toEqual([]);
  });

  it("can't Replace once the picker is cleared (nothing preselected is a real answer)", () => {
    const [picker] = collect(question(FOOD), (element) => element.type === SingleFoodPicker);
    (picker!.props.onChange as (next: string) => void)("");
    const tree = question(FOOD);
    expect(button(tree, "Replace")!.props.disabled).toBe(true);
  });

  it("offers a quiet Delete anyway with no extra explanation (item 607), which soft-deletes", () => {
    const tree = question(FOOD);
    const words = text(tree).join(" ");
    expect(words).not.toContain("past entries");
    expect(words).not.toContain(RESTORE_HINT);
    expect(tree.props.confirmLabel).toBe("Delete anyway");
    (tree.props.onConfirm as () => void)();
    expect(h.calls.deletes).toEqual([FOOD]);
    expect(h.calls.replaces).toEqual([]);
  });

  it("shows pending labels and the existing error text", () => {
    h.pending.replace = true;
    let tree = question(FOOD);
    expect(tree.props.pending).toBe(true);
    expect(button(tree, "Replacing…")!.props.disabled).toBe(true);

    h.pending.replace = false;
    h.pending.deleteError = true;
    expect(question(FOOD).props.error).toBe("Couldn't delete that — try again.");
    h.pending.replaceError = true;
    tree = question(FOOD);
    expect(tree.props.error).toBe("Couldn't replace that — try again.");
  });
});

describe("DeletedFoodNotice", () => {
  it("restores the food", () => {
    const DELETED = { ...FOOD, deletedAt: "2026-09-25T10:00:00.000Z" };
    h.store.i = 0;
    const tree = (DeletedFoodNotice as unknown as (props: { food: FoodDetail }) => Rendered)({ food: DELETED });
    (button(tree, "Restore")!.props.onClick as () => void)();
    expect(h.calls.restores).toEqual([DELETED]);
  });
});
