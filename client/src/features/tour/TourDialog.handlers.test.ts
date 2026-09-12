// Drives TourDialog's real handlers without a DOM. A renderToString suite can
// only ever see the first slide — state never moves there — so everything
// that depends on *which* slide is showing would otherwise be unpinned: Back
// appearing after slide 1, Skip disappearing on the last, Next becoming "Get
// started", and the scroll itself (including the reduced-motion behaviour).
// React's hooks are replaced with a tiny store so the dialog can be called as
// a plain function, its element tree read, and its callbacks invoked against a
// fake track. Harness ported from the v1 TourPage.handlers.test.ts.
import { describe, expect, it, vi, afterEach } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], refs: [] as { current: unknown }[], i: 0, r: 0 };
  const tour = { completions: 0 };
  const closes = { count: 0 };
  const prefs = { status: "success" as "pending" | "error" | "success", tourCompletedAt: null as string | null };
  const media = { queries: [] as string[], reduced: false };

  return {
    store,
    tour,
    closes,
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
      tour.completions = 0;
      closes.count = 0;
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

vi.mock("./hooks.js", () => ({
  usePreferences: () => ({ data: { tourCompletedAt: h.prefs.tourCompletedAt }, status: h.prefs.status }),
  useCompleteTour: () => ({
    mutate: () => {
      h.tour.completions += 1;
    },
  }),
}));

import { TOUR_SLIDES, TOUR_SLIDE_COUNT } from "./slides.js";
import { TourDialog } from "./TourDialog.js";

type Rendered = {
  type: unknown;
  ref?: { current: unknown } | null;
  props: {
    children?: unknown;
    className?: string;
    onClick?: () => void;
    onClose?: () => void;
    ariaLabel?: string;
    open?: boolean;
    onScroll?: (event: { currentTarget: { scrollLeft: number; clientWidth: number } }) => void;
    [key: string]: unknown;
  };
};

interface ScrollCall {
  left: number;
  behavior: string;
}

const SLIDE_WIDTH = 320;

/** A stand-in for the scroll container: the two properties the dialog reads. */
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
  const tree = (TourDialog as unknown as (props: unknown) => Rendered)({
    onClose: () => {
      h.closes.count += 1;
    },
  });
  const [skipRow, track, footer] = tree.props.children as Rendered[];
  if (!skipRow || !track || !footer) throw new Error("TourDialog should render the skip row, the track and the footer");
  const [dotRow, buttonRow] = footer.props.children as Rendered[];
  if (!dotRow || !buttonRow) throw new Error("the footer should render the dots and the button row");
  const [back, primary] = buttonRow.props.children as (Rendered | null)[];
  if (!primary) throw new Error("the button row should always render the primary action");
  return {
    tree,
    track,
    skip: (skipRow.props.children ?? null) as Rendered | null,
    dots: dotRow.props.children as Rendered[],
    back,
    primary,
  };
}

/** Every string the dialog would render, wherever it sits in the tree. */
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

/** The first element in the subtree whose className contains `needle`. */
function findByClass(node: unknown, needle: string): Rendered | null {
  if (node === null || node === undefined || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByClass(child, needle);
      if (found) return found;
    }
    return null;
  }
  const element = node as Rendered;
  if (typeof element.props?.className === "string" && element.props.className.includes(needle)) return element;
  return findByClass(element.props?.children, needle);
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

/** Installs a stand-in `document` and returns the dialog's keydown listeners. */
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

