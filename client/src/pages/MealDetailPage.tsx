import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { awaitingDetail } from "../lib/detailQuery.js";
import { useIsOffline } from "../lib/online.js";
import type { MealItem } from "@blw/shared";
import { useMeals, useUpdateMeal } from "../features/tracking/hooks.js";
import { SavedItemRow } from "../features/plate/PlateItemRow.js";
import { mealRecipes, recipesTitle } from "../features/tracking/mealRecipes.js";
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

/** Header title for a meal: its recipes when logged from any ("A",
 * "A + B", "A + {n} more", ledger 761), otherwise a comma-joined summary of
 * the foods served (a deleted one marked, muted) — the same "best available
 * name" idiom `storageItemTitle` uses for a storage item. Clamped to two
 * lines with "…"; the whole text stays in the heading for screen readers. */
function MealTitle({ meal }: { meal: MealItem }) {
  return (
    <span className="line-clamp-2 min-w-0 break-words">
      {recipesTitle(mealRecipes(meal)) ?? <FoodNames foods={meal.foods} />}
    </span>
  );
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
 * The body is CD-Meal-Page (plan SPEC §5): what was on the plate, one item
 * card each with its stars (a tap saves that item), then "Counted as tried"
 * (`meal.foods`, the foods this meal counts toward, so a parent can see a
 * left-out food was not counted; an `info` food such as whole milk is never
 * a food tried, so it is left out here too), the reaction note and the
 * notes. Offline the stars and Delete wait, like every plate write (SPEC §4.4). A
 * container links back to the storage batch it was served from, so the
 * storage ⇄ meal traceback stays navigable in both directions.
 */
export function MealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  const meals = useMeals(activeBaby?.id, { limit: 100 });
  // Item 334 / ledger 554: each meal food carries its own allergen slugs.
  // History must not depend on the foods LIST, which hides a deleted food —
  // a past meal keeps that food's allergen chips.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Item 574: the stars are this page's one inline edit; each tap saves that
  // one item's stars (PATCH `itemRatings`, ledger 902), and shows the tapped
  // value while it does. A 409 `meal_changed` (an item another write
  // replaced) refetches the meal like any settled edit.
  const updateMeal = useUpdateMeal(activeBaby?.id);
  const offline = useIsOffline();
  const goBack = useBackNavigate("/");

  const meal = meals.data?.items.find((candidate) => candidate.id === id) ?? null;
  // No baby at all leaves the meals query disabled (pending for good), so
  // only a real baby's meals are waited on; with none, the meal is missing.
  const isLoading = babyLoading || (activeBaby !== null && awaitingDetail(meals, Boolean(meal)));

  // While a tap is saving, show what was tapped rather than the old value.
  const pending = updateMeal.isPending && updateMeal.variables?.id === id ? updateMeal.variables.input : undefined;

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

  const recipes = mealRecipes(meal);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title={<MealTitle meal={meal} />}
        emoji={
          <FoodPlate
            {...(recipes.length > 0 ? { emoji: "🍳", tint: "neutral" as const } : foodPlate(meal.foods[0]!))}
            size={40}
          />
        }
        leading={<BackButton fallback="/" />}
      />

      <Card padding="sm" className="flex flex-col">
        <span className="mb-2 text-xs text-[var(--color-text-muted)]">{servedAtLabel(meal.servedAt)}</span>

        {meal.items && meal.items.length > 0 && (
          <ul aria-label="On the plate" className="flex flex-col gap-2">
            {meal.items.map((item) => (
              <SavedItemRow
                key={item.kind === "storage" ? item.storageItemId : item.id}
                item={item}
                pending={pending?.itemRatings}
                disabled={offline}
                // One item per tap, merged server-side.
                onRate={(itemId, value) => updateMeal.mutate({ id: meal.id, input: { itemRatings: { [itemId]: value } } })}
              />
            ))}
          </ul>
        )}
        {offline && (
          <p id="meal-offline" className="mt-2 text-xs text-[var(--color-text-muted)]">
            You're offline.
          </p>
        )}
        {updateMeal.isError && !offline && (
          <p role="alert" className="mt-2 text-xs text-[var(--color-danger)]">
            Couldn't save that rating — try again.
          </p>
        )}

        <span id="meal-counted" className="mt-3 text-sm font-semibold text-[var(--color-text)]">
          Counted as tried
        </span>
        <ul aria-labelledby="meal-counted" className="mt-1.5 flex flex-wrap gap-1.5">
          {meal.foods
            .filter((food) => food.kind !== "info")
            .map((food) => (
            <li
              key={food.id}
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-bg-inset)] px-[9px] py-[3px] text-[13px] text-[var(--color-text)]"
            >
              {food.name}
              <DeletedMark deleted={food.deleted} />
              <AllergenChips allergens={food.allergens ?? []} />
            </li>
            ))}
        </ul>

        {meal.reactionNote && (
          <span className="mt-2.5 text-xs text-[var(--color-danger)]">Reaction: {meal.reactionNote}</span>
        )}

        {meal.notes && <span className="mt-2.5 text-xs text-[var(--color-text-muted)]">{meal.notes}</span>}
      </Card>

      <div className="flex items-center gap-2">
        {/* CD-Meal-Page: 44px targets, as every control on the boards. */}
        <ButtonLink to={`/log-meal?edit=${meal.id}`} variant="secondary">
          Edit
        </ButtonLink>
        {/* A delete is a plate write: it waits while offline (SPEC §4.4). */}
        <Button
          type="button"
          variant="danger-quiet"
          disabled={offline}
          aria-describedby={offline ? "meal-offline" : undefined}
          onClick={() => setConfirmingDelete(true)}
        >
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
