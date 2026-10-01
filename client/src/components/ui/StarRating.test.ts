// Item 574/578: the star control. Markup is pinned with renderToString;
// behaviour by calling the (hook-free) component as a plain function and
// firing its handlers by hand — no DOM.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RatingSummaryText, StarRating, formatRatingSummary, starForKey } from "./StarRating.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}

function all(node: unknown, match: (el: El) => boolean, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((child) => all(child, match, out));
  else if (node && typeof node === "object" && "props" in node) {
    const el = node as El;
    if (match(el)) out.push(el);
    all(el.props.children, match, out);
  }
  return out;
}

function tree(value: number | null, onChange: (value: number | null) => void = () => {}) {
  return (StarRating as unknown as (props: unknown) => El)({ value, onChange, label: "Rating for Banana" });
}
const stars = (root: El) => all(root, (el) => el.props.role === "radio");
const clear = (root: El) => all(root, (el) => el.type === "button" && el.props.role === undefined)[0];

describe("StarRating markup", () => {
  it("is a labelled radio group of five 44px stars, with star N checked", () => {
    const html = renderToString(createElement(StarRating, { value: 3, onChange: () => {}, label: "Rating for Banana" }));
    expect(html).toContain('role="radiogroup" aria-label="Rating for Banana"');
    expect(html.match(/role="radio"/g)).toHaveLength(5);
    expect(html.match(/h-11 w-11/g)).toHaveLength(5);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true" aria-label="3 stars"/);
    // Three filled, two empty.
    expect(html.match(/★/g)).toHaveLength(3);
    expect(html.match(/☆/g)).toHaveLength(2);
    expect(html).toContain(">Clear<");
  });

  it("paints filled stars in the apricot graphic, empty ones muted (item 640)", () => {
    const html = renderToString(createElement(StarRating, { value: 3, onChange: () => {}, label: "Rating for Banana" }));
    expect(html.match(/text-\[var\(--color-apricot-graphic\)\]"[^>]*><span aria-hidden="true">★/g)).toHaveLength(3);
    expect(html.match(/text-\[var\(--color-text-muted\)\]"[^>]*><span aria-hidden="true">☆/g)).toHaveLength(2);
    expect(html).not.toContain("text-[var(--color-accent)]");
  });

  it("never shows a 0-star state: unrated means nothing checked, all empty, no Clear", () => {
    const html = renderToString(createElement(StarRating, { value: null, onChange: () => {}, label: "Rating for Banana" }));
    expect(html).not.toContain('aria-checked="true"');
    expect(html).not.toContain("★");
    expect(html).not.toMatch(/\b0 stars?\b/);
    expect(html).not.toContain(">Clear<");
  });

  it("puts the one tab stop on the chosen star, or on the first when unrated", () => {
    expect(stars(tree(4)).map((star) => star.props.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
    expect(stars(tree(null)).map((star) => star.props.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });
});

describe("StarRating behaviour", () => {
  it("tapping star N sets N: the right-most is 5, the middle one 3", () => {
    const set: (number | null)[] = [];
    const root = tree(null, (value) => set.push(value));
    const buttons = stars(root);
    (buttons[4]!.props.onClick as () => void)();
    (buttons[2]!.props.onClick as () => void)();
    (buttons[0]!.props.onClick as () => void)();
    expect(set).toEqual([5, 3, 1]);
  });

  it("Clear resets to not rated (null, never 0)", () => {
    const set: (number | null)[] = [];
    (clear(tree(2, (value) => set.push(value)))!.props.onClick as () => void)();
    expect(set).toEqual([null]);
  });

  it("arrow keys move the choice and the focus together", () => {
    const set: (number | null)[] = [];
    const focused: number[] = [];
    const group = { children: [1, 2, 3, 4, 5].map((n) => ({ focus: () => focused.push(n) })) };
    const star3 = stars(tree(3, (value) => set.push(value)))[2]!;
    let prevented = false;
    (star3.props.onKeyDown as (event: unknown) => void)({
      key: "ArrowRight",
      preventDefault: () => {
        prevented = true;
      },
      currentTarget: { parentElement: group },
    });
    expect(set).toEqual([4]);
    expect(focused).toEqual([4]);
    expect(prevented).toBe(true);
  });

  it.each([
    ["ArrowRight", null, 1],
    ["ArrowRight", 5, 5],
    ["ArrowUp", 2, 3],
    ["ArrowLeft", 1, 1],
    ["ArrowDown", 4, 3],
    ["ArrowLeft", null, 1],
    ["Home", 4, 1],
    ["End", 2, 5],
    ["Tab", 2, null],
  ] as const)("%s from %s -> %s", (key, from, to) => {
    expect(starForKey(key, from)).toBe(to);
  });
});

describe("rating summaries", () => {
  const summary = { average: 4.2, count: 5, latest: 4, lastRatedAt: "2026-09-27T12:00:00.000Z" };

  it('reads "4.2 (5)" (the ★ is drawn beside it)', () => {
    expect(formatRatingSummary(summary)).toBe("4.2 (5)");
    expect(formatRatingSummary({ ...summary, average: 4, count: 1 })).toBe("4.0 (1)");
  });

  it("renders nothing at all when unrated", () => {
    expect(renderToString(createElement(RatingSummaryText, { summary: undefined }))).toBe("");
    const html = renderToString(createElement(RatingSummaryText, { summary }));
    expect(html).toContain('<span class="text-[var(--color-apricot-graphic)]">★</span> 4.2 (5)');
    expect(html).toContain("Rated 4.2 out of 5, 5 ratings");
    // Item 651: rating numbers line up in a column of cards.
    expect(html).toMatch(/^<span class="[^"]*\btabular-nums\b/);
  });
});
