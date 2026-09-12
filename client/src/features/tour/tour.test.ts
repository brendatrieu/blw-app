import { describe, expect, it } from "vitest";
import { clampSlide, resolveTourExit, shouldOpenTour, slideIndexFromScroll } from "./tour.js";
import { TOUR_SLIDE_COUNT } from "./slides.js";

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
  it("marks the tour seen on a first run", () => {
    expect(resolveTourExit(false)).toEqual({ patch: true });
  });

  it("writes nothing on a replay", () => {
    // Re-stamping would move the date the parent first saw the tour.
    expect(resolveTourExit(true)).toEqual({ patch: false });
  });

  it("never navigates — the tour is a modal, so closing it goes nowhere", () => {
    for (const replay of [true, false]) {
      expect(Object.keys(resolveTourExit(replay))).toEqual(["patch"]);
    }
  });
});

describe("shouldOpenTour", () => {
  const base = {
    status: "success" as const,
    fetchStatus: "idle" as const,
    tourCompletedAt: null as string | null | undefined,
    alreadyOpened: false,
  };

  it("opens for a parent who has never seen the tour, once the server has said so", () => {
    expect(shouldOpenTour(base)).toBe(true);
  });

  it("never opens before the answer is known", () => {
    expect(shouldOpenTour({ ...base, status: "pending", fetchStatus: "fetching" })).toBe(false);
    expect(shouldOpenTour({ ...base, status: "pending", tourCompletedAt: undefined })).toBe(false);
    // An API blip is not a reason to interrupt someone mid-app.
    expect(shouldOpenTour({ ...base, status: "error", tourCompletedAt: undefined })).toBe(false);
  });

  it("ignores a cached answer that is still being refetched", () => {
    // The v1 bug: a persisted `{ tourCompletedAt: null }` made the query read
    // "success" off the cache on a cold start, and the tour re-ran for
    // someone who had already finished it. A restored-but-refetching query
    // is "success" + "fetching", and decides nothing.
    expect(shouldOpenTour({ ...base, fetchStatus: "fetching" })).toBe(false);
    // Offline, the same query parks in "paused" — also not an answer.
    expect(shouldOpenTour({ ...base, fetchStatus: "paused" })).toBe(false);
  });

  it("leaves a parent who has already seen it alone", () => {
    expect(shouldOpenTour({ ...base, tourCompletedAt: "2026-09-11T10:00:00.000Z" })).toBe(false);
  });

  it("opens at most once per session", () => {
    // The guard against re-opening when the completing PATCH fails.
    expect(shouldOpenTour({ ...base, alreadyOpened: true })).toBe(false);
  });

  it("treats a resolved-but-missing payload as 'do nothing'", () => {
    expect(shouldOpenTour({ ...base, tourCompletedAt: undefined })).toBe(false);
  });
});
