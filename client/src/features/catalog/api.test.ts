import { describe, expect, it } from "vitest";
import { foodsQuerySchema, recipesQuerySchema, type FoodsQuery } from "@blw/shared";
import { buildFoodsQueryString, buildRecipesQueryString, type RecipeFilters } from "./api.js";

describe("buildFoodsQueryString", () => {
  it("forwards EVERY FoodsQuery key the shared schema knows (an allow-list that lags the schema drops filters silently)", () => {
    const full: Required<FoodsQuery> = {
      category: ["veg", "fruit"],
      allergen: ["egg"],
      ironLevel: ["high"],
      vitaminCLevel: ["high", "moderate"],
      fiberLevel: ["low"],
      q: "beef",
      maxAgeMonths: 9,
      deleted: true,
    };
    const params = new URLSearchParams(buildFoodsQueryString(full).slice(1));
    for (const key of Object.keys(foodsQuerySchema.shape)) {
      // Pick-several groups repeat the key once per value (item 595).
      expect(params.getAll(key).join(","), `query param "${key}" is missing`).toBe(
        String(full[key as keyof FoodsQuery]),
      );
    }
  });

  it("repeats a pick-several param once per value and omits an empty pick (item 595)", () => {
    expect(buildFoodsQueryString({ vitaminCLevel: ["high", "moderate"] })).toBe(
      "?vitaminCLevel=high&vitaminCLevel=moderate",
    );
    expect(buildFoodsQueryString({ category: ["veg", "fruit"], allergen: ["egg"] })).toBe(
      "?category=veg&category=fruit&allergen=egg",
    );
    // Never `category=`: an empty pick is no filter.
    expect(buildFoodsQueryString({ category: [], allergen: [], ironLevel: [], vitaminCLevel: [], fiberLevel: [] })).toBe(
      "",
    );
  });

  it("omits unset filters and returns an empty string for none", () => {
    expect(buildFoodsQueryString({})).toBe("");
    expect(buildFoodsQueryString({ vitaminCLevel: ["low"] })).toBe("?vitaminCLevel=low");
    // Off is absent, never `deleted=false` (ledger 544).
    expect(buildFoodsQueryString({ deleted: false })).toBe("");
  });
});

describe("buildRecipesQueryString", () => {
  it("forwards EVERY RecipesQuery key the shared schema knows (an allow-list that lags the schema drops filters silently)", () => {
    // scope: "custom" rather than "all" — "all" is the server default and is
    // deliberately omitted, so it can't stand in for "every key round-trips".
    const full: Required<RecipeFilters> = {
      q: "porridge",
      scope: "custom",
      maxAgeMonths: 9,
      allergen: ["egg", "milk"],
      ironFocus: true,
      vitaminCHigh: true,
      fiberHigh: true,
      ingredientFoodId: "11111111-1111-4111-8111-111111111111",
    };
    const params = new URLSearchParams(buildRecipesQueryString(full).slice(1));
    for (const key of Object.keys(recipesQuerySchema.shape)) {
      expect(params.getAll(key).join(","), `query param "${key}" is missing`).toBe(
        String(full[key as keyof RecipeFilters]),
      );
    }
  });

  it("omits unset filters and returns an empty string for none", () => {
    expect(buildRecipesQueryString({})).toBe("");
    expect(buildRecipesQueryString({ ironFocus: false, vitaminCHigh: false })).toBe("");
    expect(buildRecipesQueryString({ vitaminCHigh: true })).toBe("?vitaminCHigh=true");
    // Allergen is pick-several (item 593): repeated, and omitted when empty.
    expect(buildRecipesQueryString({ allergen: [] })).toBe("");
    expect(buildRecipesQueryString({ allergen: ["peanut", "egg"] })).toBe("?allergen=peanut&allergen=egg");
  });
});
