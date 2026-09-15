import { useMutation } from "@tanstack/react-query";
import type { CreateFeedbackInput } from "@blw/shared";
import { track } from "../../lib/usage/track.js";
import { sendFeedback } from "./api.js";

/**
 * Sending feedback is a mutation with no cache to update: nothing the parent
 * can see reads the feedback table, so there is nothing to invalidate. The
 * inbox is an admin surface with its own keys, refetched on the admin's own
 * schedule.
 *
 * `feedback_sent` fires from `onSuccess` — once, on persistence, never per
 * attempt — the same rule `meal_logged` follows. And it carries NO props at
 * all: the event's shared schema is `z.object({}).strict()`, so the message
 * cannot reach analytics even by accident. That is a guarantee of the type,
 * not a convention this call site is trusted to keep.
 */
export function useSendFeedback() {
  return useMutation({
    mutationFn: (input: CreateFeedbackInput) => sendFeedback(input),
    onSuccess: () => {
      track("feedback_sent", {});
    },
  });
}
