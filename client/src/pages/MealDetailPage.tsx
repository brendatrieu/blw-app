import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { MealItem } from "@blw/shared";
import { useMeals } from "../features/tracking/hooks.js";
import { MealDeleteControl } from "../features/tracking/components/ServeLogList.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { getFoodEmoji } from "../features/catalog/foodEmoji.js";
import { BackButton, useBackNavigate } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { ButtonLink } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { Skeleton, SkeletonList } from "../components/ui/Skeleton.js";

/** Header title for a meal: its recipe title when logged from one, otherwise
 * a comma-joined summary of the foods served — the same "best available
 * name" idiom `pantryItemTitle` uses for a pantry item. Exported so the
 * title text is pinnable without a DOM render. */
export function mealTitle(meal: MealItem): string {
  return meal.recipeTitle ?? meal.foods.map((food) => food.name).join(", ");
}

/** Full weekday/date plus time, e.g. "Wednesday, August 26 · 2:05 PM" — more
 * complete than the day-grouped list's own "Today"/short-date labels, since
 * this page stands alone with no surrounding day heading for context. */
function servedAtLabel(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

/**
 * Full-screen detail view for a single meal, reached by tapping a `MealCard`
 * on Home's food log or a `MealsFromBatch` row (see each component's
 * `linkable`/link). There's no single-meal fetch endpoint, so — like
 * `PantryDetailPage` — the meal is located by id within the same best-effort
 * recent-meals window (`useMeals`, last 100) the rest of the app already
 * uses. An id not found there redirects home instead of rendering a dead
 * page.
 *
 * The body mirrors `MealCard`'s content (food chips, recipe title, reaction
 * note, general notes) but stands alone under this page's own title instead
 * of inside a list row, and adds one thing the list doesn't show per food:
 * a 🧺 link back to the pantry batch it was served from, when it has one —
 * making the pantry ⇄ meal traceback navigable in both directions.
 */
export function MealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  const { data, isLoading: mealsLoading } = useMeals(activeBaby?.id, { limit: 100 });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const goBack = useBackNavigate("/");

  const isLoading = babyLoading || mealsLoading;
  const meal = data?.items.find((candidate) => candidate.id === id) ?? null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <BackButton fallback="/" />
        <Skeleton className="h-6 w-2/3" />
        <SkeletonList count={1} />
      </div>
    );
  }

  if (!meal) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <BackButton fallback="/" />
      <PageHeader
        title={mealTitle(meal)}
        emoji={meal.recipeTitle ? "🍳" : getFoodEmoji(meal.foods[0]!.slug, meal.foods[0]!.category)}
      />

      <Card padding="sm" className="flex flex-col gap-2">
        <span className="text-xs text-[var(--color-text-muted)]">{servedAtLabel(meal.servedAt)}</span>

        <div className="flex flex-wrap items-center gap-1.5">
          {meal.foods.map((food) => (
            <span
              key={food.id}
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-bg-inset)] px-2 py-1 text-sm text-[var(--color-text)]"
            >
              <span aria-hidden="true">{getFoodEmoji(food.slug, food.category)}</span>
              {food.name}
              {food.pantryItemId && (
                <Link
                  to={`/pantry/${food.pantryItemId}`}
                  aria-label={`View the pantry batch this ${food.name} was served from`}
                  title="From pantry"
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  🧺
                </Link>
              )}
            </span>
          ))}
        </div>

        {meal.recipeTitle && (
          <span className="text-xs font-medium text-[var(--color-text-muted)]">🍳 {meal.recipeTitle}</span>
        )}

        {meal.reactionNote && (
          <span className="text-xs text-[var(--color-danger)]">Reaction: {meal.reactionNote}</span>
        )}

        {meal.notes && <span className="text-xs text-[var(--color-text-muted)]">{meal.notes}</span>}
      </Card>

      <div className="flex items-center gap-2">
        {!confirmingDelete && (
          <ButtonLink to={`/log-meal?edit=${meal.id}`} size="sm" variant="secondary">
            Edit
          </ButtonLink>
        )}
        <MealDeleteControl
          meal={meal}
          babyId={meal.babyId}
          confirming={confirmingDelete}
          onRequestDelete={() => setConfirmingDelete(true)}
          onCancelDelete={() => setConfirmingDelete(false)}
          onDeleted={goBack}
        />
      </div>
    </div>
  );
}
