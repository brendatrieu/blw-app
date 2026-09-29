import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RatingHistoryChart, RatingSummaryRowView } from "./RatingHistory.js";

const POINTS = [
  { servedAt: "2026-09-20T12:00:00.000Z", rating: 3 },
  { servedAt: "2026-09-24T12:00:00.000Z", rating: 5 },
  { servedAt: "2026-09-27T12:00:00.000Z", rating: 4 },
];

const render = (points = POINTS) =>
  renderToString(createElement(RatingHistoryChart, { points, name: "Banana", babyName: "Robin" }));

describe("RatingHistoryChart (item 575)", () => {
  it("draws a line graph on a fixed 0-5 axis under the baby's history heading", () => {
    const html = render();
    expect(html).toContain("Robin&#x27;s rating history</h2>");
    // The average is the top-of-page row's job now (item 585), said once.
    expect(html).not.toContain("★");
    expect(html).toContain('role="img"');
    expect(html).toContain('stroke="var(--chart-1)"');
    // Axis labels 0..5 and never above 5 (the data-driven axis would round to 6).
    const axis = [...html.matchAll(/<text\b[^>]*x="22"[^>]*text-anchor="end"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(axis).toEqual(["0", "1", "2", "3", "4", "5"]);
    // The screen-reader table names each point as a meal, not a week.
    expect(html).toContain(">Meal<");
    expect(html).toContain(">Stars<");
    expect(html).not.toContain(">Week<");
  });

  it("renders nothing until there is a rating", () => {
    expect(render([])).toBe("");
  });
});

describe("RatingSummaryRowView (item 585)", () => {
  const row = (points = POINTS) => renderToString(createElement(RatingSummaryRowView, { points }));

  it("is the average exactly as the cards show it, with no label and no graph", () => {
    const html = row();
    expect(html).toContain("★ 4.0 (3)");
    expect(html).toContain("Rated 4.0 out of 5, 3 ratings");
    expect(html).not.toContain("&#x27;s ratings");
    expect(html).not.toContain("<svg");
  });

  it("renders nothing until there is a rating", () => {
    expect(row([])).toBe("");
  });
});
