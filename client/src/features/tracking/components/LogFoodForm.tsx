import { useEffect, useMemo, useRef, useState } from "react";
import type { CreateStorageItemInput, MealItem, StorageLocation } from "@blw/shared";
import { useFoods, useRecipeDetails } from "../../catalog/hooks.js";
import { FoodPicker } from "../../catalog/components/FoodPicker.js";
import { RecipePicker } from "../../catalog/components/RecipePicker.js";
import { useCreateMeal, useUpdateMeal } from "../hooks.js";
import {
  addRecipeChips,
  adoptRecipeChips,
  recipeIngredientFoodIds,
  removeRecipeChips,
  type RecipeChipOwners,
} from "../recipeChips.js";
import { mealRecipes } from "../mealRecipes.js";
import { MealRatingsField, RECIPE_ROW_PREFIX, mealFormRatingRows, mealFormRatingsInput } from "./MealRatingsField.js";
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
  /** Ledger 759: the meal's recipes, in the order picked. Always this shape,
   * never the legacy single `recipeId`, so an edit of a several-recipe meal
   * can never meet the server's old-app 409. */
  recipeIds: string[];
  servedAt: string;
  reactionNote: string | null;
  /** General note, distinct from `reactionNote` — see `optionalNotes` in shared/tracking. */
  notes: string | null;
  /** Built by `mealFormRatingsInput` from the visible star rows. */
  recipeRatings: Record<string, number | null>;
  foodRatings: Record<string, number | null>;
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
 * being logged (item 152): the recipes win outright when any is selected
 * (their ingredients are the leftovers, even if the user has also tweaked the
 * food chips); otherwise it is EVERY selected food.
 *
 * There is no third "which one?" branch any more (item 348). A container
 * holds a whole meal now, so a three-food meal's leftovers are one container
 * of three foods — the question the old "Which food?" select asked (and made
 * the parent answer by throwing two of the three away) no longer has a
 * reason to exist. What replaces it is a choice the parent may ignore: one
 * container, or one per food — and, since ledger 759, the same choice for
 * the leftovers of two or more recipes.
 */
export type LeftoverSourceKind = { kind: "recipe"; recipeIds: string[] } | { kind: "foods"; foodIds: string[] };

export function resolveLeftoverSource(recipeIds: string[], foodIds: string[]): LeftoverSourceKind {
  if (recipeIds.length > 0) return { kind: "recipe", recipeIds };
  return { kind: "foods", foodIds };
}

/**
 * Builds the `createStorageItem` payload for a leftovers-from-this-meal save
 * (item 153): one recipe carries `recipeId`, two or more carry `recipeIds`
 * (ledger 759: one container holding them all, or one per recipe),
 * food-sourced carries EVERY selected food's id (item 348) — never both. `notes`/`quantityNote` are
 * deliberately omitted (not auto-copied from the meal) rather than sent as
 * `null`/`""`, so the storage item starts with none of its own. Pure so the
 * exact payload shape — and the recipe/foods branch split — is
 * mutation-tested without a DOM environment.
 *
 * `separateItems` rides along only where the control that sets it is
 * actually shown (`offersContainerChoice`): with one food or one recipe it is
 * meaningless, and a flag left over from a food the parent has since removed
 * must not reach the server.
 */
export function buildLeftoverStorageInput(
  source: LeftoverSourceKind,
  location: StorageLocation,
  servingsTotal: string,
  bestBy: string,
  separateItems = false,
  preparedAt: Date = nowAtMinute(),
): CreateStorageItemInput {
  const trimmedServings = servingsTotal.trim();
  return {
    ...(source.kind === "recipe"
      ? offersContainerChoice(source.recipeIds)
        ? { recipeIds: source.recipeIds, separateItems }
        : { recipeId: source.recipeIds[0]! }
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
   * ever read, when the source is two or more foods or recipes. */
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
 * choice (only with two or more foods or recipes — see
 * `offersContainerChoice`), the
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
      <ContainerChoiceField
        ids={source.kind === "foods" ? source.foodIds : source.recipeIds}
        value={containerChoice}
        onChange={onContainerChoiceChange}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--color-text)]">Location</span>
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
  /** Create-mode prefill for a recipe ("Log meal" from a recipe page, i.e.
   * `/log-meal?recipe=<id>` — item 213); ignored when editing. Its
   * ingredients fan out into food chips exactly as a hand-picked recipe's do. */
  initialRecipeId?: string;
}

