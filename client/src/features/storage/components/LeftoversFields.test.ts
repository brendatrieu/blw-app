// The leftovers block's markup (item 154), moved with the component from
// LogFoodForm (ledger 902). Its own state is pinned in PlateScreen's tests.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LeftoverSourceKind } from "../leftovers.js";
import { LeftoversFields, type LeftoversFieldsProps } from "./LeftoversFields.js";

describe("LeftoversFields (render)", () => {
  const baseProps: Omit<LeftoversFieldsProps, "source"> = {
    containerChoice: "one",
    onContainerChoiceChange: () => {},
    location: "fridge" as const,
    onLocationChange: () => {},
    servingsTotal: "",
    onServingsTotalChange: () => {},
    bestBy: "",
    onBestByChange: () => {},
  };

  const render = (source: LeftoverSourceKind, props: Partial<typeof baseProps> = {}) =>
    renderToString(createElement(LeftoversFields, { ...baseProps, ...props, source }));

  it("renders the location segments, servings, and best-by fields for every source kind", () => {
    const html = render({ kind: "recipe", recipeIds: ["recipe-1"] });
    expect(html).toContain("Location");
    expect(html).toMatch(/Total servings(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/Best by(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
  });

  // Item 348: the select that made a parent throw away two of three foods is
  // gone from every source kind, for good.
  it("never asks 'Which food?' again — not for a recipe, one food, or several", () => {
    const sources: LeftoverSourceKind[] = [
      { kind: "recipe", recipeIds: ["recipe-1"] },
      { kind: "foods", foodIds: ["food-1"] },
      { kind: "foods", foodIds: ["food-1", "food-2", "food-3"] },
    ];
    for (const source of sources) {
      expect(render(source)).not.toContain("Which food?");
    }
  });

  describe("the 'Save as' choice (item 348)", () => {
    it("is shown, as a radiogroup with both containers, from two foods up", () => {
      const html = render({ kind: "foods", foodIds: ["food-1", "food-2"] });
      expect(html).toContain("Save as");
      expect(html).toMatch(/role="radiogroup"[^>]*aria-label="Save as"/);
      expect(html).toContain("One container");
      expect(html).toContain("Separate containers");
    });

    it("defaults to One container — the segment checked before anyone touches it", () => {
      const html = render({ kind: "foods", foodIds: ["food-1", "food-2"] });
      expect(html).toMatch(/aria-checked="true"[^>]*>(?:<!-- -->)?\s*One container</);
      expect(html).toMatch(/aria-checked="false"[^>]*>(?:<!-- -->)?\s*Separate containers</);
    });

    it("follows the caller's choice when it is 'separate'", () => {
      const html = render({ kind: "foods", foodIds: ["food-1", "food-2"] }, { containerChoice: "separate" });
      expect(html).toMatch(/aria-checked="true"[^>]*>(?:<!-- -->)?\s*Separate containers</);
    });

    it("is hidden at one food — one food is one container either way", () => {
      expect(render({ kind: "foods", foodIds: ["food-1"] })).not.toContain("Save as");
    });

    // Ledger 759 (owner Q2): leftovers of two or more recipes ask the same
    // question — one container holding them all, or one per recipe.
    it("is shown from two recipes up", () => {
      const html = render({ kind: "recipe", recipeIds: ["recipe-1", "recipe-2"] });
      expect(html).toMatch(/role="radiogroup"[^>]*aria-label="Save as"/);
      expect(html).toContain("One container");
      expect(html).toContain("Separate containers");
    });

    it("is hidden at zero foods, and for a one-recipe container", () => {
      expect(render({ kind: "foods", foodIds: [] })).not.toContain("Save as");
      expect(render({ kind: "recipe", recipeIds: ["recipe-1"] })).not.toContain("Save as");
    });
  });
});

