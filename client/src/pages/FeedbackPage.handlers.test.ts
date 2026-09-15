// Drives the send-feedback page's real handlers without a DOM.
//
// A renderToString suite can only ever see the page's first state, so what
// happens *after* the button — what is actually sent, what a blank box does,
// which sentence a refusal turns into, whether the box is emptied — would
// otherwise be unpinned. React's `useState` is replaced with a tiny store so
// the page can be called as a plain function, its element tree walked, and
// its callbacks invoked against a fake mutation. Harness idiom ported from
// features/admin/AccessPanel.handlers.test.ts.
import { describe, expect, it, beforeEach, vi } from "vitest";
import { ApiError } from "../lib/api.js";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const calls = { sends: [] as unknown[], celebrations: [] as unknown[] };
  const outcome = { error: null as unknown };

  return {
    store,
    calls,
    outcome,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] =
          typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    reset: () => {
      store.states = [];
      store.i = 0;
      calls.sends = [];
      calls.celebrations = [];
      outcome.error = null;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

// `toRoutePattern` needs the real `matchPath`; only the page's own read of
// "where am I" is replaced.
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useLocation: () => ({ pathname: "/feedback" }) };
});

interface MutateOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

vi.mock("../features/feedback/hooks.js", () => ({
  useSendFeedback: () => ({
    isPending: false,
    mutate: (input: unknown, options?: MutateOptions) => {
      h.calls.sends.push(input);
      if (h.outcome.error) options?.onError?.(h.outcome.error);
      else options?.onSuccess?.();
    },
  }),
}));

vi.mock("../components/ui/Celebration.js", () => ({
  useCelebration: () => ({
    celebrate: (options: unknown) => {
      h.calls.celebrations.push(options);
    },
  }),
}));

import {
  FEEDBACK_CELEBRATION,
  FEEDBACK_RATE_LIMITED,
  FEEDBACK_SEND_FAILED,
} from "../features/feedback/api.js";
import { FeedbackPage } from "./FeedbackPage.js";

interface Rendered {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}

function isElement(node: unknown): node is Rendered {
  return typeof node === "object" && node !== null && "props" in node;
}

function collect(node: unknown, match: (element: Rendered) => boolean, out: Rendered[] = []): Rendered[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, match, out);
    return out;
  }
  if (!isElement(node)) return out;
  if (match(node)) out.push(node);
  collect(node.props.children, match, out);
  return out;
}

/** All plain strings in the tree, so an alert's sentence can be read back. */
function text(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) text(child, out);
    return out;
  }
  if (isElement(node)) text(node.props.children, out);
  return out;
}

function page(): Rendered {
  h.store.i = 0;
  return (FeedbackPage as unknown as () => Rendered)();
}

function type(tree: Rendered, value: string) {
  const [box] = collect(tree, (element) => element.props.id === "feedback-message");
  (box!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}

function submit(tree: Rendered) {
  const [form] = collect(tree, (element) => element.type === "form");
  (form!.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
}

function boxValue(tree: Rendered): unknown {
  const [box] = collect(tree, (element) => element.props.id === "feedback-message");
  return box?.props.value;
}

function fieldError(tree: Rendered): unknown {
  const [field] = collect(tree, (element) => element.props.htmlFor === "feedback-message");
  return field?.props.error;
}

function sentences(tree: Rendered): string {
  return text(tree.props.children).join(" ");
}

beforeEach(() => {
  h.reset();
});

describe("sending", () => {
  it("sends the trimmed message with the screen as a PATTERN and the build it came from", () => {
    type(page(), "  The storage list keeps scrolling.  ");
    submit(page());
    expect(h.calls.sends).toEqual([
      {
        message: "The storage list keeps scrolling.",
        routePattern: "/feedback",
        appVersion: "test",
      },
    ]);
  });

  it("never sends a pathname, only a pattern the shared enum allows", () => {
    type(page(), "hi");
    submit(page());
    const [sent] = h.calls.sends as Array<{ routePattern: string }>;
    expect(sent!.routePattern.startsWith("/")).toBe(true);
    expect(sent!.routePattern).not.toContain("?");
  });

  it("thanks the parent and empties the box once the server has it", () => {
    type(page(), "Found a typo on the storage page");
    submit(page());
    expect(h.calls.celebrations).toEqual([FEEDBACK_CELEBRATION]);
    expect(h.calls.celebrations).toEqual([{ title: "Thanks, we read every message", emoji: "💌" }]);
    expect(boxValue(page())).toBe("");
  });
});

describe("a blank box", () => {
  it("asks for words instead of spending one of the hour's five sends", () => {
    // The server charges the budget by the attempt, before it parses the
    // body — so an empty submit that reached it would cost a real send and
    // answer 400. `sends` staying empty is the whole point of this test.
    submit(page());
    expect(h.calls.sends).toEqual([]);
    expect(fieldError(page())).toBe("Tell us a little more");
  });

  it("treats a box of spaces the same way", () => {
    type(page(), "     ");
    submit(page());
    expect(h.calls.sends).toEqual([]);
    expect(fieldError(page())).toBe("Tell us a little more");
  });

  it("clears its own message as soon as something is typed", () => {
    submit(page());
    type(page(), "there we go");
    expect(fieldError(page())).toBeUndefined();
  });
});

describe("refusals", () => {
  it("turns a 429 into the wait-an-hour sentence, not a status code", () => {
    h.outcome.error = new ApiError(429, "rate_limited", { error: "rate_limited", retryAfterSeconds: 900 });
    type(page(), "one more thing");
    submit(page());
    expect(sentences(page())).toContain(FEEDBACK_RATE_LIMITED);
    expect(sentences(page())).toContain("Try again in an hour.");
  });

  it("keeps the message on screen when the send fails, so nothing has to be retyped", () => {
    h.outcome.error = new ApiError(500, "server_error");
    type(page(), "a long report nobody wants to write twice");
    submit(page());
    expect(sentences(page())).toContain(FEEDBACK_SEND_FAILED);
    expect(boxValue(page())).toBe("a long report nobody wants to write twice");
    expect(h.calls.celebrations).toEqual([]);
  });

  it("says the same plain thing when the request never happened at all", () => {
    h.outcome.error = new TypeError("Failed to fetch");
    type(page(), "offline note");
    submit(page());
    expect(sentences(page())).toContain(FEEDBACK_SEND_FAILED);
  });

  it("drops a previous refusal on the next attempt", () => {
    h.outcome.error = new ApiError(500, "server_error");
    type(page(), "first try");
    submit(page());
    h.outcome.error = null;
    submit(page());
    expect(sentences(page())).not.toContain(FEEDBACK_SEND_FAILED);
    expect(h.calls.celebrations).toHaveLength(1);
  });
});
