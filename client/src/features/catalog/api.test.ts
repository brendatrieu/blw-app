import { describe, expect, it } from "vitest";
import { foodsQuerySchema, recipesQuerySchema, type FoodsQuery } from "@blw/shared";
import { buildFoodsQueryString, buildRecipesQueryString, type RecipeFilters } from "./api.js";

describe("buildFoodsQueryString", () => {
  it("forwards EVERY FoodsQuery key the shared schema knows (an allow-list that lags the schema drops filters silently)", () => {
    const full: Required<FoodsQuery> = {
      category: "veg",
      allergen: "egg",
      ironLevel: "high",
      vitaminCLevel: "moderate",
      fiberLevel: "low",
      q: "beef",
      maxAgeMonths: 9,
    };
    const params = new URLSearchParams(buildFoodsQueryString(full).slice(1));
    for (const key of Object.keys(foodsQuerySchema.shape)) {
      expect(params.get(key), `query param "${key}" is missing`).toBe(String(full[key as keyof FoodsQuery]));
    }
  });

  it("omits unset filters and returns an empty string for none", () => {
    expect(buildFoodsQueryString({})).toBe("");
    expect(buildFoodsQueryString({ vitaminCLevel: "low" })).toBe("?vitaminCLevel=low");
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
      allergen: "egg",
      ironFocus: true,
      vitaminCHigh: true,
      fiberHigh: true,
      ingredientFoodId: "11111111-1111-4111-8111-111111111111",
    };
    const params = new URLSearchParams(buildRecipesQueryString(full).slice(1));
    for (const key of Object.keys(recipesQuerySchema.shape)) {
      expect(params.get(key), `query param "${key}" is missing`).toBe(String(full[key as keyof RecipeFilters]));
    }
  });

  it("omits unset filters and returns an empty string for none", () => {
    expect(buildRecipesQueryString({})).toBe("");
    expect(buildRecipesQueryString({ ironFocus: false, vitaminCHigh: false })).toBe("");
    expect(buildRecipesQueryString({ vitaminCHigh: true })).toBe("?vitaminCHigh=true");
  });
});
