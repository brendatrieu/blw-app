// Drives LogFoodForm's OWN leftovers state without a DOM. The suite next door
// renders `LeftoversFields` directly, which means every assertion about the
// "Save as" choice there is really an assertion about the value the TEST
// passed in — so the form's own `useState<ContainerChoice>("one")` was
// unpinned: flipping it to `"separate"` left the whole client suite green
// while a three-food meal's leftovers quietly became three containers. This
// suite opens the leftovers block and saves, so the default is judged where
// it is read: in the `createStorageItem` payload.
//
// Harness idiom: the vi.hoisted hook store from TourDialog.handlers.test.ts.
import { describe, expect, it, vi } from "vitest";
import type { CreateStorageItemInput } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], refs: [] as { current: unknown }[], i: 0, r: 0 };
  const meals: { input: unknown; options: { onSuccess?: () => void } }[] = [];
  const containers: unknown[] = [];

  return {
    store,
    meals,
    containers,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    reset: () => {
      store.states = [];
      store.refs = [];
      store.i = 0;
      store.r = 0;
      meals.length = 0;
      containers.length = 0;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useState: h.useState,
    useRef: h.useRef,
    useMemo: (factory: () => unknown) => factory(),
    // The only effect here is the recipe-ingredient merge, which returns
    // immediately with no recipe selected — the case this suite drives.
    useEffect: (effect: () => void) => {
      effect();
    },
  };
});

vi.mock("../../catalog/hooks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useFoods: () => ({ data: { foods: [] } }), useRecipe: () => ({ data: undefined }) };
});

vi.mock("../hooks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useCreateMeal: () => ({
      mutate: (input: unknown, options: { onSuccess?: () => void } = {}) => {
        h.meals.push({ input, options });
      },
      isPending: false,
      isError: false,
    }),
    useUpdateMeal: () => ({ mutate: () => {}, isPending: false, isError: false }),
  };
});

vi.mock("../../storage/hooks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useCreateStorageItem: () => ({
      mutate: (input: unknown) => {
        h.containers.push(input);
      },
      isPending: false,
    }),
  };
});

import { LeftoversFields, LogFoodForm } from "./LogFoodForm.js";
import { Switch } from "../../../components/ui/Switch.js";

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

const FOOD_IDS = ["food-1", "food-2", "food-3"];

/** Renders the real form against the hook store — state survives between
 * calls, so a second render sees whatever the first one's callbacks set. */
function render(): Rendered {
  h.store.i = 0;
  h.store.r = 0;
  return (LogFoodForm as unknown as (props: unknown) => Rendered)({
    babyId: "baby-1",
    onDone: () => {},
    // The meal this suite is about: three foods from the hand-built picker,
    // no recipe — the case that used to ask "Which food?" and keep one.
    initialFoodIds: FOOD_IDS,
  });
}

function openLeftovers(tree: Rendered) {
  const toggle = find(tree, Switch);
  if (!toggle) throw new Error("create mode should render the leftovers switch");
  (toggle.props.onChange as (open: boolean) => void)(true);
}

function leftovers(tree: Rendered): Rendered {
  const fields = find(tree, LeftoversFields);
  if (!fields) throw new Error("the leftovers block should be open");
  return fields;
}

/** Submits, then runs the meal mutation's success callback — the storage half
 * only ever starts once the meal itself has saved. */
function saveAndSettle(tree: Rendered) {
  (tree.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
  expect(h.meals).toHaveLength(1);
  h.meals[0]!.options.onSuccess?.();
}

describe("LogFoodForm's own 'Save as' state (item 348)", () => {
  it("opens the leftovers block on One container", () => {
    h.reset();
    openLeftovers(render());

    expect(leftovers(render()).props.containerChoice).toBe("one");
  });

  it("saves a three-food meal's leftovers as ONE container when nobody touches the choice", () => {
    h.reset();
    openLeftovers(render());

    const tree = render();
    expect(leftovers(tree).props.containerChoice).toBe("one");
    saveAndSettle(tree);

    expect(h.containers).toHaveLength(1);
    const input = h.containers[0] as CreateStorageItemInput;
    expect(input.foodIds).toEqual(FOOD_IDS);
    expect(input.separateItems).toBe(false);
  });

  it("saves separate containers only once the parent asks for them", () => {
    h.reset();
    openLeftovers(render());
    (leftovers(render()).props.onContainerChoiceChange as (choice: string) => void)("separate");

    const tree = render();
    expect(leftovers(tree).props.containerChoice).toBe("separate");
    saveAndSettle(tree);

    expect((h.containers[0] as CreateStorageItemInput).separateItems).toBe(true);
  });
});
