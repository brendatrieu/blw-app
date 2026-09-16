import { useEffect, useMemo, useRef, useState } from "react";
import type { CreateStorageItemInput, MealItem, StorageLocation } from "@blw/shared";
import { useFoods, useRecipe } from "../../catalog/hooks.js";
import { FoodPicker } from "../../catalog/components/FoodPicker.js";
import { RecipePicker } from "../../catalog/components/RecipePicker.js";
import { useCreateMeal, useUpdateMeal } from "../hooks.js";
import { applyRecipeIngredients, recipeIngredientFoodIds } from "../recipeChips.js";
import { useCreateStorageItem } from "../../storage/hooks.js";
import { LOCATIONS, offersContainerChoice, type ContainerChoice } from "../../storage/format.js";
import { ContainerChoiceField } from "../../storage/components/ContainerChoiceField.js";
import { BEST_BY_BEFORE_PREPARED_MESSAGE, isBestByBeforePrepared } from "../../storage/freshness.js";
import { Field } from "../../../components/ui/Field.js";
import { Input, Textarea } from "../../../components/ui/Input.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl.js";
import { DateField } from "../../../components/ui/DateField.js";
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { Switch } from "../../../components/ui/Switch.js";
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
 * What the "+ Save leftovers to storage" toggle saves, inferred from the meal
 * being logged (item 152): a recipe wins outright when one is selected (its
 * ingredients are the leftovers, even if the user has also tweaked the food
 * chips); otherwise it is EVERY selected food.
 *
 * There is no third "which one?" branch any more (item 348). A container
 * holds a whole meal now, so a three-food meal's leftovers are one container
 * of three foods — the question the old "Which food?" select asked (and made
 * the parent answer by throwing two of the three away) no longer has a
 * reason to exist. What replaces it is a choice the parent may ignore: one
 * container, or one per food.
 */
export type LeftoverSourceKind = { kind: "recipe" } | { kind: "foods"; foodIds: string[] };

export function resolveLeftoverSource(recipeId: string | null, foodIds: string[]): LeftoverSourceKind {
  if (recipeId) return { kind: "recipe" };
  return { kind: "foods", foodIds };
}

/** The leftover source once the recipe branch has its concrete id attached —
 * what `buildLeftoverStorageInput` actually needs. */
export type ResolvedLeftoverSource = { kind: "recipe"; recipeId: string } | { kind: "foods"; foodIds: string[] };

/**
 * Builds the `createStorageItem` payload for a leftovers-from-this-meal save
 * (item 153): recipe-sourced carries `recipeId`, food-sourced carries EVERY
 * selected food's id (item 348) — never both. `notes`/`quantityNote` are
 * deliberately omitted (not auto-copied from the meal) rather than sent as
 * `null`/`""`, so the storage item starts with none of its own. Pure so the
 * exact payload shape — and the recipe/foods branch split — is
 * mutation-tested without a DOM environment.
 *
 * `separateItems` rides along only where the control that sets it is
 * actually shown (`offersContainerChoice`): with one food it is meaningless,
 * and a flag left over from a food the parent has since removed must not
 * reach the server.
 */
export function buildLeftoverStorageInput(
  source: ResolvedLeftoverSource,
  location: StorageLocation,
  servingsTotal: string,
  bestBy: string,
  separateItems = false,
  preparedAt: Date = nowAtMinute(),
): CreateStorageItemInput {
  const trimmedServings = servingsTotal.trim();
  return {
    ...(source.kind === "recipe"
      ? { recipeId: source.recipeId }
      : {
          foodIds: source.foodIds,
          ...(offersContainerChoice(source.foodIds) ? { separateItems } : {}),
        }),
    location,
    preparedAt: preparedAt.toISOString(),
    servingsTotal: trimmedServings ? Number(trimmedServings) : undefined,
    bestBy: bestBy || undefined,
  };
}

const LEFTOVER_LOCATION_OPTIONS = LOCATIONS.map((loc) => ({ value: loc.value, label: loc.label, icon: null }));

export interface LeftoversFieldsProps {
  source: LeftoverSourceKind;
  /** "One container" or "Separate containers" — only ever asked, and only
   * ever read, when the source is two or more foods. */
  containerChoice: ContainerChoice;
  onContainerChoiceChange: (choice: ContainerChoice) => void;
  location: StorageLocation;
  onLocationChange: (location: StorageLocation) => void;
  servingsTotal: string;
  onServingsTotalChange: (value: string) => void;
  bestBy: string;
  onBestByChange: (value: string) => void;
  /** The "Best by can't be before the prepared date" message, once a failed
   * submit has earned it — see `validateLogFood`. */
  bestByError?: string;
}

