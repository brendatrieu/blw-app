// Drives TourPage's real handlers without a DOM. The renderToString suite
// (TourPage.test.ts) can only ever see the first slide — state never moves
// there — so everything that depends on *which* slide is showing was
// unpinned: Skip disappearing on the last slide, Next becoming "Get
// started", and the scroll itself (including the reduced-motion behaviour).
// React's hooks are replaced with a tiny store so the page can be called as
// a plain function, its element tree read, and its callbacks invoked against
// a fake track. Harness ported from DateTimeField.handlers.test.ts.
import { describe, expect, it, vi, afterEach } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], refs: [] as { current: unknown }[], i: 0, r: 0 };
  const nav = { calls: [] as { to: string; options: unknown }[] };
  const tour = { completions: 0 };
  const prefs = { status: "success" as "pending" | "error" | "success", tourCompletedAt: null as string | null };
  const media = { queries: [] as string[], reduced: false };

  return {
    store,
    nav,
    tour,
    prefs,
    media,
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
    reset: (tourCompletedAt: string | null = null) => {
      store.states = [];
      store.refs = [];
      store.i = 0;
      store.r = 0;
      nav.calls = [];
      tour.completions = 0;
      prefs.status = "success";
      prefs.tourCompletedAt = tourCompletedAt;
      media.queries = [];
      media.reduced = false;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useState: h.useState,
    useRef: h.useRef,
    // Effects run inline: the only two here are the replay latch (which this
    // suite depends on) and the key listener, which returns early with no
    // `document`.
    useEffect: (effect: () => void) => {
      effect();
    },
    useCallback: (fn: unknown) => fn,
  };
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useNavigate: () => (to: string, options?: unknown) => {
      h.nav.calls.push({ to, options });
    },
  };
});

vi.mock("../features/tour/hooks.js", () => ({
  preferenceKeys: { all: () => ["preferences"] as const },
  usePreferences: () => ({ data: { tourCompletedAt: h.prefs.tourCompletedAt }, status: h.prefs.status }),
  useCompleteTour: () => ({
    mutate: () => {
      h.tour.completions += 1;
    },
  }),
}));

import { TOUR_SLIDE_COUNT } from "../features/tour/slides.js";
import { TourPage } from "./TourPage.js";

type Rendered = {
  type: unknown;
  ref?: { current: unknown } | null;
  props: {
    children?: unknown;
    className?: string;
    onClick?: () => void;
    onScroll?: (event: { currentTarget: { scrollLeft: number; clientWidth: number } }) => void;
  };
};

interface ScrollCall {
  left: number;
  behavior: string;
}

const SLIDE_WIDTH = 320;

/** A stand-in for the scroll container: the two properties the page reads. */
function fakeTrack(scrolls: ScrollCall[], clientWidth = SLIDE_WIDTH) {
  return {
    clientWidth,
    scrollLeft: 0,
    scrollTo: (options: ScrollCall) => scrolls.push(options),
  };
}

function renderTour() {
  h.store.i = 0;
  h.store.r = 0;
  const tree = (TourPage as unknown as (props: unknown) => Rendered)({});
  const [skipRow, track, footer] = tree.props.children as Rendered[];
  if (!skipRow || !track || !footer) throw new Error("TourPage should render the skip row, the track and the footer");
  const [dotRow, primary] = footer.props.children as Rendered[];
  if (!dotRow || !primary) throw new Error("the footer should render the dots and the primary button");
  return {
    tree,
    track,
    skip: (skipRow.props.children ?? null) as Rendered | null,
    dots: dotRow.props.children as Rendered[],
    primary,
  };
}

/** Every string the page would render, wherever it sits in the tree. */
function collectText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  collectText((node as Rendered).props?.children, out);
  return out;
}

/** Moves the real track to slide `index` the way a swipe would. */
function scrollTo(view: ReturnType<typeof renderTour>, index: number) {
  view.track.props.onScroll?.({
    currentTarget: { scrollLeft: index * SLIDE_WIDTH, clientWidth: SLIDE_WIDTH },
  });
  return renderTour();
}

const globals = globalThis as unknown as { window?: unknown; document?: unknown };

afterEach(() => {
  delete globals.window;
  delete globals.document;
});

interface FakeKey {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  target: { tagName?: string } | null;
  preventDefault: () => void;
}

