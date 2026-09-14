// Drives UsageProvider's real effects without a DOM: React's hooks are
// replaced with a tiny store so the provider can be called as a function and
// its effects run by hand. Same harness idiom as
// TourProvider.handlers.test.ts — this is what pins the one thing a
// renderToString suite can never see: that a page view is counted ONCE per
// route change, including under StrictMode's double-invoked effects.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = {
    refs: [] as { current: unknown }[],
    r: 0,
    effects: [] as (() => void | (() => void))[],
    cleanups: [] as (() => void)[],
    pathname: "/",
    preferences: {
      status: "pending" as "pending" | "error" | "success",
      data: undefined as { shareUsageData: boolean } | undefined,
      error: undefined as unknown,
      isPending: true,
    },
    cache: { subscribers: [] as (() => void)[] },
    queryData: new Map<string, unknown>(),
  };
  return {
    store,
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    useEffect: (effect: () => void | (() => void)) => {
      store.effects.push(effect);
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useRef: h.useRef, useEffect: h.useEffect };
});

// Only `useLocation` is faked — `matchPath` is the real matcher `routes.ts`
// resolves patterns with, and a fake one would pin nothing.
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useLocation: () => ({ pathname: h.store.pathname }) };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: (key: readonly unknown[]) => h.store.queryData.get(JSON.stringify(key)),
    getQueryCache: () => ({
      subscribe: (fn: () => void) => {
        h.store.cache.subscribers.push(fn);
        return () => {};
      },
    }),
  }),
}));

vi.mock("../../features/tour/hooks.js", () => ({
  usePreferences: () => h.store.preferences,
}));

// Only `track` is faked: `recordRouteChange` is the real navigation state,
// and from_route is exactly what this suite is checking.
vi.mock("./track.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    track: (...args: unknown[]) => {
      tracked.push(args as [string, Record<string, unknown>]);
    },
    setUsageConsent: (preference: boolean | undefined) => {
      consents.push(preference);
    },
  };
});

const tracked: Array<[string, Record<string, unknown>]> = [];
const consents: Array<boolean | undefined> = [];

import { babyKeys } from "../../features/babies/api.js";
import { aiKeys } from "../../features/ai/hooks.js";
import { resetUsage } from "./track.js";
import { UsageProvider, readAccountContext } from "./UsageProvider.js";

interface FakeWindow {
  listeners: Map<string, ((event: unknown) => void)[]>;
  addEventListener: (type: string, fn: (event: unknown) => void) => void;
  removeEventListener: (type: string, fn: (event: unknown) => void) => void;
  matchMedia: () => { matches: boolean };
  navigator: { standalone: boolean; userAgent: string; onLine: boolean; maxTouchPoints: number };
  localStorage: { getItem: () => string | null };
  location: { pathname: string };
}

function fakeWindow(): FakeWindow {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  return {
    listeners,
    addEventListener: (type, fn) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener: (type, fn) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== fn));
    },
    matchMedia: () => ({ matches: false }),
    navigator: { standalone: false, userAgent: "", onLine: true, maxTouchPoints: 0 },
    localStorage: { getItem: () => null },
    location: { pathname: "/" },
  };
}

let win: FakeWindow;

/** One render, then the effects it queued (as React would run them). */
function mount(): void {
  h.store.r = 0;
  h.store.effects = [];
  (UsageProvider as unknown as (props: unknown) => unknown)({ children: "app" });
  runEffects();
}

/** A re-render at the current state, effects and all. */
function rerender(): void {
  mount();
}

function runEffects(): void {
  for (const effect of h.store.effects) {
    const cleanup = effect();
    if (typeof cleanup === "function") h.store.cleanups.push(cleanup);
  }
}

function names(): string[] {
  return tracked.map(([name]) => name);
}

function propsFor(name: string): Record<string, unknown>[] {
  return tracked.filter(([entry]) => entry === name).map(([, props]) => props);
}

beforeEach(() => {
  tracked.length = 0;
  consents.length = 0;
  h.store.refs = [];
  h.store.r = 0;
  h.store.effects = [];
  h.store.cleanups = [];
  h.store.pathname = "/";
  h.store.preferences = { status: "pending", data: undefined, error: undefined, isPending: true };
  h.store.cache.subscribers = [];
  h.store.queryData.clear();
  resetUsage();
  win = fakeWindow();
  vi.stubGlobal("window", win);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetUsage();
});

