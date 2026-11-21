import { describe, expect, it } from "vitest";
import type { RecipeDetail } from "@blw/shared";
import { SWIPE_MIN_PX, swipeStep } from "../../lib/scrollTrack.js";
import { arrowStep, cookHref, cookProgress, cookScreen, moveScreen, readScreen, shownVariant } from "./cook.js";

const variant = (ageStage: "6" | "9" | "12", steps: string[]) => ({ ageStage, textureNote: "", steps });

describe("shownVariant: cook mode plays exactly what the recipe page shows (ledger 1094)", () => {
  const catalog = { variants: [variant("6", ["a"]), variant("9", ["b", "c"]), variant("12", [])] };

  it("is the asked-for stage when the recipe has it", () => {
    expect(shownVariant(catalog, "9")).toEqual({ stage: "9", variant: catalog.variants[1] });
    // A stage whose prep has no steps is shown as such: nothing to cook.
    expect(shownVariant(catalog, "12").variant?.steps).toEqual([]);
  });

  it("clamps a stage the recipe lacks, as the page's age bar does (item 253)", () => {
    const nineUp = { variants: [variant("9", ["b"]), variant("12", ["d"])] };
    expect(shownVariant(nineUp, "6")).toEqual({ stage: "9", variant: nineUp.variants[0] });
  });

  it("is a custom recipe's one variant, whatever the stage", () => {
    const custom = { variants: [variant("6", ["x"])] };
    expect(shownVariant(custom, "12").variant).toBe(custom.variants[0]);
    expect(shownVariant({ variants: [] }, "6")).toEqual({ stage: null, variant: undefined });
  });
});

describe("cookHref", () => {
  const recipe = (isCustom: boolean) => ({ id: "r1", isCustom }) as Pick<RecipeDetail, "id" | "isCustom">;
  it("carries a catalog recipe's stage, and no stage for a custom one", () => {
    expect(cookHref(recipe(false), "9")).toBe("/recipes/r1/cook?stage=9");
    expect(cookHref(recipe(true), "6")).toBe("/recipes/r1/cook");
    expect(cookHref(recipe(false), null)).toBe("/recipes/r1/cook");
  });
});

describe("screens: You'll need, steps 1..M, All done (ledger 1095)", () => {
  it("names each index, clamped into range", () => {
    expect(cookScreen(0, 3)).toEqual({ kind: "need" });
    expect(cookScreen(1, 3)).toEqual({ kind: "step", n: 1, of: 3 });
    expect(cookScreen(3, 3)).toEqual({ kind: "step", n: 3, of: 3 });
    expect(cookScreen(4, 3)).toEqual({ kind: "done" });
    expect(cookScreen(99, 3)).toEqual({ kind: "done" });
    expect(cookScreen(-2, 3)).toEqual({ kind: "need" });
  });

  it("reads ?step= safely: missing or junk is the first screen, too far the last", () => {
    expect(readScreen(null, 3)).toBe(0);
    expect(readScreen("2", 3)).toBe(2);
    expect(readScreen("abc", 3)).toBe(0);
    expect(readScreen("-1", 3)).toBe(0);
    expect(readScreen("2.7", 3)).toBe(2);
    expect(readScreen("40", 3)).toBe(4);
  });

  it("moves one screen at a time and never past either end", () => {
    expect(moveScreen(0, 1, 3)).toBe(1);
    expect(moveScreen(3, 1, 3)).toBe(4);
    expect(moveScreen(4, 1, 3)).toBe(4);
    expect(moveScreen(0, -1, 3)).toBe(0);
    expect(moveScreen(1, -1, 3)).toBe(0);
  });

  it("fills the progress bar step by step, empty on You'll need, full on All done", () => {
    expect(cookProgress({ kind: "need" })).toBe(0);
    expect(cookProgress({ kind: "step", n: 2, of: 4 })).toBe(0.5);
    expect(cookProgress({ kind: "done" })).toBe(1);
  });
});

describe("input: keyboard and swipe", () => {
  it("→ is next and ← is back; other keys and modified arrows do nothing", () => {
    expect(arrowStep({ key: "ArrowRight" })).toBe(1);
    expect(arrowStep({ key: "ArrowLeft" })).toBe(-1);
    expect(arrowStep({ key: "Enter" })).toBe(0);
    expect(arrowStep({ key: "ArrowRight", metaKey: true })).toBe(0);
    expect(arrowStep({ key: "ArrowLeft", altKey: true })).toBe(0);
    expect(arrowStep({ key: "ArrowLeft", ctrlKey: true })).toBe(0);
  });

  it("uses the landing's swipe: 40px sideways, more sideways than up/down, left = next", () => {
    expect(SWIPE_MIN_PX).toBe(40);
    expect(swipeStep(-40, 0)).toBe(1);
    expect(swipeStep(40, 0)).toBe(-1);
    expect(swipeStep(-39, 0)).toBe(0);
    expect(swipeStep(-60, 80)).toBe(0);
  });
});
