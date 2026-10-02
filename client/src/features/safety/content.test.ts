import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { getGuide, getSafetyArticle, guideArticles, safetyArticles } from "./content.js";
import { Markdown } from "../../lib/markdown/Markdown.js";
import { resolveStorageItemMenuActions } from "../storage/format.js";

const EXPECTED_SLUGS = [
  "gagging-vs-choking",
  "allergic-reaction-signs",
  "unsafe-foods",
  "honey-salt-sugar",
  "allergen-introduction",
  "iron-and-nutrition-basics",
  "storage-and-reheating",
  "infant-first-aid-reference",
  "tummy-changes-starting-solids",
];

describe("safety article manifest", () => {
  it("loads exactly the 9 expected articles", () => {
    expect(safetyArticles.map((article) => article.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
  });

  it("parses title/order/summary/body for every article", () => {
    for (const article of safetyArticles) {
      expect(article.title.length).toBeGreaterThan(0);
      expect(Number.isInteger(article.order)).toBe(true);
      expect(article.summary.length).toBeGreaterThan(0);
      expect(article.body.length).toBeGreaterThan(0);
    }
  });

  it("is sorted by frontmatter order, ascending", () => {
    const orders = safetyArticles.map((article) => article.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("looks articles up by slug, and returns undefined for an unknown slug", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(getSafetyArticle(slug)?.slug).toBe(slug);
    }
    expect(getSafetyArticle("does-not-exist")).toBeUndefined();
  });

  it("renders every article's markdown body without throwing", () => {
    for (const article of safetyArticles) {
      const html = renderToString(
        createElement(MemoryRouter, null, createElement(Markdown, { content: article.body })),
      );
      expect(html.length).toBeGreaterThan(0);
    }
  });
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const EXPECTED_GUIDES = [
  "how-to-custom-recipe",
  "how-to-log-a-meal",
  "how-to-add-to-storage",
  "how-to-serve-from-storage",
];

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

describe("how-to guides (item 601)", () => {
  it("load as their own group, in order, apart from the safety articles", () => {
    expect(guideArticles.map((guide) => guide.slug)).toEqual(EXPECTED_GUIDES);
    for (const slug of EXPECTED_GUIDES) {
      expect(getGuide(slug)?.slug).toBe(slug);
      expect(getSafetyArticle(slug)).toBeUndefined();
    }
    expect(getGuide("gagging-vs-choking")).toBeUndefined();
  });

  it("stay out of the AI safety corpus, which is built from content/safety only", () => {
    const corpus = readFileSync(path.join(repoRoot, "server/src/ai/prompts/safety-corpus.ts"), "utf8");
    for (const guide of guideArticles) {
      expect(corpus).not.toContain(guide.slug);
      expect(corpus).not.toContain(guide.title);
    }
    const script = readFileSync(path.join(repoRoot, "server/scripts/build-safety-corpus.mjs"), "utf8");
    expect(script).toContain('"../../content/safety"');
    expect(script).not.toContain("content/guides");
  });

  it("each has 4-6 numbered steps, one screenshot per step, every image with alt text and a real file", () => {
    for (const guide of guideArticles) {
      const steps = guide.body.match(/^## \d+\. \S/gm) ?? [];
      expect(steps.length, guide.slug).toBeGreaterThanOrEqual(4);
      expect(steps.length, guide.slug).toBeLessThanOrEqual(6);
      const images = [...guide.body.matchAll(IMAGE_RE)];
      expect(images.length, guide.slug).toBe(steps.length);
      for (const [, alt = "", src = ""] of images) {
        expect(alt.trim().length, `${guide.slug}: ${src}`).toBeGreaterThan(10);
        expect(src, guide.slug).toMatch(/^\/guides\/[a-z0-9-]+\.webp$/);
        expect(existsSync(path.join(repoRoot, "client/public", src)), src).toBe(true);
      }
    }
  });

  it("add-to-storage step 2 only asks for Done on the multi-select food path (the recipe picker closes on tap)", () => {
    const body = getGuide("how-to-add-to-storage")?.body ?? "";
    const step2 = body.split(/^## /m).find((s) => s.startsWith("2. ")) ?? "";
    expect(step2).toContain("The recipe list closes by itself.");
    expect(step2).toMatch(/For foods you can pick several, then tap \*\*Done\*\*\./);
    expect(step2).not.toContain("tap your pick, then tap **Done**");
    expect(body).toContain("Use within 90d");
  });

  it("log-a-meal step 1 doesn't place Log meal 'at the top' (Up next sits above it on Home, item 677)", () => {
    const body = getGuide("how-to-log-a-meal")?.body ?? "";
    const step1 = body.split(/^## /m).find((s) => s.startsWith("1. ")) ?? "";
    expect(step1).toContain("On **Home**, tap **Log meal**.");
    expect(step1).not.toMatch(/at the top/);
  });

  it("serve step 1 warns that Free-form items have no Serve (label-only items withhold it)", () => {
    // The add-to-storage guide offers Free-form; resolveStorageItemMenuActions
    // gives a label-only item only Edit and Remove, so the serve guide says so.
    expect(resolveStorageItemMenuActions({ status: "active", foods: [], recipeTitle: null }).serve).toBe(false);
    expect(getGuide("how-to-add-to-storage")?.body).toContain("**Free-form**");
    const body = getGuide("how-to-serve-from-storage")?.body ?? "";
    const step1 = body.split(/^## /m).find((s) => s.startsWith("1. ")) ?? "";
    expect(step1).toContain("**Free-form** items can't be served, so tap **Remove** when they're gone.");
  });

  it("renders every screenshot as an <img> with its alt text", () => {
    for (const guide of guideArticles) {
      const html = renderToString(createElement(MemoryRouter, null, createElement(Markdown, { content: guide.body })));
      const images = [...guide.body.matchAll(IMAGE_RE)];
      expect(html.match(/<img /g)?.length, guide.slug).toBe(images.length);
      expect(html).toContain(`src="${images[0]?.[2]}"`);
      expect(html).toContain('alt="');
    }
  });
});

describe("Markdown images", () => {
  const render = (content: string) =>
    renderToString(createElement(MemoryRouter, null, createElement(Markdown, { content })));

  it("renders a same-origin image that has alt text, eagerly (so one view caches it for offline)", () => {
    const html = render("![A screenshot of the form](/guides/x.webp)");
    expect(html).toContain('src="/guides/x.webp"');
    expect(html).toContain('alt="A screenshot of the form"');
    expect(html).toContain('loading="eager"');
  });

  it("renders nothing for an image without alt text, or from another origin", () => {
    expect(render("![](/guides/x.webp)")).not.toContain("<img");
    expect(render("![Remote](https://example.com/x.png)")).not.toContain("<img");
    expect(render("![Protocol-relative](//example.com/x.png)")).not.toContain("<img");
  });
});
