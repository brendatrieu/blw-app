import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Plate } from "../foodEmoji.js";
import { FoodPlate, FoodPlates } from "./FoodPlate.js";

const RING = "ring-2 ring-[var(--color-bg-elevated)]";
const PLATES: Plate[] = [
  { emoji: "🥑", tint: "fruit" },
  { emoji: "🍗", tint: "protein" },
  { emoji: "🍚", tint: "grain" },
];

/** Each rendered disc's opening tag, in document order (the slot itself excluded). */
function discs(html: string): string[] {
  return html.match(/<span aria-hidden="true" class="flex [^>]*>/g) ?? [];
}

/** A disc's "left,top" (React prints 0 without a unit). */
function spot(tag: string): string {
  return /left:(\d+)(?:px)?;top:(\d+)(?:px)?/.exec(tag)!.slice(1).join(",");
}

describe("FoodPlate (item 657)", () => {
  it("is a decorative round disc sized and tinted by its props, emoji about half the size", () => {
    const html = renderToString(
      createElement(FoodPlate, { emoji: "🐟", tint: "protein", size: 104 }),
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("rounded-full");
    expect(html).toContain(
      "width:104px;height:104px;font-size:52px;background:var(--color-plate-protein)",
    );
    expect(html).toContain("🐟");
  });

  it("never lets a small plate's emoji drop below 14px", () => {
    expect(
      renderToString(createElement(FoodPlate, { emoji: "🥚", tint: "dairy", size: 24 })),
    ).toContain("font-size:14px");
  });
});

describe("FoodPlates (item 658)", () => {
  const render = (plates: Plate[], overflow = 0) =>
    renderToString(createElement(FoodPlates, { plates, overflow }));

  it("is one aria-hidden 48x44 slot", () => {
    expect(render(PLATES.slice(0, 1))).toMatch(
      /^<span aria-hidden="true" class="relative block h-\[44px\] w-\[48px\] shrink-0">/,
    );
  });

  it("1 food: one 44px plate, no ring", () => {
    const d = discs(render(PLATES.slice(0, 1)));
    expect(d).toHaveLength(1);
    expect(d[0]).toContain("width:44px");
    expect(spot(d[0]!)).toBe("2,0");
    expect(d[0]).not.toContain(RING);
  });

  it("2 foods: two 30px plates on a diagonal, the overlapping one ringed", () => {
    const d = discs(render(PLATES.slice(0, 2)));
    expect(d).toHaveLength(2);
    expect(d[0]).toContain("width:30px");
    expect(spot(d[0]!)).toBe("0,0");
    expect(d[0]).not.toContain(RING);
    expect(spot(d[1]!)).toBe("18,14");
    expect(d[1]).toContain(RING);
  });

  it("3 foods: a 24px pyramid, both bottom plates ringed", () => {
    const d = discs(render(PLATES));
    expect(d.map(spot)).toEqual(["12,0", "0,20", "24,20"]);
    expect(d.every((tag) => tag.includes("width:24px"))).toBe(true);
    expect(d.map((tag) => tag.includes(RING))).toEqual([false, true, true]);
  });

  it("4+ foods: the first two plates, then a ringed neutral +N plate in tabular ink", () => {
    const html = render(PLATES.slice(0, 2), 3);
    const d = discs(html);
    expect(d.map(spot)).toEqual(["12,0", "0,20", "24,20"]);
    expect(d[2]).toContain("var(--color-plate-neutral)");
    expect(d[2]).toContain("font-extrabold tabular-nums text-[var(--color-text)]");
    expect(d[2]).toContain("font-size:12px");
    expect(d[2]).toContain(RING);
    expect(html).toContain(">+3</span>");
    expect(html).toContain("🥑");
    expect(html).toContain("🍗");
  });
});
