import type { MealItem } from "@blw/shared";

/**
 * Meals that include at least one food served from the given pantry item.
 * Only `POST /api/pantry/:id/serve` ever stamps `pantryItemId` on a meal's
 * foods (see `mealFoodSchema` in shared/src/tracking.ts) — a meal logged by
 * hand never carries one — so this is a plain filter, no join needed. Pure
 * so the batch-membership rule is unit-testable without rendering.
 */
export function mealsFromPantryItem(meals: MealItem[], pantryItemId: string): MealItem[] {
  return meals.filter((meal) => meal.foods.some((food) => food.pantryItemId === pantryItemId));
}
