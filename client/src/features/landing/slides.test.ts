import { describe, expect, it } from "vitest";
import { DISCLAIMER, LANDING_SLIDES } from "./slides.js";

/** Ledger 992: the owner-approved copy, word for word, and one shot pair per slide. */
describe("landing slides", () => {
  it("are the five approved slides, in order, verbatim", () => {
    expect(LANDING_SLIDES.map(({ title, body, shot }) => ({ title, body, shot }))).toEqual([
      {
        title: "Log what they ate.",
        body: "Put each food on the plate, rate it with stars if you like, and note any reaction.",
        shot: "log",
      },
      { title: "Plan ahead, if you like.", body: "Fill in the days ahead, then serve today's meals with one tap.", shot: "plan" },
      {
        title: "Keep track of what you've prepped.",
        body: "Each batch shows the servings left and when to use it by.",
        shot: "storage",
      },
      {
        title: "Introduce allergens step by step.",
        body: "Work through the top 9, with a nudge when one is due for a serve.",
        shot: "allergens",
      },
      { title: "Find iron-rich foods.", body: "Filter for High iron, and see how to prep each one by age.", shot: "foods" },
    ]);
  });

  it("gives every screenshot alt text", () => {
    for (const slide of LANDING_SLIDES) expect(slide.alt.trim().length, slide.shot).toBeGreaterThan(20);
  });

  it("keeps the disclaimer's wording", () => {
    expect(DISCLAIMER).toBe("Little Meals is educational, not medical advice. Consult your pediatrician.");
  });
});
