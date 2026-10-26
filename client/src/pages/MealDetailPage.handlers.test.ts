// Item 574: the meal page's stars are its one inline edit — each tap is a
// PATCH through `useUpdateMeal` (one item's `itemRatings`, ledger 902), and
// the tapped value shows while it saves.
// Called as a plain function with the hooks mocked (no DOM).
import { describe, expect, it, vi } from "vitest";
import type { MealItem } from "@blw/shared";

const h = vi.hoisted(() => ({
  meal: null as unknown,
  mutations: [] as unknown[],
  pending: undefined as unknown,
  sets: [] as unknown[],
  offline: false,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: (init: unknown) => [init, (value: unknown) => h.sets.push(value)] };
});
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useParams: () => ({ id: (h.meal as MealItem).id }) };
});
vi.mock("../lib/online.js", () => ({ useIsOffline: () => h.offline }));
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
import { MealDeleteDialog } from "../features/tracking/components/ServeLogList.js";
import { Button } from "../components/ui/Button.js";
import { StarRating } from "../components/ui/StarRating.js";
import { SavedItemRow } from "../features/plate/PlateItemRow.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function find(node: unknown, type: unknown): El | null {
  return findAll(node, type)[0] ?? null;
}
function findAll(node: unknown, type: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, type, out);
    return out;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return out;
  const el = node as El;
  if (el.type === type) out.push(el);
  findAll(el.props.children, type, out);
  return out;
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EGG = { id: id(1), slug: "egg", name: "Egg", category: "protein" as const };
const BANANA = { id: id(2), slug: "banana", name: "Banana", category: "fruit" as const };
const CARROT = { id: id(3), slug: "carrot", name: "Carrot", category: "veg" as const };

// Ledger 902: one star line per item, a container per part, keyed by the
// meal item's id. Egg sits in the patties AND on its own (800).
const MEAL: MealItem = {
  id: "22222222-2222-4222-8222-222222222222",
  babyId: "baby-1",
  servedAt: "2026-09-20T12:00:00.000Z",
  reactionNote: null,
  notes: null,
  recipeId: "r1",
  recipeTitle: "Salmon Oat Patties",
  recipeRating: 3,
  foods: [{ ...EGG, storageItemId: null }],
  items: [
    { kind: "recipe", id: id(10), recipe: { id: id(20), title: "Salmon Oat Patties" }, leftOut: [], inferred: false, rating: 3 },
    { kind: "food", id: id(11), food: EGG, rating: null },
    {
      kind: "storage",
      storageItemId: id(30),
      label: null,
      location: "freezer",
      servings: 1,
      parts: [
        { kind: "food", id: id(12), food: BANANA, rating: 2 },
        { kind: "food", id: id(13), food: CARROT, rating: null },
      ],
    },
  ],
};

function render(meal: MealItem, pending?: unknown): El {
  h.meal = meal;
  h.pending = pending;
  h.mutations.length = 0;
  return (MealDetailPage as unknown as () => El)();
}
/** Every star line, through each item card (a plain function: no hooks). */
const stars = (tree: El) =>
  findAll(tree, SavedItemRow).flatMap((row) =>
    findAll((SavedItemRow as unknown as (props: unknown) => El)(row.props), StarRating),
  );
const lines = (tree: El) => stars(tree).map((star) => [star.props.label, star.props.value]);
const tap = (tree: El, label: string, value: number | null) =>
  (stars(tree).find((star) => star.props.label === `Rating for ${label}`)!.props.onChange as (value: number | null) => void)(value);

describe("MealDetailPage stars (item 574, ledger 902)", () => {
  it("one line per item in plate order, a container per food it held, the recipe and a fresh Egg each their own", () => {
    expect(lines(render(MEAL))).toEqual([
      ["Rating for Salmon Oat Patties", 3],
      ["Rating for Egg", null],
      ["Rating for Banana", 2],
      ["Rating for Carrot", null],
    ]);
  });

  it("saves a tap as that one item's itemRatings, and a cleared star as null", () => {
    const tree = render(MEAL);
    tap(tree, "Egg", 5);
    tap(tree, "Banana", null);
    tap(tree, "Salmon Oat Patties", 4);
    // A container's second part names its own item, not the container's first.
    tap(tree, "Carrot", 2);
    expect(h.mutations).toEqual([
      { id: MEAL.id, input: { itemRatings: { [id(11)]: 5 } } },
      { id: MEAL.id, input: { itemRatings: { [id(12)]: null } } },
      { id: MEAL.id, input: { itemRatings: { [id(10)]: 4 } } },
      { id: MEAL.id, input: { itemRatings: { [id(13)]: 2 } } },
    ]);
  });

  it("shows the tapped value while it saves, on that item only", () => {
    expect(lines(render(MEAL, { id: MEAL.id, input: { itemRatings: { [id(12)]: null, [id(11)]: 1 } } }))).toEqual([
      ["Rating for Salmon Oat Patties", 3],
      ["Rating for Egg", 1],
      ["Rating for Banana", null],
      ["Rating for Carrot", null],
    ]);
  });

  it("ignores a save in flight for another meal", () => {
    expect(lines(render(MEAL, { id: "other", input: { itemRatings: { [id(11)]: 1 } } }))[1]).toEqual(["Rating for Egg", null]);
  });

  it("offline, every star waits, and the page says why (SPEC §4.4, VERIFY-p2-c1 #7)", () => {
    h.offline = true;
    const tree = render(MEAL);
    h.offline = false;
    expect(stars(tree).map((star) => star.props.disabled)).toEqual([true, true, true, true]);
    expect(JSON.stringify(tree)).toContain("You're offline.");
    expect(stars(render(MEAL)).map((star) => star.props.disabled)).toEqual([false, false, false, false]);
    expect(JSON.stringify(render(MEAL))).not.toContain("You're offline.");
  });

  it("an older cached body without items shows no stars until the list refreshes", () => {
    expect(stars(render({ ...MEAL, items: undefined }))).toEqual([]);
  });
});

describe("MealDetailPage delete (item 599)", () => {
  it("Delete opens the question sheet instead of deleting", () => {
    h.meal = MEAL;
    h.sets.length = 0;
    const tree = (MealDetailPage as unknown as () => El)();
    const sheet = find(tree, MealDeleteDialog)!;
    expect(sheet.props.open).toBe(false);
    expect(sheet.props.meal).toBe(MEAL);

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
