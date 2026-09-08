import { describe, expect, it } from "vitest";
import { createCustomFoodSchema, isSingleEmoji, updateCustomFoodSchema, ageStageForMonths } from "./catalog.js";

describe("isSingleEmoji", () => {
  it("accepts one emoji, including multi-codepoint ones", () => {
    for (const value of ["🥑", "🍞", "👩🏽‍🍳", "🇳🇿", "❤️"]) {
      expect(isSingleEmoji(value), value).toBe(true);
    }
  });

  it("rejects letters, digits, empty strings and two emoji", () => {
    for (const value of ["", " ", "a", "ab", "7", "🥑🍞", "🥑 "]) {
      expect(isSingleEmoji(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("createCustomFoodSchema", () => {
  it("trims the name and collapses an empty emoji/notes to null", () => {
    const parsed = createCustomFoodSchema.parse({
      name: "  Banana bread  ",
      category: "grain",
      emoji: "",
      notes: "   ",
    });

    expect(parsed).toEqual({
      name: "Banana bread",
      category: "grain",
      emoji: null,
      notes: null,
      // An untouched checklist is a real answer, not a missing one.
      allergenSlugs: [],
    });
  });

  it("rejects a blank name, an over-long name and a non-emoji emoji", () => {
    expect(createCustomFoodSchema.safeParse({ name: "   ", category: "grain" }).success).toBe(false);
    expect(createCustomFoodSchema.safeParse({ name: "x".repeat(61), category: "grain" }).success).toBe(false);
    expect(createCustomFoodSchema.safeParse({ name: "Fine", category: "grain", emoji: "no" }).success).toBe(false);
    expect(createCustomFoodSchema.safeParse({ name: "Fine", category: "snack" }).success).toBe(false);
  });
});

describe("updateCustomFoodSchema", () => {
  it("leaves absent keys absent so a PATCH touches nothing else", () => {
    const parsed = updateCustomFoodSchema.parse({ name: "Banana loaf" });
    expect(parsed).toEqual({ name: "Banana loaf" });
    expect("emoji" in parsed).toBe(false);
    expect("allergenSlugs" in parsed).toBe(false);
  });

  it("distinguishes clearing a field from leaving it alone", () => {
    expect(updateCustomFoodSchema.parse({ emoji: null })).toEqual({ emoji: null });
    expect(updateCustomFoodSchema.parse({ notes: "" })).toEqual({ notes: null });
  });

  it("rejects an empty patch", () => {
    expect(updateCustomFoodSchema.safeParse({}).success).toBe(false);
  });
});

describe("ageStageForMonths", () => {
  it("files a custom recipe's single variant at the 6 / 9 / 12 stage", () => {
    expect(ageStageForMonths(6)).toBe("6");
    expect(ageStageForMonths(8)).toBe("6");
    expect(ageStageForMonths(9)).toBe("9");
    expect(ageStageForMonths(10)).toBe("9");
    expect(ageStageForMonths(11)).toBe("9");
    expect(ageStageForMonths(12)).toBe("12");
    expect(ageStageForMonths(36)).toBe("12");
  });
});
