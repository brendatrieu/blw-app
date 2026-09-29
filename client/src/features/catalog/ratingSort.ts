import type { RatingSummary } from "@blw/shared";

/** Item 576/586: the rating sort. Absent = the list's usual order. The owner
 * dropped "Most recent rating" (2026-09-28) as one sort too many. */
export type RatingSort = "highest";

export const RATING_SORTS: readonly { value: RatingSort; label: string }[] = [
  { value: "highest", label: "Average rating" },
];

export function ratingSortLabel(sort: RatingSort): string {
  return RATING_SORTS.find((option) => option.value === sort)?.label ?? sort;
}

/**
 * Reorders a list the server already returned in its usual order.
 * "Average rating": highest average first, more ratings breaking a tie.
 * Never-rated items go LAST, still in the usual order — as do rated ties,
 * because `Array.prototype.sort` is stable.
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
    return y.average - x.average || y.count - x.count;
  });
  return [...rated, ...unrated];
}
