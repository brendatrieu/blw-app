// Ledger 940: the "Leave without saving?" guard. No DOM: useLeaveGuard is
// called as a plain function with React's hooks mocked (a vi.hoisted store,
// as in Menu.handlers.test.ts), and document / window are stubs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0, effects: [] as Array<() => void | (() => void)> };
  return {
    store,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    useEffect: (effect: () => void | (() => void)) => {
      store.effects.push(effect);
    },
  };
});
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useState: h.useState,
  useEffect: h.useEffect,
}));

import { guardedLeave, holdLeaveGuard, internalLinkClick, leaveNow, useLeaveGuard } from "./leaveGuard.js";

const HERE = { origin: "http://app.test", pathname: "/plan/daily-meals", search: "", hash: "" };
const anchor = (href: string, attrs: Record<string, string> = {}) => ({
  href: new URL(href, HERE.origin).href,
  target: attrs.target ?? "",
  hasAttribute: (name: string) => name in attrs,
  click: vi.fn(),
});
const clickOn = (link: unknown, extra: Record<string, unknown> = {}) => ({
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target: { closest: (selector: string) => (selector === "a[href]" ? link : null) } as unknown as EventTarget,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...extra,
});

describe("internalLinkClick", () => {
  it("is the link for a plain tap on an in-app link elsewhere", () => {
    const home = anchor("/");
    expect(internalLinkClick(clickOn(home), HERE)).toBe(home);
    expect(internalLinkClick(clickOn(anchor("/plan?week=2026-11-02")), HERE)).not.toBeNull();
  });

  it("is null for no link, a modified or non-primary click, a new tab, a download, another site, or the page itself", () => {
    expect(internalLinkClick(clickOn(null), HERE)).toBeNull();
    for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
      expect(internalLinkClick(clickOn(anchor("/"), extra), HERE)).toBeNull();
    }
    expect(internalLinkClick(clickOn(anchor("/", { target: "_blank" })), HERE)).toBeNull();
    expect(internalLinkClick(clickOn(anchor("/", { download: "" })), HERE)).toBeNull();
    expect(internalLinkClick(clickOn(anchor("https://example.com/")), HERE)).toBeNull();
    expect(internalLinkClick(clickOn(anchor("/plan/daily-meals")), HERE)).toBeNull();
  });
});

describe("guardedLeave / holdLeaveGuard / leaveNow", () => {
  it("leaves at once with no guard; asks the holder while held; leaveNow never asks", () => {
    const went: string[] = [];
    guardedLeave(() => went.push("free"));
    expect(went).toEqual(["free"]);
    const asked: Array<() => void> = [];
    const release = holdLeaveGuard((leave) => asked.push(leave));
    guardedLeave(() => went.push("held"));
    expect(went).toEqual(["free"]);
    expect(asked).toHaveLength(1);
    // A Leave that itself goes through a guarded way out is not asked again.
    leaveNow(() => guardedLeave(() => went.push("approved")));
    expect(went).toEqual(["free", "approved"]);
    expect(asked).toHaveLength(1);
    // A stale release never drops a newer hold.
    const newer = holdLeaveGuard(() => {});
    release();
    guardedLeave(() => went.push("still held"));
    expect(went).toEqual(["free", "approved"]);
    newer();
    guardedLeave(() => went.push("released"));
    expect(went).toEqual(["free", "approved", "released"]);
  });
});

describe("useLeaveGuard", () => {
  const listeners = new Map<string, (event: unknown) => void>();
  beforeEach(() => {
    h.store.states.length = 0;
    h.store.effects.length = 0;
    listeners.clear();
    vi.stubGlobal("document", {
      addEventListener: (type: string, fn: (event: unknown) => void, capture: boolean) => {
        expect(capture).toBe(true); // before React Router's Link sees the tap
        listeners.set(type, fn);
      },
      removeEventListener: (type: string) => listeners.delete(type),
    });
    vi.stubGlobal("window", { location: HERE });
  });
  afterEach(() => vi.unstubAllGlobals());

  const run = (dirty: boolean) => {
    h.store.i = 0;
    h.store.effects.length = 0;
    const guard = useLeaveGuard(dirty);
    return { guard, effect: h.store.effects[0]! };
  };

  it("no change: holds nothing, so Back and links go straight away", () => {
    const { guard, effect } = run(false);
    expect(effect()).toBeUndefined();
    expect(listeners.size).toBe(0);
    expect(guard.open).toBe(false);
    const went: string[] = [];
    guardedLeave(() => went.push("back"));
    expect(went).toEqual(["back"]);
  });

  it("a change: a link tap is stopped and asks; Keep editing stays; Leave re-taps that link, unasked", () => {
    const cleanup = run(true).effect() as () => void;
    const home = anchor("/");
    const tap = clickOn(home);
    listeners.get("click")!(tap);
    expect(tap.preventDefault).toHaveBeenCalled();
    expect(tap.stopPropagation).toHaveBeenCalled();
    let { guard } = run(true);
    expect(guard.open).toBe(true);
    guard.keep();
    ({ guard } = run(true));
    expect(guard.open).toBe(false);
    expect(home.click).not.toHaveBeenCalled();

    listeners.get("click")!(clickOn(home));
    ({ guard } = run(true));
    // The re-tap reaches the listener again while leaving: it must pass.
    home.click.mockImplementation(() => {
      const again = clickOn(home);
      listeners.get("click")!(again);
      expect(again.preventDefault).not.toHaveBeenCalled();
    });
    guard.leave();
    expect(home.click).toHaveBeenCalledTimes(1);
    expect(run(true).guard.open).toBe(false);
    cleanup();
    expect(listeners.size).toBe(0);
    // Released on cleanup.
    const went: string[] = [];
    guardedLeave(() => went.push("back"));
    expect(went).toEqual(["back"]);
  });

  it("a change: Back asks; Leave goes back", () => {
    const cleanup = run(true).effect() as () => void;
    const went: string[] = [];
    guardedLeave(() => went.push("back"));
    expect(went).toEqual([]);
    const { guard } = run(true);
    expect(guard.open).toBe(true);
    guard.leave();
    expect(went).toEqual(["back"]);
    cleanup();
  });

  it("ignores taps that aren't in-app links", () => {
    const cleanup = run(true).effect() as () => void;
    const tap = clickOn(null);
    listeners.get("click")!(tap);
    expect(tap.preventDefault).not.toHaveBeenCalled();
    expect(run(true).guard.open).toBe(false);
    cleanup();
  });
});
