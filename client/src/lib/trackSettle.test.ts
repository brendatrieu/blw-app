// Ledger 1142c: Up next's card follows the page on show, but only once the track has settled.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fitToRestingSlide, holdHeight, restingSlide, SETTLE_MS, watchSettle } from "./trackSettle.js";

describe("restingSlide", () => {
  it("names the slide a track rests on, within half a pixel of its edge", () => {
    expect(restingSlide(0, 300, 3)).toBe(0);
    expect(restingSlide(600, 300, 3)).toBe(2);
    expect(restingSlide(299.6, 300, 3)).toBe(1);
    expect(restingSlide(358, 358.4, 2)).toBe(1); // WebKit's whole-pixel scrollLeft
  });
  it("is null between slides (mid-swipe, mid-snap), with no width, or no slides", () => {
    expect(restingSlide(150, 300, 3)).toBeNull();
    expect(restingSlide(302, 300, 3)).toBeNull();
    expect(restingSlide(1, 300, 3)).toBeNull(); // a finger lifted 1px short: the snap is still to come
    expect(restingSlide(0, 0, 3)).toBeNull();
    expect(restingSlide(0, 300, 0)).toBeNull();
    expect(restingSlide(Number.NaN, 300, 3)).toBeNull();
  });
  it("clamps an overscroll past either end to the end it bounces back to, only once it is back", () => {
    expect(restingSlide(-40, 300, 3)).toBeNull();
    expect(restingSlide(-0.5, 300, 3)).toBe(0);
    expect(restingSlide(640, 300, 3)).toBeNull();
  });
});

const box = (rendered = 0) => {
  const b = {
    style: { height: "", transition: "" },
    rendered,
    reflows: 0,
    getBoundingClientRect: () => ({ height: b.rendered }),
    get offsetHeight() {
      b.reflows++;
      return Math.round(b.rendered);
    },
  };
  return b;
};
const track = (scrollLeft: number, heights: number[]) => ({
  scrollLeft,
  clientWidth: 300,
  children: heights.map((height) => ({ getBoundingClientRect: () => ({ height }) })),
});

describe("fitToRestingSlide", () => {
  it("takes the resting slide's own height, fractions kept (138.1 stays 138.1)", () => {
    const b = box();
    fitToRestingSlide(track(0, [138.1, 394]), b);
    expect(b.style.height).toBe("138.1px");
    fitToRestingSlide(track(300, [138.1, 394]), b);
    expect(b.style.height).toBe("394px");
  });
  it("leaves the height alone while the track is between slides", () => {
    const b = box();
    b.style.height = "292px";
    fitToRestingSlide(track(160, [292, 190]), b);
    expect(b.style.height).toBe("292px");
    fitToRestingSlide(track(0, []), b);
    expect(b.style.height).toBe("292px");
  });
});

describe("holdHeight", () => {
  it("a resize still easing in stops where it is, without a transition, and the transition comes back", () => {
    const b = box(250.5);
    b.style.height = "394px";
    holdHeight(b);
    expect(b.style).toEqual({ height: "250.5px", transition: "" });
    expect(b.reflows).toBe(1);
  });
  it("a box at rest, or never sized, is left alone", () => {
    const b = box(394);
    b.style.height = "394px";
    holdHeight(b);
    const never = box(500);
    holdHeight(never);
    expect([b.style.height, b.reflows, never.style.height, never.reflows]).toEqual(["394px", 0, "", 0]);
  });
});

describe("watchSettle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("settles SETTLE_MS after the last scroll event, once", () => {
    const settle = vi.fn();
    const w = watchSettle(settle);
    expect(w.idle()).toBe(true);
    for (let frame = 0; frame < 30; frame++) {
      w.scrolled();
      vi.advanceTimersByTime(16);
    }
    expect([settle.mock.calls.length, w.idle()]).toEqual([0, false]);
    vi.advanceTimersByTime(SETTLE_MS - 17);
    expect(settle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect([settle.mock.calls.length, w.idle()]).toEqual([1, true]);
  });

  it("never settles while a finger is down, however long it is held still; lifting it settles", () => {
    const settle = vi.fn();
    const w = watchSettle(settle);
    w.scrolled();
    w.touchStart();
    w.scrolled();
    vi.advanceTimersByTime(10 * SETTLE_MS);
    expect([settle.mock.calls.length, w.idle()]).toEqual([0, false]);
    w.touchEnd();
    expect(w.idle()).toBe(false);
    // The snap after the lift keeps it waiting.
    w.scrolled();
    vi.advanceTimersByTime(SETTLE_MS - 1);
    w.scrolled();
    vi.advanceTimersByTime(SETTLE_MS);
    expect([settle.mock.calls.length, w.idle()]).toEqual([1, true]);
  });
});
