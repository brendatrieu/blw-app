import { describe, expect, it } from "vitest";
import {
  RECIPE_RATING_KEY,
  RECIPE_ROW_PREFIX,
  mealFormRatingRows,
  mealFormRatingsInput,
  mealRatingRows,
} from "./MealRatingsField.js";

const FOODS = [
  { id: "f1", name: "Egg" },
  { id: "f2", name: "Banana" },
];

describe("mealRatingRows (item 574)", () => {
  it("gives a loose-food meal one row per food", () => {
    expect(mealRatingRows(null, FOODS, { f1: 4 })).toEqual([
      { key: "f1", label: "Egg", value: 4 },
      { key: "f2", label: "Banana", value: null },
    ]);
  });

  it("gives a recipe meal one row, for the recipe", () => {
    expect(mealRatingRows({ title: "Pancakes", rating: 2 }, FOODS, { f1: 4 })).toEqual([
      { key: RECIPE_RATING_KEY, label: "Pancakes", value: 2 },
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
