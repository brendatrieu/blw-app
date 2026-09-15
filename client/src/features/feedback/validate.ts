import type { FormErrors } from "../../lib/forms.js";

/**
 * The send-feedback form's field rules (item 360).
 *
 * One field, one rule — but it lives here rather than inline in the page for
 * the same reason every other form's `validate<Form>` does: it is the thing
 * that decides whether the API is reached at all, and a rule that decides
 * that should be readable and testable without a DOM.
 *
 * An empty object means valid, the reading `lib/forms.ts` fixes for every
 * form in the app.
 */

export type FeedbackField = "message";
export type FeedbackErrors = FormErrors<FeedbackField>;

/** Visual field order — what a failed submit focuses first (item 235). */
export const FEEDBACK_FIELD_ORDER: readonly FeedbackField[] = ["message"];

/** Error key → the id of the control a failed submit should focus. */
export const FEEDBACK_FIELD_IDS = { message: "feedback-message" } as const;

/**
 * Blank is the only way to get this wrong. Trimmed first, because the shared
 * schema trims too: a box holding three spaces is a blank box on both sides
 * of the wire, and catching it here is what keeps a parent from spending one
 * of their five sends an hour on a typo (the server's budget is charged by
 * the attempt, before the body is parsed).
 *
 * The message is phrased as the ask rather than as "<Field> is required"
 * (item 238).
 */
export function validateFeedback(values: { message: string }): FeedbackErrors {
  return values.message.trim().length === 0 ? { message: "Tell us a little more" } : {};
}
