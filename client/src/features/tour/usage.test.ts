// Call-site pins for the tour events (item 320): opened / completed /
// skipped, with the slide a skip happened on and the gesture that caused it.
// Same hook-store harness as TourDialog.handlers.test.ts, with `track`
// replaced by a recorder.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0, refs: [] as { current: unknown }[], r: 0 };
  const prefs = { status: "success" as "pending" | "error" | "success", fetchStatus: "idle", tourCompletedAt: null as string | null };
  return {
    store,
    prefs,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      return [store.states[i], (v: unknown) => {
        store.states[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(store.states[i]) : v;
      }];
    },
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    reset: () => {
      store.states = [];
      store.i = 0;
      store.refs = [];
      store.r = 0;
      prefs.status = "success";
      prefs.fetchStatus = "idle";
      prefs.tourCompletedAt = null;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useState: h.useState,
    useRef: h.useRef,
    useEffect: (effect: () => void) => {
      effect();
    },
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
  };
});

vi.mock("./hooks.js", () => ({
  usePreferences: () => ({
    data: { tourCompletedAt: h.prefs.tourCompletedAt, shareUsageData: true },
    status: h.prefs.status,
    fetchStatus: h.prefs.fetchStatus,
  }),
  useCompleteTour: () => ({ mutate: () => {} }),
  preferenceKeys: { all: () => ["preferences"] },
}));

const tracked: Array<[string, Record<string, unknown>]> = [];
vi.mock("../../lib/usage/track.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, track: (...args: unknown[]) => tracked.push(args as [string, Record<string, unknown>]) };
});

import { TOUR_SLIDE_COUNT } from "./slides.js";
import { TourDialog } from "./TourDialog.js";
import { TourProvider } from "./TourProvider.js";

type Rendered = {
  type: unknown;
  props: {
    children?: unknown;
    onClick?: () => void;
    onClose?: (reason?: "overlay" | "escape") => void;
    onScroll?: (event: { currentTarget: { scrollLeft: number; clientWidth: number } }) => void;
    value?: { openTour: () => void };
    [key: string]: unknown;
  };
};

const SLIDE_WIDTH = 320;

function renderDialog(source: "first_run" | "more" = "first_run") {
  h.store.i = 0;
  h.store.r = 0;
  const tree = (TourDialog as unknown as (props: unknown) => Rendered)({ source, onClose: () => {} });
  const [skipRow, track, footer] = tree.props.children as Rendered[];
  const [, buttonRow] = footer!.props.children as Rendered[];
  const buttons = buttonRow!.props.children as (Rendered | null)[];
  return {
    tree,
    track: track!,
    skip: (skipRow!.props.children ?? null) as Rendered | null,
    primary: buttons[buttons.length - 1]!,
  };
}

/** Moves the real track to a slide the way a swipe would. */
function scrollTo(view: ReturnType<typeof renderDialog>, index: number, source: "first_run" | "more" = "first_run") {
  view.track.props.onScroll?.({ currentTarget: { scrollLeft: index * SLIDE_WIDTH, clientWidth: SLIDE_WIDTH } });
  return renderDialog(source);
}

function renderProvider(): Rendered {
  h.store.i = 0;
  h.store.r = 0;
  return (TourProvider as unknown as (props: unknown) => Rendered)({ children: "app" });
}

beforeEach(() => {
  tracked.length = 0;
  h.reset();
});

describe("tour_opened", () => {
  it("reports a first-run opening as first_run", () => {
    renderProvider();
    expect(tracked).toEqual([["tour_opened", { source: "first_run" }]]);
  });

  it("reports More's 'Take the tour' as more", () => {
    h.prefs.tourCompletedAt = "2026-09-11T10:00:00.000Z"; // already seen: the gate stays shut
    const tree = renderProvider();
    expect(tracked).toEqual([]);
    tree.props.value!.openTour();
    expect(tracked).toEqual([["tour_opened", { source: "more" }]]);
  });
});

describe("tour_completed", () => {
  it("fires when the last slide's primary action is taken", () => {
    let view = renderDialog();
    view = scrollTo(view, TOUR_SLIDE_COUNT - 1);
    view.primary.props.onClick?.();
    expect(tracked).toEqual([["tour_completed", { source: "first_run" }]]);
  });

  it("carries the source it was opened with, so a replay never dilutes the first-run rate", () => {
    let view = renderDialog("more");
    view = scrollTo(view, TOUR_SLIDE_COUNT - 1, "more");
    view.primary.props.onClick?.();
    expect(tracked).toEqual([["tour_completed", { source: "more" }]]);
  });
});

describe("tour_skipped", () => {
  it("carries the slide the parent was on when they left", () => {
    let view = renderDialog();
    view = scrollTo(view, 2);
    view.skip!.props.onClick?.();
    expect(tracked).toEqual([["tour_skipped", { source: "first_run", slide: 2, via: "skip" }]]);
  });

  it("tells the Skip button, an overlay tap and Escape apart", () => {
    renderDialog().tree.props.onClose?.("overlay");
    renderDialog().tree.props.onClose?.("escape");
    expect(tracked.map(([, props]) => props.via)).toEqual(["overlay", "escape"]);
  });

  it("never reports a slide the deck does not have", () => {
    let view = renderDialog();
    // An elastic overscroll past the end, the way a trackpad flick reads.
    view = scrollTo(view, TOUR_SLIDE_COUNT + 4);
    view.tree.props.onClose?.("escape");
    expect(tracked[0]![1]).toMatchObject({ slide: TOUR_SLIDE_COUNT - 1 });
  });

  it("sends nothing about the slide's content, only its index", () => {
    const view = renderDialog();
    view.skip!.props.onClick?.();
    expect(Object.keys(tracked[0]![1]).sort()).toEqual(["slide", "source", "via"]);
  });
});
