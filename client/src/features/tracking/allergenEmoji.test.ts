import { describe, expect, it } from "vitest";
import { ALLERGEN_EMOJI, allergenTint } from "./allergenEmoji.js";

describe("allergenTint (item 657)", () => {
  it("tints every top-9 allergen by its food group", () => {
    expect(
      Object.fromEntries(Object.keys(ALLERGEN_EMOJI).map((slug) => [slug, allergenTint(slug)])),
    ).toEqual({
      milk: "dairy",
      egg: "dairy",
      peanut: "legume",
      tree_nut: "legume",
      fish: "protein",
      shellfish: "protein",
      wheat: "grain",
      soy: "legume",
      sesame: "legume",
    });
  });

  it("falls back to neutral for an unknown slug", () => {
    expect(allergenTint("lupin")).toBe("neutral");
  });
});
