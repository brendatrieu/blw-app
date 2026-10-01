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

  // Item 637: the one soft nutrient tint, shared with iron and vit C; a tone
  // swap reads fine by text alone, so pin the classes.
  it("carries the one nutrient tint's classes, not just its text (item 637)", () => {
    expect(render(food({ fiberLevel: "high" }))).toMatch(
      /class="[^"]*bg-\[var\(--color-primary-soft\)\][^"]*text-\[var\(--color-primary-soft-text\)\][^"]*"[^>]*>High fiber</,
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

// Item 637: nutrient badges wear ONE soft tint (never solid sky) at every
// level; plain info (min age, Custom) is an outline; allergens are the plum
// pill (item 636). Level wording (High/Moderate/Low) is unchanged.
describe("FoodBadges — badge rules (items 636, 637)", () => {
  const NUTRIENT = 'bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]';
  const OUTLINE = "inset-ring inset-ring-[var(--color-border)] text-[var(--color-text-muted)]";

  it("tints iron at every level, and vit C, in the one nutrient tint", () => {
    for (const ironLevel of ["high", "moderate", "low"] as const) {
      const html = render(food({ ironLevel, vitaminCLevel: "high" }));
      expect(html).toContain(`${NUTRIENT}">Iron <!-- -->`);
      expect(html).toContain(`${NUTRIENT}">Vit C <!-- -->`);
      expect(html).not.toContain("bg-[var(--color-primary)]");
    }
  });

  it("outlines min age and Custom", () => {
    expect(render(food())).toMatch(new RegExp(`${OUTLINE.replace(/[[\]()]/g, "\\$&")}">6<!-- -->m\\+<`));
    expect(render(food({ isCustom: true }))).toContain(`${OUTLINE}">Custom<`);
  });

  it("marks allergens with the plum pill, not red", () => {
    const html = render(food({ allergens: ["fish"] }));
    expect(html).toContain('bg-[var(--color-allergen-soft)] text-[var(--color-allergen-soft-text)]">Fish<');
    expect(html).not.toContain("--color-danger");
  });
});
