import { describe, expect, it } from "vitest";
import { foodsQuerySchema, type FoodsQuery } from "@blw/shared";
import { buildFoodsQueryString } from "./api.js";

describe("buildFoodsQueryString", () => {
  it("forwards EVERY FoodsQuery key the shared schema knows (an allow-list that lags the schema drops filters silently)", () => {
    const full: Required<FoodsQuery> = {
      category: "veg",
      allergen: "egg",
      ironLevel: "high",
      vitaminCLevel: "moderate",
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
