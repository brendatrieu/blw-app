// Ledger 828: sign-in and sign-up must not navigate when their call resolves.
// better-auth refetches the session ~10 ms later, so a navigate in that gap
// reached RequireAuth while it still read signed out, and "/" sent the new
// parent to About. RequireAnonymous does the landing instead (RequireAuth.test).
// Harness idiom from ForgotPasswordPage.handlers.test.ts (no DOM).
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const calls = { navigate: [] as unknown[], auth: [] as unknown[] };
  const world = { answer: { data: { token: "t" }, error: null } as { data: unknown; error: unknown } };
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
      calls.navigate = [];
      calls.auth = [];
      world.answer = { data: { token: "t" }, error: null };
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/login", search: "", state: { from: "/more" } }),
    useNavigate: () => (...args: unknown[]) => h.calls.navigate.push(args),
  };
});

vi.mock("../lib/auth.js", () => {
  const call = (input: unknown) => {
    h.calls.auth.push(input);
    return Promise.resolve(h.world.answer);
  };
  return {
    signIn: { email: call },
    signUp: { email: call },
    authErrorMessage: (error: { message?: string } | null) => error?.message ?? null,
    useAuthConfig: () => ({ data: { googleEnabled: false, emailEnabled: false } }),
  };
});

import { LoginPage } from "./LoginPage.js";
import { SignupPage } from "./SignupPage.js";

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

const PAGES = [
  {
    name: "LoginPage",
    Page: LoginPage,
    fields: { "login-email": "parent@example.com", "login-password": "made-up-pass" },
    busy: "Signing in…",
  },
  {
    name: "SignupPage",
    Page: SignupPage,
    fields: { "signup-name": "Sam", "signup-email": "parent@example.com", "signup-password": "made-up-pass" },
    busy: "Creating account…",
  },
] as const;

beforeEach(() => {
  h.reset();
});

describe.each(PAGES)("$name on submit (ledger 828)", ({ Page, fields, busy }) => {
  const page = (): Rendered => {
    h.store.i = 0;
    return (Page as unknown as () => Rendered)();
  };
  const submitButton = () => collect(page(), (element) => element.props.type === "submit")[0]!;

  async function fillAndSubmit() {
    for (const [id, value] of Object.entries(fields)) {
      const [input] = collect(page(), (element) => element.props.id === id);
      (input!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    }
    const [form] = collect(page(), (element) => element.type === "form");
    await (form!.props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: () => {},
    });
  }

  it("leaves the landing to RequireAnonymous: no navigate, still busy until the session lands", async () => {
    await fillAndSubmit();
    expect(h.calls.auth).toHaveLength(1);
    expect(h.calls.navigate).toEqual([]);
    expect(submitButton().props.disabled).toBe(true);
    expect(text(submitButton()).join("")).toBe(busy);
  });

  it("on a refusal, shows the error and frees the button", async () => {
    h.world.answer = { data: null, error: { status: 401, message: "Invalid email or password" } };
    await fillAndSubmit();
    expect(h.calls.navigate).toEqual([]);
    expect(submitButton().props.disabled).toBe(false);
    const [alert] = collect(page(), (element) => element.props.role === "alert");
    expect(text(alert).join("")).toBe("Invalid email or password");
  });
});
