import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { MealItem } from "@blw/shared";
import { useMeals, useUpdateMeal } from "../features/tracking/hooks.js";
import {
  MealRatingsField,
  RECIPE_RATING_KEY,
  mealRatingRows,
} from "../features/tracking/components/MealRatingsField.js";
import { MealDeleteDialog } from "../features/tracking/components/ServeLogList.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { AllergenChips } from "../features/catalog/components/AllergenChips.js";
import { DeletedMark, FoodNames } from "../features/catalog/components/DeletedMark.js";
import { foodPlate } from "../features/catalog/foodEmoji.js";
import { FoodPlate } from "../features/catalog/components/FoodPlate.js";
import { BackButton, useBackNavigate } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Button, ButtonLink } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { Skeleton, SkeletonList } from "../components/ui/Skeleton.js";

/** Header title for a meal: its recipe title when logged from one, otherwise
 * a comma-joined summary of the foods served (a deleted one marked, muted) —
 * the same "best available name" idiom `storageItemTitle` uses for a storage
 * item. */
function MealTitle({ meal }: { meal: MealItem }) {
  return meal.recipeTitle ?? <FoodNames foods={meal.foods} />;
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
 * `StorageDetailPage` — the meal is located by id within the same best-effort
 * recent-meals window (`useMeals`, last 100) the rest of the app already
 * uses. An id not found there redirects home instead of rendering a dead
 * page.
 *
 * The body mirrors `MealCard`'s content (food chips, recipe title, reaction
 * note, general notes) but stands alone under this page's own title instead
 * of inside a list row, and adds one thing the list doesn't show per food:
 * a 📦 link back to the storage batch it was served from, when it has one —
 * making the storage ⇄ meal traceback navigable in both directions.
 */
export function MealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  const { data, isLoading: mealsLoading } = useMeals(activeBaby?.id, { limit: 100 });
  // Item 334 / ledger 554: each meal food carries its own allergen slugs.
  // History must not depend on the foods LIST, which hides a deleted food —
  // a past meal keeps that food's allergen chips.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Item 574: the stars are this page's one inline edit; each tap saves like
  // any other meal edit (PATCH), and shows the tapped value while it does.
  const updateMeal = useUpdateMeal(activeBaby?.id);
  const goBack = useBackNavigate("/");

  const isLoading = babyLoading || mealsLoading;
  const meal = data?.items.find((candidate) => candidate.id === id) ?? null;

  // While a tap is saving, show what was tapped rather than the old value.
  const pending = updateMeal.isPending ? updateMeal.variables : undefined;
  const pendingRecipeRating = (current: MealItem) =>
    pending?.id === current.id && pending.input.recipeRating !== undefined
      ? pending.input.recipeRating
      : (current.recipeRating ?? null);
  const pendingFoodRating = (current: MealItem, foodId: string) => {
    const tapped = pending?.id === current.id ? pending.input.foodRatings?.[foodId] : undefined;
    return tapped !== undefined ? tapped : (current.foods.find((food) => food.id === foodId)?.rating ?? null);
  };

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
      <PageHeader
        title={<MealTitle meal={meal} />}
        emoji={
          <FoodPlate
            {...(meal.recipeTitle ? { emoji: "🍳", tint: "neutral" as const } : foodPlate(meal.foods[0]!))}
            size={40}
          />
        }
        leading={<BackButton fallback="/" />}
      />

      <Card padding="sm" className="flex flex-col gap-2">
        <span className="text-xs text-[var(--color-text-muted)]">{servedAtLabel(meal.servedAt)}</span>

        <div className="flex flex-wrap items-center gap-1.5">
          {meal.foods.map((food) => (
            <span
              key={food.id}
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-bg-inset)] px-2 py-1 text-sm text-[var(--color-text)]"
            >
              <FoodPlate {...foodPlate(food)} size={24} />
              {food.name}
              <DeletedMark deleted={food.deleted} />
              <AllergenChips allergens={food.allergens ?? []} />
              {food.storageItemId && (
                <Link
                  to={`/storage/${food.storageItemId}`}
                  aria-label={`View the storage batch this ${food.name} was served from`}
                  title="From storage"
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  📦
                </Link>
              )}
            </span>
          ))}
        </div>

        {meal.recipeTitle && (
          <span className="text-xs font-medium text-[var(--color-text-muted)]">🍳 {meal.recipeTitle}</span>
        )}

        <MealRatingsField
          rows={mealRatingRows(
            meal.recipeId ? { title: meal.recipeTitle ?? "Recipe", rating: pendingRecipeRating(meal) } : null,
            meal.foods,
            Object.fromEntries(meal.foods.map((food) => [food.id, pendingFoodRating(meal, food.id)])),
          )}
          onChange={(key, value) =>
            updateMeal.mutate({
              id: meal.id,
              input: key === RECIPE_RATING_KEY ? { recipeRating: value } : { foodRatings: { [key]: value } },
            })
          }
        />
        {updateMeal.isError && (
          <p role="alert" className="text-xs text-[var(--color-danger)]">
            Couldn't save that rating — try again.
          </p>
        )}

        {meal.reactionNote && (
          <span className="text-xs text-[var(--color-danger)]">Reaction: {meal.reactionNote}</span>
        )}

        {meal.notes && <span className="text-xs text-[var(--color-text-muted)]">{meal.notes}</span>}
      </Card>

      <div className="flex items-center gap-2">
        <ButtonLink to={`/log-meal?edit=${meal.id}`} size="sm" variant="secondary">
          Edit
        </ButtonLink>
        <Button type="button" variant="danger-quiet" size="sm" onClick={() => setConfirmingDelete(true)}>
          Delete
        </Button>
        <MealDeleteDialog
          meal={meal}
          babyId={meal.babyId}
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          onDeleted={goBack}
        />
      </div>
    </div>
  );
}
