import { isValidElement, type ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const h = vi.hoisted(() => {
  // The guards' hooks (ledger 829 useState; ledger 856 useRef/useEffect), kept
  // across calls like a mounted guard. Effects are collected per render.
  const store = { states: [] as unknown[], i: 0, effects: [] as (() => void)[] };
  return {
    store,
    session: null as object | null,
    // `key` as react-router's browser history reports it: "default" only for
    // an entry the app did not make (typed address, outside link, its reload).
    location: { pathname: "/", search: "", state: null as unknown, key: "default" },
    navigate: (() => {}) as (...args: unknown[]) => void,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = init;
      return [store.states[i], (value: unknown) => (store.states[i] = value)];
    },
    useRef: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = { current: init };
      return store.states[i];
    },
    useEffect: (fn: () => void) => {
      store.effects.push(fn);
    },
  };
});

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useState: h.useState,
  useRef: h.useRef,
  useEffect: h.useEffect,
}));

vi.mock("../lib/auth.js", () => ({
  useSession: () => ({ data: h.session, isPending: false }),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLocation: () => h.location,
  useNavigate: () => h.navigate,
}));

import { RequireAnonymous, RequireAuth } from "./RequireAuth.js";

/** The element RequireAuth returns for the current mocked session/location. */
function gate(pathname: string, search = "", key = "default"): ReactElement<{ to?: string; state?: unknown }> {
  h.location = { pathname, search, state: null, key };
  h.store.i = 0;
  const out = (RequireAuth as (props: { children: string }) => unknown)({ children: "app" });
  if (!isValidElement(out)) throw new Error("expected an element");
  return out as ReactElement<{ to?: string; state?: unknown }>;
}

beforeEach(() => {
  h.session = null;
  h.store.states = []; // a freshly mounted guard
  h.navigate = vi.fn();
});

describe("RequireAuth signed-out redirects (item 612)", () => {
  it("sends a signed-out visit to / to the About page, marked as the front door, with no `from`", () => {
    const el = gate("/");
    expect(el.type).toBe(Navigate);
    expect(el.props.to).toBe("/about");
    // Ledger 828: AboutPage forwards this entry to Home once signed in.
    expect(el.props.state).toEqual({ frontDoor: true });
  });

  it("sends every other signed-out path to /login with `from`, so deep links come back", () => {
    const el = gate("/foods/sweet-potato", "?tab=recipes");
    expect(el.type).toBe(Navigate);
    expect(el.props.to).toBe("/login");
    expect(el.props.state).toEqual({ from: "/foods/sweet-potato?tab=recipes" });
  });

  it("lets a signed-in parent through to /", () => {
    h.session = { user: { id: "u1" } };
    expect(gate("/").type).not.toBe(Navigate);
  });
});

describe("RequireAuth when the session ends (ledger 829)", () => {
  it("sends Sign out / account deletion to /login WITHOUT `from`, so the next sign-in lands on Home", () => {
    h.session = { user: { id: "u1" } };
    expect(gate("/settings").type).not.toBe(Navigate);
    h.session = null; // the session refetch after signOut reads signed out
    const el = gate("/settings");
    expect(el.type).toBe(Navigate);
    expect(el.props.to).toBe("/login");
    expect(el.props.state).toBeUndefined();
  });

  it("does the same when the session ends in another tab while on /admin/metrics", () => {
    h.session = { user: { id: "u1" } };
    gate("/admin/metrics");
    h.session = null;
    expect(gate("/admin/metrics").props.state).toBeUndefined();
  });

  it("still keeps `from` for a guard that never saw a session (a signed-out deep link)", () => {
    expect(gate("/storage").props.state).toEqual({ from: "/storage" });
  });
});

describe("RequireAuth on Back/Forward to an earlier session's page (ledger 870)", () => {
  // Sign out lands on /login; Back reaches e.g. a recipe page the app pushed
  // earlier. That mounts a FRESH guard (it never saw a session), so without
  // this the next sign-in landed on the last person's page.
  it("sends an in-app history entry to /login WITHOUT `from`, so sign-in lands on Home", () => {
    const el = gate("/recipes/r1", "", "a7d2rjdz");
    expect(el.type).toBe(Navigate);
    expect(el.props.to).toBe("/login");
    expect(el.props.state).toBeUndefined();
  });

  it("still keeps `from` for an address from outside the app (typed, a shared link, a reload of one)", () => {
    expect(gate("/recipes/r1", "?x=1", "default").props.state).toEqual({ from: "/recipes/r1?x=1" });
  });

  it("still sends the front door to About, whatever the entry", () => {
    expect(gate("/", "", "a7d2rjdz").props.to).toBe("/about");
  });
});

describe("RequireAnonymous finishes the deep link (item 612)", () => {
  // Ledger 828: LoginPage and SignupPage do not navigate on success; this
  // guard is where a fresh session actually lands.
  /** One render of a mounted guard, then its effects TWICE, as StrictMode runs them. */
  function anon(state: unknown): unknown {
    h.location = { pathname: "/login", search: "", state, key: "k-login" };
    h.store.i = 0;
    h.store.effects = [];
    const out = (RequireAnonymous as (props: { children: string }) => unknown)({ children: "login" });
    for (const run of [...h.store.effects, ...h.store.effects]) run();
    return out;
  }

  const showsForm = (out: unknown) => isValidElement(out) && (out.props as { children?: unknown }).children === "login";

  /** The form shows signed out, then the sign-in on it lands. */
  function signInHere(state: unknown): unknown {
    expect(showsForm(anon(state))).toBe(true);
    h.session = { user: { id: "u1" } };
    return anon(state);
  }

  it("sends a freshly signed-in parent back to where RequireAuth stopped them", () => {
    signInHere({ from: "/more" });
    expect(h.navigate).toHaveBeenCalledWith("/more");
  });

  it("falls back to / when there is no stored destination", () => {
    signInHere(null);
    expect(h.navigate).toHaveBeenCalledWith("/");
  });

  it("round-trips: the `from` RequireAuth stores is the one RequireAnonymous follows", () => {
    const stored = gate("/foods/sweet-potato", "?tab=recipes").props.state;
    h.store.states = []; // the sign-in page's own guard
    signInHere(stored);
    expect(h.navigate).toHaveBeenCalledWith("/foods/sweet-potato?tab=recipes");
  });

  // Ledger 856: the landing is pushed, so Back returns to the sign-in page
  // rather than the previous session's pages — and pushed ONCE, though
  // StrictMode runs the effect twice.
  it("pushes the landing exactly once, never replacing the sign-in entry", () => {
    expect(signInHere(null)).toBeNull();
    expect(anon(null)).toBeNull(); // a re-render before the route changes
    expect((h.navigate as Mock).mock.calls).toEqual([["/"]]);
  });

  // Ledger 856: Back from Home to /login (or a typed /login) while signed in.
  it("sends someone who arrives signed in Home, replacing the entry, even with a stored `from`", () => {
    h.session = { user: { id: "u1" } };
    const el = anon({ from: "/storage" });
    if (!isValidElement(el)) throw new Error("expected an element");
    expect(el.type).toBe(Navigate);
    expect(el.props).toMatchObject({ to: "/", replace: true });
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("lets a signed-out visitor see the form", () => {
    expect(showsForm(anon({ from: "/more" }))).toBe(true);
    expect(h.navigate).not.toHaveBeenCalled();
  });
});
