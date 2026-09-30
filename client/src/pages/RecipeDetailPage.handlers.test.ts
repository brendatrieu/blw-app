// Item 599: a custom recipe is deleted only from the "Delete <title>?" sheet's
// red button. Called as a plain function with the hooks mocked (idiom from
// FoodDetailPage.handlers).
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    mutation: {
      isPending: false,
      isError: false,
      error: null as unknown,
      calls: [] as { id: unknown; options: { onSuccess?: () => void } }[],
    },
    navigations: [] as unknown[],
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = init;
      return [store.states[i], (value: unknown) => (store.states[i] = value)];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useNavigate: () => (to: unknown) => h.navigations.push(to) };
});
vi.mock("../features/catalog/hooks.js", () => ({
  useRecipe: () => ({}),
  useDeleteCustomRecipe: () => ({
    ...h.mutation,
    mutate: (id: unknown, options: { onSuccess?: () => void }) => h.mutation.calls.push({ id, options }),
  }),
}));

import { ApiError } from "../lib/api.js";
import { Button } from "../components/ui/Button.js";
import { ConfirmSheet } from "../components/ui/ConfirmSheet.js";
import { CustomRecipeActions } from "./RecipeDetailPage.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function find(node: unknown, match: (el: El) => boolean): El | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, match);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const el = node as El;
  return match(el) ? el : find(el.props.children, match);
}

function render(): El {
  h.store.i = 0;
  return (CustomRecipeActions as unknown as (props: unknown) => El)({ recipe: { id: "recipe-9", title: "Lentil mash" } });
}
const sheetOf = (tree: El) => find(tree, (el) => el.type === ConfirmSheet)!;

beforeEach(() => {
  h.store.states = [];
  h.navigations = [];
  Object.assign(h.mutation, { isPending: false, isError: false, error: null, calls: [] });
});

describe("CustomRecipeActions delete question (item 599)", () => {
  it("Delete opens the question, deleting nothing", () => {
    expect(sheetOf(render()).props.open).toBe(false);
    const del = find(render(), (el) => el.type === Button && el.props.children === "Delete")!;
    (del.props.onClick as () => void)();
    const sheet = sheetOf(render());
    expect(sheet.props.open).toBe(true);
    expect(sheet.props.title).toBe("Delete Lentil mash?");
    expect(sheet.props.children).toMatchObject({
      props: { children: "This can't be undone." },
    });
    expect(sheet.props.confirmLabel).toBe("Delete");
    expect(h.mutation.calls).toEqual([]);
  });

  it("deletes on the red button and returns to Recipes", () => {
    (sheetOf(render()).props.onConfirm as () => void)();
    expect(h.mutation.calls.map((call) => call.id)).toEqual(["recipe-9"]);
    h.mutation.calls[0]!.options.onSuccess!();
    expect(h.navigations).toEqual(["/recipes"]);
  });

  it("shows pending, and says what is in the way on a 409", () => {
    h.mutation.isPending = true;
    expect(sheetOf(render()).props.pending).toBe(true);
    Object.assign(h.mutation, {
      isPending: false,
      isError: true,
      error: new ApiError(409, "conflict", { error: "conflict", mealCount: 2, storageCount: 0 }),
    });
    expect(sheetOf(render()).props.error).toBe("Used in 2 meals — remove those first.");
    h.mutation.error = new Error("offline");
    expect(sheetOf(render()).props.error).toBe("Couldn't delete that — try again.");
  });
});
