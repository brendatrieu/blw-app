import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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
  normalizeExtraIngredients,
  type CreateCustomRecipeInput,
  type ExtraIngredient,
  type RecipeDetail,
} from "@blw/shared";
import { CUSTOM_RECIPE_AGE_OPTIONS } from "../constants.js";
import { useCreateCustomRecipe, useFoods, useUpdateCustomRecipe } from "../hooks.js";
import { FoodPicker } from "./FoodPicker.js";
import { Field } from "../../../components/ui/Field.js";
import { Input, Textarea } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Button } from "../../../components/ui/Button.js";
import { getAutosizeProps, useAutosizeListProps } from "../../../components/ui/autosize.js";
import { useSubmitValidation, type FormErrors } from "../../../lib/forms.js";

/** The form's own state — everything a control can hold directly, converted
 * to the API's shape by `buildCustomRecipeInput`. */
export interface CustomRecipeValues {
  title: string;
  minAgeMonths: number;
  /** Ingredient food ids, in the order the picker holds them. */
  foodIds: string[];
  /** foodId -> the parent's quantity note; "" is a real answer ("no amount given"). */
  quantityNotes: Record<string, string>;
  /** One entry per extra-ingredient ROW (item 299), blank ones included —
   * `buildCustomRecipeInput` drops those, exactly as it does blank steps. */
  extraIngredients: ExtraIngredient[];
  /** One entry per step box, blank ones included — `buildCustomRecipeInput` drops those. */
  steps: string[];
  notes: string;
  /** "" = not stated; sent as 0, which the recipe page hides. */
  prepMinutes: string;
}

export type CustomRecipeField =
  | "title"
  | "ingredients"
  | "extraIngredients"
  | "steps"
  | "notes"
  | "prepMinutes";
export type CustomRecipeErrors = FormErrors<CustomRecipeField>;

/** Visual field order — what a failed submit focuses first (item 235). */
export const CUSTOM_RECIPE_FIELD_ORDER: readonly CustomRecipeField[] = [
  "title",
  "ingredients",
  "extraIngredients",
  "steps",
  "notes",
  "prepMinutes",
];

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

  // A blank ROW is "I haven't filled this in", not an error and not an
  // ingredient — so the caps are checked against what would actually be
  // sent, which is what the server will check in turn. A row with only a
  // quantity typed in it is blank by that rule too, and simply vanishes.
  const extras = normalizeExtraIngredients(values.extraIngredients);
  if (extras.length > CUSTOM_RECIPE_EXTRA_INGREDIENTS_MAX) {
    errors.extraIngredients = `At most ${CUSTOM_RECIPE_EXTRA_INGREDIENTS_MAX} extra ingredients`;
  } else if (extras.some((extra) => extra.name.length > CUSTOM_RECIPE_EXTRA_INGREDIENT_MAX)) {
    errors.extraIngredients = `Each one must be ${CUSTOM_RECIPE_EXTRA_INGREDIENT_MAX} characters or fewer`;
  } else if (extras.some((extra) => extra.quantityNote.length > CUSTOM_RECIPE_QUANTITY_NOTE_MAX)) {
    errors.extraIngredients = `Each quantity must be ${CUSTOM_RECIPE_QUANTITY_NOTE_MAX} characters or fewer`;
  }
  if (!errors.extraIngredients) {
    // The server dedupes names case-insensitively; say so here instead of
    // letting the second row vanish silently on save.
    const seen = new Set<string>();
    for (const extra of values.extraIngredients) {
      const key = extra.name.trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) {
        errors.extraIngredients = `Duplicate ingredient: ${extra.name.trim()}`;
        break;
      }
      seen.add(key);
    }
  }

  // Steps are OPTIONAL (item 240): a recipe can be a title plus a list of
  // ingredients. Only the caps still apply.
  const steps = values.steps.map((step) => step.trim()).filter((step) => step.length > 0);
  if (steps.length > CUSTOM_RECIPE_STEPS_MAX) {
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
    // `normalizeExtraIngredients` is the SHARED rule the server applies to
    // whatever arrives (trim, drop blank names, keep the first of a
    // case-insensitive duplicate). Running it here too means what the form
    // sends is already what gets stored, so the recipe page after a save
    // shows exactly the rows the parent saw before it.
    extraIngredients: normalizeExtraIngredients(values.extraIngredients),
    steps: values.steps.map((step) => step.trim()).filter((step) => step.length > 0),
    notes: values.notes.trim() || null,
    prepMinutes: prep ? Number(prep) : 0,
  };
}

