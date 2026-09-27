import { describe, expect, it } from "vitest";
import { RECIPE_RATING_KEY, mealRatingRows, mealRatingsInput } from "./MealRatingsField.js";

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

describe("mealRatingsInput", () => {
  it("sends every current food on a loose-food meal (null = cleared), and no recipe rating", () => {
    expect(mealRatingsInput(null, ["f1", "f2"], { f1: 5, gone: 3 }, 4)).toEqual({ foodRatings: { f1: 5, f2: null } });
  });

  it("sends only the recipe's rating on a recipe meal", () => {
    expect(mealRatingsInput("r1", ["f1"], { f1: 5 }, 3)).toEqual({ recipeRating: 3 });
    expect(mealRatingsInput("r1", ["f1"], {}, null)).toEqual({ recipeRating: null });
  });
});
