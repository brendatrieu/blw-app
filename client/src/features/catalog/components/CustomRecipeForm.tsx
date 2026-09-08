import { useMemo, useState } from "react";
import {
  CUSTOM_RECIPE_EXTRA_INGREDIENT_MAX,
  CUSTOM_RECIPE_EXTRA_INGREDIENTS_MAX,
  CUSTOM_RECIPE_INGREDIENTS_MAX,
  CUSTOM_RECIPE_NOTES_MAX,
  CUSTOM_RECIPE_PREP_MINUTES_MAX,
  CUSTOM_RECIPE_QUANTITY_NOTE_MAX,
  CUSTOM_RECIPE_STEP_MAX,
  CUSTOM_RECIPE_STEPS_MAX,
  CUSTOM_RECIPE_TITLE_MAX,
  type CreateCustomRecipeInput,
  type RecipeDetail,
} from "@blw/shared";
import { CUSTOM_RECIPE_AGE_OPTIONS } from "../constants.js";
import { useCreateCustomRecipe, useFoods, useUpdateCustomRecipe } from "../hooks.js";
import { FoodPicker } from "./FoodPicker.js";
import { Field } from "../../../components/ui/Field.js";
import { Input, Textarea } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Button } from "../../../components/ui/Button.js";

/** The form's own state — everything a control can hold directly, converted
 * to the API's shape by `buildCustomRecipeInput`. */
export interface CustomRecipeValues {
  title: string;
  minAgeMonths: number;
  /** Ingredient food ids, in the order the picker holds them. */
  foodIds: string[];
  /** foodId -> the parent's quantity note; "" is a real answer ("no amount given"). */
  quantityNotes: Record<string, string>;
  extraIngredients: string[];
  /** One entry per step box, blank ones included — `buildCustomRecipeInput` drops those. */
  steps: string[];
  notes: string;
  /** "" = not stated; sent as 0, which the recipe page hides. */
  prepMinutes: string;
}

export type CustomRecipeErrors = Partial<
  Record<"title" | "ingredients" | "extraIngredients" | "steps" | "notes" | "prepMinutes", string>
>;

export const DEFAULT_CUSTOM_RECIPE_AGE_MONTHS = 6;

/**
 * Client-side mirror of `createCustomRecipeSchema`'s rules, per field so each
 * message can sit under the control that caused it — same reasoning (and the
 * same "an empty object means valid") as `validateCustomFood`.
 */
export function validateCustomRecipe(values: CustomRecipeValues): CustomRecipeErrors {
  const errors: CustomRecipeErrors = {};

  const title = values.title.trim();
  if (title.length === 0) errors.title = "Title is required";
  else if (title.length > CUSTOM_RECIPE_TITLE_MAX) {
    errors.title = `Title must be ${CUSTOM_RECIPE_TITLE_MAX} characters or fewer`;
  }

  if (values.foodIds.length === 0) errors.ingredients = "Add at least one ingredient";
  else if (values.foodIds.length > CUSTOM_RECIPE_INGREDIENTS_MAX) {
    errors.ingredients = `A recipe can have at most ${CUSTOM_RECIPE_INGREDIENTS_MAX} ingredients`;
  } else if (values.foodIds.some((id) => (values.quantityNotes[id] ?? "").trim().length > CUSTOM_RECIPE_QUANTITY_NOTE_MAX)) {
    errors.ingredients = `Each quantity must be ${CUSTOM_RECIPE_QUANTITY_NOTE_MAX} characters or fewer`;
  }

  if (values.extraIngredients.length > CUSTOM_RECIPE_EXTRA_INGREDIENTS_MAX) {
    errors.extraIngredients = `At most ${CUSTOM_RECIPE_EXTRA_INGREDIENTS_MAX} extra ingredients`;
  } else if (values.extraIngredients.some((extra) => extra.trim().length > CUSTOM_RECIPE_EXTRA_INGREDIENT_MAX)) {
    errors.extraIngredients = `Each one must be ${CUSTOM_RECIPE_EXTRA_INGREDIENT_MAX} characters or fewer`;
  }

  const steps = values.steps.map((step) => step.trim()).filter((step) => step.length > 0);
  if (steps.length === 0) errors.steps = "Add at least one step";
  else if (steps.length > CUSTOM_RECIPE_STEPS_MAX) {
    errors.steps = `A recipe can have at most ${CUSTOM_RECIPE_STEPS_MAX} steps`;
  } else if (steps.some((step) => step.length > CUSTOM_RECIPE_STEP_MAX)) {
    errors.steps = `Each step must be ${CUSTOM_RECIPE_STEP_MAX} characters or fewer`;
  }

  if (values.notes.trim().length > CUSTOM_RECIPE_NOTES_MAX) {
    errors.notes = `Notes must be ${CUSTOM_RECIPE_NOTES_MAX} characters or fewer`;
  }

  const prep = values.prepMinutes.trim();
  if (prep.length > 0) {
    const minutes = Number(prep);
    if (!Number.isInteger(minutes) || minutes < 0) errors.prepMinutes = "Use a whole number of minutes";
    else if (minutes > CUSTOM_RECIPE_PREP_MINUTES_MAX) {
      errors.prepMinutes = `Prep time must be ${CUSTOM_RECIPE_PREP_MINUTES_MAX} minutes or fewer`;
    }
  }

  return errors;
}