describe("screen_viewed — once per route change", () => {
  it("reports the first screen with no from_route, then each change with where it came from", () => {
    mount();
    expect(propsFor("screen_viewed")).toEqual([{ route_pattern: "/", from_route: null }]);

    h.store.pathname = "/foods/sweet-potato";
    rerender();
    expect(propsFor("screen_viewed")).toEqual([
      { route_pattern: "/", from_route: null },
      // The real slug never appears: the pattern does.
      { route_pattern: "/foods/:slug", from_route: "/" },
    ]);
  });

  it("counts a StrictMode double-mount as ONE page view", () => {
    mount();
    // React 18 StrictMode: cleanup, then every effect set up again, with the
    // same component instance — so the refs survive and the latch holds.
    for (const cleanup of h.store.cleanups.splice(0)) cleanup();
    rerender();
    expect(propsFor("screen_viewed")).toHaveLength(1);
    expect(propsFor("pwa_launch")).toHaveLength(1);
  });

  it("does not re-count a re-render that did not change the pathname", () => {
    mount();
    rerender();
    rerender();
    expect(propsFor("screen_viewed")).toHaveLength(1);
  });

  it("counts two visits to the same pattern as two views, with the pattern as from_route", () => {
    h.store.pathname = "/foods/oats";
    mount();
    h.store.pathname = "/foods/beef";
    rerender();
    expect(propsFor("screen_viewed")).toEqual([
      { route_pattern: "/foods/:slug", from_route: null },
      { route_pattern: "/foods/:slug", from_route: "/foods/:slug" },
    ]);
  });

  it("reports an unknown pathname as the catch-all, never as itself", () => {
    h.store.pathname = "/definitely-not-a-route";
    mount();
    expect(propsFor("screen_viewed")).toEqual([{ route_pattern: "/*", from_route: null }]);
  });
});

describe("boot", () => {
  it("reports pwa_launch exactly once, before the first screen", () => {
    mount();
    h.store.pathname = "/more";
    rerender();
    expect(names().filter((name) => name === "pwa_launch")).toHaveLength(1);
    expect(names()[0]).toBe("pwa_launch");
    expect(propsFor("pwa_launch")).toEqual([{ display: "browser" }]);
  });

  it("reports a standalone launch as standalone", () => {
    win.matchMedia = () => ({ matches: true });
    mount();
    expect(propsFor("pwa_launch")).toEqual([{ display: "standalone" }]);
  });
});

describe("window events", () => {
  it("turns an install, an offline and an uncaught error into their events", () => {
    mount();
    const fire = (type: string, event: unknown) => {
      for (const listener of win.listeners.get(type) ?? []) listener(event);
    };

    fire("appinstalled", {});
    fire("offline", {});
    fire("error", { error: new TypeError("boom"), message: "boom" });
    fire("unhandledrejection", { reason: new TypeError("Failed to fetch dynamically imported module: /x.js") });

    expect(propsFor("pwa_installed")).toEqual([{ display: "browser" }]);
    expect(propsFor("offline_entered")).toEqual([{ route_pattern: "/" }]);
    expect(propsFor("client_error")).toEqual([
      { route_pattern: "/", kind: "unhandled", status: "none" },
      // A stale chunk after a deploy is its own kind: the fix is a reload.
      { route_pattern: "/", kind: "chunk_load", status: "none" },
    ]);
  });

  it("sends no message, stack or reason with a client_error", () => {
    mount();
    for (const listener of win.listeners.get("error") ?? []) {
      listener({ error: new Error("Priya threw up after the peanut butter"), message: "secret" });
    }
    expect(JSON.stringify(propsFor("client_error"))).not.toMatch(/Priya|peanut|secret/);
  });

  it("removes its listeners on unmount", () => {
    mount();
    for (const cleanup of h.store.cleanups.splice(0)) cleanup();
    expect(win.listeners.get("error")).toEqual([]);
    expect(win.listeners.get("offline")).toEqual([]);
  });
});

describe("consent", () => {
  it("publishes 'unknown' while the preferences query is in flight", () => {
    mount();
    expect(consents).toEqual([undefined]);
  });

  it("publishes the stored preference once it resolves", () => {
    mount();
    h.store.preferences = { status: "success", data: { shareUsageData: false }, error: undefined, isPending: false };
    rerender();
    expect(consents.at(-1)).toBe(false);
  });
});

describe("readAccountContext", () => {
  const client = (entries: Array<[readonly unknown[], unknown]>) =>
    ({
      getQueryData: (key: readonly unknown[]) =>
        entries.find(([candidate]) => JSON.stringify(candidate) === JSON.stringify(key))?.[1],
    }) as never;

  it("reads the active baby, the count and the key flag out of caches the app already filled", () => {
    const context = readAccountContext(
      client([
        [
          babyKeys.list(false),
          [
            { id: "a", birthDate: "2026-03-13" },
            { id: "b", birthDate: "2025-01-01" },
          ],
        ],
        [aiKeys.status(), { configured: true }],
      ]),
      "b",
    );
    expect(context.babyCount).toBe(2);
    expect(context.hasAiKey).toBe(true);
    expect(context.babyAgeMonths).toBeGreaterThan(12);
  });

  it("mirrors useActiveBaby's fallback to the first baby", () => {
    const context = readAccountContext(client([[babyKeys.list(false), [{ id: "a", birthDate: "2026-03-13" }]]]), null);
    expect(context.babyCount).toBe(1);
    expect(context.babyAgeMonths).not.toBeNull();
  });

  it("is the empty account when nothing is cached — and fetches nothing to find out", () => {
    expect(readAccountContext(client([]), null)).toEqual({ babyAgeMonths: null, babyCount: 0, hasAiKey: false });
  });
});
