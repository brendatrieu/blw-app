import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { awaitingDetail } from "../lib/detailQuery.js";
import { useIsOffline } from "../lib/online.js";
import type { MealItem } from "@blw/shared";
import { useMeals } from "../features/tracking/hooks.js";
import { mealRecipes, recipesTitle } from "../features/tracking/mealRecipes.js";
import { MealCard, MealDeleteDialog } from "../features/tracking/components/ServeLogList.js";
import { MealActionsMenu } from "../features/tracking/components/MealActionsMenu.js";
import { RatedMealLines, rateOfflineId } from "../features/tracking/components/RatedMealLines.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { FoodNames } from "../features/catalog/components/DeletedMark.js";
import { foodPlate } from "../features/catalog/foodEmoji.js";
import { FoodPlate } from "../features/catalog/components/FoodPlate.js";
import { BackButton, useBackNavigate } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
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

/**
 * Full-screen detail view for a single meal, reached by tapping a `MealCard`
 * on Home's food log or a `MealsFromBatch` row (see each component's
 * `linkable`/link). There's no single-meal fetch endpoint, so — like
 * `StorageDetailPage` — the meal is located by id within the same best-effort
 * recent-meals window (`useMeals`, last 100) the rest of the app already
 * uses. An id not found there redirects home instead of rendering a dead
 * page.
 *
 * The body is the Food log's meal card (ledger 939), its ⋮ Edit / Delete in
 * place of the page's own buttons, with each item's stars on its lines (a
 * tap saves that item, `RatedMealLines`), then the notes and reaction note.
 * No allergen marks and no "Counted as tried" list (ledger 928/933: the
 * plate shows just the food that was on it). Offline the stars and Delete
 * wait, like every plate write (SPEC §4.4). A container links back to the
 * storage batch it was served from, so the storage ⇄ meal traceback stays
 * navigable in both directions. After Delete the page lands on Home ("/"):
 * the optimistic delete takes the meal out of the recent meals, so the
 * not-found redirect below runs.
 */
export function MealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  const meals = useMeals(activeBaby?.id, { limit: 100 });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const offline = useIsOffline();
  const goBack = useBackNavigate("/");

  const meal = meals.data?.items.find((candidate) => candidate.id === id) ?? null;
  // No baby at all leaves the meals query disabled (pending for good), so
  // only a real baby's meals are waited on; with none, the meal is missing.
  const isLoading = babyLoading || (activeBaby !== null && awaitingDetail(meals, Boolean(meal)));

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
  const askDelete = () => setConfirmingDelete(true);

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

      {/* Ledger 939: the Food log's own card (its date line, From storage
          badge, ⋮ Edit / Delete and notes), with stars on its lines. It
          does not link to itself. */}
      <ul className="flex flex-col">
        <MealCard
          meal={meal}
          linkable={false}
          onRequestDelete={askDelete}
          // A delete is a plate write: it waits while offline (SPEC §4.4);
          // the lines say "You're offline.", and Delete points at that line.
          actions={
            <MealActionsMenu
              mealId={meal.id}
              onRequestDelete={askDelete}
              deleteDisabled={offline}
              deleteDescribedBy={offline ? rateOfflineId(meal.id) : undefined}
            />
          }
          lines={<RatedMealLines meal={meal} />}
        />
      </ul>
      <MealDeleteDialog
        meal={meal}
        babyId={meal.babyId}
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onDeleted={goBack}
      />
    </div>
  );
}
