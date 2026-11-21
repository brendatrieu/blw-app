// Ledger 1092: the status-bar colour follows the layouts. AppLayout hands the
// header's scroll edge to setStatusBarSurface (frost scrolled, top at the top);
// the screens outside it (sign-in, About, the password pages) set "page".
// theme.test.ts pins what each surface paints; this pins that the layouts call
// it. Node env: layouts run as plain functions, useEffect captured through a
// vi.hoisted store (as App.scroll.test.ts), watchScrollEdge's onChange captured.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { effects: [] as { fn: () => unknown; deps: unknown[] | undefined }[] };
  const header = { id: "header" };
  return {
    store,
    header,
    setStatusBarSurface: vi.fn(),
    watchScrollEdge: vi.fn((_target: unknown, _source: unknown, _docks: unknown, _onChange?: (under: boolean) => void) => () => {}),
    useState: (init: unknown) => [init, () => {}],
    // headerRef starts null; hand it a fake element so the effect wires up.
    useRef: (init: unknown) => ({ current: init ?? header }),
    useEffect: (fn: () => unknown, deps?: unknown[]) => store.effects.push({ fn, deps }),
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
    useLocation: () => ({ pathname: "/", search: "", hash: "" }),
    useNavigationType: () => "PUSH",
  };
});
vi.mock("./theme.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, setStatusBarSurface: h.setStatusBarSurface };
});
vi.mock("./lib/scrollEdge.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, watchScrollEdge: h.watchScrollEdge };
});

import { OutsideAppLayout } from "./App.js";
import { AppLayout } from "./components/AppLayout.js";

/** Render once and run the mount-only ([]) effects. */
function mount(layout: () => unknown) {
  layout();
  const once = h.store.effects.filter((e) => e.deps?.length === 0);
  expect(once.length, "a mount-only effect").toBeGreaterThan(0);
  for (const e of once) e.fn();
}

const win = { scrollTo: () => {} };
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.stubGlobal("window", win);
  h.store.effects = [];
  h.setStatusBarSurface.mockClear();
  h.watchScrollEdge.mockClear();
});

describe("status bar surface (ledger 1092)", () => {
  it("AppLayout: frost once content scrolls under the header, top again at the top", () => {
    mount(AppLayout);
    expect(h.watchScrollEdge).toHaveBeenCalledTimes(1);
    const [target, source, , onChange] = h.watchScrollEdge.mock.calls[0]!;
    expect(target).toBe(h.header);
    expect(source).toBe(win);
    expect(onChange).toBeTypeOf("function");
    onChange!(true);
    expect(h.setStatusBarSurface).toHaveBeenLastCalledWith("frost");
    onChange!(false);
    expect(h.setStatusBarSurface).toHaveBeenLastCalledWith("top");
    expect(h.setStatusBarSurface).toHaveBeenCalledTimes(2);
  });

  it("OutsideAppLayout: the page's own colour", () => {
    mount(OutsideAppLayout);
    expect(h.setStatusBarSurface).toHaveBeenCalledTimes(1);
    expect(h.setStatusBarSurface).toHaveBeenCalledWith("page");
  });
});
