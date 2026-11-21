// Ledger 1102 (1133 verify c2, non-blocking #2): the scroll-edge watchers are
// wired where the look needs them. scrollEdge.test.ts pins the watcher itself
// and App.statusBar.test.ts pins AppLayout's header (watchScrollEdge(header,
// window) and the status bar). This pins the other two callers: the Sheet's
// pinned row watches its own panel's scroll, and the Foods / Recipes FilterBar
// watches the window as a docking strip (frosted only once it sits at its
// sticky top, not while it is still in flow). Node env: the components run as
// plain functions, useRef hands back a fake element, useEffect is captured and
// run by hand (vi.hoisted, as App.statusBar.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const panel = { id: "panel" };
  const el = { id: "el", parentElement: panel };
  const effects: (() => unknown)[] = [];
  return {
    panel,
    el,
    effects,
    watchScrollEdge: vi.fn((..._args: unknown[]) => () => {}),
    useRef: (init: unknown) => ({ current: init ?? el }),
    useEffect: (fn: () => unknown) => {
      effects.push(fn);
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useRef: h.useRef, useEffect: h.useEffect };
});
vi.mock("./scrollEdge.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, watchScrollEdge: h.watchScrollEdge };
});

import { SheetPanel } from "../components/ui/Sheet.js";
import { FilterBar } from "../features/catalog/components/filters.js";

const win = { id: "window" };
beforeEach(() => {
  h.effects.length = 0;
  h.watchScrollEdge.mockClear();
  vi.stubGlobal("window", win);
});
afterEach(() => vi.unstubAllGlobals());

/** Render once and run the effects it registered. */
function mount(render: () => unknown) {
  render();
  for (const fn of h.effects) fn();
}

describe("scroll-edge wiring (ledger 1102)", () => {
  it("Sheet: the pinned row watches its own panel's scroll (clear at rest, the panel's look once the body is under it)", () => {
    mount(() => SheetPanel({ title: "Filters", onClose: () => {}, children: "body" }));
    expect(h.watchScrollEdge).toHaveBeenCalledTimes(1);
    expect(h.watchScrollEdge).toHaveBeenCalledWith(h.el, h.panel);
  });

  it("FilterBar: watches the window as a docking strip (frosted only once docked under the header)", () => {
    mount(() => FilterBar({ children: "search" }));
    expect(h.watchScrollEdge).toHaveBeenCalledTimes(1);
    expect(h.watchScrollEdge).toHaveBeenCalledWith(h.el, win, true);
  });
});
