import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge.js";

describe("Badge weight (item 720)", () => {
  it("is 12px/500 in every tone (font-medium, one step under Nunito's 600)", () => {
    for (const tone of ["primary", "neutral", "allergen", "outline", "nutrient"] as const) {
      const html = renderToString(createElement(Badge, { tone, children: "6m+" }));
      expect(html, tone).toMatch(/^<span class="[^"]* text-xs font-medium whitespace-nowrap /);
      expect(html, tone).not.toMatch(/font-(?:semibold|bold|extrabold)/);
    }
  });
});
