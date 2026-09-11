import type { MealItem } from "@blw/shared";

/**
 * Meals that include at least one food served from the given storage item.
 * Only `POST /api/storage/:id/serve` ever stamps `storageItemId` on a meal's
 * foods (see `mealFoodSchema` in shared/src/tracking.ts) — a meal logged by
 * hand never carries one — so this is a plain filter, no join needed. Pure
 * so the batch-membership rule is unit-testable without rendering.
 */
export function mealsFromStorageItem(meals: MealItem[], storageItemId: string): MealItem[] {
  return meals.filter((meal) => meal.foods.some((food) => food.storageItemId === storageItemId));
}
