// Feature 2 type pass (items 648, 649): Fraunces for page titles only, and
// one shared 20px section heading. Item 708 (font Option 1): Plus Jakarta Sans
// is the base face for everything else, one weight step lighter.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const token = (name: string) =>
  css
    .match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "m"))?.[1]
    ?.replace(/\s+/g, " ")
    .trim();

describe("type tokens (items 648, 649, 708)", () => {
  it("self-hosts Plus Jakarta Sans beside Fraunces (opsz axis); the old rounded face is gone", () => {
    expect(css).toContain('@import "@fontsource-variable/plus-jakarta-sans/wght.css";');
    expect(css).toContain('@import "@fontsource-variable/fraunces/opsz.css";');
    const pkg = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
    const deps = Object.keys(JSON.parse(pkg).dependencies).filter((name) => name.startsWith("@fontsource"));
    expect(deps.sort()).toEqual(["@fontsource-variable/fraunces", "@fontsource-variable/plus-jakarta-sans"]);
    expect(css).not.toMatch(/nunito|ui-rounded/i);
  });

  it("--font-family-base leads with Plus Jakarta Sans and falls back to a plain sans (item 708)", () => {
    expect(token("font-family-base")).toMatch(/^"Plus Jakarta Sans Variable",.*\bsans-serif$/);
    expect(css).not.toContain("--font-family-heading");
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

  it("the rest of the ramp is the base family, one step lighter (item 708: h1 600, caption 500, body 400)", () => {
    expect(token("font-h1")).toBe("600 1.25rem/1.3 var(--font-family-base)");
    expect(token("font-body")).toBe("400 1rem/1.5 var(--font-family-base)");
    expect(token("font-caption")).toBe("500 0.75rem/1.4 var(--font-family-base)");
  });

  it("--font-h2 is the shared section heading: base family 700, 20px (kept at 700 by item 708)", () => {
    expect(token("font-h2")).toBe("700 1.25rem/1.25 var(--font-family-base)");
    expect(css).toMatch(/\.font-h2 \{\s*font: var\(--font-h2\);\s*\}/);
  });

  it("only --font-display uses Fraunces", () => {
    expect(css.match(/var\(--font-family-display\)/g)).toHaveLength(1);
  });

  it("Tailwind's --font-weight-* scale is not redefined: renamed classes mean what they say (item 708)", () => {
    expect(css).not.toMatch(/--font-weight-/);
  });
});

describe("weights stepped down one, honestly (item 708)", () => {
  const root = new URL("../", import.meta.url);
  const sources = (readdirSync(root, { recursive: true }) as string[])
    .filter((path) => /\.tsx?$/.test(path) && !path.endsWith("type.test.ts"))
    .map((path) => ({ path: path.replaceAll("\\", "/"), text: readFileSync(new URL(path, root), "utf8") }));

  it("no client source uses font-black (900 became font-extrabold)", () => {
    expect(sources.filter(({ text }) => /(?<![\w-])font-black(?![\w-])/.test(text)).map(({ path }) => path)).toEqual([]);
  });

  it("no inline weight is 800 or 900 any more", () => {
    const offenders = sources.filter(({ text }) => /fontWeight(?:=\{|:\s*)[^}\n]*\b(?:800|900)\b/.test(text));
    expect(offenders.map(({ path }) => path)).toEqual([]);
  });

  it("no comment or test title still quotes an 800 weight like 16px/800 (item 721)", () => {
    expect(sources.filter(({ text }) => /px\/800\b/.test(text)).map(({ path }) => path)).toEqual([]);
  });

  it("the chart labels sit one step lighter: Donut 700, Line 600", () => {
    const text = (name: string) => sources.find(({ path }) => path === `components/charts/${name}.tsx`)!.text;
    expect(text("Donut")).toContain("fontWeight={700}");
    expect(text("Line")).toContain("fontWeight={600}");
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
  it("only title files use .font-display (an admin stat number stays the base face)", () => {
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
