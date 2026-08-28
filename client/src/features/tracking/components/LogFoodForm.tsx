import { useEffect, useMemo, useRef, useState } from "react";
import type { MealItem } from "@blw/shared";
import { useFoods, useRecipe } from "../../catalog/hooks.js";
import { getFoodEmoji } from "../../catalog/foodEmoji.js";
import { useCreateMeal, useFavorites, useUpdateMeal } from "../hooks.js";
import { applyRecipeIngredients, recipeIngredientFoodIds } from "../recipeChips.js";
import { Field } from "../../../components/ui/Field.js";
import { Textarea } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { MultiCombobox, type MultiComboboxOption } from "../../../components/ui/MultiCombobox.js";
import { Button } from "../../../components/ui/Button.js";

/** The submit payload shape shared by both create and update — same fields
 * either way, so `resolveMealSubmit` differs only in which mutation (and id)
 * consumes it, never in the input's shape. */
export interface MealSubmitInput {
  foodIds: string[];
  recipeId: string | null;
  servedAt: string;
  reactionNote: string | null;
  /** General note, distinct from `reactionNote` — see `optionalNotes` in shared/tracking. */
  notes: string | null;
}

export type MealSubmitAction =
  | { kind: "create"; input: MealSubmitInput }
  | { kind: "update"; id: string; input: MealSubmitInput };

/**
 * Pure edit-vs-create decision for the log form's submit, mirroring
 * `resolveEnterAction`'s pattern (MultiCombobox.tsx): the handler calls this
 * and switches on `kind` verbatim, so the branch itself can never silently
 * collapse to always-create. A present `mealId` (edit mode) means PATCH that
 * meal; its absence means POST a new one — this is the only place that
 * decision is made.
 */
export function resolveMealSubmit(mealId: string | undefined, input: MealSubmitInput): MealSubmitAction {
  return mealId ? { kind: "update", id: mealId, input } : { kind: "create", input };
}

export interface LogFoodFormProps {
  babyId: string;
  /** Present in edit mode: prefills every field from this meal, and Save
   * issues a PATCH against it instead of creating a new one. */
  meal?: MealItem;
  onDone: () => void;
}

/**
 * The quick-log form: pick foods (and optionally a recipe, whose ingredients
 * add themselves as removable chips), a served-at time, and an optional
 * reaction note. Rendered full-screen by LogFoodPage, which passes the
 * page's own back-navigation as `onDone` for both success and Cancel, and
 * which also supplies `meal` when the page was opened in edit mode
 * (`/log-meal?edit=:id`).
 *
 * There's no standalone "list recipes" endpoint (same gap the pantry "from a
 * recipe" picker works around — see AddPantryItemForm), so the recipe
 * `Select`'s options are the user's favorited recipes; `RecipeDetail`
 * (fetched on selection via `useRecipe`, since the favorites list itself
 * carries no ingredients) supplies the ingredient list to turn into chips.
 */
