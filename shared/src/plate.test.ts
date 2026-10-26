import { describe, expect, it } from "vitest";
import {
  PLATE_ITEMS_MAX,
  plateInputFromItems,
  plateItemsInputSchema,
  plateKey,
  type PlateItem,
  type PlateItemInput,
} from "./plate.js";
import { storageLocationSchema } from "./storage.js";
import { createPlateMealInputSchema, isPlateMealBody, starRatingSchema, updatePlateMealInputSchema } from "./tracking.js";
import * as plate from "./plate.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const food = (n: number) => ({ id: id(n), slug: `f${n}`, name: `Food ${n}`, category: "veg" as const });

describe("plateKey (ledger 799)", () => {
  it("tells a fresh food, a fresh recipe and a container apart", () => {
    expect(plateKey({ kind: "food", foodId: id(1) })).toBe(`food:${id(1)}`);
    expect(plateKey({ kind: "recipe", recipeId: id(1) })).toBe(`recipe:${id(1)}`);
    expect(plateKey({ kind: "storage", storageItemId: id(1), servings: 1 })).toBe(`storage:${id(1)}`);
  });
});

describe("plateItemsInputSchema", () => {
  const ok = (items: unknown) => plateItemsInputSchema.safeParse(items).success;

  it("allows each food, recipe and container once, and a fresh food beside a container holding it", () => {
    expect(ok([{ kind: "food", foodId: id(1) }, { kind: "storage", storageItemId: id(1), servings: 1 }])).toBe(true);
    expect(ok([{ kind: "food", foodId: id(1) }, { kind: "food", foodId: id(1) }])).toBe(false);
    expect(ok([{ kind: "recipe", recipeId: id(2) }, { kind: "recipe", recipeId: id(2), id: id(9) }])).toBe(false);
    expect(ok([{ kind: "storage", storageItemId: id(3) }, { kind: "storage", storageItemId: id(3) }])).toBe(false);
  });

  it("refuses one kept id twice, an empty plate, too many items and bad stars or servings", () => {
    expect(ok([{ kind: "food", id: id(9), foodId: id(1) }, { kind: "food", id: id(9), foodId: id(2) }])).toBe(false);
    expect(ok([])).toBe(false);
    expect(ok(Array.from({ length: PLATE_ITEMS_MAX + 1 }, (_, n) => ({ kind: "food", foodId: id(n + 1) })))).toBe(false);
    expect(ok(Array.from({ length: PLATE_ITEMS_MAX }, (_, n) => ({ kind: "food", foodId: id(n + 1) })))).toBe(true);
    expect(ok([{ kind: "food", foodId: id(1), rating: 0 }])).toBe(false);
    expect(ok([{ kind: "food", foodId: id(1), rating: null }])).toBe(true);
    expect(ok([{ kind: "storage", storageItemId: id(1), servings: 100 }])).toBe(false);
    expect(ok([{ kind: "storage", storageItemId: id(1), ratings: { [id(2)]: 6 } }])).toBe(false);
  });
});

describe("plateInputFromItems", () => {
  it("is the input that saves a plate unchanged: ids kept, no servings, no left-out list", () => {
    const items: PlateItem[] = [
      { kind: "food", id: id(11), food: food(1), rating: 4 },
      { kind: "recipe", id: id(12), recipe: { id: id(5), title: "Muffins" }, leftOut: [food(2)], inferred: false, rating: null },
      {
        kind: "storage",
        storageItemId: id(7),
        label: null,
        location: "freezer",
        servings: 2,
        parts: [
          { kind: "recipe", id: id(13), recipe: { id: id(5), title: "Muffins" }, rating: 5 },
          { kind: "food", id: id(14), food: food(3), rating: null },
        ],
      },
    ];
    const expected: PlateItemInput[] = [
      { kind: "food", id: id(11), foodId: id(1), rating: 4 },
      { kind: "recipe", id: id(12), recipeId: id(5), rating: null },
      { kind: "storage", storageItemId: id(7), ratings: { [id(5)]: 5, [id(3)]: null } },
    ];
    expect(plateInputFromItems(items)).toEqual(expected);
    expect(plateItemsInputSchema.parse(expected)).toEqual(expected);
  });
});

describe("the plate meal bodies", () => {
  it("takes items XOR the legacy keys, and items XOR itemRatings on PATCH", () => {
    const items = [{ kind: "food", foodId: id(1) }];
    expect(createPlateMealInputSchema.safeParse({ items }).success).toBe(true);
    expect(createPlateMealInputSchema.safeParse({ items, foodIds: [id(1)] }).success).toBe(false);
    expect(updatePlateMealInputSchema.safeParse({ items }).success).toBe(true);
    expect(updatePlateMealInputSchema.safeParse({ itemRatings: { [id(9)]: null }, notes: "x" }).success).toBe(true);
    expect(updatePlateMealInputSchema.safeParse({ items, itemRatings: {} }).success).toBe(false);
    expect(updatePlateMealInputSchema.safeParse({ notes: "x" }).success).toBe(false);
    expect(updatePlateMealInputSchema.safeParse({ items, recipeId: null }).success).toBe(false);
  });

  it("routes a body by its keys", () => {
    expect(isPlateMealBody({ items: [] })).toBe(true);
    expect(isPlateMealBody({ itemRatings: {} })).toBe(true);
    expect(isPlateMealBody({ foodIds: [] })).toBe(false);
    expect(isPlateMealBody(null)).toBe(false);
  });

  it("re-exports the moved star rating and storage location unchanged", () => {
    expect(starRatingSchema).toBe(plate.starRatingSchema);
    expect(storageLocationSchema).toBe(plate.storageLocationSchema);
    expect(storageLocationSchema.options).toEqual(["fridge", "freezer", "counter"]);
  });
});
