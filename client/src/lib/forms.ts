import { useState } from "react";

/**
 * Per-field validation messages, keyed by whatever field names a form's own
 * `validate<Form>` helper uses. An EMPTY object means valid — every helper in
 * the app reads exactly that, so "is this form submittable?" is one rule, not
 * one per form.
 */
export type FormErrors<K extends string> = Partial<Record<K, string | undefined>>;

/** True when `errors` carries no message at all (the "valid" reading above). */
export function isFormValid<K extends string>(errors: FormErrors<K>): boolean {
  return Object.values(errors).every((message) => !message);
}

/**
 * The field a failed submit should send the caret to: the FIRST key in
 * `order` that carries a message, or null when nothing is wrong. `order` is
 * the form's own visual field order, so the parent lands on the topmost
 * problem rather than whichever key an object literal happened to list first.
 *
 * Pure and separate from the focusing itself so the choice is unit-tested
 * without a DOM — see `focusFieldById` for the half that touches one.
 */
export function firstInvalidField<K extends string>(errors: FormErrors<K>, order: readonly K[]): K | null {
  for (const key of order) {
    if (errors[key]) return key;
  }
  return null;
}

/**
 * Focus the control with this id, if there is one. Deliberately a no-op with
 * no `document` (the renderToString tests run in node, with no DOM env) and
 * with an unknown/absent id, so a form whose invalid field has no focusable
 * control still shows its message rather than throwing.
 */
export function focusFieldById(id: string | null | undefined): void {
  if (!id) return;
  if (typeof document === "undefined") return;
  const element = document.getElementById(id);
  if (element && typeof element.focus === "function") element.focus();
}

/**
 * A deliberately loose "looks like an address" check for the sign-in and
 * sign-up forms: something, an @, something with a dot in it. Anything
 * stricter rejects real addresses, and the server is what actually decides —
 * this only exists so an obvious typo gets a sentence rather than a round
 * trip and a generic failure.
 */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * The errors a form should RENDER, given everything `validate` found and
 * whether a submit has been attempted: nothing at all before the first
 * attempt (item 235 — no shouting at an untouched form), everything after.
 * Pure and exported so that rule is pinned by a test rather than buried in
 * the hook's return statement.
 */
export function visibleErrors<K extends string>(errors: FormErrors<K>, attempted: boolean): FormErrors<K> {
  return attempted ? errors : {};
}

export interface SubmitValidation<K extends string> {
  /**
   * The errors to RENDER: empty until the first submit attempt, then live —
   * so nobody is shouted at before they have tried to save, and a fixed field
   * clears its own message on the next keystroke (the errors are recomputed
   * from `values` on every render, not frozen at submit time).
   */
  errors: FormErrors<K>;
  /** Whether a submit has been attempted at all. */
  attempted: boolean;
  /**
   * Call FIRST in a submit handler. Records the attempt, and when anything is
   * wrong focuses the first invalid field and returns false — the handler
   * returns on false and never reaches the API. Returns true when valid.
   */
  attemptSubmit: () => boolean;
}

/**
 * The one required-field convention every form in this app shares (item 235):
 * the submit button stays enabled, a pure `validate<Form>` decides what is
 * wrong, nothing is shown before the first submit attempt, and a failed
 * submit focuses the topmost broken field instead of silently doing nothing.
 *
 * `validate` runs on every render against the CURRENT values, so a message
 * disappears the moment its own field is fixed without any per-field "touched"
 * bookkeeping. `fieldIds` maps each error key to the id of the control to
 * focus; a key may be omitted when nothing focusable represents it.
 */
export function useSubmitValidation<V, K extends string>(
  values: V,
  validate: (values: V) => FormErrors<K>,
  order: readonly K[],
  fieldIds: Partial<Record<K, string>>,
): SubmitValidation<K> {
  const [attempted, setAttempted] = useState(false);
  const errors = validate(values);

  function attemptSubmit(): boolean {
    setAttempted(true);
    const invalid = firstInvalidField(errors, order);
    if (!invalid) return true;
    focusFieldById(fieldIds[invalid]);
    return false;
  }

  return { errors: visibleErrors(errors, attempted), attempted, attemptSubmit };
}
