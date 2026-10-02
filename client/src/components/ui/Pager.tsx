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
 */
export function Pager({ label, pages: win, onPage, capped }: PagerProps) {
  if (win.last === 0) return null;
  const atStart = win.page === 0;
  const atEnd = win.page === win.last;
  return (
    <div className="-mr-2 flex shrink-0 items-center">
      <span className="mr-1 text-sm whitespace-nowrap tabular-nums text-[var(--color-text-muted)]">
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
