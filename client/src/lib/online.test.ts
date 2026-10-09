// Ledger 765/766: the app's offline signal. Hook behaviour is driven without
// a DOM: useSyncExternalStore is captured through a vi.hoisted store, and the
// window is a bare EventTarget.
import { afterEach, describe, expect, it, vi } from "vitest";
import { onlineManager } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  subscribe: null as null | ((onChange: () => void) => () => void),
  getSnapshot: null as null | (() => boolean),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useSyncExternalStore: (subscribe: (onChange: () => void) => () => void, getSnapshot: () => boolean) => {
      h.subscribe = subscribe;
      h.getSnapshot = getSnapshot;
      return getSnapshot();
    },
  };
});

import { isAppOffline, useIsOffline } from "./online.js";

afterEach(() => {
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

describe("isAppOffline", () => {
  it("is offline once TanStack's onlineManager is (an offline event fired)", () => {
    expect(isAppOffline()).toBe(false);
    onlineManager.setOnline(false);
    expect(isAppOffline()).toBe(true);
  });

  it("is offline on a cold start with no network, where onlineManager still says online", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(onlineManager.isOnline()).toBe(true);
    expect(isAppOffline()).toBe(true);
    // Reading it never seeds onlineManager: Log meal's offline path, which
    // rides on onlineManager, stays exactly as it was.
    expect(onlineManager.isOnline()).toBe(true);
  });
});

describe("useIsOffline", () => {
  it("re-reads on window online/offline events and on onlineManager changes, and unsubscribes cleanly", () => {
    const fakeWindow = new EventTarget();
    vi.stubGlobal("window", fakeWindow);
    const nav = { onLine: false };
    vi.stubGlobal("navigator", nav);

    expect(useIsOffline()).toBe(true);
    let calls = 0;
    const unsubscribe = h.subscribe!(() => calls++);

    // Cold-start offline coming back: onlineManager never changed, so only
    // the window event can bring the app back.
    nav.onLine = true;
    fakeWindow.dispatchEvent(new Event("online"));
    expect(calls).toBe(1);
    expect(h.getSnapshot!()).toBe(false);

    onlineManager.setOnline(false);
    expect(calls).toBe(2);
    expect(h.getSnapshot!()).toBe(true);

    unsubscribe();
    fakeWindow.dispatchEvent(new Event("offline"));
    onlineManager.setOnline(true);
    expect(calls).toBe(2);
  });
});
