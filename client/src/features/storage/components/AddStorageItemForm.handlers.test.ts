// Drives AddStorageItemForm's OWN state without a DOM. A renderToString suite
// can only ever see a first render of a form nobody has touched, and the Add
// form cannot be opened past one prefilled food that way — so the one thing
// item 348's owner decision actually turns on, which segment the form STARTS
// on, had nothing pinning it: flipping the component's own
// `useState<ContainerChoice>("one")` to `"separate"` left the whole client
// suite green while every save of two or more foods quietly became a save of
// N containers. Here the food picker is driven to two foods and the form
// submitted, so the default is judged where it is read — in the payload.
//
// Harness idiom: the vi.hoisted hook store from TourDialog.handlers.test.ts.
// React's `useState` is replaced with a store, so the component can be called
// as a plain function, its element tree read, and its callbacks invoked.
import { describe, expect, it, vi } from "vitest";
import type { CreateStorageItemInput } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const created: unknown[] = [];

  return {
    store,
    created,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    reset: () => {
      store.states = [];
      store.i = 0;
      created.length = 0;
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
    useCreateStorageItem: () => ({
      mutate: (input: unknown) => {
        h.created.push(input);
      },
      isPending: false,
    }),
  };
});

import { AddStorageItemForm } from "./AddStorageItemForm.js";
import { ContainerChoiceField } from "./ContainerChoiceField.js";
import { FoodPicker } from "../../catalog/components/FoodPicker.js";

interface Rendered {
  type: unknown;
  props: Record<string, unknown>;
}

/** The first element of this component type anywhere in the returned tree. */
function find(node: unknown, type: unknown): Rendered | null {
  if (node === null || node === undefined || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  }
  const element = node as Rendered;
  if (element.type === type) return element;
  return find(element.props?.children, type);
}

/** Renders the real form against the hook store — state survives between calls,
 * so a second render sees whatever the first one's callbacks set. */
function render(): Rendered {
  h.store.i = 0;
  return (AddStorageItemForm as unknown as (props: unknown) => Rendered)({ onDone: () => {} });
}

function pickFoods(tree: Rendered, foodIds: string[]) {
  const picker = find(tree, FoodPicker);
  if (!picker) throw new Error("the food tab should render the food picker");
  (picker.props.onChange as (ids: string[]) => void)(foodIds);
}

function containerChoiceField(tree: Rendered): Rendered {
  const field = find(tree, ContainerChoiceField);
  if (!field) throw new Error("the food tab should always mount the container choice");
  return field;
}

function submit(tree: Rendered) {
  (tree.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
}

describe("AddStorageItemForm's own 'Save as' state (item 348)", () => {
  it("starts on One container, before a single food has been picked", () => {
    h.reset();
    expect(containerChoiceField(render()).props.value).toBe("one");
  });

  it("saves two foods as ONE container when nobody touches the choice", () => {
    h.reset();
    pickFoods(render(), ["food-1", "food-2"]);

    const tree = render();
    expect(containerChoiceField(tree).props.value).toBe("one");
    submit(tree);

    expect(h.created).toHaveLength(1);
    const input = h.created[0] as CreateStorageItemInput;
    expect(input.foodIds).toEqual(["food-1", "food-2"]);
    expect(input.separateItems).toBe(false);
  });

  it("saves separate containers only once the parent asks for them", () => {
    h.reset();
    pickFoods(render(), ["food-1", "food-2"]);
    (containerChoiceField(render()).props.onChange as (choice: string) => void)("separate");

    const tree = render();
    expect(containerChoiceField(tree).props.value).toBe("separate");
    submit(tree);

    expect((h.created[0] as CreateStorageItemInput).separateItems).toBe(true);
  });
});
