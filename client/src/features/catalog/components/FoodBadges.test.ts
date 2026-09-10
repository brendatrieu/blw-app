import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FoodListItem } from "@blw/shared";
import { FoodBadges } from "./FoodBadges.js";

type BadgeFood = Parameters<typeof FoodBadges>[0]["food"];

function food(overrides: Partial<BadgeFood> = {}): BadgeFood {
  return {
    ironLevel: "low" as FoodListItem["ironLevel"],
    vitaminCLevel: "low" as FoodListItem["vitaminCLevel"],
    fiberLevel: "low" as FoodListItem["fiberLevel"],
    allergens: [],
    minAgeMonths: 6,
    isCustom: false,
    ...overrides,
  };
}

const render = (item: BadgeFood) => renderToString(createElement(FoodBadges, { food: item }));

// Item 279: fiber is badged only at "high" — "moderate" and "low" are facts
// nobody reaches for a food over, so they'd be noise next to iron and vit C.
describe("FoodBadges — High fiber (item 279)", () => {
  it("badges a high-fiber catalog food", () => {
    expect(render(food({ fiberLevel: "high" }))).toContain(">High fiber<");
  });

  it("says nothing at moderate or low", () => {
    expect(render(food({ fiberLevel: "moderate" }))).not.toContain("High fiber");
    expect(render(food({ fiberLevel: "low" }))).not.toContain("High fiber");
  });

  // A custom food's fiber column holds a placeholder "low" — but even a
  // hand-set "high" must stay hidden, exactly like iron and vitamin C.
  it("stays hidden on a custom food whatever the column says", () => {
    const html = render(food({ isCustom: true, fiberLevel: "high" }));
    expect(html).not.toContain("High fiber");
    expect(html).toContain(">Custom<");
  });

  // The tone is load-bearing: swapping it for "sunshine" (vit C's) or
  // "primary" (iron's) reads fine by text alone, so pin the classes.
  it("carries the success tone's classes, not just its text", () => {
    expect(render(food({ fiberLevel: "high" }))).toMatch(
      /class="[^"]*bg-\[var\(--color-success-soft\)\][^"]*text-\[var\(--color-success-soft-text\)\][^"]*"[^>]*>High fiber</,
    );
  });

  it("sits after the vitamin C badge and before the min-age one", () => {
    const html = render(food({ ironLevel: "high", vitaminCLevel: "high", fiberLevel: "high" }));
    const vitC = html.indexOf(">Vit C ");
    const fiber = html.indexOf(">High fiber<");
    // React splits `{minAgeMonths}m+` into two text nodes in SSR output.
    const age = html.search(/>6(?:<!-- -->)?m\+</);
    expect(vitC).toBeGreaterThan(-1);
    expect(fiber).toBeGreaterThan(vitC);
    expect(age).toBeGreaterThan(fiber);
  });
});
