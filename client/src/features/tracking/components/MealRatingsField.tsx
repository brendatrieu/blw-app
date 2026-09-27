import { StarRating } from "../../../components/ui/StarRating.js";

/** The key of the one row a recipe meal has. Never a food id (those are uuids). */
export const RECIPE_RATING_KEY = "recipe";

export interface MealRatingRow {
  /** A food id, or `RECIPE_RATING_KEY`. */
  key: string;
  label: string;
  value: number | null;
}

/**
 * Item 574: which star rows a meal shows. A recipe meal is rated once, as the
 * recipe; a loose-food meal once per food, in the order its foods are shown.
 */
export function mealRatingRows(
  recipe: { title: string; rating: number | null } | null,
  foods: readonly { id: string; name: string }[],
  foodRatings: Readonly<Record<string, number | null>>,
): MealRatingRow[] {
  if (recipe) return [{ key: RECIPE_RATING_KEY, label: recipe.title, value: recipe.rating }];
  return foods.map((food) => ({ key: food.id, label: food.name, value: foodRatings[food.id] ?? null }));
}

/**
 * The rating half of a meal save, for the rows the parent can see: the recipe
 * on a recipe meal, every current food (null = cleared or never rated) on a
 * loose-food meal. The server refuses a rating that does not fit the meal, so
 * the other kind is never sent — and the server itself drops the other
 * kind's stored ratings when an edit switches the meal between the two.
 */
export function mealRatingsInput(
  recipeId: string | null,
  foodIds: readonly string[],
  foodRatings: Readonly<Record<string, number | null>>,
  recipeRating: number | null,
): { foodRatings?: Record<string, number | null>; recipeRating?: number | null } {
  if (recipeId) return { recipeRating };
  return { foodRatings: Object.fromEntries(foodIds.map((id) => [id, foodRatings[id] ?? null])) };
}

/**
 * The "Rating (optional)" block: a heading, then one labelled star row per
 * `mealRatingRows` entry. Sits ABOVE the reaction note on the log form and on
 * the meal page.
 */
export function MealRatingsField({
  rows,
  onChange,
  disabled,
}: {
  rows: MealRatingRow[];
  onChange: (key: string, value: number | null) => void;
  disabled?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div role="group" aria-labelledby="meal-ratings-heading" className="flex flex-col gap-1">
      <span id="meal-ratings-heading" className="text-sm font-semibold text-[var(--color-text)]">
        Rating (optional)
      </span>
      {rows.map((row) => (
        <div key={row.key} className="flex flex-col">
          <span className="text-sm text-[var(--color-text-muted)]">{row.label}</span>
          <StarRating
            label={`Rating for ${row.label}`}
            value={row.value}
            onChange={(value) => onChange(row.key, value)}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}
