import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, splitOptionalLabel } from "./Field.js";

describe("splitOptionalLabel", () => {
  it("splits a trailing (optional) off a string label", () => {
    expect(splitOptionalLabel("Notes (optional)")).toEqual({ base: "Notes", suffix: "(optional)" });
  });

  it("is case-insensitive and tolerates extra spacing", () => {
    expect(splitOptionalLabel("Best by  (Optional)")).toEqual({ base: "Best by", suffix: "(Optional)" });
  });

  it("returns null for labels without the suffix, or with it mid-label", () => {
    expect(splitOptionalLabel("Notes")).toBeNull();
    expect(splitOptionalLabel("(optional) Notes")).toBeNull();
  });

  it("returns null for non-string labels", () => {
    expect(splitOptionalLabel(createElement("span", null, "Notes (optional)"))).toBeNull();
  });
});

describe("Field (render)", () => {
  it("renders the (optional) suffix de-emphasized: normal weight, muted color, inside the label", () => {
    const html = renderToString(
      createElement(Field, { label: "Notes (optional)", htmlFor: "x", children: createElement("input", { id: "x" }) }),
    );
    expect(html).toContain('<span class="font-normal text-[var(--color-text-muted)]">(optional)</span>');
    expect(html).toContain("Notes");
  });

  // The error slot is the single rendering path every form's required-field
  // message travels (item 235), so what it emits is pinned here rather than
  // re-asserted in each form's own test.
  it("renders a supplied error as an alert in danger text, under the control", () => {
    const html = renderToString(
      createElement(Field, {
        label: "Title",
        htmlFor: "x",
        error: "Title is required",
        children: createElement("input", { id: "x" }),
      }),
    );
    expect(html).toMatch(/<p role="alert" class="[^"]*text-\[var\(--color-danger\)\][^"]*">Title is required<\/p>/);
    // Under the control, not above it.
    expect(html.indexOf('id="x"')).toBeLessThan(html.indexOf("Title is required"));
  });

  it("renders no alert markup at all when the error is absent — the pre-submit state", () => {
    const html = renderToString(
      createElement(Field, { label: "Title", htmlFor: "x", children: createElement("input", { id: "x" }) }),
    );
    expect(html).not.toContain('role="alert"');
  });

  it("lets an error replace the hint rather than stacking with it", () => {
    const withHint = renderToString(
      createElement(Field, {
        label: "Password",
        htmlFor: "x",
        hint: "At least 8 characters.",
        children: createElement("input", { id: "x" }),
      }),
    );
    expect(withHint).toContain("At least 8 characters.");

    const withError = renderToString(
      createElement(Field, {
        label: "Password",
        htmlFor: "x",
        hint: "At least 8 characters.",
        error: "Password is required",
        children: createElement("input", { id: "x" }),
      }),
    );
    expect(withError).toContain("Password is required");
    expect(withError).not.toContain("At least 8 characters.");
  });

  it("leaves labels without the suffix untouched", () => {
    const html = renderToString(
      createElement(Field, { label: "Food", htmlFor: "x", children: createElement("input", { id: "x" }) }),
    );
    expect(html).not.toContain("font-normal text-[var(--color-text-muted)]");
    expect(html).toContain("Food");
  });
});