describe("TourDialog (items 310, 313)", () => {
  it("is a modal named for the app, opened the moment it is mounted", () => {
    h.reset();
    const { tree } = renderTour();
    expect(tree.props.open).toBe(true);
    expect(tree.props.ariaLabel).toBe("Little Meals tour");
  });

  it("renders all six slides in order, copy verbatim", () => {
    h.reset();
    const { track } = renderTour();
    const slides = track.props.children as Rendered[];
    expect(slides).toHaveLength(TOUR_SLIDE_COUNT);

    slides.forEach((slide, index) => {
      const expected = TOUR_SLIDES[index]!;
      const text = collectText(slide);
      expect(text, `slide ${index + 1} emoji`).toContain(expected.emoji);
      expect(text, `slide ${index + 1} title`).toContain(expected.title);
      // The body string as written — not a reflowed or split copy.
      expect(text, `slide ${index + 1} body`).toContain(expected.body);
      // One paragraph, rendered as plain text: nothing reintroduces a break.
      const body = findByClass(slide, "text-sm");
      expect(body, `slide ${index + 1} body element`).not.toBeNull();
      expect(body!.props.children).toBe(expected.body);
      expect(body!.props.className).not.toContain("whitespace-pre");
    });
  });

  it("gives every slide the same height so the card cannot resize mid-swipe", () => {
    h.reset();
    const { track } = renderTour();
    expect(track.props.className).toContain("items-stretch");
    expect(track.props.className).toContain("snap-x");
    expect(track.props.className).toContain("snap-mandatory");
    // On a short viewport the card scrolls; the track is never squeezed and
    // the slides never cropped.
    expect(track.props.className).toContain("shrink-0");
    for (const slide of track.props.children as Rendered[]) {
      expect(slide.props.className).toContain("w-full");
      expect(slide.props.className).toContain("shrink-0");
      expect(slide.props.className).toContain("snap-center");
    }
  });

  it("hides Back on the first slide and steps back one slide everywhere else", () => {
    h.reset();
    const scrolls: ScrollCall[] = [];
    let view = renderTour();
    view.track.ref!.current = fakeTrack(scrolls);

    view = scrollTo(view, 0);
    expect(view.back, "slide 1 should not render Back").toBeNull();
    expect(collectText(view.tree), "no Back anywhere on the first slide").not.toContain("Back");

    for (let index = 1; index < TOUR_SLIDE_COUNT; index += 1) {
      view = scrollTo(view, index);
      expect(view.back, `slide ${index + 1} should render Back`).not.toBeNull();
      expect(collectText(view.back)).toContain("Back");
      // Secondary, and a full 44px target.
      expect(view.back!.props.variant).toBe("secondary");

      const before = scrolls.length;
      view.back!.props.onClick?.();
      expect(scrolls.length, "Back scrolls the track").toBe(before + 1);
      expect(scrolls.at(-1)).toEqual({ left: (index - 1) * SLIDE_WIDTH, behavior: "smooth" });
    }
  });

  it("hides Skip on the last slide and nowhere else", () => {
    h.reset();
    let view = renderTour();

    for (let index = 0; index < TOUR_SLIDE_COUNT; index += 1) {
      view = scrollTo(view, index);
      const text = collectText(view.tree);
      if (index === TOUR_SLIDE_COUNT - 1) {
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
    expect(h.closes.count).toBe(0);
    expect(h.tour.completions).toBe(0);

    view = scrollTo(view, TOUR_SLIDE_COUNT - 1);
    view.primary.props.onClick?.();
    // "Get started" leaves; it does not try to scroll past the end.
    expect(scrolls).toHaveLength(1);
    expect(h.tour.completions).toBe(1);
    expect(h.closes.count).toBe(1);
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

    // Other keys, modifiers and form fields are left alone. Escape in
    // particular belongs to the Dialog, not to the carousel.
    const before = scrolls.length;
    expect(press("Enter")).toBe(false);
    expect(press("Escape")).toBe(false);
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

  it("Skip on a first run marks the tour seen and closes", () => {
    h.reset(null);
    const view = renderTour();
    view.skip!.props.onClick?.();
    expect(h.tour.completions).toBe(1);
    // Asserted straight after the click: the exit never awaits the PATCH.
    expect(h.closes.count).toBe(1);
  });

  it("Skip on a replay writes nothing and just closes", () => {
    h.reset("2026-09-11T10:00:00.000Z");
    const view = renderTour();
    view.skip!.props.onClick?.();
    expect(h.tour.completions).toBe(0);
    expect(h.closes.count).toBe(1);
  });

  it("takes the same exit on an overlay tap or Escape — PATCH on a first run, nothing on a replay", () => {
    // Both reach the dialog through its single `onClose`, which is the
    // dialog's own exit, so neither can drift from Skip's behaviour.
    h.reset(null);
    let view = renderTour();
    view.tree.props.onClose?.();
    expect(h.tour.completions).toBe(1);
    expect(h.closes.count).toBe(1);

    h.reset("2026-09-11T10:00:00.000Z");
    view = renderTour();
    view.tree.props.onClose?.();
    expect(h.tour.completions).toBe(0);
    expect(h.closes.count).toBe(1);
  });

  it("treats a still-loading preferences read as a first run, not a replay", () => {
    // The gate only opens the tour once the query has resolved, but a replay
    // must never be *guessed*: an unresolved read means no stamp is known, so
    // the exit marks the tour seen rather than silently skipping the write.
    h.reset("2026-09-11T10:00:00.000Z");
    h.prefs.status = "pending";
    const view = renderTour();
    view.skip!.props.onClick?.();
    expect(h.tour.completions).toBe(1);
    expect(h.closes.count).toBe(1);
  });
});
