// Items 599, 610: a custom recipe is deleted only from the "Delete <title>?"
// pop-up's red button. Ledger 957: nothing blocks it, so the question names
// the meals and storage items that keep it before the red button. Called as a plain function with the hooks mocked (idiom from
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
    // Ledgers 937, 957: what the plan-count read answers, and the calls it got.
    planCount: { data: undefined as { plannedMealCount: number; mealCount: number; storageCount: number } | undefined },
    planCountCalls: [] as [string, boolean][],
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
  useRecipePlanCount: (id: string, enabled: boolean) => {
    h.planCountCalls.push([id, enabled]);
    return h.planCount;
  },
  useDeleteCustomRecipe: () => ({
    ...h.mutation,
    mutate: (id: unknown, options: { onSuccess?: () => void }) => h.mutation.calls.push({ id, options }),
  }),
}));

import { ApiError } from "../lib/api.js";
import { Button } from "../components/ui/Button.js";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.js";
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
const dialogOf = (tree: El) => find(tree, (el) => el.type === ConfirmDialog)!;

beforeEach(() => {
  h.store.states = [];
  h.navigations = [];
  h.planCount.data = undefined;
  h.planCountCalls = [];
  Object.assign(h.mutation, { isPending: false, isError: false, error: null, calls: [] });
});

describe("CustomRecipeActions delete question (item 599)", () => {
  it("Delete opens the question, deleting nothing", () => {
    expect(dialogOf(render()).props.open).toBe(false);
    const del = find(render(), (el) => el.type === Button && el.props.children === "Delete")!;
    (del.props.onClick as () => void)();
    const dialog = dialogOf(render());
    expect(dialog.props.open).toBe(true);
    expect(dialog.props.title).toBe("Delete Lentil mash?");
    expect(dialog.props.children).toMatchObject([null, { props: { children: "This cannot be undone." } }]);
    expect(dialog.props.confirmLabel).toBe("Delete");
    expect(h.mutation.calls).toEqual([]);
  });

  it("backs out (Cancel, overlay, Escape) through onClose, deleting nothing (item 610)", () => {
    const del = find(render(), (el) => el.type === Button && el.props.children === "Delete")!;
    (del.props.onClick as () => void)();
    (dialogOf(render()).props.onClose as () => void)();
    expect(dialogOf(render()).props.open).toBe(false);
    expect(h.mutation.calls).toEqual([]);
  });

  it("deletes on the red button and returns to Recipes", () => {
    (dialogOf(render()).props.onConfirm as () => void)();
    expect(h.mutation.calls.map((call) => call.id)).toEqual(["recipe-9"]);
    h.mutation.calls[0]!.options.onSuccess!();
    expect(h.navigations).toEqual(["/recipes"]);
  });

  it("shows pending, and one plain retry line for any failure (no 409 any more, ledger 957)", () => {
    h.mutation.isPending = true;
    expect(dialogOf(render()).props.pending).toBe(true);
    Object.assign(h.mutation, {
      isPending: false,
      isError: true,
      // What an older server still answers while a meal names the recipe.
      error: new ApiError(409, "conflict", { error: "conflict", mealCount: 2, storageCount: 0 }),
    });
    expect(dialogOf(render()).props.error).toBe("Couldn't delete that — try again.");
    h.mutation.error = new Error("offline");
    expect(dialogOf(render()).props.error).toBe("Couldn't delete that — try again.");
  });
});

describe("CustomRecipeActions delete question names the plans it leaves (ledger 937)", () => {
  const paragraphs = (tree: El) =>
    (dialogOf(tree).props.children as unknown[]).filter(Boolean).map((p) => (p as El).props.children);

  it("reads the count only while the question is open", () => {
    render();
    expect(h.planCountCalls).toEqual([["recipe-9", false]]);
    const del = find(render(), (el) => el.type === Button && el.props.children === "Delete")!;
    (del.props.onClick as () => void)();
    h.planCountCalls = [];
    render();
    expect(h.planCountCalls).toEqual([["recipe-9", true]]);
  });

  it("adds the plan line before 'cannot be undone', singular and plural", () => {
    h.planCount.data = { plannedMealCount: 1, mealCount: 0, storageCount: 0 };
    expect(paragraphs(render())).toEqual([
      "It's planned for 1 meal. Deleting it takes it off those plans.",
      "This cannot be undone.",
    ]);
    h.planCount.data = { plannedMealCount: 3, mealCount: 0, storageCount: 0 };
    expect(paragraphs(render())[0]).toBe("It's planned for 3 meals. Deleting it takes it off those plans.");
  });

  it("says nothing about plans when none hold it, or the read failed or is offline", () => {
    h.planCount.data = { plannedMealCount: 0, mealCount: 0, storageCount: 0 };
    expect(paragraphs(render())).toEqual(["This cannot be undone."]);
    h.planCount.data = undefined;
    expect(paragraphs(render())).toEqual(["This cannot be undone."]);
    // The question still deletes without the line.
    (dialogOf(render()).props.onConfirm as () => void)();
    expect(h.mutation.calls.map((call) => call.id)).toEqual(["recipe-9"]);
  });
});

describe("CustomRecipeActions delete question: just the plans and 'cannot be undone' (ledger 967)", () => {
  const paragraphs = (tree: El) =>
    (dialogOf(tree).props.children as unknown[]).filter(Boolean).map((p) => (p as El).props.children);

  it("never names the logged meals or storage items that keep it, nor how they show it", () => {
    h.planCount.data = { plannedMealCount: 2, mealCount: 1, storageCount: 1 };
    expect(paragraphs(render())).toEqual(["It's planned for 2 meals. Deleting it takes it off those plans.", "This cannot be undone."]);
    h.planCount.data = { plannedMealCount: 0, mealCount: 3, storageCount: 2 };
    expect(paragraphs(render())).toEqual(["This cannot be undone."]);
    expect(JSON.stringify(paragraphs(render()))).not.toMatch(/Used in|deleted/);
  });

  it("still deletes, on the plain Delete, whatever keeps it (it never blocks)", () => {
    h.planCount.data = { plannedMealCount: 0, mealCount: 1, storageCount: 0 };
    const dialog = dialogOf(render());
    expect(dialog.props.confirmLabel).toBe("Delete");
    (dialog.props.onConfirm as () => void)();
    expect(h.mutation.calls.map((call) => call.id)).toEqual(["recipe-9"]);
  });
});
