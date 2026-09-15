import { useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { FEEDBACK_MESSAGE_MAX } from "@blw/shared";
import {
  FEEDBACK_CELEBRATION,
  feedbackErrorMessage,
} from "../features/feedback/api.js";
import { useSendFeedback } from "../features/feedback/hooks.js";
import {
  FEEDBACK_FIELD_IDS,
  FEEDBACK_FIELD_ORDER,
  validateFeedback,
} from "../features/feedback/validate.js";
import { BackButton } from "../components/ui/BackButton.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Textarea } from "../components/ui/Input.js";
import { getAutosizeProps } from "../components/ui/autosize.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { useCelebration } from "../components/ui/Celebration.js";
import { appVersion } from "../lib/usage/context.js";
import { toRoutePattern } from "../lib/usage/routes.js";
import { useSubmitValidation } from "../lib/forms.js";

/**
 * Send feedback (item 360): one box, one button, and a sentence saying what
 * rides along with the words.
 *
 * **Why the screen is attached at all.** "The list is broken" is unanswerable
 * without knowing which list; asking the parent to say costs them a sentence
 * and usually gets a guess. So the page sends the route PATTERN it is reading
 * off `useLocation().pathname` — never the pathname itself, which is the one
 * place a baby's id or a food slug could ride along — plus the build the
 * report came from. Both are disclosed above the button, before the send,
 * rather than buried in a policy page after it.
 *
 * **Why the box is validated here as well as on the server.** The server
 * spends a send from the hour's budget on the ATTEMPT, before it parses the
 * body — so a submitted blank box would cost a parent one of five sends and
 * give them a 400 for it. `attemptSubmit()` runs first and returns on false,
 * and the API is never reached.
 */
export function FeedbackPage() {
  const { pathname } = useLocation();
  const { celebrate } = useCelebration();
  const send = useSendFeedback();

  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { attemptSubmit } = useSubmitValidation(
    { message },
    validateFeedback,
    FEEDBACK_FIELD_ORDER,
    FEEDBACK_FIELD_IDS,
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (send.isPending) return;
    if (!attemptSubmit()) return;

    send.mutate(
      {
        message: message.trim(),
        routePattern: toRoutePattern(pathname),
        appVersion: appVersion(),
      },
      {
        onSuccess: () => {
          // Cleared, so the next thought starts on an empty box rather than
          // on a message that already arrived and could be sent twice.
          setMessage("");
          celebrate(FEEDBACK_CELEBRATION);
        },
        onError: (mutationError) => {
          setError(feedbackErrorMessage(mutationError));
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Send feedback" emoji="💌" leading={<BackButton fallback="/more" />} />

      <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        <Field label="Your message" htmlFor="feedback-message">
          <Textarea
            id="feedback-message"
            rows={2}
            maxLength={FEEDBACK_MESSAGE_MAX}
            placeholder="Something could be better? Let us know!"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setError(null);
            }}
            {...getAutosizeProps()}
          />
        </Field>

        {/* Announced politely rather than shown silently: the cap is only
            interesting as it is approached, and a screen reader that
            interrupted on every keystroke would be worse than no counter. */}
        <p aria-live="polite" className="text-right text-xs text-[var(--color-text-muted)]">
          {`${message.length}/${FEEDBACK_MESSAGE_MAX}`}
        </p>

        <div>
          {/* Disabled until there is something to send: the owner wants no
              red "say more" line here, so the button carries the rule. */}
          <Button type="submit" disabled={send.isPending || message.trim().length === 0} className="w-full">
            {send.isPending ? "Sending…" : "Send"}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
