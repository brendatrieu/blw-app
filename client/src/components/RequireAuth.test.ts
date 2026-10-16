import { isValidElement, type ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  // RequireAuth's one useState (ledger 829), kept across calls like a mounted guard.
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    session: null as object | null,
    location: { pathname: "/", search: "", state: null as unknown },
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = init;
      return [store.states[i], (value: unknown) => (store.states[i] = value)];
    },
  };
});

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useState: h.useState,
}));

vi.mock("../lib/auth.js", () => ({
  useSession: () => ({ data: h.session, isPending: false }),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLocation: () => h.location,
}));

import { RequireAnonymous, RequireAuth } from "./RequireAuth.js";

/** The element RequireAuth returns for the current mocked session/location. */
function gate(pathname: string, search = ""): ReactElement<{ to?: string; state?: unknown }> {
  h.location = { pathname, search, state: null };
  h.store.i = 0;
  const out = (RequireAuth as (props: { children: string }) => unknown)({ children: "app" });
  if (!isValidElement(out)) throw new Error("expected an element");
  return out as ReactElement<{ to?: string; state?: unknown }>;
}

beforeEach(() => {
  h.session = null;
  h.store.states = []; // a freshly mounted guard
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

describe("RequireAnonymous finishes the deep link (item 612)", () => {
  // Ledger 828: LoginPage and SignupPage do not navigate on success; this
  // guard is where a fresh session actually lands.
  function anon(state: unknown): ReactElement<{ to?: string }> {
    h.session = { user: { id: "u1" } };
    h.location = { pathname: "/login", search: "", state };
    const out = (RequireAnonymous as (props: { children: string }) => unknown)({
      children: "login",
    });
    if (!isValidElement(out)) throw new Error("expected an element");
    return out as ReactElement<{ to?: string }>;
  }

  it("sends a freshly signed-in parent back to where RequireAuth stopped them", () => {
    const el = anon({ from: "/more" });
    expect(el.type).toBe(Navigate);
    expect(el.props.to).toBe("/more");
  });

  it("falls back to / when there is no stored destination", () => {
    expect(anon(null).props.to).toBe("/");
  });

  it("round-trips: the `from` RequireAuth stores is the one RequireAnonymous follows", () => {
    const stored = gate("/foods/sweet-potato", "?tab=recipes").props.state;
    expect(anon(stored).props.to).toBe("/foods/sweet-potato?tab=recipes");
  });

  it("lets a signed-out visitor see the form", () => {
    h.session = null;
    h.location = { pathname: "/login", search: "", state: { from: "/more" } };
    expect(
      (RequireAnonymous as (props: { children: string }) => unknown)({ children: "login" }),
    ).not.toHaveProperty("type", Navigate);
  });
});
