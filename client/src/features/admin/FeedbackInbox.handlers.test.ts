// Drives the inbox's real handlers without a DOM: which patch each button
// sends, which buttons a message gets in each tab, and what switching tabs
// actually asks the server for. Harness idiom ported from
// AccessPanel.handlers.test.ts.
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { AdminFeedbackItem, FeedbackFilter } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const calls = { patches: [] as unknown[], asked: [] as string[] };
  const data = {
    items: [] as AdminFeedbackItem[],
    summary: undefined as { new: number; read: number; resolved: number; archived: number } | undefined,
  };

  return {
    store,
    calls,
    data,
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
      calls.patches = [];
      calls.asked = [];
      data.items = [];
      data.summary = { new: 1, read: 0, resolved: 0, archived: 0 };
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

vi.mock("./hooks.js", () => ({
  useFeedbackSummary: () => ({ data: h.data.summary }),
  useAdminFeedback: (filter: string) => {
    h.calls.asked.push(filter);
    return { data: { items: h.data.items }, isLoading: false, isError: false };
  },
  useUpdateFeedback: () => ({
    isPending: false,
    mutate: (variables: unknown) => {
      h.calls.patches.push(variables);
    },
  }),
}));

import { FeedbackInbox, feedbackActions, feedbackTabCount, relativeTime } from "./FeedbackInbox.js";

const ITEM: AdminFeedbackItem = {
  id: "feedback-1",
  message: "The storage list keeps scrolling to the top.",
  senderEmail: "parent@example.com",
  routePattern: "/storage",
  appVersion: "abc1234",
  status: "new",
  archived: false,
  createdAt: "2026-09-13T15:30:00.000Z",
  readAt: null,
  resolvedAt: null,
};

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

function panel(): Rendered {
  h.store.i = 0;
  return (FeedbackInbox as unknown as () => Rendered)();
}

/** Every action button's visible label, in render order. */
function actionLabels(tree: Rendered): string[] {
  return collect(tree, (element) => typeof element.props.onClick === "function").map((button) =>
    String(button.props.children),
  );
}

function click(tree: Rendered, label: string) {
  const [button] = collect(
    tree,
    (element) => typeof element.props.onClick === "function" && element.props.children === label,
  );
  (button!.props.onClick as () => void)();
}

function switchTo(tree: Rendered, filter: FeedbackFilter) {
  const [control] = collect(tree, (element) => element.props["aria-label"] === "Feedback filter");
  (control!.props.onChange as (value: FeedbackFilter) => void)(filter);
}

beforeEach(() => {
  h.reset();
});

describe("the tabs", () => {
  it("opens on the messages that still need a human", () => {
    panel();
    expect(h.calls.asked).toEqual(["open"]);
  });

  it("asks the server for the tab that was tapped", () => {
    switchTo(panel(), "archived");
    h.calls.asked = [];
    panel();
    expect(h.calls.asked).toEqual(["archived"]);
  });

  it("counts Open as unread plus read, and the other two as their own buckets", () => {
    const summary = { new: 2, read: 3, resolved: 4, archived: 5 };
    expect(feedbackTabCount(summary, "open")).toBe(5);
    expect(feedbackTabCount(summary, "resolved")).toBe(4);
    expect(feedbackTabCount(summary, "archived")).toBe(5);
    // Nothing yet reads as zero, not as a blank that resizes the tabs.
    expect(feedbackTabCount(undefined, "open")).toBe(0);
  });
});

describe("the actions each tab offers", () => {
  it("gives an unread message Mark read, Resolve and Clear", () => {
    h.data.items = [ITEM];
    expect(actionLabels(panel())).toEqual(["Mark read", "Resolve", "Clear"]);
  });

  it("drops Mark read once the message has been read — an action that changes nothing is noise", () => {
    h.data.items = [{ ...ITEM, status: "read", readAt: "2026-09-13T16:00:00.000Z" }];
    expect(actionLabels(panel())).toEqual(["Resolve", "Clear"]);
  });

  it("offers Reopen and Clear on the Resolved tab", () => {
    h.data.items = [{ ...ITEM, status: "resolved", resolvedAt: "2026-09-14T09:00:00.000Z" }];
    switchTo(panel(), "resolved");
    expect(actionLabels(panel())).toEqual(["Reopen", "Clear"]);
  });

  it("offers only Restore on the Archived tab — the tab IS the undo", () => {
    h.data.items = [{ ...ITEM, archived: true }];
    switchTo(panel(), "archived");
    expect(actionLabels(panel())).toEqual(["Restore"]);
    // Nothing on this panel deletes anything.
    expect(actionLabels(panel())).not.toContain("Delete");
  });
});

describe("what each action sends", () => {
  it("marks read, resolves and clears with exactly one field each", () => {
    h.data.items = [ITEM];
    click(panel(), "Mark read");
    click(panel(), "Resolve");
    click(panel(), "Clear");
    expect(h.calls.patches).toEqual([
      { id: "feedback-1", patch: { status: "read" } },
      { id: "feedback-1", patch: { status: "resolved" } },
      { id: "feedback-1", patch: { archived: true } },
    ]);
  });

  it("reopens to READ, not to new — the message has already been seen", () => {
    h.data.items = [{ ...ITEM, status: "resolved" }];
    switchTo(panel(), "resolved");
    click(panel(), "Reopen");
    expect(h.calls.patches).toEqual([{ id: "feedback-1", patch: { status: "read" } }]);
  });

  it("restores by un-archiving, leaving the status it had alone", () => {
    h.data.items = [{ ...ITEM, archived: true, status: "read" }];
    switchTo(panel(), "archived");
    click(panel(), "Restore");
    expect(h.calls.patches).toEqual([{ id: "feedback-1", patch: { archived: false } }]);
  });
});

describe("an empty tab", () => {
  it("says so in the same three words on every tab", () => {
    for (const filter of ["open", "resolved", "archived"] as const) {
      h.reset();
      switchTo(panel(), filter);
      expect(text(panel().props.children).join(" "), filter).toContain("Nothing here.");
    }
  });
});

describe("feedbackActions", () => {
  it("is the whole table, readable without rendering anything", () => {
    expect(feedbackActions(ITEM, "open").map((action) => action.patch)).toEqual([
      { status: "read" },
      { status: "resolved" },
      { archived: true },
    ]);
    expect(feedbackActions({ ...ITEM, status: "resolved" }, "resolved").map((action) => action.label)).toEqual([
      "Reopen",
      "Clear",
    ]);
    expect(feedbackActions({ ...ITEM, archived: true }, "archived").map((action) => action.label)).toEqual([
      "Restore",
    ]);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("reads an inbox by recency, in the coarsest unit that is still useful", () => {
    expect(relativeTime("2026-09-15T11:59:30.000Z", now)).toBe("just now");
    expect(relativeTime("2026-09-15T11:20:00.000Z", now)).toBe("40m ago");
    expect(relativeTime("2026-09-15T04:00:00.000Z", now)).toBe("8h ago");
    expect(relativeTime("2026-09-12T12:00:00.000Z", now)).toBe("3d ago");
    expect(relativeTime("2026-09-01T12:00:00.000Z", now)).toBe("2w ago");
    expect(relativeTime("2026-06-15T12:00:00.000Z", now)).toBe("3mo ago");
  });

  it("never renders a clock skew as the future", () => {
    expect(relativeTime("2026-09-15T12:00:20.000Z", now)).toBe("just now");
  });

  it("returns nothing at all rather than 'NaN ago' for a stamp it cannot read", () => {
    expect(relativeTime("not a date", now)).toBe("");
  });
});
