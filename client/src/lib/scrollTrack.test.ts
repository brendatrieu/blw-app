import { describe, expect, it } from "vitest";
import { newWheelGesture, swipeStep, SWIPE_MIN_PX, wheelStep, WHEEL_GAP_MS } from "./scrollTrack.js";

describe("swipeStep (ledger 1024)", () => {
  it("a sideways swipe moves one slide: left = next, right = back", () => {
    expect(swipeStep(-SWIPE_MIN_PX, 0)).toBe(1);
    expect(swipeStep(120, 10)).toBe(-1);
    expect(swipeStep(-120, -60)).toBe(1);
  });
  it("a tap or a short drag is not a swipe", () => {
    expect(swipeStep(0, 0)).toBe(0);
    expect(swipeStep(-(SWIPE_MIN_PX - 1), 0)).toBe(0);
    expect(swipeStep(8, 3)).toBe(0);
  });
  it("a move as much (or more) up/down as sideways never changes the slide", () => {
    expect(swipeStep(-100, 100)).toBe(0);
    expect(swipeStep(60, -200)).toBe(0);
    expect(swipeStep(0, 300)).toBe(0);
  });
  it("ignores missing numbers", () => {
    expect(swipeStep(Number.NaN, 0)).toBe(0);
    expect(swipeStep(-100, Number.NaN)).toBe(0);
  });
});

describe("wheelStep (ledger 1024)", () => {
  it("one trackpad gesture, momentum tail included, moves one slide", () => {
    const g = newWheelGesture();
    const steps = [5, 10, 20, 30, 40, 30, 20, 10, 5, 2, 1].map((dx, i) => wheelStep(g, dx, 0, i * 16));
    expect(steps.filter(Boolean)).toEqual([1]);
  });
  it("a pause ends the gesture; the next one moves again, either way", () => {
    const g = newWheelGesture();
    expect(wheelStep(g, 100, 0, 0)).toBe(1);
    expect(wheelStep(g, 100, 0, 16)).toBe(0);
    expect(wheelStep(g, -100, 0, 16 + WHEEL_GAP_MS + 1)).toBe(-1);
  });
  it("vertical wheel and small nudges never move", () => {
    const g = newWheelGesture();
    expect([0, 16, 32, 48].map((t) => wheelStep(g, 10, 80, t))).toEqual([0, 0, 0, 0]);
    expect(wheelStep(g, SWIPE_MIN_PX - 1, 0, 1000)).toBe(0);
  });
});
