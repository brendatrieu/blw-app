import { describe, expect, it } from "vitest";
import { TOUR_SLIDES, TOUR_SLIDE_COUNT } from "./slides.js";

/**
 * The copy is fixed (item 308). Every title, body and emoji is pinned here
 * word for word, so a rewrite has to be a deliberate edit to this file and
 * not a drive-by tweak in a component.
 */
describe("tour deck", () => {
  it("is the six slides the copy was written for, verbatim", () => {
    expect(TOUR_SLIDE_COUNT).toBe(6);
    expect(TOUR_SLIDES).toHaveLength(6);
    expect(TOUR_SLIDES).toEqual([
      {
        title: "Welcome to Little Meals",
        body: "Here to help you start solids with confidence, one little meal at a time.",
        emoji: "👋",
      },
      {
        title: "Log meals",
        body: "Tap Log meal after your baby eats. Over time you get a full picture of what they've tried, and if a reaction shows up you can trace it back to the foods and allergens served that day.",
        emoji: "🍽️",
      },
      {
        title: "Keep track of what you've prepped",
        body: "Add batches to Storage. Each item shows how long it stays fresh, so you serve it in time and toss it when it's expired.",
        emoji: "📦",
      },
      {
        title: "Introduce allergens step by step",
        body: "Mark each allergen as established once it's been tolerated, and the ladder will nudge you when it's time to serve it again.",
        emoji: "🪜",
      },
      {
        title: "Help when you need it",
        body: "Learn has short guides on choking, allergies, and tummy changes.\nSymptom check helps you decide if you should seek care. Find both under More.",
        emoji: "🛟",
      },
      {
        title: "You're ready",
        body: "Add your baby's profile, then log the first meal.",
        emoji: "✨",
      },
    ]);
  });

  it("breaks slide 5's body across two lines, and no other slide's", () => {
    // A real newline in the data, not a `<br>` in the component: the break is
    // part of the copy. TourDialog renders bodies `whitespace-pre-line`.
    const fifth = TOUR_SLIDES[4]!;
    expect(fifth.title).toBe("Help when you need it");
    expect(fifth.body.split("\n")).toEqual([
      "Learn has short guides on choking, allergies, and tummy changes.",
      "Symptom check helps you decide if you should seek care. Find both under More.",
    ]);

    for (const [index, slide] of TOUR_SLIDES.entries()) {
      if (index === 4) continue;
      expect(slide.body, `slide ${index + 1} should be one line`).not.toContain("\n");
    }
  });

  it("carries the app's name once, on the first slide, and adds no subtitle", () => {
    expect(TOUR_SLIDES[0]!.title).toBe("Welcome to Little Meals");
    // The old product name is gone from the user-facing copy entirely.
    for (const slide of TOUR_SLIDES) {
      expect(`${slide.title} ${slide.body}`).not.toContain("blw-app");
    }
    // Data, not markup: no slide carries anything but the three fields.
    for (const slide of TOUR_SLIDES) {
      expect(Object.keys(slide).sort()).toEqual(["body", "emoji", "title"]);
    }
  });
});