/**
 * The POST/PATCH body for these values. Blank steps and blank extra
 * ingredients are dropped rather than sent (an empty step box is "I haven't
 * filled this in", not a step), every free-text field is trimmed, and blank
 * notes collapse to `null`.
 *
 * `prepMinutes` is ALWAYS sent, as 0 when the field is blank: on a PATCH an
 * absent key leaves the column alone, so an omitted one would make clearing
 * a prep time impossible — and 0 is exactly what "not stated" is stored as.
 */
export function buildCustomRecipeInput(values: CustomRecipeValues): CreateCustomRecipeInput {
  const prep = values.prepMinutes.trim();
  return {
    title: values.title.trim(),
    minAgeMonths: values.minAgeMonths,
    ingredients: values.foodIds.map((foodId) => ({
      foodId,
      quantityNote: (values.quantityNotes[foodId] ?? "").trim(),
    })),
    extraIngredients: values.extraIngredients.map((extra) => extra.trim()).filter((extra) => extra.length > 0),
    steps: values.steps.map((step) => step.trim()).filter((step) => step.length > 0),
    notes: values.notes.trim() || null,
    prepMinutes: prep ? Number(prep) : 0,
  };
}

/** The form's starting values: an existing recipe's own fields when editing,
 * otherwise one empty step and the youngest age. A custom recipe keeps its
 * single set of steps in `variants[0]` (item 203). */
export function initialCustomRecipeValues(recipe?: RecipeDetail): CustomRecipeValues {
  if (!recipe) {
    return {
      title: "",
      minAgeMonths: DEFAULT_CUSTOM_RECIPE_AGE_MONTHS,
      foodIds: [],
      quantityNotes: {},
      extraIngredients: [],
      steps: [""],
      notes: "",
      prepMinutes: "",
    };
  }
  const quantityNotes: Record<string, string> = {};
  for (const ingredient of recipe.ingredients) quantityNotes[ingredient.foodId] = ingredient.quantityNote;
  const steps = recipe.variants[0]?.steps ?? [];
  return {
    title: recipe.title,
    minAgeMonths: recipe.minAgeMonths,
    foodIds: recipe.ingredients.map((ingredient) => ingredient.foodId),
    quantityNotes,
    extraIngredients: [...recipe.extraIngredients],
    steps: steps.length > 0 ? [...steps] : [""],
    notes: recipe.notes ?? "",
    prepMinutes: recipe.prepMinutes > 0 ? String(recipe.prepMinutes) : "",
  };
}

/**
 * What Enter should do inside the free-text "extra ingredients" box.
 *
 * `prevent` is true for EVERY Enter, whatever the draft holds: this input
 * sits inside the recipe form, and a browser's implicit submission would
 * otherwise save a half-written recipe the moment someone pressed Enter to
 * commit a chip (item 211). `commit` carries the trimmed chip when there's
 * something to add, and is null for a blank/whitespace draft.
 *
 * Pure and consumed verbatim by the keydown handler, in the same spirit as
 * `resolveEnterAction` in MultiCombobox.
 */
export function resolveChipKey(key: string, draft: string): { prevent: boolean; commit: string | null } {
  if (key !== "Enter") return { prevent: false, commit: null };
  const trimmed = draft.trim();
  return { prevent: true, commit: trimmed.length > 0 ? trimmed : null };
}

/** The extra-ingredient list with `entry` appended: trimmed, never blank,
 * never a duplicate (case-insensitive), never past the shared cap. Returns
 * the SAME array when the entry can't be added. */
export function addExtraIngredient(current: string[], entry: string): string[] {
  const trimmed = entry.trim();
  if (trimmed.length === 0 || current.length >= CUSTOM_RECIPE_EXTRA_INGREDIENTS_MAX) return current;
  if (current.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) return current;
  return [...current, trimmed];
}

