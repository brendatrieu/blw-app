import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Line } from "./Line.js";

/**
 * The axis, read off the rendered markup rather than off `niceTicks`.
 *
 * `helpers.test.ts` already pins the tick arithmetic; this pins the thing the
 * owner actually saw — the *labels*. A fractional step survives the numbers
 * and only shows up once `formatCount` has rounded 0.5 and 1.5 into a second
 * "1" and a second "2", which no unit test of the arithmetic would catch.
 */

/**
 * The y-axis labels, in render order.
 *
 * Anchored on the gutter x the ticks are drawn at (`GUTTER_L - 4`, 22 user
 * units) rather than on `text-anchor`: the series' end label and the last
 * week's name are end-anchored too, and matching those would hide a duplicate
 * tick behind two unrelated strings.
 */
function axisLabels(html: string): string[] {
  return [...html.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
    .filter(([, attrs]) => attrs!.includes('x="22"') && attrs!.includes('text-anchor="end"'))
    .map(([, , label]) => label!);
}

describe("Line axis labels", () => {
  it("prints whole, distinct counts for a two-parent week", () => {
    const html = renderToString(
      createElement(Line, {
        points: [
          { label: "Sep 7", value: 1 },
          { label: "Sep 14", value: 2 },
        ],
        title: "Weekly logging parents",
        summary: "Two weeks.",
        valueHeader: "Parents",
      }),
    );

    const labels = axisLabels(html);
    expect(labels).toEqual(["0", "1", "2"]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("still labels an all-zero series with a baseline and a one", () => {
    const html = renderToString(
      createElement(Line, {
        points: [{ label: "Sep 14", value: 0 }],
        title: "Weekly logging parents",
        summary: "One empty week.",
        valueHeader: "Parents",
      }),
    );

    expect(axisLabels(html)).toEqual(["0", "1"]);
  });
});

// Ratings draw on a fixed 0-5 scale: two 2-star ratings must sit low on the
// chart, not stretch to its top as a data-fitted axis would draw them.
describe("Line with a fixed maximum", () => {
  it("keeps the axis at 0-5 however low the ratings are", () => {
    const html = renderToString(
      createElement(Line, {
        points: [
          { label: "Sep 20", value: 2 },
          { label: "Sep 27", value: 2 },
        ],
        title: "Ratings",
        summary: "Two ratings.",
        valueHeader: "Stars",
        fixedMax: 5,
      }),
    );
    const labels = axisLabels(html);
    expect(labels[0]).toBe("0");
    expect(labels[labels.length - 1]).toBe("5");
  });
});

// Item 582: one rating (or one admin week) draws a centred dot; its value and
// date must sit on it, not at the plot's right and left edges.
describe("Line with a single point", () => {
  it("centres the value label and the date on the lone dot", () => {
    const html = renderToString(
      createElement(Line, {
        points: [{ label: "Sep 27", value: 4 }],
        title: "Ratings",
        summary: "One rating.",
        valueHeader: "Stars",
        fixedMax: 5,
      }),
    );
    const cx = html.match(/<circle cx="([^"]+)"/)![1];
    expect(html).toMatch(new RegExp(`<text x="${cx}"[^>]*text-anchor="middle"[^>]*font-size="11"[^>]*>4<`));
    expect(html).toMatch(new RegExp(`<text x="${cx}"[^>]*text-anchor="middle"[^>]*>Sep 27<`));
  });

  it("keeps the end label at the right edge for a real series", () => {
    const html = renderToString(
      createElement(Line, {
        points: [
          { label: "Sep 20", value: 2 },
          { label: "Sep 27", value: 4 },
        ],
        title: "Ratings",
        summary: "Two ratings.",
        valueHeader: "Stars",
        fixedMax: 5,
      }),
    );
    expect(html).toMatch(/<text x="314"[^>]*text-anchor="end"[^>]*font-size="11"[^>]*>4</);
  });
});

