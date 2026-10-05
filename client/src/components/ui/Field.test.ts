import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, OptionalLabel, splitOptionalLabel } from "./Field.js";

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

// Item 736: "(optional)" looks the same everywhere. Every "(optional)" the app
// renders goes through Field's label or OptionalLabel (so the suffix is the
// one quiet span), and no label carrying it is muted as a whole.
describe("one (optional) treatment everywhere (item 736)", () => {
  const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return files(full);
      return /\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
    });

  it("renders OptionalLabel as the label text plus the quiet suffix, and a plain label untouched", () => {
    const wrap = (label: string) => renderToString(createElement("span", null, createElement(OptionalLabel, { label })));
    expect(wrap("Rating (optional)")).toBe(
      '<span>Rating<!-- --> <span class="font-normal text-[var(--color-text-muted)]">(optional)</span></span>',
    );
    expect(wrap("When")).toBe("<span>When</span>");
  });

  it("every (optional) in the client source is a Field label or an OptionalLabel label", () => {
    const offenders: string[] = [];
    let sites = 0;
    for (const file of files(srcRoot)) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const all = code.match(/\(optional\)/g)?.length ?? 0;
      const ok = code.match(/label=(?:"[^"\n]*\(optional\)"|\{`[^`\n]*\(optional\)`\})/g)?.length ?? 0;
      sites += ok;
      if (all !== ok) offenders.push(path.relative(srcRoot, file));
    }
    expect(offenders).toEqual([]);
    expect(sites).toBeGreaterThanOrEqual(25);
  });

  it("no element wrapping an OptionalLabel is muted as a whole", () => {
    let checked = 0;
    for (const file of files(srcRoot)) {
      const code = readFileSync(file, "utf8");
      for (const m of code.matchAll(/className="([^"]*)">\s*<OptionalLabel/g)) {
        checked++;
        expect(m[1], path.relative(srcRoot, file)).not.toContain("color-text-muted");
        expect(m[1], path.relative(srcRoot, file)).toContain("text-[var(--color-text)]");
      }
    }
    // Field, ServeSheet x2, MealRatingsField, SymptomSurveyForm x2, CustomRecipeForm x2.
    expect(checked).toBe(8);
  });
});
