import { useEffect, useMemo, useRef, useState } from "react";
import type { CreateFridgeItemInput, MealItem, FridgeLocation } from "@blw/shared";
import { useFoods, useRecipe } from "../../catalog/hooks.js";
import { FoodPicker, foodPickerOption } from "../../catalog/components/FoodPicker.js";
import { RecipePicker } from "../../catalog/components/RecipePicker.js";
import { useCreateMeal, useUpdateMeal } from "../hooks.js";
import { applyRecipeIngredients, recipeIngredientFoodIds } from "../recipeChips.js";
import { useCreateFridgeItem } from "../../fridge/hooks.js";
import { LOCATIONS } from "../../fridge/format.js";
import { Field } from "../../../components/ui/Field.js";
import { Input, Textarea } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl.js";
import { DateField } from "../../../components/ui/DateField.js";
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { Switch } from "../../../components/ui/Switch.js";
import { type MultiComboboxOption } from "../../../components/ui/MultiCombobox.js";
import { Button } from "../../../components/ui/Button.js";
import { useSubmitValidation, type FormErrors } from "../../../lib/forms.js";

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

/**
 * What the "+ Save leftovers to fridge" toggle should show, inferred from
 * the meal being logged (item 152): a recipe wins outright when one is
 * selected (its ingredients are the leftovers, even if the user has also
 * tweaked the food chips); with no recipe, exactly one selected food is
 * unambiguous; two or more (or zero, though the toggle is disabled at zero
 * — see `LogFoodForm`) require the parent to pick which food the leftovers
 * came from via a compact select.
 */
export type LeftoverSourceKind = { kind: "recipe" } | { kind: "food"; foodId: string } | { kind: "choose" };

export function resolveLeftoverSource(recipeId: string | null, foodIds: string[]): LeftoverSourceKind {
  if (recipeId) return { kind: "recipe" };
  if (foodIds.length === 1) return { kind: "food", foodId: foodIds[0]! };
  return { kind: "choose" };
}

/** The leftover source once fully resolved (a "choose" kind picks a concrete
 * foodId before this point) — what `buildLeftoverFridgeInput` actually needs. */
export type ResolvedLeftoverSource = { kind: "recipe"; recipeId: string } | { kind: "food"; foodId: string };

/**
 * Builds the `createFridgeItem` payload for a leftovers-from-this-meal save
 * (item 153): recipe-sourced carries `recipeId`, food-sourced carries
 * `foodIds: [foodId]` — never both. `notes`/`quantityNote` are deliberately
 * omitted (not auto-copied from the meal) rather than sent as `null`/`""`,
 * so the fridge item starts with none of its own. Pure so the exact payload
 * shape — and the recipe/food branch split — is mutation-tested without a
 * DOM environment.
 */
export function buildLeftoverFridgeInput(
  source: ResolvedLeftoverSource,
  location: FridgeLocation,
  servingsTotal: string,
  bestBy: string,
  preparedAt: Date = nowAtMinute(),
): CreateFridgeItemInput {
  const trimmedServings = servingsTotal.trim();
  return {
    ...(source.kind === "recipe" ? { recipeId: source.recipeId } : { foodIds: [source.foodId] }),
    location,
    preparedAt: preparedAt.toISOString(),
    servingsTotal: trimmedServings ? Number(trimmedServings) : undefined,
    bestBy: bestBy || undefined,
  };
}

const LEFTOVER_LOCATION_OPTIONS = LOCATIONS.map((loc) => ({ value: loc.value, label: loc.label, icon: null }));

export interface LeftoversFieldsProps {
  source: LeftoverSourceKind;
  /** The meal's currently selected foods, for the "choose" select — same
   * emoji + name idiom as the recipe select and the food combobox's chips. */
  selectedFoodOptions: MultiComboboxOption[];
  chosenFoodId: string;
  onChosenFoodIdChange: (foodId: string) => void;
  location: FridgeLocation;
  onLocationChange: (location: FridgeLocation) => void;
  servingsTotal: string;
  onServingsTotalChange: (value: string) => void;
  bestBy: string;
  onBestByChange: (value: string) => void;
}

