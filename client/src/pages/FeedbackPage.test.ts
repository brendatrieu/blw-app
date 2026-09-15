import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FEEDBACK_MESSAGE_MAX } from "@blw/shared";

/**
 * The send-feedback screen's render pins (item 360).
 *
 * Note the escaping: `renderToString` emits `&#x27;` for an apostrophe, and
 * the disclosure line carries one ("you're"). The sentence is pinned in its
 * escaped form here and in its raw form by the constant's own test — pinning
 * the raw string against the HTML would fail on correct output.
 */

vi.mock("../features/feedback/hooks.js", () => ({
  useSendFeedback: () => ({ mutate: () => {}, isPending: false }),
}));

vi.mock("../components/ui/Celebration.js", () => ({
  useCelebration: () => ({ celebrate: () => {} }),
}));

import { FEEDBACK_DISCLOSURE } from "../features/feedback/api.js";
import { FeedbackPage } from "./FeedbackPage.js";

function render(): string {
  return renderToString(
    createElement(MemoryRouter, { initialEntries: ["/feedback"] }, createElement(FeedbackPage, null)),
  );
}

describe("FeedbackPage", () => {
  it("opens with the box, named and labelled", () => {
    const html = render();
    expect(html).toContain(">Send feedback<");
    expect(html).toContain(">💌</span>");
    expect(html).toContain('id="feedback-message"');
    expect(html).toContain('for="feedback-message"');
    expect(html).toContain("<textarea");
  });

  it("offers a way back to More, since there is no browser chrome in the PWA", () => {
    // The chevron is icon-only; "Back" is the sr-only word that goes with it.
    expect(render()).toContain(">Back<");
  });

  it("grows with what is typed in it, and stops at the length the server accepts", () => {
    const html = render();
    // The attribute `getAutosizeProps()` renders: unwiring item 300 here
    // would be invisible at runtime but is visible to this line.
    expect(html).toContain('data-autosize="true"');
    // React's server renderer emits the prop's own spelling here; HTML
    // attribute names are case-insensitive, so the pin is too.
    expect(html.toLowerCase()).toContain(`maxlength="${FEEDBACK_MESSAGE_MAX}"`);
    expect(FEEDBACK_MESSAGE_MAX).toBe(2000);
  });

  it("counts against that same number, announced politely", () => {
    const html = render();
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(">0/2000<");
  });

  it("says what travels with the message, before the send rather than after it", () => {
    const html = render();
    expect(html).toContain(
      "We attach which screen you&#x27;re on and the app version, and we may reply to your account email.",
    );
    // The page renders the constant, not a second copy of the sentence.
    expect(FEEDBACK_DISCLOSURE).toBe(
      "We attach which screen you're on and the app version, and we may reply to your account email.",
    );
  });

  it("leaves the submit enabled on an empty box (item 235)", () => {
    const html = render();
    expect(html).toContain(">Send<");
    expect(html).toMatch(/<button[^>]*type="submit"/);
    // Nothing on this screen starts out disabled — a dead button explains
    // nothing; the submit is what asks for the message.
    expect(html).not.toContain("disabled=");
  });

  it("shouts at nobody before they have tried to send", () => {
    expect(render()).not.toContain('role="alert"');
  });
});
