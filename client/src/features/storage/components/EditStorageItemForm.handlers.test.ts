// B2 (item 729): an untouched Save from an Edit form whose item prop was
// replaced by a background refetch must not erase another device's contents
// edit. The chips are seeded once, so after the refetch they still show the
// old list; judging "changed" against the NEW prop made that stale list look
// like an edit and wrote it back. `buildContentsPatch` is pinned on its own in
// EditStorageItemForm.test.ts — this pins that the form feeds it the seed.
//
// Harness idiom: the vi.hoisted hook store from AddStorageItemForm.handlers.test.ts.
import { describe, expect, it, vi } from "vitest";
import type { StorageItem, UpdateStorageItemInput } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const updated: unknown[] = [];

  return {
    store,
    updated,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    useMemo: (factory: () => unknown) => factory(),
    reset: () => {
      store.states = [];
      store.i = 0;
      updated.length = 0;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useMemo: h.useMemo };
});

vi.mock("../hooks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useUpdateStorageItem: () => ({
      mutate: (variables: unknown) => {
        h.updated.push(variables);
      },
      isPending: false,
      isError: false,
    }),
  };
});

import { EditStorageItemForm } from "./EditStorageItemForm.js";
import { FoodPicker } from "../../catalog/components/FoodPicker.js";

interface Rendered {
  type: unknown;
  props: Record<string, unknown>;
}

const food = (id: string, name: string) => ({ id, slug: id, name, emoji: null });

const ITEM: StorageItem = {
  id: "11111111-1111-1111-1111-111111111111",
  label: null,
  foods: [food("broccoli", "Broccoli"), food("carrot", "Carrot")],
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
  servingsTotal: null,
  servingsLeft: null,
  bestBy: null,
  notes: null,
};

function render(item: StorageItem): Rendered {
  h.store.i = 0;
  return (EditStorageItemForm as unknown as (props: unknown) => Rendered)({ item, onDone: () => {} });
}

/** Depth-first search of the returned element tree (children are not rendered). */
function find(node: unknown, match: (el: Rendered) => boolean): Rendered | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, match);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return undefined;
  const el = node as Rendered;
  return match(el) ? el : find(el.props.children, match);
}

function submit(tree: Rendered): UpdateStorageItemInput {
  (tree.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
  expect(h.updated).toHaveLength(1);
  return (h.updated[0] as { input: UpdateStorageItemInput }).input;
}

describe("EditStorageItemForm untouched Save after a refetch (B2, item 729)", () => {
  it("sends no foodIds when another device's newer contents arrive under untouched chips", () => {
    h.reset();
    render(ITEM);
    const refetched = { ...ITEM, foods: [...ITEM.foods, food("peas", "Peas"), food("rice", "Rice")] };
    const input = submit(render(refetched));
    expect(input).not.toHaveProperty("foodIds");
  });

  it("sends no label when a Free-form item's name was not edited, even after a rename elsewhere", () => {
    h.reset();
    const soup = { ...ITEM, foods: [], label: "Soup" };
    render(soup);
    const input = submit(render({ ...soup, label: "Lentil soup" }));
    expect(input).not.toHaveProperty("label");
  });
});

// B3 (item 729): a real edit has to reach the PATCH. Without these, a picker
// whose onChange went nowhere, or a submit that always passed the seed, still
// passed every test while silently dropping the parent's change.
describe("EditStorageItemForm real contents edits reach the PATCH (B3, item 729)", () => {
  it("sends the new food list after foods are added and removed in the picker", () => {
    h.reset();
    const picker = find(render(ITEM), (el) => el.type === FoodPicker);
    expect(picker).toBeDefined();
    (picker!.props.onChange as (ids: string[]) => void)(["broccoli", "peas"]);
    const input = submit(render(ITEM));
    expect(input.foodIds).toEqual(["broccoli", "peas"]);
  });

  it("sends the trimmed new name after a Free-form item is renamed", () => {
    h.reset();
    const soup = { ...ITEM, foods: [], label: "Soup" };
    const name = find(render(soup), (el) => el.props.id === "storage-edit-label");
    expect(name).toBeDefined();
    (name!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "  Lentil soup  " } });
    const input = submit(render(soup));
    expect(input.label).toBe("Lentil soup");
  });
});
