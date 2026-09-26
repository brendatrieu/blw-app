// Drives the custom-food delete prompt's real handlers without a DOM
// (ledger 542). The prompt only exists after a click, which a renderToString
// suite never makes, so `useState` is replaced with a tiny store and the
// component is called as a plain function, its element tree walked and its
// callbacks invoked against fake mutations. Idiom from FeedbackPage.handlers.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodDetail, FoodListItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const calls = { deletes: [] as unknown[], replaces: [] as unknown[], restores: [] as unknown[], navigations: [] as unknown[] };
  const foods = { list: [] as unknown[] };
  return {
    store,
    calls,
    foods,
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
  useFood: () => ({}),
  useFoods: () => ({ data: { foods: h.foods.list } }),
  useDeleteCustomFood: () => ({ isPending: false, isError: false, mutate: (food: unknown) => h.calls.deletes.push(food) }),
  useRestoreCustomFood: () => ({ isPending: false, isError: false, mutate: (food: unknown) => h.calls.restores.push(food) }),
  useReplaceCustomFood: () => ({
    isPending: false,
    isError: false,
    mutate: (input: unknown, options?: MutateOptions) => {
      h.calls.replaces.push(input);
      options?.onSuccess?.({ replacement: { id: "c", slug: "cauliflower", name: "Cauliflower" } });
    },
  }),
}));

import { Button } from "../components/ui/Button.js";
import { DeleteConfirmActions } from "../components/ui/DeleteConfirmActions.js";
import { SingleFoodPicker } from "../features/catalog/components/FoodPicker.js";
import { CustomFoodActions, DeletedFoodNotice, RESTORE_HINT } from "./FoodDetailPage.js";

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

function actions(food: FoodDetail): Rendered {
  h.store.i = 0;
  return (CustomFoodActions as unknown as (props: { food: FoodDetail }) => Rendered)({ food });
}

function button(tree: Rendered, label: string): Rendered | undefined {
  return collect(tree, (element) => element.type === Button && text(element.props.children).join("") === label)[0];
}

function openPrompt(food: FoodDetail): Rendered {
  (button(actions(food), "Delete")!.props.onClick as () => void)();
  return actions(food);
}

beforeEach(() => {
  h.reset();
  h.foods.list = [CATALOG_CAULIFLOWER];
});

describe("an unused custom food", () => {
  const UNUSED = { ...FOOD, usage: { mealCount: 0, storageCount: 0, recipeCount: 0 } };

  it("gets a plain confirm that says it can be restored, and no Replace", () => {
    const tree = openPrompt(UNUSED);
    const [confirm] = collect(tree, (element) => element.type === DeleteConfirmActions);
    expect(confirm!.props.confirmLabel).toBe("Delete");
    expect(text(tree).join(" ")).toContain(RESTORE_HINT);
    expect(collect(tree, (element) => element.type === SingleFoodPicker)).toEqual([]);

    (confirm!.props.onConfirm as () => void)();
    expect(h.calls.deletes).toEqual([UNUSED]);
    // Soft: the parent stays on the page, which turns read-only.
    expect(h.calls.navigations).toEqual([]);
  });
});

describe("a custom food still in use", () => {
  it("names where, without zero counts, and offers Replace with the same-name catalog food preselected", () => {
    const tree = openPrompt(FOOD);
    const words = text(tree).join(" ");
    expect(words).toContain("Used in 1 storage item");
    expect(words).not.toContain("0 meals");

    const [picker] = collect(tree, (element) => element.type === SingleFoodPicker);
    expect(picker!.props.value).toBe(CATALOG_CAULIFLOWER.id);
    // The food being replaced is never offered as its own replacement.
    expect(picker!.props.excludeId).toBe(FOOD.id);
    expect(words).toContain("1 storage item will switch to Cauliflower");
  });

  it("replaces with the picked food and lands on its page", () => {
    const tree = openPrompt(FOOD);
    (button(tree, "Replace")!.props.onClick as () => void)();
    expect(h.calls.replaces).toEqual([{ food: FOOD, replacementId: CATALOG_CAULIFLOWER.id }]);
    expect(h.calls.navigations).toEqual(["/foods/cauliflower"]);
    expect(h.calls.deletes).toEqual([]);
  });

  it("can't Replace once the picker is cleared (nothing preselected is a real answer)", () => {
    const [picker] = collect(openPrompt(FOOD), (element) => element.type === SingleFoodPicker);
    (picker!.props.onChange as (next: string) => void)("");
    const tree = actions(FOOD);
    expect(button(tree, "Replace")!.props.disabled).toBe(true);
    expect(text(tree).join(" ")).not.toContain("will switch to");
  });

  it("offers Delete anyway, which soft-deletes and says past entries will show it as deleted", () => {
    const tree = openPrompt(FOOD);
    const words = text(tree).join(" ");
    expect(words).toContain("past entries will show it as deleted");
    expect(words).toContain(RESTORE_HINT);
    const [confirm] = collect(tree, (element) => element.type === DeleteConfirmActions);
    expect(confirm!.props.confirmLabel).toBe("Delete anyway");
    (confirm!.props.onConfirm as () => void)();
    expect(h.calls.deletes).toEqual([FOOD]);
    expect(h.calls.replaces).toEqual([]);
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
