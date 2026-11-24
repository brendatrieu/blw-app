import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RecipeDetail } from "@blw/shared";
import { catalogKeys } from "../catalog/hooks.js";
import { babyKeys } from "../babies/api.js";
import { CookPage } from "./CookPage.js";

const RECIPE: RecipeDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "salmon-mash",
  title: "Salmon mash",
  minAgeMonths: 6,
  prepMinutes: 15,
  ironFocus: true,
  vitaminCHigh: false,
  fiberHigh: false,
  imageUrl: null,
  fridgeHoursOverride: null,
  freezerDaysOverride: null,
  allergens: ["fish"],
  ingredients: [
    { foodId: "f1", foodSlug: "salmon", foodName: "Salmon", isCustom: false, foodEmoji: null, quantityNote: "1 fillet", allergens: ["fish"] },
  ],
  extraIngredients: [{ name: "olive oil", quantityNote: "a drizzle" }],
  variants: [
    { ageStage: "6", textureNote: "", steps: ["Steam the salmon until it flakes, about 12 minutes.", "Mash with a fork."] },
    { ageStage: "9", textureNote: "", steps: ["Steam", "Flake", "Serve"] },
  ],
  isCustom: false,
  notes: null,
};

function renderCook(search: string, recipe: RecipeDetail = RECIPE) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(catalogKeys.recipe(recipe.id), recipe);
  queryClient.setQueryData(babyKeys.list(false), []);
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [`/recipes/${recipe.id}/cook${search}`] },
        createElement(Routes, null, createElement(Route, { path: "/recipes/:id/cook", element: createElement(CookPage) })),
      ),
    ),
  );
}

