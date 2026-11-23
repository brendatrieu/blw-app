// Item 694: Home's ‹ › paging — the window/clamp math, the range label, and
// the pager's markup (hidden when it all fits, 44px targets, dimmed ends).
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageTrack, Pager, pageWindow, rangeLabel, type PagedTrack } from "./Pager.js";

const render = (total: number, page: number, capped?: boolean) =>
  renderToString(
    createElement(Pager, {
      label: "meals",
      pages: pageWindow(total, page, 3),
      onPage: () => {},
      capped,
    }),
  );

describe("pageWindow", () => {
  it("slices three at a time and knows the last page", () => {
    expect(pageWindow(8, 0, 3)).toEqual({ page: 0, last: 2, start: 0, end: 3, total: 8, size: 3 });
    expect(pageWindow(8, 1, 3)).toEqual({ page: 1, last: 2, start: 3, end: 6, total: 8, size: 3 });
    expect(pageWindow(8, 2, 3)).toEqual({ page: 2, last: 2, start: 6, end: 8, total: 8, size: 3 });
    expect(pageWindow(6, 1, 3)).toMatchObject({ last: 1, start: 3, end: 6 });
  });

  it("is one page at 3 or fewer, and empty at 0", () => {
    expect(pageWindow(3, 0, 3)).toMatchObject({ page: 0, last: 0, start: 0, end: 3 });
    expect(pageWindow(4, 0, 3).last).toBe(1);
    expect(pageWindow(0, 0, 3)).toEqual({ page: 0, last: 0, start: 0, end: 0, total: 0, size: 3 });
  });

  it("clamps a page the data no longer has (items shrank) and a negative one", () => {
    expect(pageWindow(7, 5, 3)).toMatchObject({ page: 2, start: 6, end: 7 });
    expect(pageWindow(6, 2, 3)).toMatchObject({ page: 1, start: 3, end: 6 });
    expect(pageWindow(2, 4, 3)).toMatchObject({ page: 0, start: 0, end: 2 });
    expect(pageWindow(8, -1, 3)).toMatchObject({ page: 0, start: 0, end: 3 });
  });
});

describe("rangeLabel", () => {
  it('reads "1–3 of 8" (en dash), "7–8 of 8", and a lone row as "7 of 7"', () => {
    expect(rangeLabel(pageWindow(8, 0, 3))).toBe("1–3 of 8");
    expect(rangeLabel(pageWindow(8, 2, 3))).toBe("7–8 of 8");
    expect(rangeLabel(pageWindow(7, 2, 3))).toBe("7 of 7");
  });

  it('says "100+" when the fetch hit its cap', () => {
    expect(rangeLabel(pageWindow(100, 0, 3), true)).toBe("1–3 of 100+");
  });
});

describe("Pager", () => {
  it("renders nothing when everything fits (3 or fewer)", () => {
    expect(render(3, 0)).toBe("");
    expect(render(0, 0)).toBe("");
    expect(render(4, 0)).not.toBe("");
  });

  it("is a muted, announced range, then ‹ and › as 44px named buttons", () => {
    const html = render(8, 1);
    // aria-live on the range (item 775): a swipe or an arrow changes it.
    expect(html).toMatch(
      /^<div class="-mr-2 flex shrink-0 items-center"><span class="[^"]*text-sm[^"]*tabular-nums[^"]*text-\[var\(--color-text-muted\)\]">(<span aria-hidden="true" class="invisible [^"]*">[^<]*<\/span>){2}<span aria-live="polite" class="col-start-1 row-start-1">4–6 of 8<\/span><\/span>/,
    );
    const buttons = html.match(/<button [^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b).toContain('type="button"');
      expect(b).toMatch(/\bh-11 w-11\b/);
      expect(b).toContain("motion-reduce:transition-none");
    }
    expect(buttons[0]).toContain('aria-label="Previous meals"');
    expect(buttons[1]).toContain('aria-label="Next meals"');
    expect(html.indexOf('d="M15 18l-6-6 6-6"')).toBeLessThan(html.indexOf('d="M9 18l6-6-6-6"'));
    // Mid-list: neither end is dimmed.
    expect(html).not.toContain("aria-disabled=");
  });

  it("dims ‹ on the first page and › on the last (aria-disabled, so focus stays put)", () => {
    const first = render(8, 0).match(/<button [^>]*>/g)!;
    expect(first[0]).toContain('aria-disabled="true"');
    expect(first[1]).not.toContain("aria-disabled=");
    const last = render(8, 2).match(/<button [^>]*>/g)!;
    expect(last[0]).not.toContain("aria-disabled=");
    expect(last[1]).toContain('aria-disabled="true"');
    expect(last[1]).toContain("aria-disabled:*:opacity-60");
    expect(last[1]).not.toMatch(/\sdisabled=""/);
  });

  it("steps by one and does nothing past either end", () => {
    const calls: number[] = [];
    const buttons = (page: number) => {
      const el = Pager({
        label: "meals",
        pages: pageWindow(8, page, 3),
        onPage: (p) => calls.push(p),
      })!;
      const kids = (el.props as { children: unknown[] }).children;
      return kids.slice(1) as { props: { onClick: () => void } }[];
    };
    const [prev0, next0] = buttons(0);
    prev0!.props.onClick();
    next0!.props.onClick();
    const [prev2, next2] = buttons(2);
    next2!.props.onClick();
    prev2!.props.onClick();
    expect(calls).toEqual([1, 1]);
  });
});

