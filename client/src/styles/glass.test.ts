// Ledgers 1077-1084 (round 15): the app's glass surfaces, pinned in markup and CSS.
// Contrast for every new token lives in contrast.test.ts.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Card, CardButton, CardLink } from "../components/ui/Card.js";
import { MenuPanel } from "../components/ui/Menu.js";
import { SkeletonList } from "../components/ui/Skeleton.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { FilterBar } from "../features/catalog/components/filters.js";

const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const classesOf = (html: string) => (/class="([^"]*)"/.exec(html)?.[1] ?? "").split(" ");
/** The body of the first `selector {` rule after `from`. */
const rule = (selector: string, from = 0) => {
  const at = css.indexOf(`${selector} {`, from);
  return at < 0 ? null : css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
};
const layerStart = css.indexOf("@layer components {");

describe("card glass (ledger 1080)", () => {
  const surfaces = {
    Card: renderToString(createElement(Card, null, "x")),
    CardLink: renderToString(createElement(MemoryRouter, null, createElement(CardLink, { to: "/x" }, "x"))),
    CardButton: renderToString(createElement(CardButton, null, "x")),
  };
  for (const [name, html] of Object.entries(surfaces)) {
    it(`${name} wears .app-card, with no fill, border colour or shadow utility of its own to fight it`, () => {
      const cls = classesOf(html);
      expect(cls).toEqual(expect.arrayContaining(["app-card", "rounded-[var(--radius-lg)]", "border"]));
      expect(cls.filter((c) => /^(bg-|shadow-|border-\[|backdrop-)/.test(c))).toEqual([]);
    });
  }
  it("a Settings-style override still wins: the glass sits in the components layer, below utilities", () => {
    expect(layerStart).toBeGreaterThan(-1);
    expect(css.indexOf(".app-card {", layerStart)).toBeGreaterThan(layerStart);
    expect(classesOf(renderToString(createElement(Card, { className: "border-2 border-[var(--color-danger)]" }, "x")))).toContain("border-[var(--color-danger)]");
  });
  it("on the glow ground and in the popups the card is the translucent fill, light border and soft shadow, and never blurs (the chair's PERF call)", () => {
    const card = rule(".app-ground .app-card,\n  .app-frost .app-card", layerStart)!;
    expect(card).toContain("background-color: var(--color-card-glass);");
    expect(card).toContain("border-color: var(--color-card-glass-border);");
    expect(card).toContain("box-shadow: var(--shadow-card-glass);");
    expect(card).not.toContain("backdrop-filter");
  });
  it("anywhere else (sign-in, sign-up, the password pages: outside AppLayout, verify c1) a card is main's solid one", () => {
    // main's Card BASE: border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]
    const card = rule(".app-card", layerStart)!;
    expect(card).toContain("background-color: var(--color-bg-elevated);");
    expect(card).toContain("border-color: var(--color-border);");
    expect(card).toContain("box-shadow: var(--shadow-sm);");
    expect(card).not.toContain("backdrop-filter");
    // The glass rule is scoped and comes after the base, so it wins on the ground.
    expect(css.indexOf(".app-ground .app-card,", layerStart)).toBeGreaterThan(css.indexOf(".app-card {", layerStart));
    for (const page of ["LoginPage", "SignupPage", "ForgotPasswordPage", "ResetPasswordPage"]) {
      const src = readFileSync(new URL(`../pages/${page}.tsx`, import.meta.url), "utf8");
      expect(src, page).toContain("<Card ");
      expect(src, page).not.toMatch(/app-ground|app-frost/);
    }
  });
  it("skeleton cards wear the same glass", () => {
    const html = renderToString(createElement(SkeletonList, { count: 1 }));
    expect(html).toMatch(/<div class="app-card [^"]*border[^"]*"/);
    expect(html).not.toContain("bg-[var(--color-bg-elevated)]");
  });
});

describe("the sweep's surfaces (ledger 1083)", () => {
  // Hand-rolled card-like surfaces outside Card: each wears .app-card instead
  // of the opaque elevated/inset fill that sat flat on the glow.
  const CARD_LIKE: Record<string, number> = {
    "features/storage/components/StorageItemCard.tsx": 1,
    "features/tracking/components/ServeLogList.tsx": 1,
    "features/plate/PlateItemRow.tsx": 1,
    "features/plan/DailyMealsPage.tsx": 1,
    "features/catalog/components/FoodTile.tsx": 1,
    "features/catalog/components/EmojiChooser.tsx": 1,
    "features/symptom/components/CandidateCard.tsx": 1,
    "features/symptom/components/SymptomHistoryList.tsx": 1,
    "features/symptom/components/SymptomResultView.tsx": 1,
    "features/symptom/components/SymptomSurveyForm.tsx": 1,
    "pages/SymptomCheckPage.tsx": 1,
    "pages/FoodDetailPage.tsx": 2,
    "pages/RecipeDetailPage.tsx": 4,
  };
  for (const [file, count] of Object.entries(CARD_LIKE)) {
    it(`${file} wears the card glass on its ${count} card-like surface(s)`, () => {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(src.match(/\bapp-card\b/g)?.length ?? 0).toBe(count);
    });
  }
  it("EmptyState is a glass card, not an inset slab", () => {
    const cls = classesOf(renderToString(createElement(EmptyState, { title: "x" })));
    expect(cls).toEqual(expect.arrayContaining(["app-card", "border"]));
    expect(cls.filter((c) => c.startsWith("bg-"))).toEqual([]);
  });
  it("the Foods / Recipes filter strip is clear at rest and frosts like the header, height unchanged", () => {
    const html = renderToString(createElement(FilterBar, null, "x"));
    const cls = classesOf(html);
    expect(cls).toEqual(expect.arrayContaining(["app-frost", "app-frost-edge", "sticky", "border-b", "border-transparent"]));
    expect(cls.filter((c) => c.startsWith("bg-"))).toEqual([]);
    // Docked, it carries the one line under the header: the header drops its own.
    expect(html).toContain('data-dock=""');
    expect(rule(".app-frost-edge:has(~ main [data-dock][data-scrolled])", layerStart)).toMatch(/box-shadow: inset 0 -1px 0 transparent/);
    for (const page of ["../pages/FoodsPage.tsx", "../features/catalog/components/RecipesSegment.tsx"]) {
      const src = readFileSync(new URL(page, import.meta.url), "utf8");
      expect(src).toContain("<FilterBar>");
      expect(src).not.toContain("sticky z-[5]");
    }
  });
});

describe("frosted bars and popups (ledgers 1079, 1081)", () => {
  it("the frost is the bars' tint, blur + saturate, and the on-glass inks", () => {
    const frost = rule("/* Bars and popups. */\n  .app-frost", layerStart)!;
    expect(frost).toContain("background-color: var(--color-bar-glass);");
    expect(frost).toContain("-webkit-backdrop-filter: var(--bar-filter);");
    expect(frost).toContain("backdrop-filter: var(--bar-filter);");
    const inks = rule(".app-ground,\n  .app-frost", layerStart)!;
    expect(inks).toContain("--color-apricot-text: var(--color-apricot-text-glass);");
    expect(inks).toContain("--color-text-muted: var(--color-text-muted-glass);");
    expect(inks).toContain("--color-primary-soft-text: var(--color-primary-soft-text-glass);"); // nutrient chips (ledger 1083)
  });
  it("the Menu panel is frosted with the bars' hairline, not the elevated fill", () => {
    const cls = classesOf(renderToString(createElement(MenuPanel, { children: null })));
    expect(cls).toEqual(expect.arrayContaining(["app-frost", "border-[var(--color-bar-hairline)]", "shadow-[var(--shadow-lg)]"]));
    expect(cls.filter((c) => c.startsWith("bg-"))).toEqual([]);
  });
  it("the tour's other dots wear the landing's dot ink (3:1 over glass), not the border colour", () => {
    const tour = readFileSync(new URL("../features/tour/TourDialog.tsx", import.meta.url), "utf8");
    expect(tour).toContain('slideIndex === index ? "var(--color-accent)" : "var(--color-landing-dot)"');
  });
});

describe("fallbacks (ledger 1082)", () => {
  const supportsAt = css.indexOf("@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))", layerStart);
  const reducedAt = css.indexOf("@media (prefers-reduced-transparency: reduce)", layerStart);
  it("no backdrop-filter support: bars and popups go near-opaque", () => {
    expect(supportsAt).toBeGreaterThan(layerStart);
    const body = rule(".app-frost,\n    .app-frost .app-frost-edge[data-scrolled]", supportsAt)!;
    expect(body).toContain("background-color: var(--color-app-solid);");
  });
  it("reduced transparency: cards, bars and popups near-opaque with no blur", () => {
    expect(reducedAt).toBeGreaterThan(layerStart);
    const body = rule(".app-ground .app-card,\n    .app-frost .app-card,\n    .app-frost,\n    .app-frost .app-frost-edge[data-scrolled]", reducedAt)!;
    expect(body).toContain("background-color: var(--color-app-solid);");
    expect(body).toContain("backdrop-filter: none;");
  });
  it("About's own glass and its fallbacks are untouched", () => {
    expect(rule(".glass-card")).toContain("background-color: var(--color-glass);");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce) {\n  .glass-card {");
  });
});

describe("the ground's even top row (ledger 1090)", () => {
  it("is its own 4rem box over the glows and under the content, not a layer of the page-tall glow background", () => {
    const ground = rule(".app-ground", css.indexOf("  .app-ground {", layerStart))!;
    expect(ground).toContain("position: relative;");
    expect(ground).toContain("isolation: isolate;"); // z-index -1 stays above the ground's own background
    const band = rule(".app-ground::before", layerStart)!;
    for (const decl of ['content: "";', "position: absolute;", "inset: 0 0 auto;", "height: 4rem;", "z-index: -1;", "pointer-events: none;"]) {
      expect(band).toContain(decl);
    }
    expect(band).toContain("background-image: linear-gradient(var(--color-app-glow-top), transparent);");
  });
  it("the tall glow backgrounds carry no band (Chrome filters their top row), and About does not wear the ground", async () => {
    const { APP_GLOW_PLACES } = await import("../components/AppLayout.js");
    const { glowTiles } = await import("../lib/glows.js");
    const { ABOUT_GLOWS } = await import("../pages/AboutPage.js");
    expect(glowTiles("app", APP_GLOW_PLACES, 3).backgroundImage).not.toMatch(/linear-gradient|glow-top/);
    expect(ABOUT_GLOWS).not.toMatch(/linear-gradient|glow-top/);
    expect(readFileSync(new URL("../pages/AboutPage.tsx", import.meta.url), "utf8")).not.toContain("app-ground");
  });
});
