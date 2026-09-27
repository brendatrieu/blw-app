// Item 574: the meal page's stars are its one inline edit — each tap is a
// PATCH through `useUpdateMeal`, and the tapped value shows while it saves.
// Called as a plain function with the hooks mocked (no DOM).
import { describe, expect, it, vi } from "vitest";
import type { MealItem } from "@blw/shared";

const h = vi.hoisted(() => ({
  meal: null as unknown,
  mutations: [] as unknown[],
  pending: undefined as unknown,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: (init: unknown) => [init, () => {}] };
});
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useParams: () => ({ id: (h.meal as MealItem).id }) };
});
vi.mock("../components/ui/BackButton.js", () => ({ BackButton: () => null, useBackNavigate: () => () => {} }));
vi.mock("../features/babies/useActiveBaby.js", () => ({
  useActiveBaby: () => ({ activeBaby: { id: "baby-1" }, isLoading: false }),
}));
vi.mock("../features/tracking/hooks.js", () => ({
  useMeals: () => ({ data: { items: [h.meal] }, isLoading: false }),
  useUpdateMeal: () => ({
    mutate: (variables: unknown) => h.mutations.push(variables),
    isPending: h.pending !== undefined,
    variables: h.pending,
    isError: false,
  }),
}));

import { MealDetailPage } from "./MealDetailPage.js";
import { MealRatingsField, type MealRatingRow } from "../features/tracking/components/MealRatingsField.js";

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

const LOOSE: MealItem = {
  id: "22222222-2222-4222-8222-222222222222",
  babyId: "baby-1",
  servedAt: "2026-09-20T12:00:00.000Z",
  reactionNote: null,
  notes: null,
  recipeId: null,
  recipeTitle: null,
  recipeRating: null,
  foods: [
    { id: "food-1", slug: "egg", name: "Egg", category: "protein", storageItemId: null, rating: 2 },
    { id: "food-2", slug: "banana", name: "Banana", category: "fruit", storageItemId: null, rating: null },
  ],
};

function field(meal: MealItem, pending?: unknown): El {
  h.meal = meal;
  h.pending = pending;
  h.mutations.length = 0;
  const tree = (MealDetailPage as unknown as () => El)();
  const found = find(tree, MealRatingsField);
  if (!found) throw new Error("the meal page should render its ratings");
  return found;
}
const tap = (el: El, key: string, value: number | null) =>
  (el.props.onChange as (key: string, value: number | null) => void)(key, value);

describe("MealDetailPage stars (item 574)", () => {
  it("saves a food's tap as a per-food PATCH, and Clear as null", () => {
    const el = field(LOOSE);
    tap(el, "food-2", 5);
    tap(el, "food-1", null);
    expect(h.mutations).toEqual([
      { id: LOOSE.id, input: { foodRatings: { "food-2": 5 } } },
      { id: LOOSE.id, input: { foodRatings: { "food-1": null } } },
    ]);
  });

  it("saves the recipe's tap as a recipe rating on a recipe meal", () => {
    const el = field({ ...LOOSE, recipeId: "r1", recipeTitle: "Pancakes", recipeRating: 1 });
    tap(el, "recipe", 4);
    expect(h.mutations).toEqual([{ id: LOOSE.id, input: { recipeRating: 4 } }]);
  });

  it("shows the tapped value while the save is in flight", () => {
    const rows = field(LOOSE, { id: LOOSE.id, input: { foodRatings: { "food-2": 3 } } }).props.rows as MealRatingRow[];
    expect(rows.map((row) => [row.key, row.value])).toEqual([
      ["food-1", 2],
      ["food-2", 3],
    ]);
  });
});
