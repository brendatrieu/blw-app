// Item 599: a meal is deleted only from the "Delete this meal?" sheet's red
// button — the kebab (list) just asks. Components are called as plain
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

import { ConfirmSheet } from "../../../components/ui/ConfirmSheet.js";
import { MealCard, MealDeleteSheet, ServeLogList } from "./ServeLogList.js";

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
  return (MealDeleteSheet as unknown as (props: unknown) => El)({
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

describe("MealDeleteSheet", () => {
  it("asks a question with one short line (item 607), deleting nothing until the red button", () => {
    const sheet = question(MEAL);
    expect(sheet.type).toBe(ConfirmSheet);
    expect(sheet.props.title).toBe("Delete this meal?");
    expect(text(sheet.props.children)).toBe("This can't be undone.");
    expect(sheet.props.confirmLabel).toBe("Delete");
    expect(h.mutation.calls).toEqual([]);
  });

  it("keeps the same one line for a meal from storage — no storage explanation", () => {
    const fromStorage = { ...MEAL, foods: [{ ...MEAL.foods[0]!, storageItemId: "s-1" }] };
    expect(text(question(fromStorage).props.children)).toBe("This can't be undone.");
  });

  it("deletes on the red button, then closes and hands off to onDeleted", () => {
    const events: string[] = [];
    (question(MEAL, events).props.onConfirm as () => void)();
    expect(h.mutation.calls.map((call) => call.id)).toEqual([MEAL.id]);
    expect(events).toEqual([]);
    h.mutation.calls[0]!.options.onSuccess!();
    expect(events).toEqual(["closed", "deleted"]);
  });

  it("shows pending, and keeps the sheet open with the reason when the delete fails", () => {
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
    expect(find(list(), MealDeleteSheet)).toBeNull();
    (find(list(), MealCard)!.props.onRequestDelete as (meal: MealItem) => void)(MEAL);
    const sheet = find(list(), MealDeleteSheet);
    expect(sheet!.props.meal).toBe(MEAL);
    expect(h.mutation.calls).toEqual([]);
  });

  it("keeps the question open after the row leaves the list (the delete is optimistic), until closed", () => {
    (find(list(), MealCard)!.props.onRequestDelete as (meal: MealItem) => void)(MEAL);
    h.meals = [];
    const sheet = find(list(), MealDeleteSheet);
    expect(sheet).not.toBeNull();
    (sheet!.props.onClose as () => void)();
    expect(find(list(), MealDeleteSheet)).toBeNull();
  });
});
