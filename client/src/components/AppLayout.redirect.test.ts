// Drives AppLayout's first-run gate (item 304) without a DOM: React's hooks
// and the router's are replaced with a tiny store, so the layout can be
// called as a function, its effects run by hand, and the navigate() calls it
// makes read back. This is what pins the behaviour renderToString cannot
// reach — that the redirect fires once, only when the preferences query has
// actually answered, and never turns into a loop.
//
// Same harness idiom as DateTimeField.handlers.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = {
    refs: [] as { current: unknown }[],
    r: 0,
    effects: [] as (() => void)[],
    navigateCalls: [] as unknown[][],
    pathname: "/",
    preferences: { status: "pending", data: undefined } as {
      status: "pending" | "error" | "success";
      data: { tourCompletedAt: string | null } | undefined;
    },
  };
  return {
    store,
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    useEffect: (fn: () => void) => {
      store.effects.push(fn);
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useRef: h.useRef, useEffect: h.useEffect };
});

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: h.store.pathname, search: "", hash: "" }),
  useNavigate:
    () =>
    (...args: unknown[]) => {
      h.store.navigateCalls.push(args);
    },
  useNavigationType: () => "PUSH",
  // Element types only — never rendered by this harness.
  Link: () => null,
  Outlet: () => null,
}));

vi.mock("../features/tour/hooks.js", () => ({
  usePreferences: () => h.store.preferences,
  preferenceKeys: { all: () => ["preferences"] },
}));

import { AppLayout } from "./AppLayout.js";

interface RenderInput {
  pathname?: string;
  status?: "pending" | "error" | "success";
  tourCompletedAt?: string | null;
}

/** One render pass plus the effects it queued, against the persistent refs. */
function render({ pathname = "/", status = "pending", tourCompletedAt = null }: RenderInput = {}): void {
  h.store.r = 0;
  h.store.effects = [];
  h.store.pathname = pathname;
  h.store.preferences = {
    status,
    data: status === "success" ? { tourCompletedAt } : undefined,
  };
  (AppLayout as unknown as () => unknown)();
  for (const effect of h.store.effects) effect();
}

beforeEach(() => {
  // Fresh mount: refs (including the "already redirected" latch) start over.
  h.store.refs = [];
  h.store.r = 0;
  h.store.effects = [];
  h.store.navigateCalls = [];
});

describe("AppLayout first-run gate", () => {
  it("sends a parent who has never seen the tour, exactly once", () => {
    // The query is still in flight on the first paint: no redirect yet, and
    // nothing rendered about it either.
    render({ status: "pending" });
    expect(h.store.navigateCalls).toEqual([]);

    render({ status: "success", tourCompletedAt: null });
    expect(h.store.navigateCalls).toEqual([["/tour", { replace: true }]]);
  });

  it("never redirects twice, even while the flag is still null", () => {
    render({ status: "success", tourCompletedAt: null });
    expect(h.store.navigateCalls).toHaveLength(1);

    // The PATCH failed, so the flag is still null and the user is back on the
    // dashboard. Without the latch this is an infinite loop.
    render({ status: "success", tourCompletedAt: null, pathname: "/tour" });
    render({ status: "success", tourCompletedAt: null, pathname: "/" });
    render({ status: "success", tourCompletedAt: null, pathname: "/storage" });

    expect(h.store.navigateCalls).toHaveLength(1);
  });

  it("leaves a parent who has already seen the tour where they are", () => {
    render({ status: "pending" });
    render({ status: "success", tourCompletedAt: "2026-09-11T10:00:00.000Z" });
    expect(h.store.navigateCalls).toEqual([]);
  });

  it("does nothing when the preferences query errors", () => {
    // An API blip must not interrupt someone who is already using the app.
    render({ status: "error" });
    render({ status: "error" });
    expect(h.store.navigateCalls).toEqual([]);
  });

  it("does not redirect the tour to itself", () => {
    render({ status: "success", tourCompletedAt: null, pathname: "/tour" });
    expect(h.store.navigateCalls).toEqual([]);
  });

  it("redirects from a deep link, not just the dashboard", () => {
    render({ status: "success", tourCompletedAt: null, pathname: "/storage/abc-123" });
    expect(h.store.navigateCalls).toEqual([["/tour", { replace: true }]]);
  });

  it("still redirects when the answer only arrives after a route change", () => {
    render({ status: "pending", pathname: "/" });
    render({ status: "pending", pathname: "/meals" });
    expect(h.store.navigateCalls).toEqual([]);

    render({ status: "success", tourCompletedAt: null, pathname: "/meals" });
    expect(h.store.navigateCalls).toEqual([["/tour", { replace: true }]]);
  });
});