/** Installs a stand-in `document` and returns the page's keydown listeners as they register. */
function fakeDocument() {
  const listeners: ((event: FakeKey) => void)[] = [];
  globals.document = {
    addEventListener: (type: string, listener: (event: FakeKey) => void) => {
      if (type === "keydown") listeners.push(listener);
    },
    removeEventListener: () => {},
  };
  return listeners;
}

describe("TourPage handlers (items 303, 306)", () => {
  it("hides Skip on the last slide and nowhere else", () => {
    h.reset();
    let view = renderTour();

    for (let index = 0; index < TOUR_SLIDE_COUNT; index += 1) {
      view = scrollTo(view, index);
      const isLast = index === TOUR_SLIDE_COUNT - 1;
      const text = collectText(view.tree);
      if (isLast) {
        expect(view.skip, `slide ${index + 1} should not render Skip`).toBeNull();
        expect(text, "no Skip anywhere on the last slide").not.toContain("Skip");
      } else {
        expect(view.skip, `slide ${index + 1} should render Skip`).not.toBeNull();
        expect(text).toContain("Skip");
      }
    }
  });

  it("labels the primary button Next until the last slide, where it becomes Get started", () => {
    h.reset();
    let view = renderTour();
    expect(view.primary.props.children).toBe("Next");

    for (let index = 0; index < TOUR_SLIDE_COUNT; index += 1) {
      view = scrollTo(view, index);
      expect(view.primary.props.children, `slide ${index + 1}`).toBe(
        index === TOUR_SLIDE_COUNT - 1 ? "Get started" : "Next",
      );
    }

    // Swiping back un-does it: the label follows the track, it is not a
    // one-way latch.
    view = scrollTo(view, 0);
    expect(view.primary.props.children).toBe("Next");
  });

  it("advances one slide per Next, and finishes instead of scrolling on the last", () => {
    h.reset();
    const scrolls: ScrollCall[] = [];
    let view = renderTour();
    view.track.ref!.current = fakeTrack(scrolls);

    view = renderTour();
    view.primary.props.onClick?.();
    expect(scrolls.at(-1)).toEqual({ left: SLIDE_WIDTH, behavior: "smooth" });
    expect(h.nav.calls).toHaveLength(0);
    expect(h.tour.completions).toBe(0);

    view = scrollTo(view, TOUR_SLIDE_COUNT - 1);
    view.primary.props.onClick?.();
    // "Get started" leaves; it does not try to scroll past the end.
    expect(scrolls).toHaveLength(1);
    expect(h.tour.completions).toBe(1);
    expect(h.nav.calls).toEqual([{ to: "/", options: { replace: true } }]);
  });

  it("scrolls the track to a tapped dot, clamped to the deck", () => {
    h.reset();
    const scrolls: ScrollCall[] = [];
    let view = renderTour();
    view.track.ref!.current = fakeTrack(scrolls);

    view = renderTour();
    expect(view.dots).toHaveLength(TOUR_SLIDE_COUNT);
    view.dots[3]!.props.onClick?.();
    expect(scrolls.at(-1)).toEqual({ left: 3 * SLIDE_WIDTH, behavior: "smooth" });
    view.dots[TOUR_SLIDE_COUNT - 1]!.props.onClick?.();
    expect(scrolls.at(-1)).toEqual({ left: (TOUR_SLIDE_COUNT - 1) * SLIDE_WIDTH, behavior: "smooth" });
  });

  it("jumps instead of animating when the parent asked for reduced motion", () => {
    h.reset();
    globals.window = {
      matchMedia: (query: string) => {
        h.media.queries.push(query);
        return { matches: h.media.reduced };
      },
    };

    const scrolls: ScrollCall[] = [];
    let view = renderTour();
    view.track.ref!.current = fakeTrack(scrolls);
    view = renderTour();

    h.media.reduced = true;
    view.dots[2]!.props.onClick?.();
    expect(scrolls.at(-1)).toEqual({ left: 2 * SLIDE_WIDTH, behavior: "auto" });
    expect(h.media.queries.at(-1)).toBe("(prefers-reduced-motion: reduce)");

    // Same tap, motion allowed: the animation comes back.
    h.media.reduced = false;
    view.dots[2]!.props.onClick?.();
    expect(scrolls.at(-1)).toEqual({ left: 2 * SLIDE_WIDTH, behavior: "smooth" });

    // Next takes the same path, so it honours the preference too.
    h.media.reduced = true;
    view.primary.props.onClick?.();
    expect(scrolls.at(-1)?.behavior).toBe("auto");
  });

  it("does not animate — or throw — where there is no window to ask", () => {
    h.reset();
    const scrolls: ScrollCall[] = [];
    let view = renderTour();
    view.track.ref!.current = fakeTrack(scrolls);
    view = renderTour();
    view.dots[1]!.props.onClick?.();
    expect(scrolls.at(-1)).toEqual({ left: SLIDE_WIDTH, behavior: "smooth" });
  });

  it("moves between slides with ← → Home End, clamped, and never while typing or with a modifier held", () => {
    h.reset();
    const listeners = fakeDocument();
    const scrolls: ScrollCall[] = [];
    let view = renderTour();
    const track = fakeTrack(scrolls);
    view.track.ref!.current = track;
    view = renderTour();
    expect(listeners.length).toBeGreaterThan(0);

    const press = (key: string, extra: Partial<FakeKey> = {}) => {
      let prevented = false;
      listeners.at(-1)!({
        key,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        target: { tagName: "DIV" },
        preventDefault: () => {
          prevented = true;
        },
        ...extra,
      });
      return prevented;
    };
    const last = TOUR_SLIDE_COUNT - 1;

    track.scrollLeft = 0;
    expect(press("ArrowRight")).toBe(true);
    expect(scrolls.at(-1)?.left).toBe(SLIDE_WIDTH);

    track.scrollLeft = 2 * SLIDE_WIDTH;
    press("ArrowLeft");
    expect(scrolls.at(-1)?.left).toBe(SLIDE_WIDTH);

    press("End");
    expect(scrolls.at(-1)?.left).toBe(last * SLIDE_WIDTH);
    press("Home");
    expect(scrolls.at(-1)?.left).toBe(0);

    // The deck has ends: no scrolling past either.
    track.scrollLeft = 0;
    press("ArrowLeft");
    expect(scrolls.at(-1)?.left).toBe(0);
    track.scrollLeft = last * SLIDE_WIDTH;
    press("ArrowRight");
    expect(scrolls.at(-1)?.left).toBe(last * SLIDE_WIDTH);

    // Other keys, modifiers and form fields are left alone.
    const before = scrolls.length;
    expect(press("Enter")).toBe(false);
    expect(press("ArrowRight", { metaKey: true })).toBe(false);
    expect(press("ArrowRight", { target: { tagName: "INPUT" } })).toBe(false);
    expect(scrolls.length).toBe(before);
  });

  it("ignores a scroll on a zero-width track instead of scrolling to NaN", () => {
    h.reset();
    const scrolls: ScrollCall[] = [];
    let view = renderTour();
    view.track.ref!.current = fakeTrack(scrolls, 0);
    view = renderTour();
    view.dots[4]!.props.onClick?.();
    expect(scrolls).toHaveLength(0);
  });

  it("Skip on a first run marks the tour seen and starts the app at the dashboard", () => {
    h.reset(null);
    const view = renderTour();
    view.skip!.props.onClick?.();
    expect(h.tour.completions).toBe(1);
    // Asserted straight after the click: the exit never awaits the PATCH.
    expect(h.nav.calls).toEqual([{ to: "/", options: { replace: true } }]);
  });

  it("Skip on a replay writes nothing and goes back to More", () => {
    h.reset("2026-09-11T10:00:00.000Z");
    const view = renderTour();
    view.skip!.props.onClick?.();
    expect(h.tour.completions).toBe(0);
    expect(h.nav.calls).toEqual([{ to: "/more", options: { replace: true } }]);
  });

  it("treats a still-loading preferences read as a first run, not a replay", () => {
    // The gate only ever opens the tour once the query has resolved, but a
    // replay must never be *guessed*: an unresolved read means no stamp is
    // known, so the exit marks the tour seen rather than silently skipping
    // the write.
    h.reset("2026-09-11T10:00:00.000Z");
    h.prefs.status = "pending";
    const view = renderTour();
    view.skip!.props.onClick?.();
    expect(h.tour.completions).toBe(1);
    expect(h.nav.calls).toEqual([{ to: "/", options: { replace: true } }]);
  });
});
