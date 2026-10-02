// Item 694: Home's ‹ › paging — the window/clamp math, the range label, and
// the pager's markup (hidden when it all fits, 44px targets, dimmed ends).
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pager, pageWindow, rangeLabel } from "./Pager.js";

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
    expect(pageWindow(8, 0, 3)).toEqual({ page: 0, last: 2, start: 0, end: 3, total: 8 });
    expect(pageWindow(8, 1, 3)).toEqual({ page: 1, last: 2, start: 3, end: 6, total: 8 });
    expect(pageWindow(8, 2, 3)).toEqual({ page: 2, last: 2, start: 6, end: 8, total: 8 });
    expect(pageWindow(6, 1, 3)).toMatchObject({ last: 1, start: 3, end: 6 });
  });

  it("is one page at 3 or fewer, and empty at 0", () => {
    expect(pageWindow(3, 0, 3)).toMatchObject({ page: 0, last: 0, start: 0, end: 3 });
    expect(pageWindow(4, 0, 3).last).toBe(1);
    expect(pageWindow(0, 0, 3)).toEqual({ page: 0, last: 0, start: 0, end: 0, total: 0 });
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

  it("is a muted range, then ‹ and › as 44px named buttons", () => {
    const html = render(8, 1);
    expect(html).toMatch(
      /^<div class="-mr-2 flex shrink-0 items-center"><span class="[^"]*text-sm[^"]*tabular-nums[^"]*text-\[var\(--color-text-muted\)\]">4–6 of 8<\/span>/,
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
