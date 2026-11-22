// Ledger 1144a: Up next's card height follows the swipe, between the two neighbouring pages.
import { describe, expect, it } from "vitest";
import { heightAt, restingSlide } from "./trackHeight.js";

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
    expect(restingSlide(1, 300, 3)).toBeNull();
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

describe("heightAt", () => {
  const pages = [292, 190, 394];
  it("is the page's own height, exactly, on a page edge (WebKit's whole pixels too)", () => {
    expect(heightAt(0, 300, pages)).toBe(292);
    expect(heightAt(300, 300, pages)).toBe(190);
    expect(heightAt(600, 300, pages)).toBe(394);
    expect(heightAt(299.6, 300, pages)).toBe(190);
    expect(heightAt(358, 358.4, pages)).toBe(190);
    expect(heightAt(717, 358.4, pages)).toBe(394);
  });
  it("mixes the two neighbouring pages by how far the track is between them", () => {
    expect(heightAt(150, 300, pages)).toBe(241);
    expect(heightAt(75, 300, pages)).toBe(266.5);
    expect(heightAt(450, 300, pages)).toBe(292);
    expect(heightAt(570, 300, pages)).toBeCloseTo(373.6, 9);
    expect(heightAt(1, 300, pages)).toBeCloseTo(292 - 102 / 300, 9); // a finger 1px in already moves it
  });
  it("clamps an overscroll at either end to that end's page", () => {
    expect(heightAt(-40, 300, pages)).toBe(292);
    expect(heightAt(640, 300, pages)).toBe(394);
    expect(heightAt(9000, 300, pages)).toBe(394);
  });
  it("one page is always that page's height", () => {
    expect(heightAt(0, 300, [138.1])).toBe(138.1);
    expect(heightAt(40, 300, [138.1])).toBe(138.1);
    expect(heightAt(-40, 300, [138.1])).toBe(138.1);
  });
  it("is null with no pages, no width, or a scroll or width that is not a number", () => {
    expect(heightAt(0, 300, [])).toBeNull();
    expect(heightAt(0, 0, pages)).toBeNull();
    expect(heightAt(0, -300, pages)).toBeNull();
    expect(heightAt(Number.NaN, 300, pages)).toBeNull();
    expect(heightAt(0, Number.NaN, pages)).toBeNull();
    expect(heightAt(Number.POSITIVE_INFINITY, 300, pages)).toBeNull();
  });
});
