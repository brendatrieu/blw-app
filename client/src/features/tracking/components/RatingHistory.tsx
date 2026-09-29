import { STAR_RATING_MAX, type RatingHistoryQuery, type RatingHistoryResponse, type RatingSummary } from "@blw/shared";
import { Line } from "../../../components/charts/Line.js";
import { RatingSummaryText } from "../../../components/ui/StarRating.js";
import { useActiveBaby } from "../../babies/useActiveBaby.js";
import { useRatingHistory } from "../hooks.js";

type Points = RatingHistoryResponse["points"];

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The card numbers, from a history already oldest first. */
function summarize(points: Points): RatingSummary {
  const total = points.reduce((sum, point) => sum + point.rating, 0);
  return {
    average: total / points.length,
    count: points.length,
    latest: points[points.length - 1]!.rating,
    lastRatedAt: points[points.length - 1]!.servedAt,
  };
}

/**
 * Item 585: a subtitle under a food's or recipe's badges — the baby's average,
 * exactly as the cards show it. The graph lives at the bottom of the page.
 * Renders nothing until there is a rating.
 */
export function RatingSummaryRowView({ points }: { points: Points }) {
  if (points.length === 0) return null;
  return <RatingSummaryText summary={summarize(points)} className="text-sm" />;
}

/**
 * Item 575: one food's or recipe's ratings for one baby as a small line graph
 * on a fixed 0-5 axis (one point per rated meal, oldest first). Renders
 * nothing until there is a rating.
 */
export function RatingHistoryChart({ points, name, babyName }: { points: Points; name: string; babyName: string }) {
  if (points.length === 0) return null;
  const summary = summarize(points);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-h2 text-[var(--color-text)]">{`${babyName}'s rating history`}</h2>
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

/** The active baby's history; both parts share the one (deduped) query. */
function useActiveRatingHistory(target: RatingHistoryQuery) {
  const { activeBaby } = useActiveBaby();
  const { data } = useRatingHistory(activeBaby?.id, target);
  return activeBaby && data ? { points: data.points, babyName: activeBaby.name } : null;
}

/** The detail page's subtitle, for the active baby. */
export function RatingSummaryRow({ target }: { target: RatingHistoryQuery }) {
  const history = useActiveRatingHistory(target);
  return history ? <RatingSummaryRowView points={history.points} /> : null;
}

/** The detail page's bottom section, for the active baby. */
export function RatingHistory({ target, name }: { target: RatingHistoryQuery; name: string }) {
  const history = useActiveRatingHistory(target);
  return history ? <RatingHistoryChart {...history} name={name} /> : null;
}
