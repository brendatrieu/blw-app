// Drives the Password help panel's real handlers without a DOM (ledger 821).
// useState is a tiny store, the mutation is a fake whose answer each test
// picks, and the clipboard is a stand-in. Harness idiom from
// AccessPanel.handlers.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminResetLinkResponse, GrantCollaboratorInput } from "@blw/shared";

const LINK: AdminResetLinkResponse = {
  url: "https://littlemeals.test/api/auth/reset-password/abcdefghijklmnopqrstuvwx?callbackURL=%2Freset-password",
  expiresAt: "2026-10-15T21:00:00.000Z",
};

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const calls = { creates: [] as GrantCollaboratorInput[], copies: [] as string[], resets: 0 };
  // `error` answers a request without a password, `withPassword` one with.
  const outcome = { error: null as string | null, withPassword: null as string | null };
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
      calls.resets = 0;
      outcome.error = null;
      outcome.withPassword = null;
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
  onSettled?: () => void;
}

vi.mock("./hooks.js", () => ({
  useCreateResetLink: () => ({
    isPending: false,
    mutate: (input: GrantCollaboratorInput, options?: MutateOptions) => {
      h.calls.creates.push(input);
      const code = input.password === undefined ? h.outcome.error : h.outcome.withPassword;
      if (code) options?.onError?.(new Error(code));
      else options?.onSuccess?.(LINK);
      options?.onSettled?.();
    },
    reset: () => {
      h.calls.resets += 1;
    },
  }),
}));

import { ResetLinkPanel, resetLinkErrorMessage } from "./ResetLinkPanel.js";
import { PasswordPrompt } from "./PasswordPrompt.js";

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
    expect(h.calls.creates).toEqual([{ email: "parent@example.com" }]);

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

describe("an older session confirms the owner's password in the panel (830)", () => {
  const prompt = () => collect(panel(), (element) => element.type === PasswordPrompt)[0];
  const confirm = (password: string) => (prompt()!.props.onConfirm as (value: string) => void)(password);

  it("asks right there, then makes the link with the same address and the password", () => {
    h.outcome.error = "password_required";
    type("parent@example.com");
    submit();
    expect(prompt()).toBeDefined();
    expect(collect(panel(), (element) => element.props.role === "alert")).toHaveLength(0);

    confirm("owner-password");
    expect(h.calls.creates).toEqual([
      { email: "parent@example.com" },
      { email: "parent@example.com", password: "owner-password" },
    ]);
    const tree = panel();
    expect(collect(tree, (element) => element.props["aria-label"] === "Reset link")).toHaveLength(1);
    expect(collect(tree, (element) => element.type === PasswordPrompt)).toHaveLength(0);
  });

  it("keeps asking with the reason after a wrong password or too many tries", () => {
    h.outcome.error = "password_required";
    type("parent@example.com");
    submit();
    h.outcome.withPassword = "invalid_password";
    confirm("wrong");
    expect(prompt()!.props.error).toBe("That password is not right.");
    h.outcome.withPassword = "rate_limited";
    confirm("wrong-again");
    expect(prompt()!.props.error).toBe("Too many attempts. Wait a few minutes and try again.");
    expect(collect(panel(), (element) => element.props["aria-label"] === "Reset link")).toHaveLength(0);
  });

  it("hands the action's own refusal back to the panel and closes the prompt", () => {
    h.outcome.error = "password_required";
    type("typo@example.com");
    submit();
    h.outcome.withPassword = "unknown_user";
    confirm("owner-password");
    const tree = panel();
    expect(collect(tree, (element) => element.type === PasswordPrompt)).toHaveLength(0);
    const [alert] = collect(tree, (element) => element.props.role === "alert");
    expect(text(alert).join("")).toBe("No account uses that email.");
  });

  it("closes the prompt when the address is edited: it was for the old one", () => {
    h.outcome.error = "password_required";
    type("parent@example.com");
    submit();
    type("other@example.com");
    expect(prompt()).toBeUndefined();
  });

  it("lets go of every request once it has answered, the password in it included (840)", () => {
    h.outcome.error = "password_required";
    type("parent@example.com");
    submit();
    h.outcome.withPassword = "invalid_password";
    confirm("wrong");
    h.outcome.withPassword = null;
    confirm("owner-password");
    expect(h.calls.creates).toHaveLength(3);
    expect(h.calls.resets).toBe(3);
    // The link itself stays on screen: the panel holds its own copy.
    expect(collect(panel(), (element) => element.props["aria-label"] === "Reset link")).toHaveLength(1);
  });

  it("keeps the sign-in-again sentence for an owner with no password", () => {
    h.outcome.error = "reauth_required";
    type("parent@example.com");
    submit();
    expect(prompt()).toBeUndefined();
    const [alert] = collect(panel(), (element) => element.props.role === "alert");
    expect(text(alert).join("")).toContain("Sign out, sign back in, and try again.");
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
