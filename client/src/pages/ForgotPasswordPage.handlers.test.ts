// Drives the "Forgot password?" page's real submit handler without a DOM
// (ledger 822). Harness idiom from ResetPasswordPage.handlers.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const calls = { requests: [] as unknown[] };
  const world = { answer: { data: { status: true }, error: null } as { data: unknown; error: unknown } };
  return {
    store,
    calls,
    world,
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
      calls.requests = [];
      world.answer = { data: { status: true }, error: null };
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useLocation: () => ({ pathname: "/forgot-password", search: "", state: null }) };
});

vi.mock("../lib/auth.js", () => ({
  requestPasswordReset: (input: unknown) => {
    h.calls.requests.push(input);
    return Promise.resolve(h.world.answer);
  },
  authErrorMessage: (error: { message?: string } | null) => error?.message ?? null,
  useAuthConfig: () => ({ data: { googleEnabled: false, emailEnabled: true } }),
}));

import { ForgotPasswordPage } from "./ForgotPasswordPage.js";

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
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const child of node) text(child, out);
  else if (isElement(node)) text(node.props.children, out);
  return out;
}

function page(): Rendered {
  h.store.i = 0;
  return (ForgotPasswordPage as unknown as () => Rendered)();
}

function type(value: string) {
  const [input] = collect(page(), (element) => element.props.id === "forgot-email");
  (input!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}

async function submit() {
  const [form] = collect(page(), (element) => element.type === "form");
  await (form!.props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)({
    preventDefault: () => {},
  });
}

const CONFIRMATION =
  "If an account uses that email, we've sent it a link to reset your password. The link works for one hour.";

beforeEach(() => {
  h.reset();
});

describe("asking for a link", () => {
  it("asks better-auth for a link that lands on the reset page, then answers neutrally", async () => {
    type("  parent@example.com ");
    await submit();
    expect(h.calls.requests).toEqual([{ email: "parent@example.com", redirectTo: "/reset-password" }]);
    const tree = page();
    expect(text(tree).join(" ")).toContain("Check your email");
    expect(text(tree).join(" ")).toContain(CONFIRMATION);
  });

  it("sends nothing for a missing or malformed address", async () => {
    await submit();
    type("parent@example");
    await submit();
    expect(h.calls.requests).toEqual([]);
  });

  it("shows a request that never landed instead of pretending it was sent", async () => {
    h.world.answer = { data: null, error: { status: 429, message: "Too many requests. Please try again later." } };
    type("parent@example.com");
    await submit();
    const tree = page();
    const [alert] = collect(tree, (element) => element.props.role === "alert");
    expect(text(alert).join("")).toBe("Too many requests. Please try again later.");
    expect(text(tree).join(" ")).not.toContain("Check your email");
  });
});
