import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { FoodCategory, Level } from "@blw/shared";
import { FoodTile } from "./FoodTile.js";

const CATEGORIES: FoodCategory[] = ["protein", "veg", "fruit", "grain", "dairy", "legume"];
const IRON_LEVELS: Level[] = ["high", "moderate", "low"];

function mockFood(i: number) {
  return {
    slug: `mock-food-${i}`,
    name: `Mock Food ${i}`,
    category: CATEGORIES[i % CATEGORIES.length]!,
    ironLevel: IRON_LEVELS[i % IRON_LEVELS.length]!,
    allergens: i % 3 === 0 ? ["peanut"] : [],
  };
}

describe("FoodTile", () => {
  it("renders a link and the name, with no iron or allergen dots", () => {
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(FoodTile, { food: mockFood(0) })),
    );
    expect(html).toContain("Mock Food 0");
    expect(html).toContain('href="/foods/mock-food-0"');
    // The grid used to carry unlabeled 8px iron/allergen dots that read as
    // arbitrary shades; that information lives on the food page only.
    expect(html).not.toContain("Iron:");
    expect(html).not.toContain("Contains allergen");
    expect(html).not.toMatch(/h-2 w-2 rounded-full/);
  });

  it("renders a 3-column grid of 40 tiles without throwing", () => {
    const foods = Array.from({ length: 40 }, (_, i) => mockFood(i));
    const html = renderToString(
      createElement(
        MemoryRouter,
        null,
        createElement(
          "div",
          { className: "grid grid-cols-3 gap-2.5 sm:grid-cols-4" },
          foods.map((food) => createElement(FoodTile, { key: food.slug, food })),
        ),
      ),
    );
    expect(html).toContain("grid-cols-3");
    expect((html.match(/mock-food-/g) ?? []).length).toBe(40);
  });
});
