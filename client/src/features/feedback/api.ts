import {
  createFeedbackInputSchema,
  feedbackCreatedResponseSchema,
  type CreateFeedbackInput,
  type FeedbackCreatedResponse,
} from "@blw/shared";
import { ApiError, apiPost } from "../../lib/api.js";

/**
 * The parent half of feedback: one POST, and the sentences that go with it.
 *
 * Every string the page shows lives here as an exported constant rather than
 * as a literal in the JSX, for a mundane but load-bearing reason:
 * `renderToString` escapes an apostrophe to `&#x27;`, and three of these
 * sentences carry one. A render test that pins the raw sentence would fail
 * against correct output; a test that pins the escaped form and a page that
 * drifts from the constant would both pass. Exporting the constant makes the
 * copy itself unit-testable without a DOM — the `collaboratorErrorMessage`
 * idiom from `features/admin/AccessPanel.tsx`.
 */

/** The one refusal a parent can actually hit: five sends in a rolling hour. */
export const FEEDBACK_RATE_LIMITED = "You've sent a few already. Try again in an hour.";

/** Everything else — offline, a 500, a body the schema refuses. */
export const FEEDBACK_SEND_FAILED = "Couldn't send. Check your connection and try again.";

/**
 * What travels with the words, said plainly and before the send rather than
 * in a policy page afterwards. All three facts are true of the payload: the
 * route PATTERN (never the real path), the app version, and the account the
 * session belongs to — which is where a reply would go.
 */
export const FEEDBACK_DISCLOSURE =
  "We attach which screen you're on and the app version, and we may reply to your account email.";

/** The toast on a successful send. */
export const FEEDBACK_CELEBRATION = { title: "Thanks, we read every message", emoji: "💌" } as const;

/**
 * The server answers in status codes; the page answers in sentences. 429 is
 * the only one worth its own words — it is the only refusal a parent can fix
 * by waiting, and "something went wrong" would send them back to retype the
 * message they just wrote.
 */
export function feedbackErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.status === 429 ? FEEDBACK_RATE_LIMITED : FEEDBACK_SEND_FAILED;
}

/**
 * Sends one message. Both ends are validated against the shared schema
 * rather than cast: on the way out because `routePattern` is a closed enum
 * and a free-form path is exactly what must never travel, and on the way
 * back because the 201 body is an id and nothing else — anything larger
 * would mean the server started echoing the message, which is a change worth
 * failing on rather than rendering.
 */
export async function sendFeedback(input: CreateFeedbackInput): Promise<FeedbackCreatedResponse> {
  const body = await apiPost<unknown>("/api/feedback", createFeedbackInputSchema.parse(input));
  return feedbackCreatedResponseSchema.parse(body);
}
