import { describe, expect, it } from "vitest";
import type { RatingSummary } from "@blw/shared";
import { sortByRating } from "./ratingSort.js";

const at = (day: number) => `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`;
const s = (average: number, count: number, day: number): RatingSummary => ({
  average,
  count,
  latest: Math.round(average),
  lastRatedAt: at(day),
});

// The server's usual order (iron, then name) is the input order.
const ITEMS = ["apple", "beef", "carrot", "date", "egg", "fig"];
const RATINGS: Record<string, RatingSummary> = {
  beef: s(4, 2, 10),
  date: s(4, 5, 3),
  egg: s(5, 1, 1),
  fig: s(2, 3, 20),
};
const sorted = (sort: "highest" | "recent" | undefined) => sortByRating(ITEMS, sort, (id) => RATINGS[id]);

describe("sortByRating (item 576)", () => {
  it("leaves the usual order alone with no sort", () => {
    expect(sorted(undefined)).toEqual(ITEMS);
  });

  it("Highest rated: average first, more ratings breaking a tie, never-rated last in the usual order", () => {
    expect(sorted("highest")).toEqual(["egg", "date", "beef", "fig", "apple", "carrot"]);
  });

  it("Most recently rated: latest rated meal first, never-rated last in the usual order", () => {
    expect(sorted("recent")).toEqual(["fig", "beef", "date", "egg", "apple", "carrot"]);
  });

  it("keeps the usual order between exact ties", () => {
    const tie = { a: s(3, 2, 5), b: s(3, 2, 5) } as Record<string, RatingSummary>;
    expect(sortByRating(["b", "a"], "highest", (id) => tie[id])).toEqual(["b", "a"]);
  });
});
