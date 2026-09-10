import type { MealItem } from "@blw/shared";

/**
 * Meals that include at least one food served from the given fridge item.
 * Only `POST /api/fridge/:id/serve` ever stamps `fridgeItemId` on a meal's
 * foods (see `mealFoodSchema` in shared/src/tracking.ts) — a meal logged by
 * hand never carries one — so this is a plain filter, no join needed. Pure
 * so the batch-membership rule is unit-testable without rendering.
 */
export function mealsFromFridgeItem(meals: MealItem[], fridgeItemId: string): MealItem[] {
  return meals.filter((meal) => meal.foods.some((food) => food.fridgeItemId === fridgeItemId));
}
