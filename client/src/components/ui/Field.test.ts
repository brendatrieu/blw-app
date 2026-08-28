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

  it("leaves labels without the suffix untouched", () => {
    const html = renderToString(
      createElement(Field, { label: "Food", htmlFor: "x", children: createElement("input", { id: "x" }) }),
    );
    expect(html).not.toContain("font-normal text-[var(--color-text-muted)]");
    expect(html).toContain("Food");
  });
});
