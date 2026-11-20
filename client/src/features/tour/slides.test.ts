import { describe, expect, it } from "vitest";
import { TOUR_SLIDES, TOUR_SLIDE_COUNT } from "./slides.js";

/**
 * The copy is fixed (item 308). Every title, body and emoji is pinned here
 * word for word, so a rewrite has to be a deliberate edit to this file and
 * not a drive-by tweak in a component.
 */
describe("tour deck", () => {
  it("is the five slides the copy was written for, verbatim", () => {
    expect(TOUR_SLIDE_COUNT).toBe(5);
    expect(TOUR_SLIDES).toHaveLength(5);
    expect(TOUR_SLIDES).toEqual([
      {
        title: "Welcome to Little Meals",
        body: "Here to help you start solids with confidence, one little meal at a time.",
        emoji: "👋",
      },
      {
        title: "Log meals",
        body: "Tap Log meal after each meal. If a reaction shows up, you can trace it back.",
        emoji: "🍽️",
      },
      {
        title: "Plan the week ahead",
        body: "Use the calendar at the top, then tap Serve on Home.",
        emoji: "🗓️",
      },
      {
        title: "Help when you need it",
        body: "Safety guides and Symptom Check are under More. Always stay with baby and keep them upright while they eat.",
        emoji: "🛟",
      },
      {
        title: "You're ready",
        body: "Add your baby's profile, then log the first meal.",
        emoji: "✨",
      },
    ]);
  });

  it("keeps every body as one flowing paragraph — no line breaks in the copy", () => {
    for (const [index, slide] of TOUR_SLIDES.entries()) {
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
