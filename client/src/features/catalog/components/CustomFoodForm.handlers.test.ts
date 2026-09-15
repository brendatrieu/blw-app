// Item 352's escape hatch, pinned where a `renderToString` suite cannot see
// it. The Name hint's "Add it as a recipe instead" is a real `Link`: the
// full-screen page just navigates, but inside the picker's `Sheet` the sheet
// has to close ITSELF first, or it stays mounted over /recipes/new and over
// the page again on Back, still holding a half-typed food. Both halves of that
// — the Link calling `onNavigateAway`, and FoodPicker passing the closer —
// live in props and in state, neither of which a server render reaches: the
// hint hangs off `Field`'s `hint` prop rather than its children, and the sheet
// renders nothing at all while closed.
//
// Harness idiom: the vi.hoisted hook store from TourDialog.handlers.test.ts /
// AddStorageItemForm.handlers.test.ts. React's `useState` is replaced with a
// store so the components can be called as plain functions, their element
// trees read, and their callbacks invoked.
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };

  return {
    store,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    // The picker memoizes its option list; with no React around it, the
    // factory just runs.
    useMemo: (factory: () => unknown) => factory(),
    reset: () => {
      store.states = [];
      store.i = 0;
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
    useFoods: () => ({ data: { foods: [] }, isLoading: false }),
    useCreateCustomFood: () => ({ mutate: () => {}, isPending: false }),
    useUpdateCustomFood: () => ({ mutate: () => {}, isPending: false }),
  };
});

import { Link } from "react-router-dom";
import { CustomFoodForm } from "./CustomFoodForm.js";
import { FoodPicker } from "./FoodPicker.js";
import { MultiCombobox } from "../../../components/ui/MultiCombobox.js";
import { Sheet } from "../../../components/ui/Sheet.js";

interface Rendered {
  type: unknown;
  props: Record<string, unknown>;
}

/**
 * The first element of this component type anywhere in the returned tree —
 * searching EVERY prop, not only `children`, because the hint that carries the
 * link is passed to `Field` as a prop.
 */
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
  if (!element.props) return null;
  for (const value of Object.values(element.props)) {
    const found = find(value, type);
    if (found) return found;
  }
  return null;
}

function renderForm(props: Record<string, unknown>): Rendered {
  h.store.i = 0;
  return (CustomFoodForm as unknown as (props: unknown) => Rendered)({ onSaved: () => {}, ...props });
}

function recipeLink(tree: Rendered): Rendered {
  const link = find(tree, Link);
  if (!link) throw new Error("the name hint should carry a Link to the recipe form");
  return link;
}

describe("CustomFoodForm's recipe pointer (item 352)", () => {
  it("links to the custom-recipe form", () => {
    h.reset();
    expect(recipeLink(renderForm({})).props.to).toBe("/recipes/new");
  });

  it("runs the caller's `onNavigateAway` when the link is followed", () => {
    h.reset();
    const closed: string[] = [];
    const link = recipeLink(renderForm({ onNavigateAway: () => closed.push("closed") }));

    expect(closed).toEqual([]);
    (link.props.onClick as () => void)();
    expect(closed).toEqual(["closed"]);
  });

  // The full-screen page has nothing to tidy: it must not be forced to pass a
  // no-op, and the link must still navigate without one.
  it("navigates with no handler at all when the caller passes none", () => {
    h.reset();
    const link = recipeLink(renderForm({}));
    expect(link.props.onClick).toBeUndefined();
    expect(link.props.to).toBe("/recipes/new");
  });
});

function renderPicker(): Rendered {
  h.store.i = 0;
  return (FoodPicker as unknown as (props: unknown) => Rendered)({
    id: "log-food-food",
    value: [],
    onChange: () => {},
  });
}

function sheet(tree: Rendered): Rendered {
  const found = find(tree, Sheet);
  if (!found) throw new Error("the picker should always mount its create sheet");
  return found;
}

describe("FoodPicker hands the sheet's own closer to the form (item 352)", () => {
  it("closes the create sheet before the recipe link navigates", () => {
    h.reset();

    // Open the sheet the way the create row does.
    const combobox = find(renderPicker(), MultiCombobox);
    if (!combobox) throw new Error("the picker should render the food combobox");
    (combobox.props.onCreate as (query: string) => void)("Papaya bread");

    const opened = sheet(renderPicker());
    expect(opened.props.open).toBe(true);

    const form = find(opened.props.children, CustomFoodForm);
    if (!form) throw new Error("the sheet should hold the custom food form");
    (form.props.onNavigateAway as () => void)();

    expect(sheet(renderPicker()).props.open).toBe(false);
  });
});
