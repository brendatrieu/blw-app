import { describe, expect, it } from "vitest";
import { DISCLAIMER, LANDING_SLIDES } from "./slides.js";

/** Ledger 992: the owner-approved copy, word for word, and one shot pair per slide. */
describe("landing slides", () => {
  it("are the intro and the five approved slides, in order, verbatim (ledger 1008)", () => {
    expect(LANDING_SLIDES.map(({ title, body, shot }) => ({ title, body, shot }))).toEqual([
      // The tagline, then the first-run tour's welcome line: no new wording.
      { title: "Starting solids, made simpler.", body: "Here to help you start solids with confidence, one little meal at a time.", shot: null },
      {
        title: "Log what they ate.",
        body: "Rate each food and note any reaction.",
        shot: "log",
      },
      { title: "Plan ahead, if you like.", body: "Then serve today's meals in one tap.", shot: "plan" },
      {
        title: "Keep track of what you've prepped.",
        body: "See servings left and when to use each batch.",
        shot: "storage",
      },
      {
        title: "Introduce allergens step by step.",
        body: "The top 9, with a nudge when one is due.",
        shot: "allergens",
      },
      { title: "Find food and recipe ideas.", body: "Recipes and first foods, with prep for your baby's age.", shot: "recipes" },
    ]);
  });

  it("gives every screenshot its alt text, verbatim (ledger 1027)", () => {
    expect(LANDING_SLIDES.map((slide) => (slide.shot ? slide.alt : null))).toEqual([
      null,
      "Log meal with Avocado and Banana on the plate, each rated with stars.",
      "Meal Plan for today: Breakfast, Lunch, Snack and Dinner planned, each with its foods and a Serve button.",
      "Home with the Storage section highlighted: Pear and Spinach in the Fridge and Sweet Potato Lentil Patties in the Freezer, each with the days left.",
      "Allergen ladder with the progress ring at the top, 2 of 9 established, then Peanut, established and due for a serve.",
      "Recipes list with search and All, Favorites and Custom chips: Apple Cinnamon Tahini Oatmeal, Baked Butter Beans in Tomato Sauce and more, each marked 6m+ with its foods.",
    ]);
  });

  it("keeps the disclaimer's wording", () => {
    expect(DISCLAIMER).toBe("Little Meals is educational, not medical advice. Consult your pediatrician.");
  });
});
