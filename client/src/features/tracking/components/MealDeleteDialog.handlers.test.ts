// Items 599, 610: a meal is deleted only from the "Delete this meal?" pop-up's
// red button — the kebab (list) just asks. Components are called as plain
// functions with the hooks mocked (idiom from FoodDetailPage.handlers).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const mutation = {
    isPending: false,
    isError: false,
    calls: [] as { id: unknown; options: { onSuccess?: () => void } }[],
  };
  return {
    store,
    mutation,
    meals: [] as unknown[],
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      return [store.states[i], (value: unknown) => (store.states[i] = value)];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useMemo: (fn: () => unknown) => fn() };
});
vi.mock("../hooks.js", () => ({
  useMeals: () => ({ data: { items: h.meals }, isLoading: false, isError: false }),
  useDeleteMeal: () => ({
    isPending: h.mutation.isPending,
    isError: h.mutation.isError,
    mutate: (id: unknown, options: { onSuccess?: () => void }) => h.mutation.calls.push({ id, options }),
  }),
}));

import { ConfirmDialog } from "../../../components/ui/ConfirmDialog.js";
import { MealCard, MealDeleteDialog, ServeLogList } from "./ServeLogList.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function find(node: unknown, type: unknown): El | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const el = node as El;
  return el.type === type ? el : find(el.props.children, type);
}
function text(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object" && "props" in node) return text((node as El).props.children);
  return "";
}

const MEAL: MealItem = {
  id: "11111111-1111-4111-8111-111111111111",
  babyId: "baby-1",
  servedAt: "2026-09-20T12:00:00.000Z",
  reactionNote: null,
  notes: null,
  recipeId: null,
  recipeTitle: null,
  recipeRating: null,
  foods: [{ id: "food-1", slug: "egg", name: "Egg", category: "protein", storageItemId: null, rating: null }],
};

function question(meal: MealItem, events: string[] = []): El {
  return (MealDeleteDialog as unknown as (props: unknown) => El)({
    meal,
    babyId: "baby-1",
    open: true,
    onClose: () => events.push("closed"),
    onDeleted: () => events.push("deleted"),
  });
}

beforeEach(() => {
  h.store.states = [];
  h.store.i = 0;
  h.mutation.isPending = false;
  h.mutation.isError = false;
  h.mutation.calls = [];
  h.meals = [MEAL];
});

describe("MealDeleteDialog", () => {
  it("asks a question with one short line (item 607), deleting nothing until the red button", () => {
    const dialog = question(MEAL);
    expect(dialog.type).toBe(ConfirmDialog);
    expect(dialog.props.title).toBe("Delete this meal?");
    expect(text(dialog.props.children)).toBe("This can't be undone.");
    expect(dialog.props.confirmLabel).toBe("Delete");
    expect(h.mutation.calls).toEqual([]);
  });

  it("keeps the same one line for a meal from storage — no storage explanation", () => {
    const fromStorage = { ...MEAL, foods: [{ ...MEAL.foods[0]!, storageItemId: "s-1" }] };
    expect(text(question(fromStorage).props.children)).toBe("This can't be undone.");
  });

  it("backs out (Cancel, overlay, Escape) through onClose, deleting nothing (item 610)", () => {
    const events: string[] = [];
    (question(MEAL, events).props.onClose as () => void)();
    expect(events).toEqual(["closed"]);
    expect(h.mutation.calls).toEqual([]);
  });

  it("deletes on the red button, then closes and hands off to onDeleted", () => {
    const events: string[] = [];
    (question(MEAL, events).props.onConfirm as () => void)();
    expect(h.mutation.calls.map((call) => call.id)).toEqual([MEAL.id]);
    expect(events).toEqual([]);
    h.mutation.calls[0]!.options.onSuccess!();
    expect(events).toEqual(["closed", "deleted"]);
  });

  it("shows pending, and keeps the pop-up open with the reason when the delete fails", () => {
    h.mutation.isPending = true;
    expect(question(MEAL).props.pending).toBe(true);
    h.mutation.isPending = false;
    h.mutation.isError = true;
    expect(question(MEAL).props.error).toBe("Couldn't delete that — try again.");
  });
});

describe("ServeLogList delete flow", () => {
  function list(): El {
    h.store.i = 0;
    return (ServeLogList as unknown as (props: unknown) => El)({ babyId: "baby-1" });
  }

  it("opens the question for the meal whose kebab asked, without deleting", () => {
    expect(find(list(), MealDeleteDialog)).toBeNull();
    (find(list(), MealCard)!.props.onRequestDelete as (meal: MealItem) => void)(MEAL);
    const dialog = find(list(), MealDeleteDialog);
    expect(dialog!.props.meal).toBe(MEAL);
    expect(h.mutation.calls).toEqual([]);
  });

  it("keeps the question open after the row leaves the list (the delete is optimistic), until closed", () => {
    (find(list(), MealCard)!.props.onRequestDelete as (meal: MealItem) => void)(MEAL);
    h.meals = [];
    const dialog = find(list(), MealDeleteDialog);
    expect(dialog).not.toBeNull();
    (dialog!.props.onClose as () => void)();
    expect(find(list(), MealDeleteDialog)).toBeNull();
  });
});
