// Drives TourProvider's first-run gate (item 311) without a DOM: React's
// hooks are replaced with a tiny store, so the provider can be called as a
// function, its effects run by hand, and both what it exposes (`openTour`)
// and what it renders (the dialog, or nothing) read back. This pins what a
// renderToString suite cannot reach — that the tour opens itself once, only
// once the network has answered, and never on a restored cache.
//
// Same harness idiom as DateTimeField.handlers.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = {
    states: [] as unknown[],
    i: 0,
    refs: [] as { current: unknown }[],
    r: 0,
    effects: [] as (() => void)[],
    preferences: {
      status: "pending",
      fetchStatus: "fetching",
      data: undefined,
    } as {
      status: "pending" | "error" | "success";
      fetchStatus: "fetching" | "paused" | "idle";
      data: { tourCompletedAt: string | null } | undefined;
    },
  };
  return {
    store,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (v: unknown) => {
        store.states[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(store.states[i]) : v;
      };
      return [store.states[i], set];
    },
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
  return {
    ...actual,
    useState: h.useState,
    useRef: h.useRef,
    useEffect: h.useEffect,
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
  };
});

vi.mock("./hooks.js", () => ({
  usePreferences: () => h.store.preferences,
  preferenceKeys: { all: () => ["preferences"] },
}));

// The dialog is an element type here, never called: this suite is about when
// it is mounted, not what it renders.
vi.mock("./TourDialog.js", () => ({ TourDialog: () => null }));

import { TourDialog } from "./TourDialog.js";
import { TourProvider } from "./TourProvider.js";

interface Rendered {
  type: unknown;
  props: { children?: unknown; value?: { openTour: () => void } };
}

interface RenderInput {
  status?: "pending" | "error" | "success";
  fetchStatus?: "fetching" | "paused" | "idle";
  tourCompletedAt?: string | null;
}

/** One call of the component, against the persistent state. */
function pass(): Rendered {
  h.store.i = 0;
  h.store.r = 0;
  h.store.effects = [];
  return (TourProvider as unknown as (props: unknown) => Rendered)({ children: "app" });
}

/**
 * A render, the effects it queued, and the re-render those effects caused —
 * i.e. what the parent actually ends up looking at. The second pass does not
 * re-run its effects: their deps have not changed, so React would not either.
 */
function render({ status = "pending", fetchStatus = "fetching", tourCompletedAt = null }: RenderInput = {}) {
  h.store.preferences = {
    status,
    fetchStatus,
    data: status === "success" ? { tourCompletedAt } : undefined,
  };
  pass();
  for (const effect of h.store.effects) effect();
  const tree = pass();
  const children = tree.props.children as unknown[];
  return {
    tree,
    openTour: tree.props.value!.openTour,
    /** Whether this pass rendered the dialog. */
    dialogOpen: (children[1] as Rendered | null)?.type === TourDialog,
  };
}

beforeEach(() => {
  // Fresh mount: state and the "already opened" latch start over.
  h.store.states = [];
  h.store.i = 0;
  h.store.refs = [];
  h.store.r = 0;
  h.store.effects = [];
});

describe("TourProvider first-run gate (item 311)", () => {
  it("opens the tour for a parent who has never seen it, once the network answers", () => {
    // In flight on the first paint: nothing opens, and nothing renders about
    // it either.
    expect(render({ status: "pending", fetchStatus: "fetching" }).dialogOpen).toBe(false);
    expect(render({ status: "success", fetchStatus: "idle", tourCompletedAt: null }).dialogOpen).toBe(true);
  });

  it("does not open on a restored cache that is still being refetched", () => {
    // The v1 bug, at the level that shipped it: persisted `["preferences"]`
    // made status "success" before the server had said anything.
    expect(render({ status: "success", fetchStatus: "fetching", tourCompletedAt: null }).dialogOpen).toBe(false);
    expect(render({ status: "success", fetchStatus: "paused", tourCompletedAt: null }).dialogOpen).toBe(false);
  });

  it("leaves a parent who has already seen the tour alone", () => {
    expect(
      render({ status: "success", fetchStatus: "idle", tourCompletedAt: "2026-09-11T10:00:00.000Z" }).dialogOpen,
    ).toBe(false);
  });

  it("does nothing when the preferences query errors", () => {
    // An API blip must not interrupt someone who is already using the app.
    expect(render({ status: "error" }).dialogOpen).toBe(false);
    expect(render({ status: "error" }).dialogOpen).toBe(false);
  });

  it("never re-opens itself after it has been closed, even while the flag is still null", () => {
    const opened = render({ status: "success", fetchStatus: "idle", tourCompletedAt: null });
    expect(opened.dialogOpen).toBe(true);

    // The parent skips; the PATCH fails, so the flag is still null. Without
    // the latch every later render re-opens the tour.
    h.store.states[0] = false; // the dialog closed itself

    expect(render({ status: "success", fetchStatus: "idle", tourCompletedAt: null }).dialogOpen).toBe(false);
    expect(render({ status: "success", fetchStatus: "idle", tourCompletedAt: null }).dialogOpen).toBe(false);
  });

  it("opens on demand from More, and that manual opening also spends the session's one automatic one", () => {
    const view = render({ status: "pending", fetchStatus: "fetching" });
    expect(view.dialogOpen).toBe(false);

    view.openTour();
    expect(render({ status: "pending", fetchStatus: "fetching" }).dialogOpen).toBe(true);

    // Closed again, the answer arrives: the gate does not re-open it on top
    // of a parent who has just been through it by hand.
    h.store.states[0] = false;
    expect(render({ status: "success", fetchStatus: "idle", tourCompletedAt: null }).dialogOpen).toBe(false);
  });
});
