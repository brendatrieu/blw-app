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
