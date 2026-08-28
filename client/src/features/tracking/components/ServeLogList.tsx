import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MealItem } from "@blw/shared";
import { useDeleteMeal, useMeals } from "../hooks.js";
import { getFoodEmoji } from "../../catalog/foodEmoji.js";
import { Card } from "../../../components/ui/Card.js";
import { ButtonLink } from "../../../components/ui/Button.js";
import { EmptyState } from "../../../components/ui/EmptyState.js";
import { SkeletonList } from "../../../components/ui/Skeleton.js";

/** yyyy-mm-dd in the viewer's local timezone, used to group the timeline by day. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  const today = new Date();
  const todayKey = dayKey(today.toISOString());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === todayKey) return "Today";
  if (key === dayKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export interface MealCardProps {
  meal: MealItem;
  babyId: string;
  pendingDeleteId: string | null;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
}

/** One meal in the day-grouped history: food chips (or a recipe title plus
 * its chips), the served time, an optional reaction note, and Edit/Delete
 * affordances. Exported standalone-renderable per the app's convention for
 * card-shaped list items. */
export function MealCard({ meal, babyId, pendingDeleteId, onRequestDelete, onCancelDelete }: MealCardProps) {
  const deleteMeal = useDeleteMeal(babyId);
  const confirming = pendingDeleteId === meal.id;

  return (
    <Card as="li" padding="sm" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {meal.foods.map((food) => (
            <span
              key={food.id}
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-bg-inset)] px-2 py-1 text-sm text-[var(--color-text)]"
            >
              <span aria-hidden="true">{getFoodEmoji(food.slug, food.category)}</span>
              {food.name}
              {food.pantryItemId && (
                <span aria-label="from pantry" title="From pantry" className="text-xs text-[var(--color-text-muted)]">
                  🧺
                </span>
              )}
            </span>
          ))}
        </div>
        {!confirming && (
          <div className="flex shrink-0 items-center gap-1">
            <Link
              to={`/log-meal?edit=${meal.id}`}
              className="rounded px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={() => onRequestDelete(meal.id)}
              className="rounded px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {meal.recipeTitle && (
        <span className="text-xs font-medium text-[var(--color-text-muted)]">🍳 {meal.recipeTitle}</span>
      )}

      <span className="text-xs text-[var(--color-text-muted)]">{timeLabel(meal.servedAt)}</span>

      {meal.notes && <span className="text-xs text-[var(--color-text-muted)]">{meal.notes}</span>}

      {meal.reactionNote && (
        <span className="text-xs text-[var(--color-danger)]">Reaction: {meal.reactionNote}</span>
      )}

      {confirming && (
        <div className="flex items-center gap-2 border-t border-[var(--color-border)] pt-2">
          <span className="text-xs text-[var(--color-text-muted)]">Remove this meal?</span>
          <button
            type="button"
            disabled={deleteMeal.isPending}
            onClick={() => deleteMeal.mutate(meal.id, { onSettled: onCancelDelete })}
            className="rounded-[var(--radius-md)] bg-[var(--color-danger)] px-2 py-1 text-xs font-medium text-[var(--color-primary-contrast)] disabled:opacity-60"
          >
            {deleteMeal.isPending ? "Removing…" : "Yes, delete"}
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text)]"
          >
            Cancel
          </button>
        </div>
      )}
    </Card>
  );
}

export interface ServeLogListProps {
  babyId: string;
}

/**
 * The day-grouped meal history, formerly LogPage's list half. Rendered as a
 * Home section; logging itself now happens on the full-screen /log-meal page
 * (see LogFoodPage / LogFoodForm), which the per-meal Edit link also reopens
 * (as `/log-meal?edit=:id`) to edit that meal in place.
 */
export function ServeLogList({ babyId }: ServeLogListProps) {
  const { data, isLoading, isError } = useMeals(babyId, { limit: 100 });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const items = data?.items ?? [];
    const byDay = new Map<string, MealItem[]>();
    for (const item of items) {
      const key = dayKey(item.servedAt);
      const list = byDay.get(key);
      if (list) list.push(item);
      else byDay.set(key, [item]);
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data]);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">📖 Food log</h2>

      {isLoading && <SkeletonList count={3} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load the log.</p>}

      {!isLoading && !isError && groups.length === 0 && (
        <EmptyState
          icon="🍽️"
          title="Nothing logged yet"
          description="Log what baby tried so allergen progress stays up to date."
          action={
            <ButtonLink to="/log-meal" size="sm" variant="secondary">
              Log meal
            </ButtonLink>
          }
        />
      )}

      {groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map(([key, items]) => (
            <div key={key} className="flex flex-col gap-2">
              <h3 className="font-caption uppercase tracking-wide text-[var(--color-text-muted)]">{dayLabel(key)}</h3>
              <ul className="flex flex-col gap-2">
                {items.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    babyId={babyId}
                    pendingDeleteId={pendingDeleteId}
                    onRequestDelete={setPendingDeleteId}
                    onCancelDelete={() => setPendingDeleteId(null)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
