// Ledger 851: OutsideAppLayout (sign-in, sign-up, About, the password pages)
// starts each screen at the top, as AppLayout does. Without it, Sign out from
// a scrolled Settings opened a taller-than-the-window /login at its bottom,
// the 👋 above the screen. Node env: drive both layouts as plain functions
// with useEffect captured through a vi.hoisted store, then run the effect.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = {
    effects: [] as { fn: () => void; deps: unknown[] | undefined }[],
    pathname: "/login",
    navType: "PUSH" as "PUSH" | "POP" | "REPLACE",
  };
  return {
    store,
    useState: (init: unknown) => [init, () => {}],
    useRef: (init: unknown) => ({ current: init }),
    useEffect: (fn: () => void, deps?: unknown[]) => store.effects.push({ fn, deps }),
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useRef: h.useRef, useEffect: h.useEffect };
});
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocation: () => ({ pathname: h.store.pathname, search: "", hash: "" }),
    useNavigationType: () => h.store.navType,
  };
});

import { OutsideAppLayout } from "./App.js";
import { AppLayout } from "./components/AppLayout.js";

const scrollTo = vi.fn();
beforeEach(() => {
  h.store.effects = [];
  scrollTo.mockClear();
  vi.stubGlobal("window", { scrollTo });
});
afterEach(() => vi.unstubAllGlobals());

/** Render once and run the effect keyed on the pathname. */
function enter(layout: () => unknown, pathname: string, navType: "PUSH" | "POP" | "REPLACE") {
  h.store.pathname = pathname;
  h.store.navType = navType;
  layout();
  const effect = h.store.effects.find((e) => e.deps?.length === 1 && e.deps[0] === pathname);
  expect(effect, "an effect keyed on the pathname alone").toBeDefined();
  effect!.fn();
}

describe.each([
  ["OutsideAppLayout", OutsideAppLayout],
  ["AppLayout", AppLayout],
])("%s scroll on a route change (ledger 851)", (_name, layout) => {
  it("starts a forward or replaced navigation at the top", () => {
    enter(layout, "/login", "REPLACE"); // Sign out → /login
    enter(layout, "/about", "PUSH"); // More → About
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("leaves Back/Forward (POP) at the browser's restored position", () => {
    enter(layout, "/about", "POP");
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
