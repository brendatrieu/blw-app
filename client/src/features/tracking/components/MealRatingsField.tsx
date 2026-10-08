import { StarRating } from "../../../components/ui/StarRating.js";
import { OptionalLabel } from "../../../components/ui/Field.js";

/** The key of the one row a recipe meal has. Never a food id (those are uuids). */
export const RECIPE_RATING_KEY = "recipe";

export interface MealRatingRow {
  /** A food id, `RECIPE_RATING_KEY`, or `RECIPE_ROW_PREFIX` + a recipe id. */
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

/** Ledger 759/760: a recipe's star row key, kept apart from food ids (both
 * are uuids) on forms that rate several recipes. */
export const RECIPE_ROW_PREFIX = "recipe:";

/**
 * Ledger 759: the Log meal / Edit meal star rows, by DESIGN-B §2's one rule.
 * One row per picked recipe, in pick order, then one per food that can be
 * rated on its own:
 *
 *   rateable(f) = f is not an ingredient of the picked recipes (F)
 *                 OR (the saved meal already rates f AND no recipe this edit
 *                     adds (A = picked − saved) lists it)
 *
 * so a food the server would refuse never gets stars, and a rating stored on
 * a food that has since become an ingredient stays visible and editable.
 * `ingredientsByRecipe` holds the picked recipes whose ingredients have
 * loaded; while any is missing no food row shows, since a guess could let
 * the parent rate a food the server then refuses (the Serve sheet's rule).
 */
export function mealFormRatingRows(
  recipes: readonly { id: string; title: string }[],
  foods: readonly { id: string; name: string }[],
  ingredientsByRecipe: ReadonlyMap<string, readonly string[]>,
  savedRecipeIds: readonly string[],
  storedFoodRatings: Readonly<Record<string, number | null | undefined>>,
  ratings: Readonly<Record<string, number | null>>,
): MealRatingRow[] {
  const rows: MealRatingRow[] = recipes.map((recipe) => ({
    key: `${RECIPE_ROW_PREFIX}${recipe.id}`,
    label: recipe.title,
    value: ratings[`${RECIPE_ROW_PREFIX}${recipe.id}`] ?? null,
  }));
  if (recipes.some((recipe) => !ingredientsByRecipe.has(recipe.id))) return rows;
  const ingredientsOf = (list: readonly { id: string }[]) =>
    new Set(list.flatMap((recipe) => ingredientsByRecipe.get(recipe.id) ?? []));
  const inPicked = ingredientsOf(recipes);
  const inAdded = ingredientsOf(recipes.filter((recipe) => !savedRecipeIds.includes(recipe.id)));
  for (const food of foods) {
    if (inPicked.has(food.id) && (storedFoodRatings[food.id] == null || inAdded.has(food.id))) continue;
    rows.push({ key: food.id, label: food.name, value: ratings[food.id] ?? null });
  }
  return rows;
}

/**
 * The rating half of a Log meal / Edit meal save (ledger 759), read off the
 * VISIBLE rows: every one is sent, `null` included, so an edit can clear a
 * star. A food with no row is never sent — the server keeps (or, for an
 * ingredient of a recipe this edit adds, clears) its stored value.
 */
export function mealFormRatingsInput(rows: readonly MealRatingRow[]): {
  recipeRatings: Record<string, number | null>;
  foodRatings: Record<string, number | null>;
} {
  const recipeRatings: Record<string, number | null> = {};
  const foodRatings: Record<string, number | null> = {};
  for (const row of rows) {
    if (row.key.startsWith(RECIPE_ROW_PREFIX)) recipeRatings[row.key.slice(RECIPE_ROW_PREFIX.length)] = row.value;
    else foodRatings[row.key] = row.value;
  }
  return { recipeRatings, foodRatings };
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
      <span id="meal-ratings-heading" className="text-sm font-medium text-[var(--color-text)]">
        <OptionalLabel label="Rating (optional)" />
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
