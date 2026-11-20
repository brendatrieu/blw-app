import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISCLAIMER, LANDING_SLIDES } from "./slides.js";

/** Ledger 992/1040: the owner-approved copy, word for word, and the app's own cards per slide. */
describe("landing slides", () => {
  it("are the intro and the five approved slides, in order, verbatim (ledger 1040)", () => {
    expect(LANDING_SLIDES.map(({ title, body }) => ({ title, body }))).toEqual([
      // The tagline, then the first-run tour's welcome line: no new wording.
      { title: "Starting solids, made simpler.", body: "Here to help you start solids with confidence, one little meal at a time." },
      { title: "Log what they ate.", body: "Rate each food and note any reaction." },
      { title: "Plan the week ahead.", body: "Then serve today's meals in one tap." },
      { title: "Keep track of what you've prepped.", body: "See servings left and when to use each batch." },
      { title: "Introduce allergens step by step.", body: "Know what's started, established, and due next." },
      { title: "Find food and recipe ideas.", body: "Recipes and first foods, with prep for your baby's age." },
    ]);
  });

  it("floats the chosen app cards on each slide, none on the intro (ledger 1040)", () => {
    expect(LANDING_SLIDES.map((slide) => slide.chips.map((chip) => chip.name))).toEqual([
      [],
      ["log-avocado", "log-banana"],
      ["plan-week", "plan-breakfast"],
      ["storage-list"],
      ["allergens-ring", "allergens-peanut"],
      ["recipe-egg-muffins", "recipe-beet-hummus", "recipe-omelet-fingers"],
    ]);
  });

  it("gives every card its alt text, verbatim", () => {
    expect(LANDING_SLIDES.flatMap((slide) => slide.chips.map((chip) => chip.alt))).toEqual([
      "Avocado on the plate, rated 5 stars.",
      "Banana on the plate, rated 4 stars.",
      "The meal plan's week, Sunday 15 to Saturday 21, with today, Friday 20, picked and dots under the planned days.",
      "Breakfast at 8:00 AM, planned with Iron-Fortified Oats and Banana, and a Serve button.",
      "Storage: Pear and Spinach in the fridge and Sweet Potato Lentil Patties in the freezer, each with its servings and days left.",
      "Allergen progress ring: 2 of 9 established, 1 due for a serve, 2 started and 5 not started yet.",
      "Peanut, established, with how to serve it safely and a Serve again soon nudge.",
      "Recipe card: Broccoli Cheese Egg Muffins, with broccoli, cheese and egg, from 6 months.",
      "Recipe card: Pink Beet Hummus, with beets, chickpeas, lemon and tahini, from 6 months.",
      "Recipe card: Veggie Omelet Fingers, with bell pepper, egg and spinach, from 6 months.",
    ]);
  });

  it("ships every card it names, at the size it states (WebP header)", () => {
    for (const chip of LANDING_SLIDES.flatMap((slide) => slide.chips)) {
      const url = new URL(`../../../public/landing/chips/${chip.name}.webp`, import.meta.url);
      expect(existsSync(url), chip.name).toBe(true);
      const file = readFileSync(url);
      expect(file.subarray(0, 4).toString("latin1") + file.subarray(8, 12).toString("latin1"), chip.name).toBe("RIFFWEBP");
      // Simple lossy (VP8: 14-bit sizes at 26-29) or extended (VP8X: 24-bit sizes minus one at 24-29).
      const size =
        file.subarray(12, 16).toString("latin1") === "VP8X"
          ? [file.readUIntLE(24, 3) + 1, file.readUIntLE(27, 3) + 1]
          : [file.readUInt16LE(26) & 0x3fff, file.readUInt16LE(28) & 0x3fff];
      expect(size, chip.name).toEqual([chip.width, chip.height]);
    }
  });

  it("moves the glows per slide: no two slides share a place", () => {
    const places = LANDING_SLIDES.map(({ glow }) => `${glow.sea} ${glow.apricot}`);
    expect(new Set(places).size).toBe(LANDING_SLIDES.length);
    for (const { glow } of LANDING_SLIDES) for (const at of [glow.sea, glow.apricot]) expect(at).toMatch(/^\d{1,3}% \d{1,3}%$/);
  });

  it("keeps the disclaimer's wording", () => {
    expect(DISCLAIMER).toBe("Little Meals is educational, not medical advice. Consult your pediatrician.");
  });
});