/**
 * The expanded controls behind "+ Save leftovers to fridge": a "Which
 * food?" select (only when the source is ambiguous — see
 * `resolveLeftoverSource`), the location segments, and the same optional
 * servings/best-by fields `AddFridgeItemForm` uses. Exported standalone so
 * it can be render-tested directly (item 154) without needing DOM
 * interaction to expand the toggle first.
 */
export function LeftoversFields({
  source,
  selectedFoodOptions,
  chosenFoodId,
  onChosenFoodIdChange,
  location,
  onLocationChange,
  servingsTotal,
  onServingsTotalChange,
  bestBy,
  onBestByChange,
}: LeftoversFieldsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
      {source.kind === "choose" && (
        <Field label="Which food?" htmlFor="log-food-leftover-source">
          <Select
            id="log-food-leftover-source"
            value={chosenFoodId}
            onChange={(e) => onChosenFoodIdChange(e.target.value)}
          >
            {selectedFoodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.emoji ? `${option.emoji} ` : ""}
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-[var(--color-text)]">Location</span>
        <SegmentedControl
          aria-label="Location"
          value={location}
          onChange={onLocationChange}
          options={LEFTOVER_LOCATION_OPTIONS}
        />
      </div>

      <Field label="Total servings (optional)" htmlFor="log-food-leftover-servings">
        <Input
          id="log-food-leftover-servings"
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={servingsTotal}
          onChange={(e) => onServingsTotalChange(e.target.value)}
          placeholder="e.g. 6"
        />
      </Field>

      <Field label="Best by (optional)" htmlFor="log-food-leftover-best-by">
        <DateField id="log-food-leftover-best-by" value={bestBy} onChange={onBestByChange} allowFuture title="Best by" />
      </Field>
    </div>
  );
}

export interface LogFoodFormProps {
  babyId: string;
  /** Present in edit mode: prefills every field from this meal, and Save
   * issues a PATCH against it instead of creating a new one. */
  meal?: MealItem;
  onDone: () => void;
  /** Create-mode prefill (e.g. "Log meal" from a food's detail page seeds
   * that food); ignored when editing an existing meal. */
  initialFoodIds?: string[];
  /** Create-mode prefill for the recipe ("Log meal" from a recipe page, i.e.
   * `/log-meal?recipe=<id>` — item 213); ignored when editing. Its
   * ingredients fan out into food chips exactly as a hand-picked recipe's do. */
  initialRecipeId?: string;
}

/**
 * The quick-log form: pick foods (and optionally a recipe, whose ingredients
 * add themselves as removable chips), a served-at time, and an optional
 * reaction note. Rendered full-screen by LogFoodPage, which passes the
 * page's own back-navigation as `onDone` for both success and Cancel, and
 * which also supplies `meal` when the page was opened in edit mode
 * (`/log-meal?edit=:id`).
 *
 * The recipe field is a searchable single-select over every recipe the
 * parent can see — catalog and their own, favorites floated to the top
 * (item 213). It replaced a `Select` of favorited recipes only, which was a
 * workaround for there being no recipes endpoint and which quietly made a
 * just-written custom recipe unloggable until it had been favorited.
 * `RecipeDetail` (fetched on selection via `useRecipe`, since the list
 * carries no quantities) still supplies the ingredients to turn into chips.
 */
/**
 * What a submit gesture may do once a create-mode save has progressed.
 * Pure and exported so the no-double-meal guarantee is pinned by tests:
 * after the meal has been created, NO submit path may ever return "create"
 * again — only a fridge retry (when the leftovers half failed) or nothing.
 * Consumed verbatim by handleSubmit AND handleRetryFridge; any inline
 * branching around it re-opens the double-meal bug (implicit form
 * submission via Enter reaches handleSubmit even while the submit button
 * is unmounted).
 */
export function resolveSubmitAction(
  mealSaved: boolean,
  fridgeFailurePending: boolean,
): "create" | "retry-fridge" | "noop" {
  if (!mealSaved) return "create";
  return fridgeFailurePending ? "retry-fridge" : "noop";
}

export type LogFoodField = "foods";
export type LogFoodErrors = FormErrors<LogFoodField>;

/** Visual field order — what a failed submit focuses first (item 235). */
export const LOG_FOOD_FIELD_ORDER: readonly LogFoodField[] = ["foods"];

/**
 * The log form's required-field rules (item 235). Only the food list is
 * required: "When" is seeded with the current minute and can never be empty,
 * the recipe is optional, and every leftovers control either defaults or is
 * gated behind at least one food.
 *
 * An empty object means valid — same reading as `validateCustomFood`.
 */
export function validateLogFood(values: { foodIds: string[] }): LogFoodErrors {
  const errors: LogFoodErrors = {};
  if (values.foodIds.length === 0) errors.foods = "Add at least one food";
  return errors;
}

export function LogFoodForm({ babyId, meal, onDone, initialFoodIds, initialRecipeId }: LogFoodFormProps) {
  // `FoodPicker` owns the food combobox (and its own `useFoods()` — the same
  // query key, so this shares one fetch with it). The list is still read here
  // for the two things the picker doesn't own: mapping a recipe's ingredient
  // slugs to food ids, and the leftovers "which food?" select's options.
  const { data: foodsData } = useFoods();
  const createMeal = useCreateMeal(babyId);
  const updateMeal = useUpdateMeal(babyId);
  const isEditing = Boolean(meal);

  const [foodIds, setFoodIds] = useState<string[]>(() => meal?.foods.map((food) => food.id) ?? initialFoodIds ?? []);
  const [recipeId, setRecipeId] = useState<string>(() => meal?.recipeId ?? initialRecipeId ?? "");
  const [servedAt, setServedAt] = useState(() => (meal ? nowAtMinute(new Date(meal.servedAt)) : nowAtMinute()));
  const [reactionNote, setReactionNote] = useState(() => meal?.reactionNote ?? "");
  const [notes, setNotes] = useState(() => meal?.notes ?? "");

  // Leftovers-to-fridge (items 152-153) — create mode only; `isEditing` gates
  // every bit of this out of edit-mode renders entirely.
  const [leftoversOpen, setLeftoversOpen] = useState(false);
  const [leftoverLocation, setLeftoverLocation] = useState<FridgeLocation>("fridge");
  const [leftoverServingsTotal, setLeftoverServingsTotal] = useState("");
  const [leftoverBestBy, setLeftoverBestBy] = useState("");
  const [chosenLeftoverFoodIdState, setChosenLeftoverFoodId] = useState("");
  const [fridgeFailure, setFridgeFailure] = useState<CreateFridgeItemInput | null>(null);
  const createFridgeItem = useCreateFridgeItem();
  // Belt-and-suspenders guard (the Retry button already only ever calls
  // `saveFridge`, never a meal mutation): once the meal itself has saved,
  // nothing in this component may create a second one — Retry re-attempts
  // the fridge item alone against the already-created meal.
  const mealSavedRef = useRef(false);

  const foods = foodsData?.foods ?? [];
  const { data: recipeDetail } = useRecipe(recipeId || undefined);

  const foodOptions: MultiComboboxOption[] = useMemo(() => foods.map(foodPickerOption), [foods]);
  const slugToFoodId = useMemo(() => new Map(foods.map((food) => [food.slug, food.id])), [foods]);

  const leftoverSource = resolveLeftoverSource(recipeId || null, foodIds);
  const selectedFoodOptions = useMemo(
    () => foodOptions.filter((option) => foodIds.includes(option.value)),
    [foodOptions, foodIds],
  );
  // The "choose" select's effective value: the user's own pick once made,
  // else the first selected food (so the native <select> never opens on a
  // blank/invalid value while still requiring a real user choice to submit
  // anything other than that default).
  const chosenLeftoverFoodId = chosenLeftoverFoodIdState || foodIds[0] || "";

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

  // Item 235: Save stays enabled, "Add at least one food" appears under the
  // food picker on a failed submit, and that submit focuses it.
  const { errors: shownErrors, attemptSubmit } = useSubmitValidation(
    { foodIds },
    validateLogFood,
    LOG_FOOD_FIELD_ORDER,
    { foods: "log-food-food" },
  );

  /** Resolves `leftoverSource`'s "choose" branch to a concrete food, using
   * the select's effective value — the only place a `LeftoverSourceKind`
   * becomes a `ResolvedLeftoverSource` ready for `buildLeftoverFridgeInput`. */
  function resolveFinalLeftoverSource(): ResolvedLeftoverSource | null {
    if (leftoverSource.kind === "recipe") return recipeId ? { kind: "recipe", recipeId } : null;
    if (leftoverSource.kind === "food") return { kind: "food", foodId: leftoverSource.foodId };
    return chosenLeftoverFoodId ? { kind: "food", foodId: chosenLeftoverFoodId } : null;
  }

  /** Attempts the fridge half of a leftovers save; both success and Retry
   * (item 153) funnel through here so they behave identically. Never touches
   * the meal mutation — see `mealSavedRef`. */
  function saveFridge(input: CreateFridgeItemInput) {
    createFridgeItem.mutate(input, {
      onSuccess: () => {
        setFridgeFailure(null);
        onDone();
      },
      onError: () => {
        setFridgeFailure(input);
      },
    });
  }

  function handleRetryFridge() {
    if (resolveSubmitAction(mealSavedRef.current, fridgeFailure !== null) !== "retry-fridge") return;
    saveFridge(fridgeFailure!);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Implicit submission (Enter in the food box) reaches here even while
    // the failure banner has unmounted the submit button — route it through
    // the same guarded decision as everything else.
    const postSave = resolveSubmitAction(mealSavedRef.current, fridgeFailure !== null);
    if (postSave === "retry-fridge") {
      saveFridge(fridgeFailure!);
      return;
    }
    if (postSave === "noop") return;
    if (mutation.isPending) return;
    if (!attemptSubmit()) return;
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
      case "create": {
        const finalSource = leftoversOpen ? resolveFinalLeftoverSource() : null;
        createMeal.mutate(action.input, {
          onSuccess: () => {
            mealSavedRef.current = true;
            if (!finalSource) {
              onDone();
              return;
            }
            saveFridge(buildLeftoverFridgeInput(finalSource, leftoverLocation, leftoverServingsTotal, leftoverBestBy));
          },
        });
        break;
      }
    }
  }

  return (
    // `noValidate`: this form answers its own required field inline (item 236).
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <Field label="Food" htmlFor="log-food-food" error={shownErrors.foods}>
        <FoodPicker id="log-food-food" value={foodIds} onChange={setFoodIds} />
      </Field>

      <Field label="Recipe (optional)" htmlFor="log-food-recipe">
        <RecipePicker id="log-food-recipe" value={recipeId} onChange={handleRecipeChange} />
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

      {!isEditing && !fridgeFailure && (
        <div className="flex flex-col gap-3">
          {/* Borderless row + switch: a bordered container read as a tappable
              card (user feedback), and a checkbox read as form data — a
              switch says "on/off decision" without the card costume. */}
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span id="log-food-leftovers-label" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <span aria-hidden="true" className="text-lg leading-none">🧊</span>
              Save leftovers to fridge
            </span>
            <Switch
              checked={leftoversOpen}
              disabled={foodIds.length === 0}
              onChange={setLeftoversOpen}
              aria-label="Save leftovers to fridge"
            />
          </div>
          {leftoversOpen && (
            <LeftoversFields
              source={leftoverSource}
              selectedFoodOptions={selectedFoodOptions}
              chosenFoodId={chosenLeftoverFoodId}
              onChosenFoodIdChange={setChosenLeftoverFoodId}
              location={leftoverLocation}
              onLocationChange={setLeftoverLocation}
              servingsTotal={leftoverServingsTotal}
              onServingsTotalChange={setLeftoverServingsTotal}
              bestBy={leftoverBestBy}
              onBestByChange={setLeftoverBestBy}
            />
          )}
        </div>
      )}

      {mutation.isError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}

      {fridgeFailure ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
            Meal saved — couldn't save leftovers. Try again, or close this page to skip it.
          </p>
          {/* Retry only (item 257): the meal itself is already saved, and the
              header's X leaves without retrying. */}
          <Button type="button" size="sm" onClick={handleRetryFridge} disabled={createFridgeItem.isPending}>
            {createFridgeItem.isPending ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : (
        // Save only (item 257): the page's header chevron/X is the way out.
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      )}
    </form>
  );
}
