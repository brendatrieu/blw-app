import { createElement, isValidElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input, Textarea } from "./Input.js";

describe("Textarea", () => {
  // Item 300: autosize measures and sets the height of the REAL element, so
  // it hands `Textarea` a ref. A plain function component would swallow that
  // — React 18 warns and attaches nothing — and every auto-growing field
  // would silently stay two rows tall. Only `forwardRef` makes it work, and
  // this is the assertion that fails if someone unwraps it again.
  it("forwards a ref to the element underneath", () => {
    expect(isValidElement(createElement(Textarea))).toBe(true);
    expect((Textarea as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.forward_ref"));
  });

  it("still renders a textarea carrying the app's control styling and its own props", () => {
    const html = renderToString(createElement(Textarea, { rows: 2, "aria-label": "Notes" }));
    expect(html).toMatch(/^<textarea/);
    expect(html).toContain('rows="2"');
    expect(html).toContain('aria-label="Notes"');
    expect(html).toContain("resize-none");
  });

  it("appends a caller's className rather than replacing the base styling", () => {
    const html = renderToString(createElement(Textarea, { className: "h-40" }));
    expect(html).toContain("h-40");
    expect(html).toContain("resize-none");
  });
});

describe("Input", () => {
  it("keeps the 44px minimum tap target every control in the app has", () => {
    expect(renderToString(createElement(Input, { type: "text" }))).toContain("min-h-11");
  });
});