describe("Pager range width (ledger 1145)", () => {
  // Every page reserves the same two unseen labels, so the range (and any
  // header that wraps around it) is as wide on "7 of 7" as on "4–6 of 7".
  const sizers = (html: string) => [...html.matchAll(/<span aria-hidden="true" class="([^"]*)">([^<]*)<\/span>/g)];
  const live = (html: string) => [...html.matchAll(/<span aria-live="polite" class="([^"]*)">([^<]*)<\/span>/g)];

  it("reserves the second-to-last and last pages' labels on every page, in the shown label's grid cell", () => {
    for (const [total, capped, want] of [
      [7, false, ["4–6 of 7", "7 of 7"]],
      [12, false, ["7–9 of 12", "10–12 of 12"]],
      [100, true, ["97–99 of 100+", "100 of 100+"]],
    ] as const) {
      const last = Math.ceil(total / 3) - 1;
      for (let page = 0; page <= last; page++) {
        const html = render(total, page, capped);
        expect(sizers(html).map((m) => m[2])).toEqual(want);
        for (const m of sizers(html)) expect(m[1]).toBe("invisible col-start-1 row-start-1");
        // Screen readers hear only the shown range, once, still in full.
        const shown = live(html);
        expect(shown).toHaveLength(1);
        expect(shown[0]![2]).toBe(rangeLabel(pageWindow(total, page, 3), capped));
        expect(shown[0]![1]).toBe("col-start-1 row-start-1");
        expect(html).toMatch(/^<div[^>]*><span class="mr-1 grid justify-items-end [^"]*whitespace-nowrap[^"]*">/);
      }
    }
  });

  it("those two are the widest: no page's label has more digits, or a dash the reserved one lacks", () => {
    const digits = (l: string) => l.replace(/\D/g, "").length;
    for (let size = 1; size <= 4; size++)
      for (let total = size + 1; total <= 130; total++) {
        const last = Math.ceil(total / size) - 1;
        const wide = rangeLabel(pageWindow(total, last - 1, size));
        const end = rangeLabel(pageWindow(total, last, size));
        for (let page = 0; page <= last; page++) {
          const l = rangeLabel(pageWindow(total, page, size));
          const fits = (r: string) => digits(l) <= digits(r) && (!l.includes("–") || r.includes("–"));
          expect(fits(wide) || fits(end), `${l} vs ${wide} / ${end}`).toBe(true);
        }
      }
  });
});

describe("Pager focus and dimming", () => {
  it("dims only the glyph at an end and keeps the focus ring inside the button", () => {
    const html = renderToString(
      createElement(Pager, { label: "storage items", pages: pageWindow(8, 0, 3), onPage: () => {} }),
    );
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b).toContain("aria-disabled:*:opacity-60");
      expect(b).not.toMatch(/ aria-disabled:opacity-60/);
      // Inset ring: the Food log's "See all" sits right next to ›.
      expect(b).toContain("focus-visible:outline-offset-[-2px]");
    }
  });
});