/**
 * The expanded controls behind "+ Save leftovers to storage": the "Save as"
 * choice (only with two or more foods — see `offersContainerChoice`), the
 * location segments, and the same optional servings/best-by fields
 * `AddStorageItemForm` uses. Exported standalone so it can be render-tested
 * directly (item 154) without needing DOM interaction to expand the toggle
 * first.
 */
export function LeftoversFields({
  source,
  containerChoice,
  onContainerChoiceChange,
  location,
  onLocationChange,
  servingsTotal,
  onServingsTotalChange,
  bestBy,
  onBestByChange,
  bestByError,
}: LeftoversFieldsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
      {source.kind === "foods" && (
        <ContainerChoiceField
          foodIds={source.foodIds}
          value={containerChoice}
          onChange={onContainerChoiceChange}
        />
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

      <Field label="Best by (optional)" htmlFor="log-food-leftover-best-by" error={bestByError}>
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
 * again — only a storage retry (when the leftovers half failed) or nothing.
 * Consumed verbatim by handleSubmit AND handleRetryStorage; any inline
 * branching around it re-opens the double-meal bug (implicit form
 * submission via Enter reaches handleSubmit even while the submit button
 * is unmounted).
 */
export function resolveSubmitAction(
  mealSaved: boolean,
  storageFailurePending: boolean,
): "create" | "retry-storage" | "noop" {
  if (!mealSaved) return "create";
  return storageFailurePending ? "retry-storage" : "noop";
}

export type LogFoodField = "foods" | "leftoverBestBy";
export type LogFoodErrors = FormErrors<LogFoodField>;

/** Visual field order — what a failed submit focuses first (item 235). The
 * leftovers block sits below the food picker, so it is judged second. */
export const LOG_FOOD_FIELD_ORDER: readonly LogFoodField[] = ["foods", "leftoverBestBy"];

/**
 * The log form's field rules (item 235). Only the food list is REQUIRED:
 * "When" is seeded with the current minute and can never be empty, the
 * recipe is optional, and every leftovers control either defaults or is
 * gated behind at least one food.
 *
 * The leftovers best-by date is optional but, since item 333, decides the
 * storage chip — and these leftovers are prepared NOW, so a date before
 * today would file a just-saved container as expired. Judged only while the
 * leftovers switch is on, for the same reason `validateAddStorageItem`
 * judges only the visible source tab: a value from a block that is closed is
 * not sent either.
 *
 * An empty object means valid — same reading as `validateCustomFood`.
 */
export function validateLogFood(values: {
  foodIds: string[];
  leftoversOpen?: boolean;
  leftoverBestBy?: string;
  /** What the leftovers are prepared at — `buildLeftoverStorageInput`'s own
   * default, i.e. now. Passed explicitly so this stays a pure function. */
  leftoverPreparedAt?: Date;
}): LogFoodErrors {
  const errors: LogFoodErrors = {};
  if (values.foodIds.length === 0) errors.foods = "Add at least one food";
  if (values.leftoversOpen && isBestByBeforePrepared(values.leftoverBestBy, values.leftoverPreparedAt ?? new Date())) {
    errors.leftoverBestBy = BEST_BY_BEFORE_PREPARED_MESSAGE;
  }
  return errors;
}

export function LogFoodForm({ babyId, meal, onDone, initialFoodIds, initialRecipeId }: LogFoodFormProps) {
  // `FoodPicker` owns the food combobox (and its own `useFoods()` — the same
  // query key, so this shares one fetch with it). The list is still read here
  // for the one thing the picker doesn't own: mapping a recipe's ingredient
  // slugs to food ids.
  const { data: foodsData } = useFoods();
  const updateMeal = useUpdateMeal(babyId);
  const isEditing = Boolean(meal);

  const [foodIds, setFoodIds] = useState<string[]>(() => meal?.foods.map((food) => food.id) ?? initialFoodIds ?? []);
  const [recipeId, setRecipeId] = useState<string>(() => meal?.recipeId ?? initialRecipeId ?? "");
  const [servedAt, setServedAt] = useState(() => (meal ? nowAtMinute(new Date(meal.servedAt)) : nowAtMinute()));
  const [reactionNote, setReactionNote] = useState(() => meal?.reactionNote ?? "");
  const [notes, setNotes] = useState(() => meal?.notes ?? "");

  // Leftovers-to-storage (items 152-153) — create mode only; `isEditing` gates
  // every bit of this out of edit-mode renders entirely.
  const [leftoversOpen, setLeftoversOpen] = useState(false);
  const [leftoverLocation, setLeftoverLocation] = useState<StorageLocation>("fridge");
  const [leftoverServingsTotal, setLeftoverServingsTotal] = useState("");
  const [leftoverBestBy, setLeftoverBestBy] = useState("");
  // Item 348: one container is the default — it is what a box of leftovers
  // from one meal actually is, and the parent only has to touch this to say
  // otherwise.
  const [leftoverContainerChoice, setLeftoverContainerChoice] = useState<ContainerChoice>("one");
  const [storageFailure, setStorageFailure] = useState<CreateStorageItemInput | null>(null);
  const createStorageItem = useCreateStorageItem();
  // Declared here, below the leftovers switch, because `meal_logged` carries
  // whether that switch was on — the one thing about a save that neither the
  // route nor the payload can say (item 320).
  const createMeal = useCreateMeal(babyId, { leftoversSaved: leftoversOpen });
  // Belt-and-suspenders guard (the Retry button already only ever calls
  // `saveStorage`, never a meal mutation): once the meal itself has saved,
  // nothing in this component may create a second one — Retry re-attempts
  // the storage item alone against the already-created meal.
  const mealSavedRef = useRef(false);

  const foods = foodsData?.foods ?? [];
  const { data: recipeDetail } = useRecipe(recipeId || undefined);

  const slugToFoodId = useMemo(() => new Map(foods.map((food) => [food.slug, food.id])), [foods]);

  const leftoverSource = resolveLeftoverSource(recipeId || null, foodIds);

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
    { foodIds, leftoversOpen, leftoverBestBy },
    validateLogFood,
    LOG_FOOD_FIELD_ORDER,
    { foods: "log-food-food", leftoverBestBy: "log-food-leftover-best-by" },
  );

  /** Attaches the recipe branch's concrete id — the only place a
   * `LeftoverSourceKind` becomes a `ResolvedLeftoverSource` ready for
   * `buildLeftoverStorageInput`. Null means there is nothing to save, which
   * only the zero-food case can produce (and the toggle is disabled there). */
  function resolveFinalLeftoverSource(): ResolvedLeftoverSource | null {
    if (leftoverSource.kind === "recipe") return recipeId ? { kind: "recipe", recipeId } : null;
    return leftoverSource.foodIds.length > 0 ? { kind: "foods", foodIds: leftoverSource.foodIds } : null;
  }

  /** Attempts the storage half of a leftovers save; both success and Retry
   * (item 153) funnel through here so they behave identically. Never touches
   * the meal mutation — see `mealSavedRef`. */
  function saveStorage(input: CreateStorageItemInput) {
    createStorageItem.mutate(input, {
      onSuccess: () => {
        setStorageFailure(null);
        onDone();
      },
      onError: () => {
        setStorageFailure(input);
      },
    });
  }

  function handleRetryStorage() {
    if (resolveSubmitAction(mealSavedRef.current, storageFailure !== null) !== "retry-storage") return;
    saveStorage(storageFailure!);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Implicit submission (Enter in the food box) reaches here even while
    // the failure banner has unmounted the submit button — route it through
    // the same guarded decision as everything else.
    const postSave = resolveSubmitAction(mealSavedRef.current, storageFailure !== null);
    if (postSave === "retry-storage") {
      saveStorage(storageFailure!);
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
            saveStorage(
              buildLeftoverStorageInput(
                finalSource,
                leftoverLocation,
                leftoverServingsTotal,
                leftoverBestBy,
                leftoverContainerChoice === "separate",
              ),
            );
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

      <Field
        label="Reaction (optional)"
        htmlFor="log-food-note"
        description="Only for hives, vomiting, rash or other reaction signs."
      >
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

      {!isEditing && !storageFailure && (
        <div className="flex flex-col gap-3">
          {/* Borderless row + switch: a bordered container read as a tappable
              card (user feedback), and a checkbox read as form data — a
              switch says "on/off decision" without the card costume. */}
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span id="log-food-leftovers-label" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <span aria-hidden="true" className="text-lg leading-none">📦</span>
              Save leftovers to storage
            </span>
            <Switch
              checked={leftoversOpen}
              disabled={foodIds.length === 0}
              onChange={setLeftoversOpen}
              aria-label="Save leftovers to storage"
            />
          </div>
          {leftoversOpen && (
            <LeftoversFields
              source={leftoverSource}
              containerChoice={leftoverContainerChoice}
              onContainerChoiceChange={setLeftoverContainerChoice}
              location={leftoverLocation}
              onLocationChange={setLeftoverLocation}
              servingsTotal={leftoverServingsTotal}
              onServingsTotalChange={setLeftoverServingsTotal}
              bestBy={leftoverBestBy}
              onBestByChange={setLeftoverBestBy}
              bestByError={shownErrors.leftoverBestBy}
            />
          )}
        </div>
      )}

      {mutation.isError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}

      {storageFailure ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
            Meal saved — couldn't save leftovers. Try again, or close this page to skip it.
          </p>
          {/* Retry only (item 257): the meal itself is already saved, and the
              header's X leaves without retrying. */}
          <Button type="button" size="sm" onClick={handleRetryStorage} disabled={createStorageItem.isPending}>
            {createStorageItem.isPending ? "Retrying…" : "Retry"}
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
