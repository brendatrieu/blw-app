import { afterEach, describe, expect, it, vi } from "vitest";
import { isDocked, isScrolledUnder, watchScrollEdge } from "./scrollEdge.js";

function fakeTarget() {
  const attrs = new Set<string>();
  return {
    attrs,
    toggleAttribute: (name: string, on: boolean) => (on ? attrs.add(name) : attrs.delete(name), on),
    removeAttribute: (name: string) => void attrs.delete(name),
  } as unknown as Element & { attrs: Set<string> };
}

function fakeSource<T extends { scrollY: number } | { scrollTop: number }>(initial: T) {
  const listeners: { type: string; fn: () => void; options: unknown }[] = [];
  const source = {
    ...initial,
    listeners,
    addEventListener: (type: string, fn: () => void, options: unknown) => listeners.push({ type, fn, options }),
    removeEventListener: (type: string, fn: () => void) => {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    fire() {
      for (const l of listeners) l.fn();
    },
  };
  return source;
}

describe("isScrolledUnder (ledger 1079)", () => {
  it("is false at the top and past it (iOS rubber-band), true once anything is under the header", () => {
    expect(isScrolledUnder(0)).toBe(false);
    expect(isScrolledUnder(-40)).toBe(false);
    expect(isScrolledUnder(0.5)).toBe(true);
    expect(isScrolledUnder(240)).toBe(true);
  });
});

describe("watchScrollEdge (ledgers 1079, 1081)", () => {
  it("sets data-scrolled from the window's offset at once and on every scroll, through ONE passive listener", () => {
    const target = fakeTarget();
    const win = fakeSource({ scrollY: 0 });
    const stop = watchScrollEdge(target, win);
    expect(target.attrs.has("data-scrolled")).toBe(false);
    expect(win.listeners).toHaveLength(1);
    expect(win.listeners[0]).toMatchObject({ type: "scroll", options: { passive: true } });
    win.scrollY = 120;
    win.fire();
    expect(target.attrs.has("data-scrolled")).toBe(true);
    win.scrollY = 0;
    win.fire();
    expect(target.attrs.has("data-scrolled")).toBe(false);
    stop();
  });

  it("reads an element's own scrollTop (a Sheet panel), and opens already scrolled when it is", () => {
    const target = fakeTarget();
    const panel = fakeSource({ scrollTop: 30 });
    watchScrollEdge(target, panel);
    expect(target.attrs.has("data-scrolled")).toBe(true);
  });

  it("onChange hears the state at once and on each flip only, from the same listener (ledger 1090: the status bar)", () => {
    const target = fakeTarget();
    const win = fakeSource({ scrollY: 0 });
    const heard: boolean[] = [];
    const stop = watchScrollEdge(target, win, false, (under) => heard.push(under));
    expect(heard).toEqual([false]);
    for (const y of [10, 200, 0, 0, 5]) {
      win.scrollY = y;
      win.fire();
    }
    expect(heard).toEqual([false, true, false, true]);
    expect(win.listeners).toHaveLength(1);
    stop();
    expect(heard).toHaveLength(4);
  });

  it("the cleanup removes the listener and the attribute", () => {
    const target = fakeTarget();
    const win = fakeSource({ scrollY: 300 });
    const stop = watchScrollEdge(target, win);
    expect(target.attrs.has("data-scrolled")).toBe(true);
    stop();
    expect(win.listeners).toHaveLength(0);
    expect(target.attrs.has("data-scrolled")).toBe(false);
  });
});

describe("isDocked (ledger 1083): the Foods / Recipes filter strip", () => {
  it("is false while the strip is still in flow below its docked offset, even with the page scrolled", () => {
    expect(isDocked(0, 140, 56)).toBe(false);
    expect(isDocked(40, 100, 56)).toBe(false);
  });
  it("is true once the page has scrolled and the strip sits at its docked offset (sub-pixel tolerant)", () => {
    expect(isDocked(84, 56, 56)).toBe(true);
    expect(isDocked(600, 56.4, 56)).toBe(true);
  });
  it("is false at the top even when the strip starts at the docked offset (nothing under it yet)", () => {
    expect(isDocked(0, 56, 56)).toBe(false);
    expect(isDocked(-30, 56, 56)).toBe(false);
  });
});

describe("watchScrollEdge(…, docks) (ledger 1083)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("reads the strip's own rect and sticky top on every scroll", () => {
    let top = 140;
    const target = Object.assign(fakeTarget(), { getBoundingClientRect: () => ({ top }) });
    vi.stubGlobal("getComputedStyle", () => ({ top: "56px" }));
    const win = fakeSource({ scrollY: 0 });
    const stop = watchScrollEdge(target, win, true);
    win.scrollY = 40;
    top = 100;
    win.fire();
    expect(target.attrs.has("data-scrolled")).toBe(false); // the page scrolled, the strip has not docked
    win.scrollY = 120;
    top = 56;
    win.fire();
    expect(target.attrs.has("data-scrolled")).toBe(true);
    stop();
  });
});