describe("PageTrack (item 775)", () => {
  const track = (page: number, near: number | null = null, total = 7): PagedTrack => ({
    pages: pageWindow(total, page, 3),
    size: 3,
    trackRef: { current: null },
    onScroll: () => {},
    near,
    onTouchStart: () => {},
    onWheel: () => {},
    goTo: () => {},
  });
  const html = (page: number, bleed?: boolean) =>
    renderToString(
      createElement(PageTrack<number>, {
        track: track(page),
        items: [0, 1, 2, 3, 4, 5, 6],
        bleed,
        renderSlide: (slice) => createElement("ul", null, slice.join(",")),
      }),
    );

  it("is a horizontal snap scroller that leaves vertical pans to the page", () => {
    expect(html(0)).toMatch(
      /^<div class="scroll-hidden flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden overscroll-x-contain">/,
    );
  });

  it("puts each page on its own full-width slide, one page per flick; only the shown one is reachable", () => {
    const slides = html(1).match(/<div class="[^"]*"( inert="")?><ul>[^<]*<\/ul>/g);
    expect(slides).toEqual([
      '<div class="w-full shrink-0 snap-start snap-always" inert=""><ul>0,1,2</ul>',
      '<div class="w-full shrink-0 snap-start snap-always"><ul>3,4,5</ul>',
      '<div class="w-full shrink-0 snap-start snap-always" inert=""><ul>6</ul>',
    ]);
  });

  it("bleeds 8px past the sides and bottom when asked, so a slide's card keeps its shadow", () => {
    expect(html(0, true)).toMatch(/^<div class="[^"]* overscroll-x-contain -mx-2 -mb-2">/);
    expect(html(0, true)).toContain('<div class="w-full shrink-0 snap-start snap-always px-2 pb-2"><ul>0,1,2</ul>');
  });

  it("fill (ledger 1121): every slide stretches to the tallest, so a short last page's h-full card keeps the full height; without it a slide is its own height", () => {
    const track_ = (fill?: boolean) =>
      renderToString(
        createElement(PageTrack<number>, {
          track: track(0),
          items: [0, 1, 2, 3, 4, 5, 6],
          bleed: true,
          fill,
          renderSlide: (slice) => createElement("ul", null, slice.join(",")),
        }),
      );
    expect(track_(true)).toMatch(/^<div class="scroll-hidden flex snap-x snap-mandatory items-stretch overflow-x-auto [^"]* -mx-2 -mb-2">/);
    expect(track_(false)).toMatch(/^<div class="scroll-hidden flex snap-x snap-mandatory items-start overflow-x-auto [^"]* -mx-2 -mb-2">/);
    // Ledger 1105's `fit` is gone (1120): no slide ever collapses, so nothing resizes mid-swipe.
    for (const fill of [true, false]) {
      const slides = [...track_(fill).matchAll(/<div class="(w-full[^"]*)"/g)].map((m) => m[1]);
      expect(slides).toEqual(Array(3).fill("w-full shrink-0 snap-start snap-always px-2 pb-2"));
    }
  });

  it("after a touch, only the page it started on and its neighbours snap: one flick = one page (item 778)", () => {
    const classes = (near: number | null, bleed?: boolean) =>
      [
        ...renderToString(
          createElement(PageTrack<number>, {
            track: track(near ?? 0, near, 15),
            items: Array.from({ length: 15 }, (_, i) => i),
            bleed,
            renderSlide: (slice) => createElement("ul", null, slice.join(",")),
          }),
        ).matchAll(/<div class="(w-full[^"]*)"/g),
      ].map((m) => m[1]);
    const SNAP = "w-full shrink-0 snap-start snap-always";
    const FAR = "w-full shrink-0 snap-align-none";
    expect(classes(null)).toEqual([SNAP, SNAP, SNAP, SNAP, SNAP]);
    expect(classes(2)).toEqual([FAR, SNAP, SNAP, SNAP, FAR]);
    expect(classes(0)).toEqual([SNAP, SNAP, FAR, FAR, FAR]);
    expect(classes(4, true)).toEqual([FAR, FAR, FAR, SNAP, SNAP].map((c) => `${c} px-2 pb-2`));
  });
});
