// Drives ServeControl's OWN state without a DOM: what actually reaches the
// serve request after the parent steps servings, adds more, removes a fresh
// item, picks a time and taps stars (items 354, 718; ledger 760). A
// renderToString suite only sees a first render nobody has touched.
//
// Harness idiom: the vi.hoisted hook store from TourDialog.handlers.test.ts /
// AddStorageItemForm.handlers.test.ts. React's `useState` is replaced with a
// store, so the component can be called as a plain function, its element tree
// read, and its callbacks invoked.
import { describe, expect, it, vi } from "vitest";
import type { StorageItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const mutation = { isPending: false, isError: false };
  const served: Array<{ input: Record<string, unknown>; onSuccess?: (response: unknown) => void }> = [];
  return {
    store,
    served,
    /** What the mocked serve mutation reports. */
    mutation,
    /** recipe id -> its ingredient food ids; a missing id is "still loading". */
    ingredients: new Map<string, string[]>(),
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
      served.length = 0;
      mutation.isPending = false;
      mutation.isError = false;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

vi.mock("../hooks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useStorageServe: () => ({
      mutate: (input: Record<string, unknown>, options?: { onSuccess?: (response: unknown) => void }) => {
        h.served.push({ input, onSuccess: options?.onSuccess });
      },
      get isPending() {
        return h.mutation.isPending;
      },
      get isError() {
        return h.mutation.isError;
      },
    }),
  };
});

vi.mock("../../catalog/hooks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useRecipeDetails: (ids: string[]) =>
      ids.map((id) => {
        const foods = h.ingredients.get(id);
        return { data: foods ? { ingredients: foods.map((foodId) => ({ foodId })) } : undefined };
      }),
  };
});

import { ServeControl } from "./ServeSheet.js";
import { AddMoreSheet } from "./AddMoreSheet.js";
import { DateTimeField } from "../../../components/ui/DateTimeField.js";
import { Button } from "../../../components/ui/Button.js";
import { MealRatingsField } from "../../tracking/components/MealRatingsField.js";

const ITEM: StorageItem = {
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
  servingsTotal: 3,
  servingsLeft: 2,
  bestBy: null,
  notes: null,
};
const SALMON = "aaaaaaaa-0000-0000-0000-000000000002";
const SALMON_ITEM: StorageItem = {
  ...ITEM,
  id: "22222222-2222-2222-2222-222222222222",
  foods: [],
  recipeId: SALMON,
  recipeTitle: "Salmon Cakes",
  servingsTotal: null,
  servingsLeft: null,
};
const BANANA = { id: "food-banana", slug: "banana", name: "Banana", category: "fruit", emoji: null };

interface Rendered {
  type: unknown;
  props: Record<string, unknown>;
}

/** Every element anywhere in the returned tree that matches — children AND
 * element-valued props (the Serving row frame takes its control as a prop). */
function findAll(node: unknown, match: (element: Rendered) => boolean, out: Rendered[] = []): Rendered[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, match, out);
    return out;
  }
  const element = node as Rendered;
  if (match(element)) out.push(element);
  for (const value of Object.values(element.props ?? {})) findAll(value, match, out);
  return out;
}
const byType = (type: unknown) => (element: Rendered) => element.type === type;
const byLabel = (label: string) => (element: Rendered) => element.props?.["aria-label"] === label;

function render(item: StorageItem = ITEM, onServed?: (response: unknown) => void): Rendered {
  h.store.i = 0;
  return (ServeControl as unknown as (props: unknown) => Rendered)({ item, babyId: "baby-1", onServed });
}

function click(tree: Rendered, match: (element: Rendered) => boolean) {
  const [target] = findAll(tree, match);
  if (!target) throw new Error("no such control");
  (target.props.onClick as () => void)();
}

function serve() {
  click(render(), byType(Button));
  return h.served[h.served.length - 1]!.input;
}

function addMore(picks: { items?: StorageItem[]; foods?: unknown[]; recipes?: { id: string; title: string }[] }) {
  click(render(), (element) => element.props?.children === "+ Add more");
  const [sheet] = findAll(render(), byType(AddMoreSheet));
  if (!sheet) throw new Error("+ Add more should open the Add more sheet");
  (sheet.props.onAdd as (value: unknown) => void)({ items: [], foods: [], recipes: [], ...picks });
}

describe("the Serve sheet's When field (item 354)", () => {
  it("defaults to now, so a parent who ignores the field still logs the current minute", () => {
    h.reset();
    const before = Date.now();
    const servedAt = Date.parse(serve().servedAt as string);
    expect(servedAt).toBeLessThanOrEqual(Date.now());
    expect(before - servedAt).toBeLessThan(60_000);
    expect(new Date(servedAt).getSeconds()).toBe(0);
  });

  it("sends the time the parent picked, not the moment they pressed Serve", () => {
    h.reset();
    const chosen = new Date("2026-08-21T09:05:00.000Z");
    const [field] = findAll(render(), byType(DateTimeField));
    expect(field!.props.id).toBe("serve-when");
    // No `now` override: the field's own future-time guard is the only one.
    expect(field!.props.now).toBeUndefined();
    (field!.props.onChange as (value: Date) => void)(chosen);
    expect(serve()).toMatchObject({
      servedAt: chosen.toISOString(),
      parts: [{ storageItemId: ITEM.id, servings: 1 }],
    });
  });
});

