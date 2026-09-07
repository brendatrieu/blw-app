import { describe, expect, it } from "vitest";
import { getCategoryEmoji, getFoodEmoji } from "./foodEmoji.js";

describe("getFoodEmoji", () => {
  it("prefers the food's OWN emoji over everything else (item 177)", () => {
    // Even for a slug that IS in the curated map, and with a category that
    // would also resolve — a parent's pick outranks both.
    expect(getFoodEmoji("banana", "fruit", "🍞")).toBe("🍞");
    expect(getFoodEmoji("unknown-slug", null, "🫓")).toBe("🫓");
  });

  it("treats a blank or whitespace-only emoji as 'not set' and falls through", () => {
    expect(getFoodEmoji("banana", "fruit", "")).toBe("🍌");
    expect(getFoodEmoji("banana", "fruit", "   ")).toBe("🍌");
    expect(getFoodEmoji("banana", "fruit", null)).toBe("🍌");
    expect(getFoodEmoji("banana", "fruit", undefined)).toBe("🍌");
  });

  it("trims a stored emoji rather than rendering the padding", () => {
    expect(getFoodEmoji("custom-x", "fruit", " 🥯 ")).toBe("🥯");
  });

  it("falls back to the slug map, then the category, then a plate", () => {
    expect(getFoodEmoji("salmon")).toBe("🐟");
    expect(getFoodEmoji("grandmas-banana-bread-k3f9q1", "grain")).toBe(getCategoryEmoji("grain"));
    expect(getFoodEmoji("grandmas-banana-bread-k3f9q1")).toBe("🍽️");
    expect(getFoodEmoji("grandmas-banana-bread-k3f9q1", null)).toBe("🍽️");
  });

  it("keeps the pre-existing one- and two-argument call shapes working", () => {
    // Pairings and recipe ingredients carry no emoji field at all; adding the
    // third parameter must not have broken them.
    expect(getFoodEmoji("avocado")).toBe("🥑");
    expect(getFoodEmoji("avocado", "fruit")).toBe("🥑");
  });
});

describe("getCategoryEmoji", () => {
  it("answers one emoji per category, and matches getFoodEmoji's own fallback", () => {
    const categories = ["protein", "veg", "fruit", "grain", "dairy", "legume"] as const;
    for (const category of categories) {
      const emoji = getCategoryEmoji(category);
      expect(emoji.length).toBeGreaterThan(0);
      expect(getFoodEmoji("not-a-seeded-slug", category)).toBe(emoji);
    }
    expect(new Set(categories.map(getCategoryEmoji)).size).toBe(categories.length);
  });
});
