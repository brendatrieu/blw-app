// Feature 2 type pass (items 648, 649): Fraunces for page titles only, and
// one shared Nunito 800 / 20px section heading.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const token = (name: string) =>
  css
    .match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "m"))?.[1]
    ?.replace(/\s+/g, " ")
    .trim();

describe("type tokens (items 648, 649)", () => {
  it("self-hosts Fraunces with its optical-size axis, beside Nunito", () => {
    expect(css).toContain('@import "@fontsource-variable/nunito/wght.css";');
    expect(css).toContain('@import "@fontsource-variable/fraunces/opsz.css";');
  });

  it("--font-family-display leads with Fraunces and falls back to a serif", () => {
    expect(token("font-family-display")).toMatch(/^"Fraunces Variable",.*\bserif$/);
  });

  it("--font-display is Fraunces 700 at 34px; .font-display keeps -0.01em tracking", () => {
    expect(token("font-display")).toBe("700 2.125rem/1.1 var(--font-family-display)");
    expect(css).toMatch(
      /\.font-display \{\s*font: var\(--font-display\);\s*letter-spacing: -0\.01em;/,
    );
    // A long one-word custom title wraps instead of scrolling the page sideways.
    expect(css).toMatch(/\.font-display \{[^}]*overflow-wrap: anywhere;[^}]*\}/);
  });

  it("Nunito stays everywhere else: every other ramp token is the base family", () => {
    for (const name of ["font-h1", "font-h2", "font-body", "font-caption"]) {
      expect(token(name), name).toMatch(/var\(--font-family-base\)$/);
    }
  });

  it("--font-h2 is the shared section heading: Nunito 800, 20px", () => {
    expect(token("font-h2")).toBe("800 1.25rem/1.25 var(--font-family-base)");
  });
});

describe("Fraunces is for page titles and the Home baby name only (item 648)", () => {
  const root = new URL("../", import.meta.url);
  const TITLE_FILES = [
    "components/AppLayout.tsx",
    "components/ui/PageHeader.tsx",
    "pages/AboutPage.tsx",
    "pages/FoodDetailPage.tsx",
    "pages/LoginPage.tsx",
    "pages/RecipeDetailPage.tsx",
    "pages/SignupPage.tsx",
  ];
  it("only title files use .font-display (an admin stat number stays Nunito)", () => {
    const users = (readdirSync(root, { recursive: true }) as string[])
      .filter((path) => /\.tsx$/.test(path) && !/\.test\.tsx?$/.test(path))
      .filter((path) => /\bfont-display\b/.test(readFileSync(new URL(path, root), "utf8")))
      .map((path) => path.replaceAll("\\", "/"))
      .sort();
    expect(users).toEqual(TITLE_FILES);
  });
});

describe("section headings share .font-h2 (item 649)", () => {
  const root = new URL("../", import.meta.url);
  const sources = (readdirSync(root, { recursive: true }) as string[])
    .filter((path) => /\.tsx$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => ({ path, text: readFileSync(new URL(path, root), "utf8") }));
  // Not page sections: the emergency card's small caps labels and the tour
  // dialog's slide title.
  const EXEMPT = new Set([
    "features/symptom/components/EmergencyCard.tsx",
    "features/tour/TourDialog.tsx",
  ]);

  it("finds h2s in the client source", () => {
    expect(sources.filter(({ text }) => text.includes("<h2")).length).toBeGreaterThan(15);
  });

  it("every section <h2> carries font-h2", () => {
    const offenders = sources
      .filter(({ path }) => !EXEMPT.has(path.replaceAll("\\", "/")))
      .flatMap(({ path, text }) =>
        [...text.matchAll(/<h2\b[^>]*>/g)]
          // Home's Up next card is titled by the small apricot label, as
          // A-Home draws it (item 660), not by a section heading.
          .filter(([tag]) => !/\bfont-h2\b/.test(tag) && !tag.includes("className={UP_NEXT_LABEL_CLASS}"))
          .map(([tag]) => `${path}: ${tag}`),
      );
    expect(offenders).toEqual([]);
  });
});