/**
 * The quick-log form: pick foods (and optionally recipes, whose ingredients
 * add themselves as removable chips), a served-at time, and an optional
 * reaction note. Rendered full-screen by LogFoodPage, which passes the
 * page's own back-navigation as `onDone` for both success and Cancel, and
 * which also supplies `meal` when the page was opened in edit mode
 * (`/log-meal?edit=:id`).
 *
 * "Recipes (optional)" is a searchable multi-select (ledger 759) over every
 * recipe the parent can see — catalog and their own, favorites floated to
 * the top (item 213). Each pick's `RecipeDetail` (fetched via
 * `useRecipeDetails`, since the list carries no ingredients) supplies the
 * ingredients to turn into chips.
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
  // Ledger 759: the saved meal's recipes (edit mode), first-picked first.
  const savedRecipes = useMemo(() => (meal ? mealRecipes(meal) : []), [meal]);
  const savedRecipeIds = savedRecipes.map((recipe) => recipe.id);
  const [recipeIds, setRecipeIds] = useState<string[]>(() =>
    meal ? mealRecipes(meal).map((recipe) => recipe.id) : initialRecipeId ? [initialRecipeId] : [],
  );
  const [servedAt, setServedAt] = useState(() => (meal ? nowAtMinute(new Date(meal.servedAt)) : nowAtMinute()));
  const [reactionNote, setReactionNote] = useState(() => meal?.reactionNote ?? "");
  const [notes, setNotes] = useState(() => meal?.notes ?? "");
  // Item 574: kept per star-row key (a food id, or `recipe:<id>`), so a chip
  // removed and re-added keeps its stars; only the visible rows are sent.
  const [ratings, setRatings] = useState<Record<string, number | null>>(() => ({
    ...Object.fromEntries((meal?.foods ?? []).map((food) => [food.id, food.rating ?? null])),
    ...Object.fromEntries((meal ? mealRecipes(meal) : []).map((recipe) => [`${RECIPE_ROW_PREFIX}${recipe.id}`, recipe.rating])),
  }));

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
  const recipeDetails = useRecipeDetails(recipeIds);
  const loadedRecipes = recipeDetails.flatMap((query) =>
    query.data && recipeIds.includes(query.data.id) ? [query.data] : [],
  );
  // Editing a meal that holds a food its owner has since deleted: the list no
  // longer offers it, so the picker is handed it to keep showing its chip.
  const keptFoods = useMemo(() => meal?.foods.filter((food) => food.deleted), [meal]);

  const slugToFoodId = useMemo(() => new Map(foods.map((food) => [food.slug, food.id])), [foods]);
  const foodNameById = new Map([...(meal?.foods ?? []), ...foods].map((food) => [food.id, food.name]));
  const recipeTitles = new Map([
    ...savedRecipes.map((recipe) => [recipe.id, recipe.title] as const),
    ...loadedRecipes.map((recipe) => [recipe.id, recipe.title] as const),
  ]);
  const ratingRows = mealFormRatingRows(
    recipeIds.map((id) => ({ id, title: recipeTitles.get(id) ?? "Recipe" })),
    foodIds.flatMap((id) => {
      const name = foodNameById.get(id);
      return name ? [{ id, name }] : [];
    }),
    // Ingredient food ids exactly as the server reads them (DESIGN-B §2).
    new Map(loadedRecipes.map((recipe) => [recipe.id, recipe.ingredients.map((ingredient) => ingredient.foodId)])),
    savedRecipeIds,
    Object.fromEntries((meal?.foods ?? []).map((food) => [food.id, food.rating])),
    ratings,
  );

  function handleRatingChange(key: string, value: number | null) {
    setRatings((current) => ({ ...current, [key]: value }));
  }

  const leftoverSource = resolveLeftoverSource(recipeIds, foodIds);

  // Ledger 759: which foods each picked recipe put on the meal (see
  // recipeChips.ts), so taking a recipe off removes only the foods it alone
  // added. A ref, not state: updating it must never itself re-render.
  const chipOwnersRef = useRef<RecipeChipOwners>({});
  // Edit mode opens with the saved meal's recipes. Each one ADOPTS its
  // ingredients silently when they resolve (no foodIds change) — the saved
  // foods are already correct and must not be second-guessed against a
  // recipe edited since, or re-grow a chip the parent removed. A recipe the
  // parent takes off leaves this set, so picking it again adds as usual.
  const adoptOnLoadRef = useRef<Set<string> | null>(null);
  adoptOnLoadRef.current ??= new Set(savedRecipeIds);

  // Runs after every render and is idempotent: a recipe whose ingredients
  // have landed is handled once (it then has an owners entry). Waits for the
  // foods list, which maps ingredient slugs to selectable food ids.
  // DESIGN-B §6: the saved recipes adopt only once EVERY one still picked has
  // loaded. Adopting one early let it own a food the saved recipes share
  // (Egg), so taking it off dropped that food while the other still loaded.
  // A saved recipe taken off before then owns nothing, so it drops nothing.
  useEffect(() => {
    if (slugToFoodId.size === 0) return;
    const adoptReady = recipeIds.every(
      (id) => !adoptOnLoadRef.current?.has(id) || loadedRecipes.some((recipe) => recipe.id === id),
    );
    let state = { foodIds, owners: chipOwnersRef.current };
    for (const recipe of loadedRecipes) {
      if (recipe.id in state.owners) continue;
      const adopt = adoptOnLoadRef.current?.has(recipe.id);
      if (adopt && !adoptReady) continue;
      const ingredientIds = recipeIngredientFoodIds(recipe.ingredients, slugToFoodId);
      const apply = adopt ? adoptRecipeChips : addRecipeChips;
      state = apply(state.foodIds, state.owners, recipe.id, ingredientIds);
    }
    chipOwnersRef.current = state.owners;
    if (state.foodIds !== foodIds) setFoodIds(state.foodIds);
  });

  function handleRecipesChange(nextRecipeIds: string[]) {
    const removed = recipeIds.filter((id) => !nextRecipeIds.includes(id));
    const remaining = new Map(
      loadedRecipes
        .filter((recipe) => nextRecipeIds.includes(recipe.id))
        .map((recipe) => [recipe.id, recipeIngredientFoodIds(recipe.ingredients, slugToFoodId)]),
    );
    let state = { foodIds, owners: chipOwnersRef.current };
    for (const id of removed) {
      state = removeRecipeChips(state.foodIds, state.owners, id, remaining);
      adoptOnLoadRef.current?.delete(id);
    }
    chipOwnersRef.current = state.owners;
    setFoodIds(state.foodIds);
    setRecipeIds(nextRecipeIds);
    // Item 579: the stars belong to the recipe they were given to — one taken
    // off loses them, and picking it again starts unrated.
    if (removed.length > 0) {
      setRatings((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => !removed.some((id) => key === `${RECIPE_ROW_PREFIX}${id}`)),
        ),
      );
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
      recipeIds,
      servedAt: servedAt.toISOString(),
      reactionNote: reactionNote.trim() || null,
      notes: notes.trim() || null,
      ...mealFormRatingsInput(ratingRows),
    };
    const action = resolveMealSubmit(meal?.id, input);
    switch (action.kind) {
      case "update":
        updateMeal.mutate({ id: action.id, input: action.input }, { onSuccess: onDone });
        break;
      case "create": {
        // Nothing to save only at zero foods and no recipe (the switch is
        // disabled there anyway).
        const finalSource =
          leftoversOpen && (leftoverSource.kind === "recipe" || leftoverSource.foodIds.length > 0) ? leftoverSource : null;
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
        <FoodPicker id="log-food-food" value={foodIds} onChange={setFoodIds} keptFoods={keptFoods} />
      </Field>

      <Field label="Recipes (optional)" htmlFor="log-food-recipe">
        <RecipePicker id="log-food-recipe" multiple value={recipeIds} onChange={handleRecipesChange} />
      </Field>

      <Field label="When" htmlFor="log-food-when">
        <DateTimeField id="log-food-when" value={servedAt} onChange={setServedAt} />
      </Field>

      <MealRatingsField rows={ratingRows} onChange={handleRatingChange} />

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
            <span id="log-food-leftovers-label" className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
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
