import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmergencyCard } from "./EmergencyCard.js";

function render(level: "emergency" | "urgent_care"): string {
  return renderToString(
    createElement(EmergencyCard, { level, reasons: [], steps: [], disclaimer: "", onDismiss: () => undefined }),
  );
}

describe("EmergencyCard call button (item 569)", () => {
  it("offers exactly one call button in an emergency, and it dials 911", () => {
    const html = render("emergency");
    expect(html.match(/href="tel:[^"]*"/g)).toEqual(['href="tel:911"']);
    expect(html).toContain("Call 911");
  });

  it("offers no call button when the baby needs to be seen today", () => {
    expect(render("urgent_care")).not.toContain('href="tel:');
  });
});
