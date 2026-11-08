import { useState } from "react";
import type { MealItem } from "@blw/shared";
import { useMeals } from "../hooks.js";
import { mealsFromStorageItem } from "../mealsFromBatch.js";
import { EmptyState } from "../../../components/ui/EmptyState.js";
import { SkeletonList } from "../../../components/ui/Skeleton.js";
import { MealCard, MealDeleteDialog } from "./ServeLogList.js";

interface MealsFromBatchProps {
  babyId: string | undefined;
  storageItemId: string;
}

/**
 * "Meals from this batch" on `StorageDetailPage`: which of the baby's recent
 * meals were served from this exact storage item — see `mealsFromStorageItem`
 * for the membership rule. Pulled from the same best-effort recent-meals
 * window `FoodDetailPage`'s "times served" count uses (the 100-row page-size
 * ceiling, not an exact lifetime total). The heading carries no "(recent
 * meals)" qualifier (item 704, owner's pick).
 *
 * Each meal is the Food log's own card (ledger 966): a tap opens its Edit,
 * ⋮ has Edit and Delete. A delete keeps the parent on this page; the card
 * goes, and the container above gets its servings back (the delete
 * refreshes Storage).
 */
export function MealsFromBatch({ babyId, storageItemId }: MealsFromBatchProps) {
  const { data, isLoading } = useMeals(babyId, { limit: 100 });
  const meals = mealsFromStorageItem(data?.items ?? [], storageItemId);
  // The meal itself, not its id: the delete removes the card optimistically,
  // and the question has to outlive it to show a failure (as on the Food log).
  const [pendingDelete, setPendingDelete] = useState<MealItem | null>(null);

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-h2 text-[var(--color-text)]">Meals from this batch</h2>

      {isLoading && <SkeletonList count={2} />}

      {!isLoading && meals.length === 0 && <EmptyState icon="🍽️" title="No meals logged from this batch yet" />}

      {!isLoading && meals.length > 0 && (
        <ul className="flex flex-col gap-2">
          {meals.map((meal) => (
            <MealCard key={meal.id} meal={meal} onRequestDelete={setPendingDelete} />
          ))}
        </ul>
      )}
      {pendingDelete && (
        <MealDeleteDialog meal={pendingDelete} babyId={pendingDelete.babyId} open onClose={() => setPendingDelete(null)} />
      )}
    </section>
  );
}
