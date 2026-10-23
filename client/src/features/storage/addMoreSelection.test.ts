// Ledger 878: Add more opens with the Serving list ticked, and Done applies
// only the difference. Pure data, so it runs as plain unit tests.
import { describe, expect, it } from "vitest";
import type { StorageItem } from "@blw/shared";
import { addMoreCanApply, addMoreDiff, addMoreServing, applyAddMore, type ServingList } from "./addMoreSelection.js";

const BASE: StorageItem = {
  id: "11111111-1111-1111-1111-111111111111",
  label: null,
  foods: [{ id: "food-avocado", slug: "avocado", name: "Avocado", emoji: null }],
  recipeId: null,
  recipeTitle: null,
  preparedAt: "2026-08-20T10:00:00.000Z",
  location: "fridge",
  status: "active",
  statusChangedAt: "2026-08-20T10:00:00.000Z",
  expiresAt: "2026-08-23T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: 6,
  servingsLeft: 6,
  bestBy: null,
  notes: null,
};
const SALMON: StorageItem = { ...BASE, id: "22222222-2222-2222-2222-222222222222", foods: [], recipeId: "r-salmon", recipeTitle: "Salmon Cakes" };
const PEAR: StorageItem = { ...BASE, id: "33333333-3333-3333-3333-333333333333", foods: [{ id: "food-pear", slug: "pear", name: "Pear", emoji: null }] };
const BANANA = { id: "food-banana", slug: "banana", name: "Banana", category: "fruit" as const, emoji: null };
const DAL = { id: "r-dal", title: "Red Lentil Dal" };
const NONE = { itemIds: [], recipeIds: [], foodIds: [] };

const LIST: ServingList = {
  parts: [
    { item: BASE, servings: 2 },
    { item: SALMON, servings: 3 },
  ],
  freshFoods: [BANANA],
  freshRecipes: [DAL],
};

describe("addMoreServing — what opens ticked and what is never offered", () => {
  it("ticks the containers and the fresh recipes and foods; covers what the containers hold", () => {
    expect(addMoreServing(LIST)).toEqual({
      itemIds: [BASE.id, SALMON.id],
      recipeIds: ["r-dal"],
      foodIds: ["food-banana"],
      // A recipe container's foods are its ingredients: still offered.
      covered: { recipeIds: ["r-salmon"], foodIds: ["food-avocado"] },
    });
  });
});

describe("addMoreDiff / addMoreCanApply — Done's state", () => {
  const serving = addMoreServing(LIST);

  it("is disabled with the ticks as opened, or ticked back the same in another order", () => {
    expect(addMoreCanApply(serving, serving)).toBe(false);
    expect(addMoreCanApply(serving, { ...serving, itemIds: [SALMON.id, BASE.id] })).toBe(false);
  });

  it("splits the change into new ticks and ticks taken off", () => {
    const ticks = { itemIds: [BASE.id, PEAR.id], recipeIds: [], foodIds: ["food-banana", "food-oats"] };
    expect(addMoreDiff(serving, ticks)).toEqual({
      added: { itemIds: [PEAR.id], recipeIds: [], foodIds: ["food-oats"] },
      removed: { itemIds: [SALMON.id], recipeIds: ["r-dal"], foodIds: [] },
    });
    expect(addMoreCanApply(serving, ticks)).toBe(true);
  });

  it("stays disabled with no container ticked: a serve needs one", () => {
    expect(addMoreCanApply(serving, { ...serving, itemIds: [] })).toBe(false);
  });
});

describe("applyAddMore — Done on the Serving list", () => {
  it("takes off only what was unticked, keeping the rest and their servings", () => {
    const next = applyAddMore(LIST, { removed: { ...NONE, itemIds: [SALMON.id], foodIds: ["food-banana"] }, items: [], foods: [], recipes: [] });
    expect(next).toEqual({ parts: [{ item: BASE, servings: 2 }], freshFoods: [], freshRecipes: [DAL] });
  });

  it("adds new picks after the listed ones, a container at 1 serving, never twice", () => {
    const oats = { ...BANANA, id: "food-oats", slug: "oats", name: "Oats" };
    const next = applyAddMore(LIST, { removed: NONE, items: [PEAR, BASE], foods: [oats, BANANA], recipes: [{ id: "r-egg", title: "Egg Muffins" }] });
    expect(next.parts).toEqual([...LIST.parts, { item: PEAR, servings: 1 }]);
    expect(next.freshFoods).toEqual([BANANA, oats]);
    expect(next.freshRecipes).toEqual([DAL, { id: "r-egg", title: "Egg Muffins" }]);
  });

  it("a container added replaces the same thing listed fresh (ledger 793)", () => {
    const pearFresh = { ...BANANA, id: "food-pear", slug: "pear", name: "Pear" };
    const list = { ...LIST, freshFoods: [pearFresh], freshRecipes: [] };
    const dalItem = { ...SALMON, id: "44444444-4444-4444-4444-444444444444", recipeId: "r-dal", recipeTitle: "Red Lentil Dal" };
    const next = applyAddMore(list, { removed: NONE, items: [PEAR, dalItem], foods: [], recipes: [DAL] });
    expect(next.freshFoods).toEqual([]);
    expect(next.freshRecipes).toEqual([]);
    expect(next.parts.map((part) => part.item.id)).toEqual([BASE.id, SALMON.id, PEAR.id, dalItem.id]);
  });
});
