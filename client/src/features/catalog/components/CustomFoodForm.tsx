import { useState } from "react";
import {
  CUSTOM_FOOD_NAME_MAX,
  CUSTOM_FOOD_NOTES_MAX,
  isSingleEmoji,
  type CreateCustomFoodInput,
  type FoodCategory,
  type FoodDetail,
} from "@blw/shared";
import { ALLERGEN_SLUGS, CATEGORIES } from "../constants.js";
import { getCategoryEmoji } from "../foodEmoji.js";
import { useCreateCustomFood, useUpdateCustomFood } from "../hooks.js";
import { Field } from "../../../components/ui/Field.js";
import { Input, Textarea } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Button } from "../../../components/ui/Button.js";
import { useSubmitValidation, type FormErrors } from "../../../lib/forms.js";

/** The form's own state — every field a string/array the inputs can hold
 * directly, converted to the API's shape by `buildCustomFoodInput`. */
export interface CustomFoodValues {
  name: string;
  category: FoodCategory;
  /** "" means "no emoji"; the UI seeds it from the category, never forces it. */
  emoji: string;
  allergenSlugs: string[];
  notes: string;
}

export type CustomFoodField = "name" | "emoji" | "notes";
export type CustomFoodErrors = FormErrors<CustomFoodField>;

/** Visual field order — what a failed submit focuses first (item 235). */
export const CUSTOM_FOOD_FIELD_ORDER: readonly CustomFoodField[] = ["name", "emoji", "notes"];

export const DEFAULT_CUSTOM_FOOD_CATEGORY: FoodCategory = "fruit";

/**
 * Client-side mirror of `createCustomFoodSchema`'s rules (shared/catalog.ts),
 * expressed per-field so each message can sit under the field that caused
 * it. Deliberately NOT a zod `safeParse` of the whole object: zod's issue
 * list would have to be re-keyed to fields anyway, and the trimming rules
 * ("  " is an empty name, an emoji field left blank is fine) are clearer
 * stated once, here, than reverse-engineered from issue paths.
 *
 * An empty object means valid — the submit button reads exactly that.
 */
export function validateCustomFood(values: CustomFoodValues): CustomFoodErrors {
  const errors: CustomFoodErrors = {};
  const name = values.name.trim();
  if (name.length === 0) errors.name = "Name is required";
  else if (name.length > CUSTOM_FOOD_NAME_MAX) errors.name = `Name must be ${CUSTOM_FOOD_NAME_MAX} characters or fewer`;

  const emoji = values.emoji.trim();
  // Blank is a real answer (the food falls back to the category emoji);
  // anything present has to be exactly one emoji, same rule as the server.
  if (emoji.length > 0 && !isSingleEmoji(emoji)) errors.emoji = "Use a single emoji, or leave it blank";

  if (values.notes.trim().length > CUSTOM_FOOD_NOTES_MAX) {
    errors.notes = `Notes must be ${CUSTOM_FOOD_NOTES_MAX} characters or fewer`;
  }
  return errors;
}

/**
 * The POST/PATCH body for these values. Trims every free-text field and
 * collapses blank emoji/notes to `null` (the server's own "" → null rule) so
 * clearing a field on an edit actually clears the column rather than storing
 * an empty string. Pure so the exact payload is testable without a network
 * layer, in the same spirit as `buildLeftoverFridgeInput`.
 */
export function buildCustomFoodInput(values: CustomFoodValues): CreateCustomFoodInput {
  const emoji = values.emoji.trim();
  const notes = values.notes.trim();
  return {
    name: values.name.trim(),
    category: values.category,
    emoji: emoji || null,
    allergenSlugs: [...values.allergenSlugs],
    notes: notes || null,
  };
}

/**
 * The emoji field's value after the category changes. The field is a
 * *suggestion*, not a derived value: it re-seeds from the new category only
 * while the parent hasn't made it their own — i.e. it's blank, or still the
 * previous category's suggestion. A hand-picked 🥯 survives every category
 * switch. Pure so this "don't clobber my choice" rule is pinned by a test
 * rather than by reading the handler.
 */
export function resolveEmojiForCategory(
  currentEmoji: string,
  previousCategory: FoodCategory,
  nextCategory: FoodCategory,
): string {
  const current = currentEmoji.trim();
  if (current === "" || current === getCategoryEmoji(previousCategory)) return getCategoryEmoji(nextCategory);
  return currentEmoji;
}

/** The form's starting values: an existing food's own fields when editing,
 * otherwise the category default plus whatever name the caller prefilled. */
export function initialCustomFoodValues(food?: FoodDetail, initialName = ""): CustomFoodValues {
  const category = food?.category ?? DEFAULT_CUSTOM_FOOD_CATEGORY;
  return {
    name: food?.name ?? initialName,
    category,
    emoji: food?.emoji ?? getCategoryEmoji(category),
    allergenSlugs: food?.allergens ? [...food.allergens] : [],
    notes: food?.notes ?? "",
  };
}

interface AllergenChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

/**
 * One allergen in the checklist. There's no shared checkbox primitive in
 * this app, and the established multi-select affordance is the `aria-pressed`
 * chip (FoodsPage's filter chips) — the one documented exception to
 * "CTAs are `Button` variants only".
 */
