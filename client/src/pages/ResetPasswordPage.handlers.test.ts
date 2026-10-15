// Drives the reset page's real effect and submit handler without a DOM
// (ledger 820). React's useState/useEffect are a tiny store, the router's
// location/navigate are stand-ins, and better-auth's resetPassword is a fake
// whose answer each test chooses. Harness idiom from FeedbackPage.handlers.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const calls = { navigates: [] as unknown[][], resets: [] as unknown[] };
  const world = {
    location: { pathname: "/reset-password", search: "", state: null as unknown },
    answer: { data: { status: true }, error: null } as { data: unknown; error: unknown },
  };
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
      calls.navigates = [];
      calls.resets = [];
      world.location = { pathname: "/reset-password", search: "", state: null };
      world.answer = { data: { status: true }, error: null };
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useEffect: (effect: () => void) => effect() };
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocation: () => h.world.location,
    useNavigate: () => (...args: unknown[]) => {
      h.calls.navigates.push(args);
    },
  };
});

vi.mock("../lib/auth.js", () => ({
  resetPassword: (input: unknown) => {
    h.calls.resets.push(input);
    return Promise.resolve(h.world.answer);
  },
  authErrorMessage: (error: { message?: string } | null) => error?.message ?? null,
}));

import { ResetPasswordPage } from "./ResetPasswordPage.js";

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
  return (ResetPasswordPage as unknown as () => Rendered)();
}

function type(tree: Rendered, id: string, value: string) {
  const [input] = collect(tree, (element) => element.props.id === id);
  (input!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}

async function submit(tree: Rendered) {
  const [form] = collect(tree, (element) => element.type === "form");
  await (form!.props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)({
    preventDefault: () => {},
  });
}

beforeEach(() => {
  h.reset();
});

describe("the token in the link", () => {
  it("leaves the address bar at once, parked in history state", () => {
    h.world.location.search = "?token=tok-123";
    page();
    expect(h.calls.navigates).toEqual([["/reset-password", { replace: true, state: { resetToken: "tok-123" } }]]);
    // The URL it navigates to carries no token at all.
    expect(String(h.calls.navigates[0]![0])).not.toContain("tok-123");
  });

  it("is read back from history state, with nothing left to strip", () => {
    h.world.location.state = { resetToken: "tok-123" };
    const tree = page();
    expect(h.calls.navigates).toEqual([]);
    expect(collect(tree, (element) => element.type === "form")).toHaveLength(1);
  });
});

describe("saving", () => {
  beforeEach(() => {
    h.world.location.state = { resetToken: "tok-123" };
  });

  it("sends the new password with the token, then asks for a fresh sign-in", async () => {
    type(page(), "reset-password", "brand-new-pass");
    type(page(), "reset-confirm", "brand-new-pass");
    await submit(page());
    expect(h.calls.resets).toEqual([{ newPassword: "brand-new-pass", token: "tok-123" }]);
    expect(h.calls.navigates).toEqual([["/login", { replace: true, state: { passwordReset: true } }]]);
  });

  it("sends nothing while the two copies differ", async () => {
    type(page(), "reset-password", "brand-new-pass");
    type(page(), "reset-confirm", "brand-new-pasS");
    await submit(page());
    expect(h.calls.resets).toEqual([]);
    const [confirm] = collect(page(), (element) => element.props.htmlFor === "reset-confirm");
    expect(confirm!.props.error).toBe("The passwords don't match");
  });

  it("turns a spent or expired token into the dead-link screen", async () => {
    h.world.answer = { data: null, error: { code: "INVALID_TOKEN", message: "Invalid token", status: 400 } };
    type(page(), "reset-password", "brand-new-pass");
    type(page(), "reset-confirm", "brand-new-pass");
    await submit(page());
    expect(h.calls.navigates).toEqual([]);
    expect(text(page()).join(" ")).toContain("This link no longer works");
  });

  it("shows any other refusal and stays on the form", async () => {
    h.world.answer = { data: null, error: { code: "RATE_LIMITED", message: "Too many requests.", status: 429 } };
    type(page(), "reset-password", "brand-new-pass");
    type(page(), "reset-confirm", "brand-new-pass");
    await submit(page());
    const tree = page();
    const [alert] = collect(tree, (element) => element.props.role === "alert");
    expect(text(alert).join("")).toBe("Too many requests.");
    expect(collect(tree, (element) => element.type === "form")).toHaveLength(1);
  });
});
