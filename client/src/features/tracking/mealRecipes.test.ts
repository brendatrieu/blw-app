import { describe, expect, it } from "vitest";
import { recipesTitle } from "./mealRecipes.js";

const r = (...titles: string[]) => titles.map((title) => ({ title }));

describe("recipesTitle (ledger 761)", () => {
  it("is null with no recipe, the title with one", () => {
    expect(recipesTitle([])).toBeNull();
    expect(recipesTitle(r("Lentil Patties"))).toBe("Lentil Patties");
  });

  it("'{A} + {B}' for two, '{A} + {n} more' from three", () => {
    expect(recipesTitle(r("A", "B"))).toBe("A + B");
    expect(recipesTitle(r("A", "B", "C"))).toBe("A + 2 more");
    expect(recipesTitle(r("A", "B", "C", "D", "E"))).toBe("A + 4 more");
  });
});
