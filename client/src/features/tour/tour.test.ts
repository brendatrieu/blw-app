import { describe, expect, it } from "vitest";
import { clampSlide, resolveTourExit, shouldRedirectToTour, slideIndexFromScroll } from "./tour.js";
import { TOUR_SLIDES, TOUR_SLIDE_COUNT } from "./slides.js";

const COUNT = TOUR_SLIDE_COUNT;
const WIDTH = 390; // an iPhone-ish slide width

describe("clampSlide", () => {
  it("keeps an index inside the deck", () => {
    expect(clampSlide(0, COUNT)).toBe(0);
    expect(clampSlide(3, COUNT)).toBe(3);
    expect(clampSlide(COUNT - 1, COUNT)).toBe(COUNT - 1);
  });

  it("pulls an out-of-range index back to the nearest end", () => {
    // "Next" on the last slide, and "Previous" on the first.
    expect(clampSlide(COUNT, COUNT)).toBe(COUNT - 1);
    expect(clampSlide(999, COUNT)).toBe(COUNT - 1);
    expect(clampSlide(-1, COUNT)).toBe(0);
    expect(clampSlide(-999, COUNT)).toBe(0);
  });

  it("answers 0 for a deck that cannot have a slide, or a nonsense index", () => {
    expect(clampSlide(2, 0)).toBe(0);
    expect(clampSlide(2, -1)).toBe(0);
    expect(clampSlide(Number.NaN, COUNT)).toBe(0);
    expect(clampSlide(Number.POSITIVE_INFINITY, COUNT)).toBe(0);
  });
});

describe("slideIndexFromScroll", () => {
  it("reads a settled track's slide off its scroll position", () => {
    for (let i = 0; i < COUNT; i += 1) {
      expect(slideIndexFromScroll(i * WIDTH, WIDTH, COUNT)).toBe(i);
    }
  });

  it("rounds a half-finished swipe to the slide it will snap to", () => {
    // Fractional scrollLeft is the normal case mid-gesture and on a
    // fractional-DPR display; the answer is the nearer slide, not the floor.
    expect(slideIndexFromScroll(0.4 * WIDTH, WIDTH, COUNT)).toBe(0);
    expect(slideIndexFromScroll(0.6 * WIDTH, WIDTH, COUNT)).toBe(1);
    expect(slideIndexFromScroll(1.49 * WIDTH, WIDTH, COUNT)).toBe(1);
    expect(slideIndexFromScroll(1.51 * WIDTH, WIDTH, COUNT)).toBe(2);
    expect(slideIndexFromScroll(390.7, 390.4, COUNT)).toBe(1);
  });

  it("clamps elastic overscroll at either end instead of inventing a slide", () => {
    // iOS rubber-banding goes negative at the start and past the end at the
    // finish; neither is a slide.
    expect(slideIndexFromScroll(-80, WIDTH, COUNT)).toBe(0);
    expect(slideIndexFromScroll((COUNT - 1) * WIDTH + 120, WIDTH, COUNT)).toBe(COUNT - 1);
    expect(slideIndexFromScroll(50 * WIDTH, WIDTH, COUNT)).toBe(COUNT - 1);
  });

  it("lands exactly on the last slide at the track's maximum scroll", () => {
    expect(slideIndexFromScroll((COUNT - 1) * WIDTH, WIDTH, COUNT)).toBe(COUNT - 1);
  });

  it("answers the first slide when the track has no measurable width yet", () => {
    // First paint, a hidden track, a zero-height container.
    expect(slideIndexFromScroll(0, 0, COUNT)).toBe(0);
    expect(slideIndexFromScroll(1200, 0, COUNT)).toBe(0);
    expect(slideIndexFromScroll(1200, Number.NaN, COUNT)).toBe(0);
    expect(slideIndexFromScroll(Number.NaN, WIDTH, COUNT)).toBe(0);
  });
});

describe("resolveTourExit", () => {
  it("marks the tour seen and starts the app on a first run", () => {
    expect(resolveTourExit(false)).toEqual({ patch: true, to: "/", replace: true });
  });

  it("writes nothing and goes back to More on a replay", () => {
    // Re-stamping would move the date the parent first saw the tour, and
    // /more is where the replay was started from.
    expect(resolveTourExit(true)).toEqual({ patch: false, to: "/more", replace: true });
  });
});

describe("shouldRedirectToTour", () => {
  const base = {
    status: "success" as const,
    tourCompletedAt: null as string | null,
    pathname: "/",
    alreadyRedirected: false,
  };

  it("sends a parent who has never seen the tour, once", () => {
    expect(shouldRedirectToTour(base)).toBe(true);
  });

  it("never redirects before the answer is known", () => {
    expect(shouldRedirectToTour({ ...base, status: "pending" })).toBe(false);
    expect(shouldRedirectToTour({ ...base, status: "pending", tourCompletedAt: undefined })).toBe(false);
    // An API blip is not a reason to interrupt someone mid-app.
    expect(shouldRedirectToTour({ ...base, status: "error", tourCompletedAt: undefined })).toBe(false);
  });

  it("leaves a parent who has already seen it alone", () => {
    expect(shouldRedirectToTour({ ...base, tourCompletedAt: "2026-09-11T10:00:00.000Z" })).toBe(false);
  });

  it("does not redirect the tour to itself", () => {
    expect(shouldRedirectToTour({ ...base, pathname: "/tour" })).toBe(false);
  });

  it("fires at most once per session", () => {
    // The guard against a loop when the completing PATCH fails.
    expect(shouldRedirectToTour({ ...base, alreadyRedirected: true })).toBe(false);
  });

  it("redirects from a deep link too, not just the dashboard", () => {
    expect(shouldRedirectToTour({ ...base, pathname: "/storage/abc-123" })).toBe(true);
  });

  it("treats a resolved-but-missing payload as 'do nothing'", () => {
    expect(shouldRedirectToTour({ ...base, tourCompletedAt: undefined })).toBe(false);
  });
});

describe("tour deck", () => {
  it("is the six slides the copy was written for", () => {
    expect(TOUR_SLIDE_COUNT).toBe(6);
    expect(TOUR_SLIDES).toHaveLength(6);
    // The copy is fixed: every title, body and emoji pinned word for word.
    expect(TOUR_SLIDES).toEqual([
      {
        title: "Welcome",
        body: "A quick look at what you can do here. Swipe to continue, or skip anytime.",
        emoji: "👋",
      },
      {
        title: "Log every meal",
        body: "Tap Log meal after your baby eats. Over time you get a full picture of what they've tried, and if a reaction shows up you can trace it back to the foods and allergens served that day.",
        emoji: "🍽️",
      },
      {
        title: "Keep track of what you've prepped",
        body: "Add batches to Storage with where they live: fridge, freezer, or counter. Each item shows how long it stays fresh, so you serve it in time and toss it when it's past.",
        emoji: "📦",
      },
      {
        title: "Introduce allergens step by step",
        body: "The allergen ladder lists the common allergens. Mark each one established once it's been tolerated, and tap it to see which foods carry it and when you served them.",
        emoji: "🪜",
      },
      {
        title: "Help when you need it",
        body: "Learn has short guides on choking, allergies, and tummy changes. Symptom check helps you decide when to call someone. Find both under More.",
        emoji: "🛟",
      },
      {
        title: "You're ready",
        body: "Add your baby's profile, then log the first meal.",
        emoji: "✨",
      },
    ]);
  });
});
