import { STAR_RATING_MAX, type RatingHistoryQuery, type RatingHistoryResponse } from "@blw/shared";
import { Line } from "../../../components/charts/Line.js";
import { RatingSummaryText } from "../../../components/ui/StarRating.js";
import { useActiveBaby } from "../../babies/useActiveBaby.js";
import { useRatingHistory } from "../hooks.js";

type Points = RatingHistoryResponse["points"];

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Item 575: one food's or recipe's ratings for one baby — the average line
 * cards show, over a small line graph on a fixed 0-5 axis (one point per
 * rated meal, oldest first). Renders nothing until there is a rating.
 */
export function RatingHistoryChart({ points, name, babyName }: { points: Points; name: string; babyName: string }) {
  if (points.length === 0) return null;
  const total = points.reduce((sum, point) => sum + point.rating, 0);
  const summary = {
    average: total / points.length,
    count: points.length,
    latest: points[points.length - 1]!.rating,
    lastRatedAt: points[points.length - 1]!.servedAt,
  };
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-h2 text-[var(--color-text)]">{babyName}'s ratings</h2>
        <RatingSummaryText summary={summary} className="text-sm" />
      </div>
      <Line
        points={points.map((point) => ({ label: shortDate(point.servedAt), value: point.rating }))}
        title={`${babyName}'s ratings of ${name}`}
        summary={`${summary.count} ${summary.count === 1 ? "rating" : "ratings"}, averaging ${summary.average.toFixed(1)} of ${STAR_RATING_MAX} stars; the latest is ${summary.latest}.`}
        valueHeader="Stars"
        labelHeader="Meal"
        fixedMax={STAR_RATING_MAX}
      />
    </section>
  );
}

/** The detail-page section, for the active baby. */
export function RatingHistory({ target, name }: { target: RatingHistoryQuery; name: string }) {
  const { activeBaby } = useActiveBaby();
  const { data } = useRatingHistory(activeBaby?.id, target);
  if (!activeBaby || !data) return null;
  return <RatingHistoryChart points={data.points} name={name} babyName={activeBaby.name} />;
}