export interface CustomRecipeFormProps {
  /** Present = edit mode: fields start from this recipe and Save PATCHes it. */
  recipe?: RecipeDetail;
  /** Distinguishes this form's control ids from any other on the page. */
  idPrefix?: string;
  onSaved: (recipe: RecipeDetail) => void;
  onCancel: () => void;
}

/**
 * Add/edit a recipe a parent writes for themselves (item 211). Used at
 * `/recipes/new` and `/recipes/:id/edit` with no behavioral fork.
 *
 * Ingredients are real foods (the same `FoodPicker` the log form uses, so
 * the inline "add this as a custom food" escape hatch still works mid-form)
 * because that's what makes a logged meal fan out into foods and count
 * toward allergen tracking. Anything with no food behind it — olive oil, a
 * pinch of cinnamon — goes in the free-text list instead, exactly as the
 * catalog's own recipes carry extras.
 */
export function CustomRecipeForm({ recipe, idPrefix = "custom-recipe", onSaved, onCancel }: CustomRecipeFormProps) {
  const [values, setValues] = useState<CustomRecipeValues>(() => initialCustomRecipeValues(recipe));
  const [extraDraft, setExtraDraft] = useState("");
  const createRecipe = useCreateCustomRecipe();
  const updateRecipe = useUpdateCustomRecipe();
  const { data: foodsData } = useFoods();

  const errors = validateCustomRecipe(values);
  const isValid = Object.keys(errors).length === 0;
  // Every error shows live EXCEPT the three that are true the instant the
  // form opens — an empty required field under a disabled Save already says
  // it without shouting at someone who hasn't typed yet.
  const shownErrors: CustomRecipeErrors = {
    ...errors,
    ...(values.title.trim().length === 0 ? { title: undefined } : {}),
    ...(values.foodIds.length === 0 ? { ingredients: undefined } : {}),
    ...(values.steps.every((step) => step.trim().length === 0) ? { steps: undefined } : {}),
  };
  const mutation = recipe ? updateRecipe : createRecipe;

  const foodsById = useMemo(
    () => new Map((foodsData?.foods ?? []).map((food) => [food.id, food])),
    [foodsData],
  );

  function setValue<K extends keyof CustomRecipeValues>(key: K, value: CustomRecipeValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setStep(index: number, text: string) {
    setValues((current) => ({
      ...current,
      steps: current.steps.map((step, i) => (i === index ? text : step)),
    }));
  }

  function removeStep(index: number) {
    setValues((current) => {
      const steps = current.steps.filter((_, i) => i !== index);
      return { ...current, steps: steps.length > 0 ? steps : [""] };
    });
  }

  function commitExtra(entry: string) {
    setValues((current) => ({ ...current, extraIngredients: addExtraIngredient(current.extraIngredients, entry) }));
    setExtraDraft("");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // The food picker's "add a custom food" form renders in a portal, so its
    // submit would otherwise bubble through the REACT tree into this one.
    event.stopPropagation();
    if (!isValid || mutation.isPending) return;
    const input = buildCustomRecipeInput(values);
    if (recipe) updateRecipe.mutate({ id: recipe.id, input }, { onSuccess: onSaved });
    else createRecipe.mutate(input, { onSuccess: onSaved });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field label="Title" htmlFor={`${idPrefix}-title`} error={shownErrors.title}>
        <Input
          id={`${idPrefix}-title`}
          type="text"
          required
          maxLength={CUSTOM_RECIPE_TITLE_MAX}
          value={values.title}
          onChange={(e) => setValue("title", e.target.value)}
          placeholder="e.g. Lentil & sweet potato mash"
        />
      </Field>

      <Field label="Suitable from" htmlFor={`${idPrefix}-age`}>
        <Select
          id={`${idPrefix}-age`}
          value={String(values.minAgeMonths)}
          onChange={(e) => setValue("minAgeMonths", Number(e.target.value))}
        >
          {CUSTOM_RECIPE_AGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Ingredients" htmlFor={`${idPrefix}-ingredients`} error={shownErrors.ingredients}>
        <FoodPicker
          id={`${idPrefix}-ingredients`}
          value={values.foodIds}
          onChange={(next) => setValue("foodIds", next)}
        />
      </Field>

      {values.foodIds.length > 0 && (
        <div className="flex flex-col gap-2">
          {values.foodIds.map((foodId) => {
            const food = foodsById.get(foodId);
            const label = food?.name ?? "Ingredient";
            return (
              <Field
                key={foodId}
                label={`${label} — quantity (optional)`}
                htmlFor={`${idPrefix}-quantity-${foodId}`}
              >
                <Input
                  id={`${idPrefix}-quantity-${foodId}`}
                  type="text"
                  maxLength={CUSTOM_RECIPE_QUANTITY_NOTE_MAX}
                  value={values.quantityNotes[foodId] ?? ""}
                  onChange={(e) =>
                    setValues((current) => ({
                      ...current,
                      quantityNotes: { ...current.quantityNotes, [foodId]: e.target.value },
                    }))
                  }
                  placeholder="e.g. half a cup, cooked"
                />
              </Field>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-extra`} className="text-sm font-semibold text-[var(--color-text)]">
          Anything else{" "}
          <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
        </label>
        <p className="text-xs text-[var(--color-text-muted)]">
          Store-cupboard bits with no food of their own — oil, herbs, a squeeze of lemon.
        </p>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-extra`}
            type="text"
            maxLength={CUSTOM_RECIPE_EXTRA_INGREDIENT_MAX}
            value={extraDraft}
            onChange={(e) => setExtraDraft(e.target.value)}
            onKeyDown={(event) => {
              // Verbatim pass-through of the pure decision — Enter here adds
              // a chip and must NEVER save the recipe.
              const { prevent, commit } = resolveChipKey(event.key, extraDraft);
              if (prevent) event.preventDefault();
              if (commit) commitExtra(commit);
            }}
            placeholder="e.g. olive oil"
          />
          <Button type="button" variant="secondary" onClick={() => commitExtra(extraDraft)}>
            Add
          </Button>
        </div>
        {shownErrors.extraIngredients && (
          <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
            {shownErrors.extraIngredients}
          </p>
        )}
        {values.extraIngredients.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {values.extraIngredients.map((extra) => (
              <span
                key={extra}
                className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-bg-inset)] py-1 pr-1 pl-2.5 text-sm text-[var(--color-text)]"
              >
                {extra}
                <button
                  type="button"
                  aria-label={`Remove ${extra}`}
                  onClick={() =>
                    setValues((current) => ({
                      ...current,
                      extraIngredients: current.extraIngredients.filter((candidate) => candidate !== extra),
                    }))
                  }
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={`${idPrefix}-steps-label`} className="text-sm font-semibold text-[var(--color-text)]">
          Steps
        </span>
        <ol className="flex flex-col gap-2" aria-labelledby={`${idPrefix}-steps-label`}>
          {values.steps.map((step, index) => (
            <li key={index} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2 text-sm font-medium text-[var(--color-accent)]">
                {index + 1}.
              </span>
              {/* A textarea, not an input: steps run long, and Enter inside
                  one is a newline — it can never submit the form. */}
              <Textarea
                id={`${idPrefix}-step-${index}`}
                aria-label={`Step ${index + 1}`}
                rows={2}
                maxLength={CUSTOM_RECIPE_STEP_MAX}
                value={step}
                onChange={(e) => setStep(index, e.target.value)}
                placeholder={index === 0 ? "e.g. Steam the sweet potato until soft" : "Next step"}
              />
              {values.steps.length > 1 && (
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove step ${index + 1}`} onClick={() => removeStep(index)}>
                  <span aria-hidden="true">×</span>
                </Button>
              )}
            </li>
          ))}
        </ol>
        {shownErrors.steps && (
          <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
            {shownErrors.steps}
          </p>
        )}
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={values.steps.length >= CUSTOM_RECIPE_STEPS_MAX}
            onClick={() => setValues((current) => ({ ...current, steps: [...current.steps, ""] }))}
          >
            Add step
          </Button>
        </div>
      </div>

      <Field label="Prep time (optional)" htmlFor={`${idPrefix}-prep`} error={shownErrors.prepMinutes} hint="Minutes — leave blank if you'd rather not say.">
        <Input
          id={`${idPrefix}-prep`}
          type="number"
          inputMode="numeric"
          min={0}
          max={CUSTOM_RECIPE_PREP_MINUTES_MAX}
          value={values.prepMinutes}
          onChange={(e) => setValue("prepMinutes", e.target.value)}
          placeholder="e.g. 20"
        />
      </Field>

      <Field label="Notes (optional)" htmlFor={`${idPrefix}-notes`} error={shownErrors.notes}>
        <Textarea
          id={`${idPrefix}-notes`}
          value={values.notes}
          onChange={(e) => setValue("notes", e.target.value)}
          rows={2}
          placeholder="e.g. freezes well in ice-cube trays"
        />
      </Field>

      {mutation.isError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={!isValid || mutation.isPending} className="flex-1">
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
