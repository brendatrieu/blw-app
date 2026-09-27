import type { RatingSummary } from "@blw/shared";

/** Item 576: the two rating sorts. Absent = the list's usual order. */
export type RatingSort = "highest" | "recent";

export const RATING_SORTS: readonly { value: RatingSort; label: string }[] = [
  { value: "highest", label: "Highest rated" },
  { value: "recent", label: "Most recently rated" },
];

export function ratingSortLabel(sort: RatingSort): string {
  return RATING_SORTS.find((option) => option.value === sort)?.label ?? sort;
}

/**
 * Reorders a list the server already returned in its usual order.
 * "Highest rated": average first, more ratings breaking a tie. "Most recently
 * rated": the latest rated meal first. Never-rated items go LAST, still in the
 * usual order — as do rated ties, because `Array.prototype.sort` is stable.
 */
export function sortByRating<T>(
  items: readonly T[],
  sort: RatingSort | undefined,
  summaryOf: (item: T) => RatingSummary | undefined,
): T[] {
  if (!sort) return [...items];
  const rated = items.filter((item) => summaryOf(item) !== undefined);
  const unrated = items.filter((item) => summaryOf(item) === undefined);
  rated.sort((a, b) => {
    const x = summaryOf(a)!;
    const y = summaryOf(b)!;
    if (sort === "recent") return Date.parse(y.lastRatedAt) - Date.parse(x.lastRatedAt);
    return y.average - x.average || y.count - x.count;
  });
  return [...rated, ...unrated];
}
