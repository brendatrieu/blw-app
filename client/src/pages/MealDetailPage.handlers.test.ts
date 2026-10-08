// Item 574: the meal page's stars are its one inline edit — each tap is a
// PATCH through `useUpdateMeal`, and the tapped value shows while it saves.
// Called as a plain function with the hooks mocked (no DOM).
import { describe, expect, it, vi } from "vitest";
import type { MealItem } from "@blw/shared";

const h = vi.hoisted(() => ({
  meal: null as unknown,
  mutations: [] as unknown[],
  pending: undefined as unknown,
  sets: [] as unknown[],
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: (init: unknown) => [init, (value: unknown) => h.sets.push(value)] };
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
import { MealDeleteDialog } from "../features/tracking/components/ServeLogList.js";
import { Button } from "../components/ui/Button.js";

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

// Ledger 761: two recipes; Egg is an unrated ingredient (no row of its own).
const SEVERAL: MealItem = {
  ...LOOSE,
  recipeId: "r1",
  recipeTitle: "Lentil Patties",
  recipeRating: 3,
  recipes: [
    { id: "r1", title: "Lentil Patties", rating: 3 },
    { id: "r2", title: "Salmon Cakes", rating: null },
  ],
  foods: [
    { ...LOOSE.foods[0]!, rating: null, inRecipe: true },
    { ...LOOSE.foods[1]!, inRecipe: false },
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

  it("saves a recipe's tap as recipeRatings, never the legacy recipeRating (ledger 761)", () => {
    const el = field({ ...LOOSE, recipeId: "r1", recipeTitle: "Pancakes", recipeRating: 1 });
    tap(el, "recipe:r1", 4);
    expect(h.mutations).toEqual([{ id: LOOSE.id, input: { recipeRatings: { r1: 4 } } }]);
  });

  it("on a meal with several recipes, each row saves its own recipe", () => {
    const el = field(SEVERAL);
    expect((el.props.rows as MealRatingRow[]).map((row) => row.key)).toEqual(["recipe:r1", "recipe:r2", "food-2"]);
    tap(el, "recipe:r2", 5);
    tap(el, "recipe:r1", null);
    expect(h.mutations).toEqual([
      { id: LOOSE.id, input: { recipeRatings: { r2: 5 } } },
      { id: LOOSE.id, input: { recipeRatings: { r1: null } } },
    ]);
  });

  it("shows a recipe's tapped value while it saves, and only that recipe's", () => {
    const rows = field(SEVERAL, { id: LOOSE.id, input: { recipeRatings: { r2: 1 } } }).props.rows as MealRatingRow[];
    expect(rows.map((row) => [row.key, row.value])).toEqual([
      ["recipe:r1", 3],
      ["recipe:r2", 1],
      ["food-2", null],
    ]);
  });

  it("ignores a save in flight for another meal", () => {
    const rows = field(SEVERAL, { id: "other", input: { recipeRatings: { r2: 1 } } }).props.rows as MealRatingRow[];
    expect(rows[1]).toEqual({ key: "recipe:r2", label: "Salmon Cakes", value: null });
  });

  it("keeps a rated ingredient's row while its Clear saves", () => {
    const meal: MealItem = {
      ...SEVERAL,
      foods: [{ ...SEVERAL.foods[0]!, rating: 2 }, SEVERAL.foods[1]!],
    };
    const rows = field(meal, { id: LOOSE.id, input: { foodRatings: { "food-1": null } } }).props.rows as MealRatingRow[];
    expect(rows.map((row) => [row.key, row.value])).toEqual([
      ["recipe:r1", 3],
      ["recipe:r2", null],
      ["food-1", null],
      ["food-2", null],
    ]);
  });

  it("shows the tapped value while the save is in flight", () => {
    const rows = field(LOOSE, { id: LOOSE.id, input: { foodRatings: { "food-2": 3 } } }).props.rows as MealRatingRow[];
    expect(rows.map((row) => [row.key, row.value])).toEqual([
      ["food-1", 2],
      ["food-2", 3],
    ]);
  });
});

describe("MealDetailPage delete (item 599)", () => {
  it("Delete opens the question sheet instead of deleting", () => {
    h.meal = LOOSE;
    h.sets.length = 0;
    const tree = (MealDetailPage as unknown as () => El)();
    const sheet = find(tree, MealDeleteDialog)!;
    expect(sheet.props.open).toBe(false);
    expect(sheet.props.meal).toBe(LOOSE);

    const buttons: El[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const el = node as El;
      if (el.type === Button && el.props.children === "Delete") buttons.push(el);
      walk(el.props.children);
    };
    walk(tree);
    expect(buttons).toHaveLength(1);
    // Item 638: the shared red-outline Delete, not a muted text link.
    expect(buttons[0]!.props.variant).toBe("danger-quiet");
    (buttons[0]!.props.onClick as () => void)();
    expect(h.sets).toEqual([true]);
  });
});
