import { Link } from "react-router-dom";
import { useMeals } from "../hooks.js";
import { mealsFromPantryItem } from "../mealsFromBatch.js";
import { EmptyState } from "../../../components/ui/EmptyState.js";
import { SkeletonList } from "../../../components/ui/Skeleton.js";

interface MealsFromBatchProps {
  babyId: string | undefined;
  pantryItemId: string;
}

function mealTimingLabel(servedAt: string): string {
  const date = new Date(servedAt);
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

/**
 * "Meals from this batch" on `PantryDetailPage`: which of the baby's recent
 * meals were served from this exact pantry item — see `mealsFromPantryItem`
 * for the membership rule. Pulled from the same best-effort recent-meals
 * window `FoodDetailPage`'s "times served" count uses (the 100-row page-size
 * ceiling, not an exact lifetime total), hence the muted "recent meals"
 * qualifier rather than claiming completeness.
 */
export function MealsFromBatch({ babyId, pantryItemId }: MealsFromBatchProps) {
  const { data, isLoading } = useMeals(babyId, { limit: 100 });
  const meals = mealsFromPantryItem(data?.items ?? [], pantryItemId);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-1.5">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Meals from this batch</h2>
        <span className="text-xs text-[var(--color-text-muted)]">(recent meals)</span>
      </div>

      {isLoading && <SkeletonList count={2} />}

      {!isLoading && meals.length === 0 && <EmptyState icon="🍽️" title="No meals logged from this batch yet" />}

      {!isLoading && meals.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {meals.map((meal) => (
            <li key={meal.id} className="rounded-[var(--radius-md)] bg-[var(--color-bg-inset)]">
              {/* The whole row is the link target — no other interactive
                  control lives in this row, so (unlike PantryItemCard/
                  MealCard) nothing needs to stay outside it. */}
              <Link
                to={`/meals/${meal.id}`}
                className="flex flex-col gap-0.5 rounded-[var(--radius-md)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              >
                <span className="text-sm font-medium text-[var(--color-text)]">{mealTimingLabel(meal.servedAt)}</span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {meal.foods.map((food) => food.name).join(", ")}
                </span>
                {meal.notes && <span className="text-xs text-[var(--color-text-muted)]">{meal.notes}</span>}
                {meal.reactionNote && (
                  <span className="text-xs text-[var(--color-danger)]">Reaction: {meal.reactionNote}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
