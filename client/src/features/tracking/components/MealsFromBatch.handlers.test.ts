// Ledger 966a: a container's meals are Food log cards, and their ⋮ Delete
// asks right here. The component is called as a plain function with React's
// useState as a store and the meals query mocked (the CLAUDE.md idiom).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealItem } from "@blw/shared";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  i: 0,
  meals: [] as unknown[],
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useState: (init: unknown) => {
    const i = h.i++;
    if (!(i in h.states)) h.states[i] = init;
    return [h.states[i], (value: unknown) => (h.states[i] = value)];
  },
}));
vi.mock("../hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMeals: () => ({ data: { items: h.meals }, isLoading: false }),
}));

import { MealCard, MealDeleteDialog } from "./ServeLogList.js";
import { MealsFromBatch } from "./MealsFromBatch.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function findAll(node: unknown, match: (el: El) => boolean, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, match, out);
    return out;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return out;
  const el = node as El;
  if (match(el)) out.push(el);
  findAll(el.props.children, match, out);
  return out;
}
const render = () => {
  h.i = 0;
  return (MealsFromBatch as unknown as (props: unknown) => El)({ babyId: "baby-1", storageItemId: "storage-1" });
};

const meal = (id: string, storageItemId: string | null): MealItem => ({
  id,
  babyId: "baby-1",
  servedAt: "2026-11-01T12:00:00.000Z",
  reactionNote: null,
  notes: null,
  recipeId: null,
  recipeTitle: null,
  foods: [{ id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", storageItemId }],
});

beforeEach(() => {
  h.states = [];
  h.meals = [meal("meal-1", "storage-1"), meal("meal-2", null), meal("meal-3", "storage-1")];
});

describe("MealsFromBatch delete (ledger 966a)", () => {
  it("lists this container's meals as MealCards; ⋮ Delete asks with the Food log's question and stays on the page", () => {
    let tree = render();
    const cards = findAll(tree, (el) => el.type === MealCard);
    expect(cards.map((card) => (card.props.meal as MealItem).id)).toEqual(["meal-1", "meal-3"]);
    expect(findAll(tree, (el) => el.type === MealDeleteDialog)).toEqual([]);
    (cards[1]!.props.onRequestDelete as (meal: MealItem) => void)(h.meals[2] as MealItem);
    tree = render();
    const [dialog] = findAll(tree, (el) => el.type === MealDeleteDialog);
    expect(dialog!.props).toMatchObject({ babyId: "baby-1", open: true });
    expect((dialog!.props.meal as MealItem).id).toBe("meal-3");
    // No onDeleted: nothing navigates, the card just goes (the delete
    // refreshes Storage, so the container above gets its servings back).
    expect(dialog!.props.onDeleted).toBeUndefined();
    (dialog!.props.onClose as () => void)();
    expect(findAll(render(), (el) => el.type === MealDeleteDialog)).toEqual([]);
  });
});
