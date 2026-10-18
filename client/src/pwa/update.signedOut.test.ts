import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Ledger 849: the hook and its wrapper run as plain functions, React's hooks
// mocked: useState and useEffect keep their slots across calls like a mounted
// component, and an effect runs only when its deps change.
type Effect = () => void | (() => void);
const h = vi.hoisted(() => {
  const store = {
    states: [] as unknown[],
    i: 0,
    slots: [] as { deps: unknown[]; cleanup?: void | (() => void) }[],
    e: 0,
    pending: [] as { j: number; fn: Effect }[],
  };
  return {
    store,
    location: { key: "k0" },
    session: { data: null as object | null, isPending: false },
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
  useEffect: (fn: Effect, deps: unknown[]) => {
    const j = h.store.e++;
    const slot = h.store.slots[j];
    if (!slot || deps.some((dep, k) => !Object.is(dep, slot.deps[k]))) h.store.pending.push({ j, fn });
    h.store.slots[j] = { deps, cleanup: slot?.cleanup };
  },
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLocation: () => h.location,
}));
vi.mock("../lib/auth.js", () => ({ useSession: () => h.session }));

import { resetUpdateStateForTests, setUpdateReady, useUpdateOnSignedOutNavigation } from "./update.js";
import { SignedOutUpdate } from "../components/UpdatePrompt.js";
import { SessionPending } from "../components/RequireAuth.js";

const apply = vi.fn(() => Promise.resolve());

function begin() {
  h.store.i = 0;
  h.store.e = 0;
  h.store.pending = [];
}
function commit() {
  for (const { j, fn } of h.store.pending) {
    const slot = h.store.slots[j]!;
    if (typeof slot.cleanup === "function") slot.cleanup();
    slot.cleanup = fn();
  }
}

/** One render at this location: what the hook returns, then its effects run. */
function render(key: string, signedOut: boolean): boolean {
  begin();
  const out = useUpdateOnSignedOutNavigation(key, signedOut);
  commit();
  return out;
}

beforeEach(() => {
  h.store.states = []; // a freshly mounted app
  h.store.slots = [];
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
  vi.useFakeTimers();
});
afterEach(() => {
  apply.mockClear();
  resetUpdateStateForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a waiting version on signed-out screens (ledger 849)", () => {
  it("loads on the next navigation away from a signed-out screen (About → Sign in)", () => {
    setUpdateReady("v2", apply);
    expect(render("about", true)).toBe(false);
    expect(render("login", true)).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    // Until the reload, it stays applied: the next screen never shows.
    expect(render("login", true)).toBe(true);
  });

  it("never reloads the screen someone is typing on", () => {
    setUpdateReady("v2", apply);
    for (let i = 0; i < 5; i++) expect(render("login", true)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("loads on the landing after a sign-in, though the session arrived before it", () => {
    setUpdateReady("v2", apply);
    render("login", false); // the session still loading
    render("login", true);
    expect(render("login", false)).toBe(false); // signed in, RequireAnonymous about to navigate
    expect(render("home", false)).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("does nothing with nothing waiting (also: the prompt switched off, which never sets one)", () => {
    render("about", true);
    expect(render("login", true)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("leaves signed-in navigations to the card, and a still-loading session is not signed out", () => {
    setUpdateReady("v2", apply);
    render("home", false);
    expect(render("log-meal", false)).toBe(false);
    expect(render("storage", false)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("forgets the signed-out screen once signed in: a version that arrives later waits for the card", () => {
    render("about", true);
    render("home", false); // signed in, nothing waiting yet
    setUpdateReady("v2", apply);
    expect(render("storage", false)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("ignores Later: a signed-out navigation loses nothing", () => {
    window.localStorage.getItem = () => "v2"; // Later tapped for this version
    setUpdateReady("v2", apply);
    render("about", true);
    expect(render("login", true)).toBe(true);
  });

  it("shows the screen after 5 s with no reload, and does not try again", () => {
    setUpdateReady("v2", apply);
    render("about", true);
    expect(render("login", true)).toBe(true);
    vi.advanceTimersByTime(4999);
    expect(render("login", true)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(render("login", true)).toBe(false);
    expect(render("signup", true)).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

describe("SignedOutUpdate (ledger 849)", () => {
  const wrap = () => {
    begin();
    const out = (SignedOutUpdate as (props: { children: string }) => unknown)({ children: "app" });
    commit();
    return out as ReactElement<{ children?: unknown }>;
  };

  it("shows Loading… in place of the screen being opened, the app otherwise", () => {
    setUpdateReady("v2", apply);
    h.session = { data: null, isPending: false };
    h.location = { key: "about" };
    expect(wrap().props.children).toBe("app");
    h.location = { key: "login" };
    const out = wrap();
    expect(isValidElement(out) && out.type).toBe(SessionPending);
  });

  it("counts a pending session as not signed out", () => {
    setUpdateReady("v2", apply);
    h.session = { data: null, isPending: true };
    h.location = { key: "a" };
    wrap();
    h.location = { key: "b" };
    expect(wrap().props.children).toBe("app");
  });

  it("wraps the whole app in main.tsx", () => {
    const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
    expect(main).toMatch(/<SignedOutUpdate>\s*<App \/>\s*<\/SignedOutUpdate>/);
  });
});
