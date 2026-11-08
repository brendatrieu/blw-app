import { describe, expect, it } from "vitest";
import { recipeTitleParts } from "./mealRecipes.js";

const r = (...titles: string[]) => titles.map((title) => ({ title }));
const joined = (recipes: { title: string }[]) => recipeTitleParts(recipes).map((part) => part.name).join(" + ");

describe("recipeTitleParts (ledger 761)", () => {
  it("is empty with no recipe, the title with one", () => {
    expect(recipeTitleParts([])).toEqual([]);
    expect(joined(r("Lentil Patties"))).toBe("Lentil Patties");
  });

  it("'{A} + {B}' for two, '{A} + {n} more' from three", () => {
    expect(joined(r("A", "B"))).toBe("A + B");
    expect(joined(r("A", "B", "C"))).toBe("A + 2 more");
    expect(joined(r("A", "B", "C", "D", "E"))).toBe("A + 4 more");
  });

  it("keeps a shown recipe's deleted mark, never on the count (ledger 957)", () => {
    expect(recipeTitleParts([{ title: "A", deleted: true }, { title: "B" }])).toEqual([
      { name: "A", deleted: true },
      { name: "B", deleted: undefined },
    ]);
    expect(recipeTitleParts([{ title: "A" }, { title: "B", deleted: true }, { title: "C", deleted: true }])).toEqual([
      { name: "A", deleted: undefined },
      { name: "2 more" },
    ]);
  });
});
