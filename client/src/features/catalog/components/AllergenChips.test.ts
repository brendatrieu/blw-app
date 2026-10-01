import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AllergenChips } from "./AllergenChips.js";

function render(allergens: string[]): string {
  return renderToString(createElement(AllergenChips, { allergens }));
}

// Item 334: extracted from the two identical allergen Badge loops
// FoodBadges and the recipe header carried, so the five new surfaces mark
// allergens the same way instead of each inventing one.
describe("AllergenChips", () => {
  it("renders one soft plum allergen pill per allergen, in the order given (item 636)", () => {
    const html = render(["fish", "sesame"]);
    expect(html).toContain("Fish");
    expect(html).toContain("Sesame");
    expect(html.indexOf("Fish")).toBeLessThan(html.indexOf("Sesame"));
    expect((html.match(/bg-\[var\(--color-allergen-soft\)\] text-\[var\(--color-allergen-soft-text\)\]/g) ?? []).length).toBe(2);
    expect(html).not.toContain("--color-danger");
    expect(html.match(/whitespace-nowrap/g)).toHaveLength(2);
  });

  it("labels each slug the way the food page does, not as a raw slug", () => {
    expect(render(["tree_nut"])).toContain("Tree nut");
    expect(render(["tree_nut"])).not.toContain("tree_nut");
  });

  it("falls back to the slug itself for an allergen the client has no label for", () => {
    expect(render(["lupin"])).toContain("lupin");
  });

  it("renders absolutely nothing for a food with no allergens — no wrapper, no gap", () => {
    expect(render([])).toBe("");
  });
});
