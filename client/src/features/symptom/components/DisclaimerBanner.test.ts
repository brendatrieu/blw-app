import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DisclaimerBanner } from "./DisclaimerBanner.js";

describe("DisclaimerBanner", () => {
  it("sticks just under the app header instead of over it (keeps the chip and gear tappable)", () => {
    const html = renderToString(createElement(DisclaimerBanner));
    expect(html).toContain('style="top:var(--header-height)"');
    expect(html).toMatch(/class="sticky z-\[5\] /);
    expect(html).not.toMatch(/\btop-0\b|\bz-20\b/);
  });
});