describe("CookPage screens (ledger 1095, copy 1098)", () => {
  it("opens on You'll need: the recipe's ingredient rows, none of them a link, and Start", () => {
    const html = renderCook("?stage=6");
    expect(html).toContain(">You&#x27;ll need</h2>");
    expect(html).toContain("Salmon");
    expect(html).toContain("1 fillet");
    expect(html).toContain("a drizzle olive oil");
    expect(html).not.toContain('href="/foods/salmon"');
    expect(html).toMatch(/<button[^>]*>Start<\/button>/);
    expect(html).not.toContain(">Back<");
  });

  it("shows Step N of M, the step in large text, Back and Next", () => {
    const html = renderCook("?stage=6&step=1");
    expect(html).toContain(">Step <!-- -->1<!-- --> of <!-- -->2</h2>");
    expect(html).toMatch(/<p class="text-2xl[^"]*">Steam the salmon until it flakes, about 12 minutes\.<\/p>/);
    expect(html).toMatch(/<button[^>]*>Back<\/button>/);
    expect(html).toMatch(/<button[^>]*>Next<\/button>/);
  });

  it("plays the stage in the link: 9–11 mo has three steps", () => {
    const html = renderCook("?stage=9&step=3");
    expect(html).toContain(">Step <!-- -->3<!-- --> of <!-- -->3</h2>");
    expect(html).toContain(" · <!-- -->9–11 mo");
  });

  it("ends on All done with Back to recipe and the recipe's Log meal prefill", () => {
    const html = renderCook("?stage=6&step=3");
    expect(html).toContain(">All done</h2>");
    expect(html).toMatch(/<button[^>]*>Back to recipe<\/button>/);
    expect(html).toContain(`href="/log-meal?recipe=${RECIPE.id}"`);
    expect(html).not.toMatch(/>Next<\/button>/);
    expect(renderCook("?stage=6&step=3", { ...RECIPE, deletedAt: "2026-11-08T10:00:00.000Z" })).not.toContain("/log-meal");
  });

  it("keeps a Close button on every screen and a progress bar that fills", () => {
    for (const [step, now] of [["0", "0"], ["1", "50"], ["3", "100"]] as const) {
      const html = renderCook(`?stage=6&step=${step}`);
      expect(html).toContain('aria-label="Close"');
      expect(html).toContain(`role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${now}"`);
    }
  });

  it("is one screen tall, clears the safe areas, and lets a long step scroll inside itself", () => {
    const html = renderCook("?stage=6&step=1");
    expect(html).toContain("supports-[height:100dvh]:h-[100dvh]");
    expect(html).toContain("padding-top:calc(0.25rem + env(safe-area-inset-top) + var(--top-edge-clearance-slim))");
    expect(html).toContain("padding-bottom:calc(0.75rem + env(safe-area-inset-bottom))");
    expect(html).toMatch(/class="min-h-0 flex-1 touch-pan-y touch-pinch-zoom overflow-y-auto/);
    // No fixed chrome (CLAUDE.md), and the glow ground with a frosted control bar.
    expect(html).not.toContain("fixed");
    expect(html).toContain('class="app-ground"');
    expect(html).toContain("background-repeat:no-repeat"); // lib/glows.ts glowTiles, as AppLayout
    expect(html).toContain("app-frost");
  });

  it("gives Back and Next 48px targets", () => {
    const html = renderCook("?stage=6&step=1");
    expect(html.match(/<button[^>]*class="[^"]*min-h-12[^"]*"[^>]*>(Back|Next)<\/button>/g)).toHaveLength(2);
  });

  it("does not slide on arrival (a reload or a deep link)", () => {
    expect(renderCook("?stage=6&step=1")).not.toContain("cook-slide");
  });

  it("never slides for a reduced-motion user (ledger 1141a pin)", () => {
    const css = readFileSync(new URL("../../styles/index.css", import.meta.url), "utf8");
    // Each reduced-motion block, up to its closing brace at the line start.
    const reduce = css.split("@media (prefers-reduced-motion: reduce) {").slice(1).map((rest) => rest.slice(0, rest.indexOf("\n}")));
    expect(reduce.some((block) => /\.cook-slide\s*\{\s*animation: none;/.test(block.replace(/\.[\w-]+,\s*/g, "")))).toBe(true);
  });

  it("offers Ingredients in the top bar, after the title, on every step and All done; not on You'll need (ledger 1147)", () => {
    const ingredients = /<button[^>]*class="[^"]*min-h-11[^"]*shrink-0[^"]*"[^>]*>Ingredients<\/button>/;
    expect(renderCook("?stage=6")).not.toContain(">Ingredients<");
    for (const step of ["1", "2", "3"]) {
      const html = renderCook(`?stage=6&step=${step}`);
      expect(html).toMatch(ingredients);
      // Right of the title, which truncates first; the sheet stays closed until tapped.
      expect(html).toMatch(/<h1 class="min-w-0 flex-1 truncate[^"]*">.*<\/h1><button[^>]*>Ingredients<\/button>/);
      expect(html).not.toContain('role="dialog"');
    }
    expect(renderCook("?stage=6&step=1", { ...RECIPE, ingredients: [], extraIngredients: [] })).not.toContain(">Ingredients<");
  });

  it("tints the Ingredients button sea: the nutrient chip's soft fill and ink, nothing frosted (ledger 1154a, option C)", () => {
    const html = renderCook("?stage=6&step=1");
    const cls = html.match(/<button[^>]*class="([^"]*)"[^>]*>Ingredients<\/button>/)![1]!.split(" ");
    expect(cls).toEqual(expect.arrayContaining(["!bg-[var(--color-primary-soft)]", "!text-[var(--color-primary-soft-text)]"]));
    expect(cls.filter((c) => /card-glass|shadow-|backdrop-|apricot/.test(c))).toEqual([]);
  });

  it("frosts the scroll cue's track like the bars, -webkit- twin for iOS Safari (ledger 1153b)", () => {
    const css = readFileSync(new URL("../../styles/index.css", import.meta.url), "utf8");
    const rule = css.slice(css.indexOf(".cook-cue {"), css.indexOf("}", css.indexOf(".cook-cue {")));
    expect(rule).toContain("background-color: var(--color-bar-glass);");
    expect(rule).toContain("box-shadow: inset 0 0 0 0.5px var(--color-bar-hairline);");
    expect(rule).toContain("-webkit-backdrop-filter: var(--bar-filter);");
    expect(rule).toMatch(/\n\s*backdrop-filter: var\(--bar-filter\);/);
  });

  it("gives the cue track .app-frost's near-opaque fallbacks: no blur, or less transparency asked for (ledger 1154b)", () => {
    const css = readFileSync(new URL("../../styles/index.css", import.meta.url), "utf8");
    const after = css.slice(css.indexOf(".cook-cue {"));
    expect(after).toMatch(
      /^\.cook-cue \{[^}]*\}\s*@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\s*\.cook-cue \{\s*background-color: var\(--color-app-solid\);\s*\}\s*\}\s*@media \(prefers-reduced-transparency: reduce\) \{\s*\.cook-cue \{\s*background-color: var\(--color-app-solid\);\s*-webkit-backdrop-filter: none;\s*backdrop-filter: none;\s*\}\s*\}/,
    );
  });

  it("shows no scroll cue before anything is measured (a reload lands on the step's top)", () => {
    expect(renderCook("?stage=6&step=1")).not.toContain("data-cook-cue");
  });
});