/** A fresh, empty extra-ingredient row. */
export function emptyExtraIngredientRow(): ExtraIngredient {
  return { name: "", quantityNote: "" };
}

/** The form's starting values: an existing recipe's own fields when editing,
 * otherwise the youngest age with one empty step box and one empty extra
 * ingredient row. A custom recipe keeps its single set of steps in
 * `variants[0]` (item 203). */
export function initialCustomRecipeValues(recipe?: RecipeDetail): CustomRecipeValues {
  if (!recipe) {
    return {
      title: "",
      minAgeMonths: DEFAULT_CUSTOM_RECIPE_AGE_MONTHS,
      foodIds: [],
      quantityNotes: {},
      extraIngredients: [emptyExtraIngredientRow()],
      steps: [""],
      notes: "",
      prepMinutes: "",
    };
  }
  const quantityNotes: Record<string, string> = {};
  for (const ingredient of recipe.ingredients) quantityNotes[ingredient.foodId] = ingredient.quantityNote;
  const steps = recipe.variants[0]?.steps ?? [];
  // Every stored extra becomes an editable row, name and quantity both
  // (item 299). A recipe saved without any opens the same single blank row
  // a new one does, so adding one is never a hunt for a button.
  const extras = recipe.extraIngredients.map((extra) => ({ ...extra }));
  return {
    title: recipe.title,
    minAgeMonths: recipe.minAgeMonths,
    foodIds: recipe.ingredients.map((ingredient) => ingredient.foodId),
    quantityNotes,
    extraIngredients: extras.length > 0 ? extras : [emptyExtraIngredientRow()],
    steps: steps.length > 0 ? [...steps] : [""],
    notes: recipe.notes ?? "",
    prepMinutes: recipe.prepMinutes > 0 ? String(recipe.prepMinutes) : "",
  };
}

/** Which of an extra-ingredient row's two inputs is being talked about. */
export type ExtraRowField = "name" | "quantity";

/** Where focus should land next, as a row index plus a field. */
export interface ExtraRowTarget {
  index: number;
  field: ExtraRowField;
}

/**
 * What Enter should do inside an extra-ingredient row (item 299).
 *
 * `prevent` is true for EVERY Enter, wherever it lands and whatever happens
 * next: these are `<input>`s inside the recipe form, and a browser's
 * implicit submission would otherwise save a half-written recipe the moment
 * someone pressed Enter to move along (the same hazard the old chip input
 * guarded against, item 211).
 *
 * Otherwise Enter reads as "done with this box, on to the next one":
 * - in a name, move to that row's own quantity;
 * - in a quantity, move to the next row's name;
 * - in the LAST row's quantity, append a fresh row and go to its name, so a
 *   parent can type a whole shopping list without touching the button;
 * - at the shared cap of 20 rows there is nowhere to go, so Enter is
 *   swallowed and nothing moves.
 *
 * Pure and consumed verbatim by the keydown handler, in the same spirit as
 * `resolveStepKey` below.
 */
export function resolveExtraRowKey(
  key: string,
  field: ExtraRowField,
  index: number,
  rowCount: number,
): { prevent: boolean; focus: ExtraRowTarget | null; addRow: boolean } {
  if (key !== "Enter") return { prevent: false, focus: null, addRow: false };
  if (field === "name") return { prevent: true, focus: { index, field: "quantity" }, addRow: false };
  const next = index + 1;
  if (next < rowCount) return { prevent: true, focus: { index: next, field: "name" }, addRow: false };
  if (rowCount >= CUSTOM_RECIPE_EXTRA_INGREDIENTS_MAX) return { prevent: true, focus: null, addRow: false };
  return { prevent: true, focus: { index: next, field: "name" }, addRow: true };
}

