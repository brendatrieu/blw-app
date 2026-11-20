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
  it("the card is the translucent fill, light border and soft shadow, and never blurs (the chair's PERF call)", () => {
    const card = rule(".app-card", layerStart)!;
    expect(card).toContain("background-color: var(--color-card-glass);");
    expect(card).toContain("border-color: var(--color-card-glass-border);");
    expect(card).toContain("box-shadow: var(--shadow-card-glass);");
    expect(card).not.toContain("backdrop-filter");
  });
  it("skeleton cards wear the same glass", () => {
    const html = renderToString(createElement(SkeletonList, { count: 1 }));
    expect(html).toMatch(/<div class="app-card [^"]*border[^"]*"/);
    expect(html).not.toContain("bg-[var(--color-bg-elevated)]");
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
    const body = rule(".app-card,\n    .app-frost,\n    .app-frost .app-frost-edge[data-scrolled]", reducedAt)!;
    expect(body).toContain("background-color: var(--color-app-solid);");
    expect(body).toContain("backdrop-filter: none;");
  });
  it("About's own glass and its fallbacks are untouched", () => {
    expect(rule(".glass-card")).toContain("background-color: var(--color-glass);");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce) {\n  .glass-card {");
  });
});
