import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Bars } from "./Bars.js";

/**
 * The column axis carries the same count scale the line does, and had the
 * same duplicate-label bug (Signups, two weeks, a max of 2). Pinned here on
 * the rendered labels rather than on the arithmetic, for the same reason.
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

describe("column Bars axis labels", () => {
  it("prints whole, distinct counts for a two-signup week", () => {
    const html = renderToString(
      createElement(Bars, {
        orientation: "column",
        bars: [
          { label: "Sep 7", value: 1 },
          { label: "Sep 14", value: 2 },
        ],
        title: "Signups",
        summary: "Two weeks.",
        valueHeader: "Signups",
      }),
    );

    const labels = axisLabels(html);
    expect(labels).toEqual(["0", "1", "2"]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
