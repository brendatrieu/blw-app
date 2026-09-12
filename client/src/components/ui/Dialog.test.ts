import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DialogPanel } from "./Dialog.js";

/**
 * The dialog's card, rendered standalone (`DialogPanel`, mirroring
 * `SheetPanel`) because `Dialog` itself portals into `document.body` and
 * this suite has no DOM. What the portal wraps around it is pinned in
 * Dialog.handlers.test.ts.
 */
function render(ariaLabel = "Little Meals tour"): string {
  return renderToString(
    createElement(DialogPanel, { ariaLabel, children: createElement("p", null, "panel content") }),
  );
}

describe("DialogPanel (item 309)", () => {
  it("is a modal dialog named by its prop", () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Little Meals tour"');
    // Focusable as a fallback target when the card holds no controls.
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("panel content");
  });

  it("is a centred card, not a full-bleed sheet: bounded width, rounded, elevated, bordered, padded", () => {
    const html = render();
    const className = /class="([^"]*)"/.exec(html)?.[1] ?? "";

    expect(className).toContain("w-[min(100%-2rem,24rem)]");
    expect(className).toContain("rounded-2xl");
    expect(className).toContain("bg-[var(--color-bg-elevated)]");
    expect(className).toContain("border-[var(--color-border)]");
    expect(className).toContain("p-4");
    // A tall dialog scrolls inside itself rather than off the viewport.
    expect(className).toContain("max-h-[85dvh]");
    expect(className).toContain("overflow-y-auto");
    // No bottom-sheet leftovers.
    expect(className).not.toContain("rounded-t-");
    expect(className).not.toContain("max-w-lg");
  });

  it("carries the animation hook that the reduced-motion block switches off", () => {
    expect(render()).toMatch(/class="[^"]*dialog-panel[^"]*"/);
  });
});
