// Drives the Password help panel's real handlers without a DOM (ledger 821).
// useState is a tiny store, the mutation is a fake whose answer each test
// picks, and the clipboard is a stand-in. Harness idiom from
// AccessPanel.handlers.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminResetLinkResponse } from "@blw/shared";

const LINK: AdminResetLinkResponse = {
  url: "https://littlemeals.test/api/auth/reset-password/abcdefghijklmnopqrstuvwx?callbackURL=%2Freset-password",
  expiresAt: "2026-10-15T21:00:00.000Z",
};

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const calls = { creates: [] as string[], copies: [] as string[] };
  const outcome = { error: null as string | null };
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
      calls.creates = [];
      calls.copies = [];
      outcome.error = null;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

interface MutateOptions {
  onSuccess?: (link: AdminResetLinkResponse) => void;
  onError?: (error: Error) => void;
}

vi.mock("./hooks.js", () => ({
  useCreateResetLink: () => ({
    isPending: false,
    mutate: (email: string, options?: MutateOptions) => {
      h.calls.creates.push(email);
      if (h.outcome.error) options?.onError?.(new Error(h.outcome.error));
      else options?.onSuccess?.(LINK);
    },
  }),
}));

import { ResetLinkPanel, resetLinkErrorMessage } from "./ResetLinkPanel.js";

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
  if (typeof node === "string" || typeof node === "number") out.push(String(node));
  else if (Array.isArray(node)) for (const child of node) text(child, out);
  else if (isElement(node)) text(node.props.children, out);
  return out;
}

function panel(): Rendered {
  h.store.i = 0;
  return (ResetLinkPanel as unknown as () => Rendered)();
}

function type(value: string) {
  const [input] = collect(panel(), (element) => element.props.id === "admin-reset-email");
  (input!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}

function submit() {
  const [form] = collect(panel(), (element) => element.type === "form");
  (form!.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
}

// Node 24 ships a read-only `navigator`; each test swaps in its own and the
// original goes back afterwards.
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

afterEach(() => {
  if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
});

beforeEach(() => {
  h.reset();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: (value: string) => {
          h.calls.copies.push(value);
          return Promise.resolve();
        },
      },
    },
  });
});

describe("making a link", () => {
  it("sends the trimmed address and shows the link once, ready to copy", async () => {
    type("  parent@example.com ");
    submit();
    expect(h.calls.creates).toEqual(["parent@example.com"]);

    const tree = panel();
    const [box] = collect(tree, (element) => element.props["aria-label"] === "Reset link");
    expect(box!.props.value).toBe(LINK.url);
    expect(box!.props.readOnly).toBe(true);
    expect(text(tree).join("")).toContain("Link for parent@example.com");
    expect(text(tree).join("")).toContain("It won't be shown again.");
    // The field is emptied, so the next parent starts clean.
    const [input] = collect(tree, (element) => element.props.id === "admin-reset-email");
    expect(input!.props.value).toBe("");

    const [copy] = collect(tree, (element) => text(element).join("") === "Copy link" && element.props.type === "button");
    (copy!.props.onClick as () => void)();
    await Promise.resolve();
    expect(h.calls.copies).toEqual([LINK.url]);
    expect(collect(panel(), (element) => text(element).join("") === "Copied")).not.toHaveLength(0);
  });

  it("asks for an address instead of sending an empty one", () => {
    submit();
    expect(h.calls.creates).toEqual([]);
    const [field] = collect(panel(), (element) => element.props.htmlFor === "admin-reset-email");
    expect(field!.props.error).toBe("Enter the email address they signed up with");
  });

  it("turns each refusal into a sentence and shows no link", () => {
    h.outcome.error = "no_password";
    type("google-parent@example.com");
    submit();
    const tree = panel();
    const [alert] = collect(tree, (element) => element.props.role === "alert");
    expect(text(alert).join("")).toBe("This account signs in with Google, so there's no password to reset.");
    expect(collect(tree, (element) => element.props["aria-label"] === "Reset link")).toHaveLength(0);
  });

  it("takes the last link off screen as soon as another is asked for, so a failed retry can't leave it (826 N5)", () => {
    type("first-parent@example.com");
    submit();
    expect(collect(panel(), (element) => element.props["aria-label"] === "Reset link")).toHaveLength(1);

    h.outcome.error = "unknown_user";
    type("typo-parent@example.com");
    submit();
    const tree = panel();
    expect(collect(tree, (element) => element.props["aria-label"] === "Reset link")).toHaveLength(0);
    expect(text(tree).join("")).not.toContain("first-parent@example.com");
  });

  it("survives a browser with no clipboard: the link stays in the box", async () => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    type("parent@example.com");
    submit();
    const [copy] = collect(panel(), (element) => text(element).join("") === "Copy link" && element.props.type === "button");
    (copy!.props.onClick as () => void)();
    await Promise.resolve();
    expect(collect(panel(), (element) => element.props["aria-label"] === "Reset link")).toHaveLength(1);
  });
});

describe("resetLinkErrorMessage", () => {
  it("speaks for the reset-only codes and borrows the Access panel's for the rest", () => {
    expect(resetLinkErrorMessage("owner_only")).toBe("Only the owner can make reset links.");
    expect(resetLinkErrorMessage("unknown_user")).toBe("No account uses that email.");
    expect(resetLinkErrorMessage("reauth_required")).toBe(
      "For your safety this needs a fresh sign-in. Sign out, sign back in, and try again.",
    );
    expect(resetLinkErrorMessage("anything-else")).toBe("Something went wrong. Try again in a moment.");
  });
});
