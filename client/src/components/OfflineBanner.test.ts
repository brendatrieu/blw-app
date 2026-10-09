import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onlineManager } from "@tanstack/react-query";
import { OfflineBanner } from "./OfflineBanner.js";

afterEach(() => {
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

const html = () => renderToString(createElement(OfflineBanner));

describe("OfflineBanner (ledger 765)", () => {
  it("online: an empty live region, no strip", () => {
    expect(html()).toBe('<div role="status"></div>');
  });

  it("offline: exactly \"You're offline.\" inside the polite live region, in the callout style", () => {
    onlineManager.setOnline(false);
    const out = html();
    expect(out).toMatch(/^<div role="status"><p class="[^"]*">You&#x27;re offline\.<\/p><\/div>$/);
    const classes = out.match(/<p class="([^"]*)"/)![1]!.split(" ");
    expect(classes).toEqual(
      expect.arrayContaining(["bg-[var(--color-callout-bg)]", "text-[var(--color-callout-icon)]", "border-[var(--color-callout-border)]"]),
    );
    // In flow: never fixed or sticky page chrome (CLAUDE.md iOS rule).
    expect(classes).not.toContain("fixed");
    expect(classes).not.toContain("sticky");
  });

  it("offline on a cold start (navigator.onLine false) too", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(html()).toContain("You&#x27;re offline.");
  });

  it("hides again once back online", () => {
    onlineManager.setOnline(false);
    expect(html()).toContain("offline");
    onlineManager.setOnline(true);
    expect(html()).toBe('<div role="status"></div>');
  });
});
