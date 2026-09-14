// Drives the Access panel's real handlers without a DOM.
//
// A renderToString suite (AccessPanel.test.ts) can only ever see the panel's
// first state, so everything that happens *after* a tap — what gets sent to
// the server, what an empty field does, which sentence a refusal turns into —
// would otherwise be unpinned. React's `useState` is replaced with a tiny
// store so the panel can be called as a plain function, its element tree
// walked, and its callbacks invoked against fake mutations. Harness idiom
// ported from features/tour/TourDialog.handlers.test.ts.
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { AdminCollaborator } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const calls = { grants: [] as string[], revokes: [] as string[] };
  const outcome = { grant: null as string | null, revoke: null as string | null };

  return {
    store,
    calls,
    outcome,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    reset: () => {
      store.states = [];
      store.i = 0;
      calls.grants = [];
      calls.revokes = [];
      outcome.grant = null;
      outcome.revoke = null;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

interface MutateOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

vi.mock("./hooks.js", () => ({
  useCollaborators: () => ({
    data: {
      collaborators: [
        {
          userId: null,
          email: "owner@example.com",
          source: "env",
          grantedAt: null,
          grantedBy: null,
          isSelf: true,
          canRevoke: false,
        },
        {
          userId: "user-2",
          email: "mate@example.com",
          source: "database",
          grantedAt: "2026-09-01T10:00:00.000Z",
          grantedBy: "owner@example.com",
          isSelf: false,
          canRevoke: true,
        },
      ] satisfies AdminCollaborator[],
    },
    isLoading: false,
    isError: false,
  }),
  useGrantCollaborator: () => ({
    isPending: false,
    mutate: (email: string, options?: MutateOptions) => {
      h.calls.grants.push(email);
      if (h.outcome.grant) options?.onError?.(new Error(h.outcome.grant));
      else options?.onSuccess?.();
    },
  }),
  useRevokeCollaborator: () => ({
    isPending: false,
    mutate: (userId: string, options?: MutateOptions) => {
      h.calls.revokes.push(userId);
      if (h.outcome.revoke) options?.onError?.(new Error(h.outcome.revoke));
      else options?.onSuccess?.();
    },
  }),
}));

import { AccessPanel } from "./AccessPanel.js";

interface Rendered {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}

function isElement(node: unknown): node is Rendered {
  return typeof node === "object" && node !== null && "props" in node;
}

/** Every node in the unrendered tree matching `match`, depth first. */
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

function panel(): Rendered {
  h.store.i = 0;
  return (AccessPanel as unknown as () => Rendered)();
}

function submitGrant(tree: Rendered) {
  const [form] = collect(tree, (element) => element.type === "form");
  (form!.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
}

function typeEmail(tree: Rendered, value: string) {
  const [input] = collect(tree, (element) => element.props.id === "admin-grant-email");
  (input!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}

function clickRevoke(tree: Rendered) {
  // The button itself, not any ancestor whose subtree happens to contain the
  // word — `collect` is depth first and would hand back the section.
  const [button] = collect(tree, (element) => element.type === "button" && element.props.children === "Revoke");
  (button!.props.onClick as () => void)();
}

/** The inline error the grant field is showing, if any. */
function fieldError(tree: Rendered): unknown {
  const [field] = collect(tree, (element) => element.props.htmlFor === "admin-grant-email");
  return field?.props.error;
}

beforeEach(() => {
  h.reset();
});

describe("granting access", () => {
  it("sends the trimmed address the parent signed up with", () => {
    typeEmail(panel(), "  mate@example.com  ");
    submitGrant(panel());
    expect(h.calls.grants).toEqual(["mate@example.com"]);
  });

  it("empties the field once the server has agreed", () => {
    typeEmail(panel(), "mate@example.com");
    submitGrant(panel());
    const [input] = collect(panel(), (element) => element.props.id === "admin-grant-email");
    expect(input!.props.value).toBe("");
  });

  it("asks for an address rather than posting an empty one", () => {
    submitGrant(panel());
    expect(h.calls.grants).toEqual([]);
    expect(fieldError(panel())).toBe("Enter the email address they signed up with");
  });

  it("turns a stale session into the re-auth sentence, not a raw code", () => {
    h.outcome.grant = "reauth_required";
    typeEmail(panel(), "mate@example.com");
    submitGrant(panel());
    expect(text(panel().props.children).join(" ")).toContain(
      "For your safety this needs a fresh sign-in.",
    );
  });

  it("explains an address that belongs to nobody", () => {
    h.outcome.grant = "unknown_user";
    typeEmail(panel(), "nobody@example.com");
    submitGrant(panel());
    expect(text(panel().props.children).join(" ")).toContain("No account uses that address yet.");
  });

  it("clears a previous refusal as soon as the field is edited again", () => {
    h.outcome.grant = "unknown_user";
    typeEmail(panel(), "nobody@example.com");
    submitGrant(panel());
    typeEmail(panel(), "mate@example.com");
    expect(text(panel().props.children).join(" ")).not.toContain("No account uses that address yet.");
  });
});

describe("revoking access", () => {
  it("revokes by user id, never by email", () => {
    // The email is what the owner reads; the id is what the server acts on,
    // and the two must not be confusable at the call site.
    clickRevoke(panel());
    expect(h.calls.revokes).toEqual(["user-2"]);
  });

  it("explains a refusal in the same words as the grant form", () => {
    h.outcome.revoke = "cannot_demote_self";
    clickRevoke(panel());
    expect(text(panel().props.children).join(" ")).toContain("You can't remove your own access.");
  });
});