describe("the Serving list (ledger 760)", () => {
  it("steps each container's servings on its own, within [1, servings left]", () => {
    h.reset();
    addMore({ items: [SALMON_ITEM] });
    for (let i = 0; i < 4; i++) click(render(), byLabel("Increase servings")); // the first container: 2 left
    const increases = findAll(render(), byLabel("Increase servings"));
    expect(increases).toHaveLength(2);
    for (let i = 0; i < 3; i++) (findAll(render(), byLabel("Increase servings"))[1]!.props.onClick as () => void)();
    click(render(), byLabel("Decrease servings")); // the first, back to 1
    click(render(), byLabel("Decrease servings")); // and never below 1
    expect(serve().parts).toEqual([
      { storageItemId: ITEM.id, servings: 1 },
      // Untracked: up to 99.
      { storageItemId: SALMON_ITEM.id, servings: 4 },
    ]);
  });

  it("adds what Add more picked: containers at 1 serving, then fresh foods and recipes; and ✕ takes a fresh one back out", () => {
    h.reset();
    addMore({ items: [SALMON_ITEM], foods: [BANANA], recipes: [{ id: "r-oat", title: "Oat Pancakes" }] });
    // Picking the same fresh food again does not list it twice.
    addMore({ foods: [BANANA] });
    const tree = render();
    expect(findAll(tree, (element) => element.props?.children === "Fresh, not from storage")).toHaveLength(2);
    expect(findAll(tree, byLabel("Servings: Salmon Cakes"))).toHaveLength(1);
    expect(serve()).toMatchObject({
      parts: [
        { storageItemId: ITEM.id, servings: 1 },
        { storageItemId: SALMON_ITEM.id, servings: 1 },
      ],
      foodIds: ["food-banana"],
      recipeIds: ["r-oat"],
    });

    click(render(), byLabel("Remove Banana"));
    click(render(), byLabel("Remove Oat Pancakes"));
    const input = serve();
    expect(input).not.toHaveProperty("foodIds");
    expect(input).not.toHaveProperty("recipeIds");
  });

  it("caps a tracked container at the servings LEFT, not its total", () => {
    h.reset();
    for (let i = 0; i < 3; i++) click(render(), byLabel("Increase servings")); // 2 of 3 left
    expect(serve().parts).toEqual([{ storageItemId: ITEM.id, servings: 2 }]);
  });

  it("a container's − steps only that container", () => {
    h.reset();
    addMore({ items: [SALMON_ITEM] });
    click(render(), byLabel("Increase servings")); // the first: 2
    for (let i = 0; i < 2; i++) (findAll(render(), byLabel("Increase servings"))[1]!.props.onClick as () => void)(); // the second: 3
    (findAll(render(), byLabel("Decrease servings"))[1]!.props.onClick as () => void)();
    expect(serve().parts).toEqual([
      { storageItemId: ITEM.id, servings: 2 },
      { storageItemId: SALMON_ITEM.id, servings: 2 },
    ]);
  });

  it("✕ on one fresh food takes out only that food", () => {
    h.reset();
    addMore({ foods: [BANANA, { ...BANANA, id: "food-pear", slug: "pear", name: "Pear" }] });
    click(render(), byLabel("Remove Banana"));
    expect(findAll(render(), byLabel("Remove Pear"))).toHaveLength(1);
    expect(serve().foodIds).toEqual(["food-pear"]);
  });

  it("✕ on one of two fresh recipes takes out only that recipe", () => {
    h.reset();
    addMore({ recipes: [{ id: "r-oat", title: "Oat Pancakes" }, { id: "r-dal", title: "Red Lentil Dal" }] });
    click(render(), byLabel("Remove Oat Pancakes"));
    expect(findAll(render(), byLabel("Remove Red Lentil Dal"))).toHaveLength(1);
    expect(serve().recipeIds).toEqual(["r-dal"]);
  });

  it("✕ on the second of two fresh recipes keeps the first (not just 'drop the first')", () => {
    h.reset();
    addMore({ recipes: [{ id: "r-oat", title: "Oat Pancakes" }, { id: "r-dal", title: "Red Lentil Dal" }] });
    click(render(), byLabel("Remove Red Lentil Dal"));
    expect(findAll(render(), byLabel("Remove Oat Pancakes"))).toHaveLength(1);
    expect(serve().recipeIds).toEqual(["r-oat"]);
  });

  it("closes Add more once its picks are added", () => {
    h.reset();
    addMore({ foods: [BANANA] });
    expect(findAll(render(), byType(AddMoreSheet))).toHaveLength(0);
  });

  it("disables −/+ while the request is in flight, like Serve", () => {
    h.reset();
    h.mutation.isPending = true;
    const tree = render();
    const steppers = [...findAll(tree, byLabel("Decrease servings")), ...findAll(tree, byLabel("Increase servings"))];
    expect(steppers).toHaveLength(2);
    for (const stepper of steppers) expect(stepper.props.disabled).toBe(true);
  });

  it("shows 'Couldn't serve — try again.' when the serve fails (a 409 lands here)", () => {
    h.reset();
    expect(findAll(render(), (element) => element.props?.children === "Couldn't serve — try again.")).toHaveLength(0);
    h.mutation.isError = true;
    expect(findAll(render(), (element) => element.props?.children === "Couldn't serve — try again.")).toHaveLength(1);
  });

  it("disables Serve and reads 'Serving…' while the request is in flight, so it cannot be sent twice", () => {
    h.reset();
    h.mutation.isPending = true;
    const [button] = findAll(render(), byType(Button));
    expect(button!.props.disabled).toBe(true);
    expect(button!.props.children).toBe("Serving…");
  });

  it("tells Add more which containers are already listed, so it never offers them again", () => {
    h.reset();
    addMore({ items: [SALMON_ITEM] });
    click(render(), (element) => element.props?.children === "+ Add more");
    const [sheet] = findAll(render(), byType(AddMoreSheet));
    expect(sheet!.props.servingIds).toEqual([ITEM.id, SALMON_ITEM.id]);
    (sheet!.props.onClose as () => void)();
    expect(findAll(render(), byType(AddMoreSheet))).toHaveLength(0);
  });

  it("hands the server's answer to onServed after a successful serve", () => {
    h.reset();
    const seen: unknown[] = [];
    click(render(ITEM, (response) => seen.push(response)), byType(Button));
    h.served[0]!.onSuccess!({ meal: { id: "m1" }, items: [] });
    expect(seen).toEqual([{ meal: { id: "m1" }, items: [] }]);
  });
});

