import type { MealItem } from "@blw/shared";

/**
 * Meals that took something from the given storage item. A meal's
 * `items` (ledger 902) name each container on the plate exactly, so they
 * decide when present: two containers on one plate, or a fridge and a
 * freezer container of one recipe, each find the meal. A cached body from
 * before items falls back to the foods' `storageItemId`, which only a serve
 * stamps, and only once per food. Pure so the batch-membership rule is
 * unit-testable without rendering.
 */
export function mealsFromStorageItem(meals: MealItem[], storageItemId: string): MealItem[] {
  return meals.filter((meal) =>
    meal.items
      ? meal.items.some((item) => item.kind === "storage" && item.storageItemId === storageItemId)
      : meal.foods.some((food) => food.storageItemId === storageItemId),
  );
}