/**
 * The promise the on-screen keyboard's return key makes, derived from
 * `resolveExtraRowKey` itself so the two can never disagree: "next" wherever
 * Enter moves somewhere, "done" only in the one spot where it can't (the
 * twentieth row's quantity).
 */
export function extraRowEnterKeyHint(field: ExtraRowField, index: number, rowCount: number): "next" | "done" {
  return resolveExtraRowKey("Enter", field, index, rowCount).focus ? "next" : "done";
}

/** The DOM id of one extra-ingredient input. The JSX and the keydown handler
 * both go through this, so the ids the handler focuses cannot drift from the
 * ids the inputs actually carry. */
export function extraRowFieldId(idPrefix: string, index: number, field: ExtraRowField): string {
  return `${idPrefix}-extra-${field}-${index}`;
}

/**
 * What Enter should do inside a step textarea (item 231).
 *
 * A step is one instruction, not a paragraph, so plain Enter means "this step
 * is done": `prevent` stops the newline the textarea would otherwise insert,
 * and `commit` tells the handler to blur the field. The typed text is never
 * touched — committing a step only ends editing it.
 *
 * Shift+Enter is the escape hatch for the rare multi-line step: neither
 * prevented nor committed, so the browser inserts its newline as usual.
 *
 * Pure and consumed verbatim by the keydown handler, like `resolveChipKey`.
 * Note that a textarea can never implicit-submit a form, so unlike the chip
 * input there is no submit to guard against here — only the newline.
 */
export function resolveStepKey(key: string, shiftKey: boolean): { prevent: boolean; commit: boolean } {
  if (key !== "Enter" || shiftKey) return { prevent: false, commit: false };
  return { prevent: true, commit: true };
}

/**
 * The step textarea's whole Enter wiring as one spreadable prop object, in the
 * same spirit as `getInputAriaProps` in MultiCombobox: the JSX spreads this
 * and sets none of it itself, so *removing* item 231's behaviour means
 * removing the spread — and the spread carries a rendered attribute
 * (`enterkeyhint`), which a static render test can see is gone.
 *
 * `enterKeyHint="done"` is not decoration: it is the same promise the handler
 * keeps, made to the on-screen keyboard. A phone shows a "done" return key,
 * and pressing it ends the step instead of opening a second line.
 */
export function getStepKeyProps(): {
  enterKeyHint: "done";
  onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
} {
  return {
    enterKeyHint: "done",
    onKeyDown: (event) => {
      // Verbatim pass-through of the pure decision.
      const { prevent, commit } = resolveStepKey(event.key, event.shiftKey);
      if (prevent) event.preventDefault();
      if (commit) event.currentTarget.blur();
    },
  };
}

/**
 * An extra-ingredient input's Enter wiring, spreadable for the same reason as
 * `getStepKeyProps`: the JSX spreads this and sets none of it itself, so the
 * rendered `enterkeyhint` is present exactly when the handler is.
 *
 * `act` receives the pure decision's two halves — whether to append a row,
 * and where focus should go — because only the component can do either.
 */
export function getExtraRowKeyProps(
  field: ExtraRowField,
  index: number,
  rowCount: number,
  act: (decision: { focus: ExtraRowTarget | null; addRow: boolean }) => void,
): {
  enterKeyHint: "next" | "done";
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
} {
  return {
    enterKeyHint: extraRowEnterKeyHint(field, index, rowCount),
    onKeyDown: (event) => {
      // Verbatim pass-through of the pure decision — Enter here moves along
      // the rows and must NEVER save the recipe.
      const { prevent, focus, addRow } = resolveExtraRowKey(event.key, field, index, rowCount);
      if (prevent) event.preventDefault();
      if (focus || addRow) act({ focus, addRow });
    },
  };
}