describe("the Serve sheet's star rows (item 718, DESIGN-B §2)", () => {
  function ratingsField(): Rendered {
    const [field] = findAll(render(), byType(MealRatingsField));
    if (!field) throw new Error("the serve sheet should mount its star rows");
    return field;
  }
  const tap = (key: string, value: number | null) =>
    (ratingsField().props.onChange as (key: string, value: number | null) => void)(key, value);

  it("sends no rating key at all when the parent leaves the stars blank", () => {
    h.reset();
    const input = serve();
    expect(input).not.toHaveProperty("foodRatings");
    expect(input).not.toHaveProperty("recipeRatings");
  });

  it("sends a tapped food star, and a cleared one as nothing", () => {
    h.reset();
    expect(ratingsField().props.rows).toEqual([{ key: "food-1", label: "Avocado", value: null }]);
    tap("food-1", 4);
    expect(serve().foodRatings).toEqual({ "food-1": 4 });
    tap("food-1", null);
    expect(serve()).not.toHaveProperty("foodRatings");
  });

  it("rates a recipe once, by its id, and drops a food's row once it turns out to be that recipe's ingredient", () => {
    h.reset();
    h.ingredients.clear();
    tap("food-1", 3);
    addMore({ items: [SALMON_ITEM], foods: [BANANA] });
    // Salmon Cakes' ingredients have not loaded: only the recipe row.
    expect(ratingsField().props.rows).toEqual([{ key: `recipe:${SALMON}`, label: "Salmon Cakes", value: null }]);
    h.ingredients.set(SALMON, ["food-1", "food-salmon"]);
    expect((ratingsField().props.rows as { key: string }[]).map((row) => row.key)).toEqual([`recipe:${SALMON}`, "food-banana"]);
    tap(`recipe:${SALMON}`, 5);
    const input = serve();
    expect(input.recipeRatings).toEqual({ [SALMON]: 5 });
    // Avocado's earlier star is not sent: it is rated through Salmon Cakes now.
    expect(input).not.toHaveProperty("foodRatings");
    h.ingredients.clear();
  });

  it("drops a fresh food's row when it is an ingredient of a FRESH recipe", () => {
    h.reset();
    h.ingredients.clear();
    h.ingredients.set("r-oat", ["food-banana"]);
    addMore({ foods: [BANANA], recipes: [{ id: "r-oat", title: "Oat Pancakes" }] });
    expect((ratingsField().props.rows as { key: string }[]).map((row) => row.key)).toEqual(["recipe:r-oat", "food-1"]);
    h.ingredients.clear();
  });

  it("shows no food rows until EVERY served recipe's ingredients have loaded", () => {
    h.reset();
    h.ingredients.clear();
    h.ingredients.set(SALMON, ["food-salmon"]); // loaded; Oat Pancakes is not
    addMore({ items: [SALMON_ITEM], foods: [BANANA], recipes: [{ id: "r-oat", title: "Oat Pancakes" }] });
    expect((ratingsField().props.rows as { key: string }[]).map((row) => row.key)).toEqual([`recipe:${SALMON}`, "recipe:r-oat"]);
    h.ingredients.clear();
  });
});
