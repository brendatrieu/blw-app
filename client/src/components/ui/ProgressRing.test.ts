import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressRing } from "./ProgressRing.js";

const A = "var(--color-ring-established)";
const B = "var(--color-ring-started)";
const C = "var(--color-ring-empty)";

function render(segments: string[]) {
  return renderToString(createElement(ProgressRing, { segments, label: "3 of 9 allergens established" }, "3/9"));
}

describe("ProgressRing (item 663: the segmented ring)", () => {
  it("is one labelled image, its centered text hidden from the reader", () => {
    const html = render([A, B, C]);
    expect(html).toMatch(/^<div role="img" aria-label="3 of 9 allergens established"/);
    expect(html).toContain('<div aria-hidden="true" class="absolute inset-0 flex items-center justify-center">3/9</div>');
  });

  it("draws one arc per segment, in the given order", () => {
    const html = render([A, A, B, C, C, C, C, C, C]);
    const strokes = [...html.matchAll(/<circle [^>]*stroke="([^"]+)"/g)].map((m) => m[1]);
    expect(strokes).toEqual([A, A, B, C, C, C, C, C, C]);
  });

  it("splits the ring into equal arcs with a 4px gap, walking clockwise from the top", () => {
    const html = render(Array.from({ length: 9 }, () => C));
    // 76px box, 9px stroke: r = 30, as in A-Home.
    expect(html).toContain('r="30"');
    expect(html).toContain('class="-rotate-90"');
    const circumference = 2 * Math.PI * 30;
    const step = circumference / 9;
    const dashes = [...html.matchAll(/stroke-dasharray="([\d.]+) ([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(dashes).toHaveLength(9);
    for (const [on, off] of dashes) {
      expect(on).toBeCloseTo(step - 4, 5);
      expect(on! + off!).toBeCloseTo(circumference, 5);
    }
    const offsets = [...html.matchAll(/stroke-dashoffset="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
    offsets.forEach((offset, index) => expect(offset).toBeCloseTo(-(index * step + 2), 5));
  });
});
