import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressRing } from "./ProgressRing.js";

describe("ProgressRing", () => {
  // The pastel CTA fill sinks into the light inset track (1.35:1); the ring
  // is a graphic, so it draws in the accent instead (items 639, 670).
  it("strokes the progress arc in the accent, not the CTA fill", () => {
    const html = renderToString(createElement(ProgressRing, { value: 0.5, label: "3 of 6 allergens introduced" }));
    expect(html).toContain('stroke="var(--color-accent)"');
    expect(html).not.toContain("var(--color-primary)");
  });
});