function AllergenChip({ active, label, onClick }: AllergenChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
          : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
      }`}
    >
      {label}
    </button>
  );
}

export interface CustomFoodFormProps {
  /** Present = edit mode: fields start from this food and Save PATCHes it. */
  food?: FoodDetail;
  /** Create-mode prefill for the name (the picker's query, or `?name=`). */
  initialName?: string;
  /** Distinguishes this form's control ids from any other on the page. */
  idPrefix?: string;
  onSaved: (food: FoodDetail) => void;
}

/**
 * Add/edit a food a parent keeps for themselves (items 178, 180). Used
 * three ways with no behavioral fork: full-screen at `/foods/new` and
 * `/foods/:slug/edit`, and inside the food picker's Sheet.
 *
 * Custom foods carry NO curated nutrition, prep or choking content, so this
 * form deliberately asks for none of it — name, category, an emoji, the
 * top-9 allergen checklist (required by product decision to be *asked*, not
 * to be non-empty: "nothing on this list" is a real answer), and free notes.
 */
export function CustomFoodForm({ food, initialName = "", idPrefix = "custom-food", onSaved }: CustomFoodFormProps) {
  const [values, setValues] = useState<CustomFoodValues>(() => initialCustomFoodValues(food, initialName));
  const createFood = useCreateCustomFood();
  const updateFood = useUpdateCustomFood();

  // Item 235: Save stays enabled, nothing is shown before the first submit
  // attempt, and a failed attempt focuses the topmost broken field.
  const { errors: shownErrors, attemptSubmit } = useSubmitValidation(
    values,
    validateCustomFood,
    CUSTOM_FOOD_FIELD_ORDER,
    { name: `${idPrefix}-name`, emoji: `${idPrefix}-emoji`, notes: `${idPrefix}-notes` },
  );
  const mutation = food ? updateFood : createFood;

  function setValue<K extends keyof CustomFoodValues>(key: K, value: CustomFoodValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleCategoryChange(nextCategory: FoodCategory) {
    setValues((current) => ({
      ...current,
      category: nextCategory,
      emoji: resolveEmojiForCategory(current.emoji, current.category, nextCategory),
    }));
  }

  function toggleAllergen(slug: string) {
    setValues((current) => ({
      ...current,
      allergenSlugs: current.allergenSlugs.includes(slug)
        ? current.allergenSlugs.filter((candidate) => candidate !== slug)
        : [...current.allergenSlugs, slug],
    }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // React events propagate through the *React* tree, not the DOM tree, so
    // when this form renders inside the picker's `Sheet` (a portal) its
    // submit would otherwise bubble into the surrounding log-meal / fridge
    // form's `onSubmit` and save a meal. The portal hides the nesting from
    // the DOM; this stops it in React.
    event.stopPropagation();
    if (mutation.isPending) return;
    if (!attemptSubmit()) return;
    const input = buildCustomFoodInput(values);
    if (food) updateFood.mutate({ id: food.id, input }, { onSuccess: onSaved });
    else createFood.mutate(input, { onSuccess: onSaved });
  }

  return (
    // `noValidate`: required fields are answered inline by this form, not by
    // the browser's native bubble (item 236).
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <Field label="Name" htmlFor={`${idPrefix}-name`} error={shownErrors.name}>
        <Input
          id={`${idPrefix}-name`}
          type="text"
          required
          maxLength={CUSTOM_FOOD_NAME_MAX}
          value={values.name}
          onChange={(e) => setValue("name", e.target.value)}
          placeholder="e.g. Grandma's banana bread"
        />
      </Field>

      <Field label="Category" htmlFor={`${idPrefix}-category`}>
        <Select
          id={`${idPrefix}-category`}
          value={values.category}
          onChange={(e) => handleCategoryChange(e.target.value as FoodCategory)}
        >
          {CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Emoji (optional)"
        htmlFor={`${idPrefix}-emoji`}
        error={shownErrors.emoji}
        hint="Shown wherever this food appears. Starts from the category — change it to anything."
      >
        <Input
          id={`${idPrefix}-emoji`}
          type="text"
          inputMode="text"
          autoComplete="off"
          value={values.emoji}
          onChange={(e) => setValue("emoji", e.target.value)}
          placeholder="🍽️"
          className="w-20 text-center text-xl"
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span id={`${idPrefix}-allergens-label`} className="text-sm font-semibold text-[var(--color-text)]">
          Allergens
        </span>
        <p className="text-xs text-[var(--color-text-muted)]">
          Tap any of the top 9 this food contains — they count toward allergen tracking.
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${idPrefix}-allergens-label`}>
          {ALLERGEN_SLUGS.map((allergen) => (
            <AllergenChip
              key={allergen.value}
              label={allergen.label}
              active={values.allergenSlugs.includes(allergen.value)}
              onClick={() => toggleAllergen(allergen.value)}
            />
          ))}
        </div>
      </div>

      <Field label="Notes (optional)" htmlFor={`${idPrefix}-notes`} error={shownErrors.notes}>
        <Textarea
          id={`${idPrefix}-notes`}
          value={values.notes}
          onChange={(e) => setValue("notes", e.target.value)}
          rows={2}
          placeholder="e.g. cut into finger-length strips"
        />
      </Field>

      {mutation.isError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}

      {/* Save only (item 257): the page header's chevron/X and the picker
          sheet's own close are the way out — a Cancel button beside Save
          just competed with it. */}
      <Button type="submit" disabled={mutation.isPending} className="w-full">
        {mutation.isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