export function LogFoodForm({ babyId, meal, onDone }: LogFoodFormProps) {
  const { data: foodsData, isLoading: foodsLoading } = useFoods();
  const { data: favoritesData, isLoading: favoritesLoading } = useFavorites();
  const createMeal = useCreateMeal(babyId);
  const updateMeal = useUpdateMeal(babyId);
  const isEditing = Boolean(meal);

  const [foodIds, setFoodIds] = useState<string[]>(() => meal?.foods.map((food) => food.id) ?? []);
  const [recipeId, setRecipeId] = useState<string>(() => meal?.recipeId ?? "");
  const [servedAt, setServedAt] = useState(() => (meal ? nowAtMinute(new Date(meal.servedAt)) : nowAtMinute()));
  const [reactionNote, setReactionNote] = useState(() => meal?.reactionNote ?? "");
  const [notes, setNotes] = useState(() => meal?.notes ?? "");

  const foods = foodsData?.foods ?? [];
  const favorites = favoritesData?.items ?? [];
  const { data: recipeDetail } = useRecipe(recipeId || undefined);

  const foodOptions: MultiComboboxOption[] = useMemo(
    () => foods.map((food) => ({ value: food.id, label: food.name, emoji: getFoodEmoji(food.slug, food.category) })),
    [foods],
  );
  const slugToFoodId = useMemo(() => new Map(foods.map((food) => [food.slug, food.id])), [foods]);

  // Tracks which currently-selected foods came from the active recipe (so
  // clearing/switching removes exactly those, per `applyRecipeIngredients`)
  // without needing a re-render to read it, and independent of the
  // async `recipeDetail` fetch's own lifecycle. A ref, not state: updating it
  // must never itself trigger the effect below.
  const appliedRecipeFoodIdsRef = useRef<string[]>([]);
  // Edit mode can open with a recipe already attached to the meal. The first
  // time that recipe's ingredients resolve, they're adopted as the tracked
  // "recipe-owned" set silently (no foodIds change) — the meal's saved foods
  // are already correct and must not be second-guessed against a recipe that
  // may have been edited, or had extras removed, since this meal was logged.
  // Any later resolution (a real user selection) applies the merge normally.
  const initialMealRecipeId = meal?.recipeId ?? null;
  const hasAdoptedInitialRecipeRef = useRef(false);

  useEffect(() => {
    if (!recipeId || !recipeDetail || recipeDetail.id !== recipeId) return;
    const nextIds = recipeIngredientFoodIds(recipeDetail.ingredients, slugToFoodId);
    const previous = appliedRecipeFoodIdsRef.current;
    const alreadyApplied = nextIds.length === previous.length && nextIds.every((id, index) => id === previous[index]);
    if (alreadyApplied) return;

    const isInitialAdopt = !hasAdoptedInitialRecipeRef.current && recipeId === initialMealRecipeId;
    hasAdoptedInitialRecipeRef.current = true;
    appliedRecipeFoodIdsRef.current = nextIds;
    if (!isInitialAdopt) {
      setFoodIds((current) => applyRecipeIngredients(current, previous, nextIds));
    }
  }, [recipeId, recipeDetail, slugToFoodId, initialMealRecipeId]);

  function handleRecipeChange(nextRecipeId: string) {
    setRecipeId(nextRecipeId);
    if (nextRecipeId === "") {
      setFoodIds((current) => applyRecipeIngredients(current, appliedRecipeFoodIdsRef.current, []));
      appliedRecipeFoodIdsRef.current = [];
      hasAdoptedInitialRecipeRef.current = true;
    }
  }

  const mutation = isEditing ? updateMeal : createMeal;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (foodIds.length === 0) return;
    const input: MealSubmitInput = {
      foodIds,
      recipeId: recipeId || null,
      servedAt: servedAt.toISOString(),
      reactionNote: reactionNote.trim() || null,
      notes: notes.trim() || null,
    };
    const action = resolveMealSubmit(meal?.id, input);
    switch (action.kind) {
      case "update":
        updateMeal.mutate({ id: action.id, input: action.input }, { onSuccess: onDone });
        break;
      case "create":
        createMeal.mutate(action.input, { onSuccess: onDone });
        break;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field label="Food" htmlFor="log-food-food">
        <MultiCombobox
          id="log-food-food"
          options={foodOptions}
          value={foodIds}
          onChange={setFoodIds}
          disabled={foodsLoading}
          placeholder={foodsLoading ? "Loading foods…" : "Search foods…"}
        />
      </Field>

      <Field label="Recipe (optional)" htmlFor="log-food-recipe">
        {!favoritesLoading && favorites.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            No favorited recipes yet — favorite one from its recipe page to add it here.
          </p>
        ) : (
          <Select
            id="log-food-recipe"
            value={recipeId}
            onChange={(e) => handleRecipeChange(e.target.value)}
            disabled={favoritesLoading}
          >
            <option value="">{favoritesLoading ? "Loading recipes…" : "None"}</option>
            {favorites.map((recipe) => (
              <option key={recipe.recipeId} value={recipe.recipeId}>
                {recipe.title}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="When" htmlFor="log-food-when">
        <DateTimeField id="log-food-when" value={servedAt} onChange={setServedAt} />
      </Field>

      <Field label="Reaction note (optional)" htmlFor="log-food-note">
        <Textarea
          id="log-food-note"
          value={reactionNote}
          onChange={(e) => setReactionNote(e.target.value)}
          rows={2}
          placeholder="e.g. mild rash around mouth"
        />
      </Field>

      <Field label="Notes (optional)" htmlFor="log-food-notes">
        <Textarea
          id="log-food-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. ate the whole thing"
        />
      </Field>

      {mutation.isError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={foodIds.length === 0 || mutation.isPending} className="flex-1">
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
