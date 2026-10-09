import { useRef, useState, type MutableRefObject, type ReactNode, type UIEvent } from "react";
import { flushSync } from "react-dom";
import { clampSlide, prefersReducedMotion, slideIndexFromScroll } from "../../lib/scrollTrack.js";
import { ChevronLeftGlyph, ChevronRightGlyph, ICON_BUTTON_CLASSES } from "./iconButton.js";

export interface PageWindow {
  /** The page actually shown: the asked-for one, clamped to the data. */
  page: number;
  last: number;
  /** Slice bounds (`items.slice(start, end)`). */
  start: number;
  end: number;
  total: number;
}

/**
 * Which slice of `total` items page `page` shows, `size` per page. The page
 * is clamped here, at render, rather than reset in an effect: when items
 * shrink under you (the last meal on page 3 deleted, a storage item used
 * up) you land on the new last page without an empty frame in between.
 */
export function pageWindow(total: number, page: number, size: number): PageWindow {
  const last = Math.max(0, Math.ceil(total / size) - 1);
  const clamped = Math.min(Math.max(page, 0), last);
  const start = clamped * size;
  return { page: clamped, last, start, end: Math.min(total, start + size), total };
}

/** "1–3 of 8"; a one-row page reads "7 of 7". `capped` = the fetch hit its cap, so "of 100+". */
export function rangeLabel({ start, end, total }: PageWindow, capped = false): string {
  const of = `of ${total}${capped ? "+" : ""}`;
  return end - start === 1 ? `${end} ${of}` : `${start + 1}–${end} ${of}`;
}

interface PagerProps {
  /** Plural noun for the buttons' names: "Previous storage items". */
  label: string;
  pages: PageWindow;
  onPage: (page: number) => void;
  capped?: boolean;
}

// aria-disabled, not `disabled`: a natively disabled › drops keyboard focus
// to <body> the moment you reach the last page. The handlers are no-ops at
// the ends instead, and AT still hears "dimmed".
const PAGER_BUTTON = `${ICON_BUTTON_CLASSES} aria-disabled:*:opacity-60 aria-disabled:cursor-default focus-visible:outline-offset-[-2px] motion-reduce:transition-none`;

/**
 * A Home section header's "1–3 of 8 ‹ ›" (item 694). Renders nothing when
 * everything fits on one page. `-mr-2` pulls the › glyph (not its 44px box)
 * in line with the card edge below, as `ICON_BUTTON_EDGE_INSET` does on the left.
 * The range is the live region (item 775): a swipe changes it, while the
 * rows sit still on their own slides.
 */
export function Pager({ label, pages: win, onPage, capped }: PagerProps) {
  if (win.last === 0) return null;
  const atStart = win.page === 0;
  const atEnd = win.page === win.last;
  return (
    <div className="-mr-2 flex shrink-0 items-center">
      <span aria-live="polite" className="mr-1 text-sm whitespace-nowrap tabular-nums text-[var(--color-text-muted)]">
        {rangeLabel(win, capped)}
      </span>
      <button
        type="button"
        className={PAGER_BUTTON}
        aria-label={`Previous ${label}`}
        aria-disabled={atStart || undefined}
        onClick={() => {
          if (!atStart) onPage(win.page - 1);
        }}
      >
        <ChevronLeftGlyph />
      </button>
      <button
        type="button"
        className={PAGER_BUTTON}
        aria-label={`Next ${label}`}
        aria-disabled={atEnd || undefined}
        onClick={() => {
          if (!atEnd) onPage(win.page + 1);
        }}
      >
        <ChevronRightGlyph />
      </button>
    </div>
  );
}

export interface PagedTrack {
  pages: PageWindow;
  size: number;
  trackRef: MutableRefObject<HTMLDivElement | null>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  /** The page a touch started on: only it and its neighbours snap until ‹ › (null = every page snaps). */
  near: number | null;
  onTouchStart: () => void;
  /** The ‹ › handler: scrolls the track; the scroll then sets the page. */
  goTo: (page: number) => void;
}

/**
 * Swipe paging (item 775): the page is read back from the track's scroll
 * position, as the tour does, so a swipe and ‹ › can never disagree. The
 * arrows only scroll (instantly under reduced motion); `pageWindow` still
 * clamps when items shrink, and the browser clamps the scroll to match.
 */
export function usePagedTrack(total: number, size: number): PagedTrack {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [near, setNear] = useState<number | null>(null);
  const pages = pageWindow(total, page, size);
  const count = pages.last + 1;
  return {
    pages,
    size,
    trackRef,
    onScroll: (event) => {
      const el = event.currentTarget;
      setPage(slideIndexFromScroll(el.scrollLeft, el.clientWidth, count));
    },
    near,
    // One flick = one page (item 778): Chromium's touch fling ignores
    // snap-always and can fly two pages, so a touch freezes the snap points
    // to the page it started on and its neighbours. Frozen, not following
    // the page: a window that moves mid-fling lets the fling through.
    // ponytail: a trackpad after a touch stays one page per gesture until ‹ ›.
    onTouchStart: () => setNear(pages.page),
    goTo: (next) => {
      const el = trackRef.current;
      if (!el || el.clientWidth <= 0) return;
      // Every page snaps again before the scroll starts, or the browser
      // snaps an arrow's target outside the window back inside it.
      flushSync(() => setNear(null));
      el.scrollTo({
        left: clampSlide(next, count) * el.clientWidth,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    },
  };
}

/**
 * The swipeable side of `usePagedTrack`: one full-width snap slide per page.
 * The track is as tall as its tallest slide (`items-start` keeps a short
 * last page from stretching), so a flip never moves the page below, and
 * `overflow-y-hidden` leaves vertical pans to the page. Off-screen slides
 * are `inert`: Tab, screen readers and kebabs only reach the page the range
 * names. `bleed` widens the track 8px past each side and under the bottom,
 * so a slide's card keeps its shadow instead of being clipped by the scroller.
 */
// Whole class names only: Tailwind's scanner misses a class glued to `${`.
const TRACK_CLASSES =
  "scroll-hidden flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden overscroll-x-contain";
// snap-always: a hard flick stops at the next page (WebKit); Chromium needs `near`.
const SLIDE_CLASSES = "w-full shrink-0 snap-start snap-always";
const FAR_SLIDE_CLASSES = "w-full shrink-0 snap-align-none";

export function PageTrack<T>({
  track,
  items,
  renderSlide,
  bleed = false,
}: {
  track: PagedTrack;
  items: readonly T[];
  renderSlide: (slice: readonly T[]) => ReactNode;
  bleed?: boolean;
}) {
  const slides: (readonly T[])[] = [];
  for (let start = 0; start < items.length; start += track.size) slides.push(items.slice(start, start + track.size));
  return (
    <div
      ref={track.trackRef}
      onScroll={track.onScroll}
      onTouchStart={track.onTouchStart}
      className={bleed ? `${TRACK_CLASSES} -mx-2 -mb-2` : TRACK_CLASSES}
    >
      {slides.map((slice, index) => (
        <div
          // Position keys: a slide is "page n", whatever rows it holds now.
          key={index}
          className={`${track.near === null || Math.abs(index - track.near) <= 1 ? SLIDE_CLASSES : FAR_SLIDE_CLASSES}${bleed ? " px-2 pb-2" : ""}`}
          // ponytail: React 18 has no boolean `inert`, so "" sets the
          // attribute; on React 19 this becomes `inert={true}`.
          {...(index !== track.pages.page && { inert: "" })}
        >
          {renderSlide(slice)}
        </div>
      ))}
    </div>
  );
}