export interface CustomRecipeFormProps {
  /** Present = edit mode: fields start from this recipe and Save PATCHes it. */
  recipe?: RecipeDetail;
  /** Distinguishes this form's control ids from any other on the page. */
  idPrefix?: string;
  onSaved: (recipe: RecipeDetail) => void;
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
export function CustomRecipeForm({ recipe, idPrefix = "custom-recipe", onSaved }: CustomRecipeFormProps) {
  const [values, setValues] = useState<CustomRecipeValues>(() => initialCustomRecipeValues(recipe));
  const createRecipe = useCreateCustomRecipe();
  const updateRecipe = useUpdateCustomRecipe();
  const { data: foodsData } = useFoods();

  // Item 235: Save stays enabled, nothing is shown before the first submit
  // attempt, and a failed attempt focuses the topmost broken field.
  const { errors: shownErrors, attemptSubmit } = useSubmitValidation(
    values,
    validateCustomRecipe,
    CUSTOM_RECIPE_FIELD_ORDER,
    {
      title: `${idPrefix}-title`,
      // The MultiCombobox behind FoodPicker puts this id on its text input.
      ingredients: `${idPrefix}-ingredients`,
      extraIngredients: extraRowFieldId(idPrefix, 0, "name"),
      steps: `${idPrefix}-step-0`,
      notes: `${idPrefix}-notes`,
      prepMinutes: `${idPrefix}-prep`,
    },
  );
  const mutation = recipe ? updateRecipe : createRecipe;

  const foodsById = useMemo(
    () => new Map((foodsData?.foods ?? []).map((food) => [food.id, food])),
    [foodsData],
  );

  /* Item 300: the step boxes grow with their own text, but the list is keyed
   * by index — removing a step hands an EXISTING <textarea> the next step's
   * text, which fires no `input` and re-runs no ref, so it would keep the
   * removed step's height with the scrollbar already hidden (text present,
   * invisible, unscrollable). This re-fits every step box whenever the list
   * changes length, and never on a keystroke. */
  const stepListProps = useAutosizeListProps<HTMLOListElement>(values.steps.length);

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

  function setExtra(index: number, field: ExtraRowField, text: string) {
    setValues((current) => ({
      ...current,
      extraIngredients: current.extraIngredients.map((row, i) =>
        i === index ? { ...row, ...(field === "name" ? { name: text } : { quantityNote: text }) } : row,
      ),
    }));
  }

  function addExtraRow() {
    setValues((current) =>
      current.extraIngredients.length >= CUSTOM_RECIPE_EXTRA_INGREDIENTS_MAX
        ? current
        : { ...current, extraIngredients: [...current.extraIngredients, emptyExtraIngredientRow()] },
    );
  }

  /** Unlike a step box, the LAST extra row can go too: "no extras" is a real
   * answer for an optional list, and "+ Add ingredient" brings one back. */
  function removeExtraRow(index: number) {
    setValues((current) => ({
      ...current,
      extraIngredients: current.extraIngredients.filter((_, i) => i !== index),
    }));
  }

  /** Set by Enter when the row it wants to focus does not exist yet; the
   * effect below focuses it once React has rendered the new row. */
  const pendingExtraFocus = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingExtraFocus.current;
    if (!id) return;
    pendingExtraFocus.current = null;
    document.getElementById(id)?.focus();
  });

  function actOnExtraRowKey({ focus, addRow }: { focus: ExtraRowTarget | null; addRow: boolean }) {
    if (addRow) addExtraRow();
    if (!focus) return;
    const id = extraRowFieldId(idPrefix, focus.index, focus.field);
    // An existing box can be focused straight away; a just-appended one has
    // to wait for the render that creates it.
    if (addRow) pendingExtraFocus.current = id;
    else document.getElementById(id)?.focus();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // The food picker's "add a custom food" form renders in a portal, so its
    // submit would otherwise bubble through the REACT tree into this one.
    event.stopPropagation();
    if (mutation.isPending) return;
    if (!attemptSubmit()) return;
    const input = buildCustomRecipeInput(values);
    if (recipe) updateRecipe.mutate({ id: recipe.id, input }, { onSuccess: onSaved });
    else createRecipe.mutate(input, { onSuccess: onSaved });
  }

  return (
    // `noValidate`: the app answers required fields itself (item 236) —
    // native constraint bubbles are unreliable in a PWA and would pre-empt
    // the inline messages and the focus below.
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
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

      {/* Item 299: rows, not chips. An extra now carries its own quantity,
          which a one-line chip has nowhere to put — so each one is a pair of
          boxes shaped like the ingredient quantities just above. */}
      <div className="flex flex-col gap-1.5">
        <span id={`${idPrefix}-extra-label`} className="text-sm font-semibold text-[var(--color-text)]">
          Additional ingredients{" "}
          <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
        </span>
        <p className="text-xs text-[var(--color-text-muted)]">
          Store-cupboard bits with no food of their own — oil, herbs, a squeeze of lemon.
        </p>
        {values.extraIngredients.length > 0 && (
          <ul className="flex flex-col gap-2" aria-labelledby={`${idPrefix}-extra-label`}>
            {values.extraIngredients.map((extra, index) => (
              // Index key, like the step list: a row's identity IS its
              // position, and keying by the name would remount the box the
              // parent is typing into on every keystroke.
              <li
                key={index}
                className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] p-2"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Field label={`Ingredient ${index + 1}`} htmlFor={extraRowFieldId(idPrefix, index, "name")}>
                    <Input
                      id={extraRowFieldId(idPrefix, index, "name")}
                      type="text"
                      maxLength={CUSTOM_RECIPE_EXTRA_INGREDIENT_MAX}
                      value={extra.name}
                      onChange={(e) => setExtra(index, "name", e.target.value)}
                      {...getExtraRowKeyProps("name", index, values.extraIngredients.length, actOnExtraRowKey)}
                      placeholder="e.g. olive oil"
                    />
                  </Field>
                  <Field label="Quantity (optional)" htmlFor={extraRowFieldId(idPrefix, index, "quantity")}>
                    <Input
                      id={extraRowFieldId(idPrefix, index, "quantity")}
                      type="text"
                      maxLength={CUSTOM_RECIPE_QUANTITY_NOTE_MAX}
                      value={extra.quantityNote}
                      onChange={(e) => setExtra(index, "quantity", e.target.value)}
                      {...getExtraRowKeyProps("quantity", index, values.extraIngredients.length, actOnExtraRowKey)}
                      placeholder="e.g. a drizzle"
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ingredient ${index + 1}`}
                  onClick={() => removeExtraRow(index)}
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {shownErrors.extraIngredients && (
          <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
            {shownErrors.extraIngredients}
          </p>
        )}
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={values.extraIngredients.length >= CUSTOM_RECIPE_EXTRA_INGREDIENTS_MAX}
            onClick={addExtraRow}
          >
            + Add ingredient
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={`${idPrefix}-steps-label`} className="text-sm font-semibold text-[var(--color-text)]">
          Steps <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
        </span>
        <ol {...stepListProps} className="flex flex-col gap-2" aria-labelledby={`${idPrefix}-steps-label`}>
          {values.steps.map((step, index) => (
            <li key={index} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2 text-sm font-medium text-[var(--color-accent)]">
                {index + 1}.
              </span>
              {/* A textarea, not an input: steps run long, and a textarea is
                  never a candidate for implicit form submission, so Enter here
                  can never save the recipe. Enter *commits* the step (item
                  231) — Shift+Enter still inserts a newline. */}
              <Textarea
                id={`${idPrefix}-step-${index}`}
                aria-label={`Step ${index + 1}`}
                rows={2}
                maxLength={CUSTOM_RECIPE_STEP_MAX}
                value={step}
                onChange={(e) => setStep(index, e.target.value)}
                {...getStepKeyProps()}
                // Item 300: two rows to start, then as tall as the step is.
                // Shift+Enter's newlines grow it the same way typing does.
                {...getAutosizeProps()}
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
          {...getAutosizeProps()}
          placeholder="e.g. freezes well in ice-cube trays"
        />
      </Field>

      {mutation.isError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}

      {/* Save only (item 257) — see `CustomFoodForm`. */}
      <Button type="submit" disabled={mutation.isPending} className="w-full">
        {mutation.isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
