import { isValidElement, type ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: null as object | null,
  location: { pathname: "/", search: "", state: null as unknown },
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
  const out = (RequireAuth as (props: { children: string }) => unknown)({ children: "app" });
  if (!isValidElement(out)) throw new Error("expected an element");
  return out as ReactElement<{ to?: string; state?: unknown }>;
}

beforeEach(() => {
  h.session = null;
});

describe("RequireAuth signed-out redirects (item 612)", () => {
  it("sends a signed-out visit to / to the About page, with no `from`", () => {
    const el = gate("/");
    expect(el.type).toBe(Navigate);
    expect(el.props.to).toBe("/about");
    expect(el.props.state).toBeUndefined();
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

describe("RequireAnonymous finishes the deep link (item 612)", () => {
  // Sign-in creates the session and this guard redirects before LoginPage's
  // own navigate(from) runs, so this is where the parent actually lands.
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
