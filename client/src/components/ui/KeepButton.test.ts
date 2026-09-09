import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeepButton } from "./KeepButton.js";

describe("KeepButton (item 257 — the one surviving dismiss)", () => {
  it("is icon-only with an accessible 'Keep it' name and no visible text", () => {
    const html = renderToString(createElement(KeepButton, { onClick: () => {} }));
    expect(html).toContain('aria-label="Keep it"');
    expect(html).toContain('d="M6 6l12 12M18 6L6 18"');
    expect(html.replace(/<[^>]+>/g, "").trim()).toBe("");
    expect(html).not.toContain(">Cancel<");
    expect(html).not.toContain(">Keep<");
  });

  it("meets the 44px tap-target rule, matching the header X's footprint", () => {
    const html = renderToString(createElement(KeepButton, { onClick: () => {} }));
    expect(html).toMatch(/class="[^"]*h-11 w-11/);
  });

  it("takes a custom label for confirms where 'Keep it' reads wrong", () => {
    const html = renderToString(createElement(KeepButton, { onClick: () => {}, label: "Don't delete" }));
    expect(html).toContain("aria-label=\"Don&#x27;t delete\"");
  });

  it("disables while the destructive mutation is in flight", () => {
    const html = renderToString(createElement(KeepButton, { onClick: () => {}, disabled: true }));
    expect(html).toMatch(/<button[^>]*\sdisabled=""/);
  });
});
