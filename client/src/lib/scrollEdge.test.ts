import { describe, expect, it } from "vitest";
import { isScrolledUnder, watchScrollEdge } from "./scrollEdge.js";

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
