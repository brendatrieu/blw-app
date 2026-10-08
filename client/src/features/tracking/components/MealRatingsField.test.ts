import { describe, expect, it } from "vitest";
import {
  RECIPE_ROW_PREFIX,
  mealFormRatingRows,
  mealFormRatingsInput,
  mealRatingRows,
} from "./MealRatingsField.js";

const FOODS = [
  { id: "f1", name: "Egg" },
  { id: "f2", name: "Banana" },
];

describe("mealRatingRows (items 574, 761)", () => {
  it("gives a loose-food meal one row per food", () => {
    expect(mealRatingRows([], [{ ...FOODS[0]!, rating: 4 }, FOODS[1]!])).toEqual([
      { key: "f1", label: "Egg", value: 4 },
      { key: "f2", label: "Banana", value: null },
    ]);
  });

  it("an older cached recipe meal (no inRecipe) shows its recipe row only", () => {
    expect(mealRatingRows([{ id: "r1", title: "Pancakes", rating: 2 }], FOODS)).toEqual([
      { key: `${RECIPE_ROW_PREFIX}r1`, label: "Pancakes", value: 2 },
    ]);
  });

  it("one row per recipe in order, then foods shown by !inRecipe || rating != null", () => {
    const rows = mealRatingRows(
      [
        { id: "r1", title: "Lentil Patties", rating: null },
        { id: "r2", title: "Salmon Cakes", rating: 5 },
      ],
      [
        { id: "f1", name: "Egg", rating: null, inRecipe: true },
        { id: "f2", name: "Oats", rating: 3, inRecipe: true },
        { id: "f3", name: "Banana", rating: null, inRecipe: false },
      ],
    );
    expect(rows.map((row) => row.key)).toEqual([`${RECIPE_ROW_PREFIX}r1`, `${RECIPE_ROW_PREFIX}r2`, "f2", "f3"]);
  });

  it("shows a pending value by row key, but keeps a row by its saved rating", () => {
    const rows = mealRatingRows(
      [{ id: "r1", title: "Lentil Patties", rating: 1 }],
      [
        { id: "f1", name: "Egg", rating: 4, inRecipe: true },
        { id: "f2", name: "Oats", rating: null, inRecipe: true },
      ],
      { [`${RECIPE_ROW_PREFIX}r1`]: 5, f1: null, f2: 3 },
    );
    expect(rows).toEqual([
      { key: `${RECIPE_ROW_PREFIX}r1`, label: "Lentil Patties", value: 5 },
      { key: "f1", label: "Egg", value: null },
    ]);
  });
});

// Ledger 759: the Log meal / Edit meal rows, DESIGN-B §2.
describe("mealFormRatingRows (ledger 759)", () => {
  const LENTIL = { id: "rA", title: "Lentil Patties" };
  const SALMON = { id: "rB", title: "Salmon Cakes" };
  const foods = [
    { id: "lentils", name: "Red lentils" },
    { id: "egg", name: "Egg" },
    { id: "salmon", name: "Salmon" },
    { id: "banana", name: "Banana" },
  ];
  const ingredients = new Map([
    ["rA", ["lentils", "egg"]],
    ["rB", ["salmon", "egg"]],
  ]);
  const labels = (rows: { label: string }[]) => rows.map((row) => row.label);

  it("MR-Log-Meal: one row per recipe in pick order, then the foods no recipe lists", () => {
    const rows = mealFormRatingRows([LENTIL, SALMON], foods, ingredients, [], {}, { [`${RECIPE_ROW_PREFIX}rB`]: 4, banana: 5 });
    expect(rows).toEqual([
      { key: "recipe:rA", label: "Lentil Patties", value: null },
      { key: "recipe:rB", label: "Salmon Cakes", value: 4 },
      { key: "banana", label: "Banana", value: 5 },
    ]);
  });

  it("no recipe: one row per food, in chip order", () => {
    expect(labels(mealFormRatingRows([], foods, new Map(), [], {}, {}))).toEqual(["Red lentils", "Egg", "Salmon", "Banana"]);
  });

  it("shows no food row while a picked recipe's ingredients are still loading", () => {
    const loading = new Map([["rA", ["lentils", "egg"]]]);
    expect(labels(mealFormRatingRows([LENTIL, SALMON], foods, loading, [], {}, {}))).toEqual(["Lentil Patties", "Salmon Cakes"]);
  });

  it("edit: a stored rating on an ingredient of a SAVED recipe stays visible and editable", () => {
    const rows = mealFormRatingRows([LENTIL], foods, ingredients, ["rA"], { egg: 3 }, { egg: 3 });
    expect(labels(rows)).toEqual(["Lentil Patties", "Egg", "Salmon", "Banana"]);
  });

  it("edit: adding a recipe that lists a rated food takes that food's row away (the server clears it)", () => {
    const rows = mealFormRatingRows([LENTIL, SALMON], foods, ingredients, ["rA"], { egg: 3, banana: 2 }, {});
    expect(labels(rows)).toEqual(["Lentil Patties", "Salmon Cakes", "Banana"]);
  });

  it("create: a stored value can't exist, so every ingredient is rated through its recipe", () => {
    expect(labels(mealFormRatingRows([SALMON], foods, ingredients, [], {}, { egg: 4 }))).toEqual([
      "Salmon Cakes",
      "Red lentils",
      "Banana",
    ]);
  });
});

describe("mealFormRatingsInput (ledger 759)", () => {
  it("sends every visible row, null included, split into recipes and foods", () => {
    expect(
      mealFormRatingsInput([
        { key: "recipe:rA", label: "A", value: 3 },
        { key: "recipe:rB", label: "B", value: null },
        { key: "banana", label: "Banana", value: null },
        { key: "egg", label: "Egg", value: 5 },
      ]),
    ).toEqual({ recipeRatings: { rA: 3, rB: null }, foodRatings: { banana: null, egg: 5 } });
  });
});
