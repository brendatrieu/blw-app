import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  "how-to-add-custom-food",
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

  it("add-to-storage step 1 only asks for Done on the multi-select food path (the recipe picker closes on tap)", () => {
    const body = getGuide("how-to-add-to-storage")?.body ?? "";
    const step1 = body.split(/^## /m).find((s) => s.startsWith("1. ")) ?? "";
    expect(step1).toContain("The recipe list closes by itself.");
    expect(step1).toMatch(/For foods you can pick several, then tap \*\*Done\*\*\./);
    expect(step1).not.toContain("tap your pick, then tap **Done**");
    expect(body).toContain("Use within 90d");
  });

  // Item 725: a guide is opened from the form it explains (its HowToLink) or
  // from More, so none of them says where to start. Step 1 is the form's own
  // first field, and the three "open the form" screenshots are gone.
  it("start at the form's first field, never at how to reach the form", () => {
    expect(guideArticles.map((guide) => guide.body.match(/^## 1\. (.+)$/m)?.[1])).toEqual([
      "Name it",
      "Name it and pick an age",
      "Pick the foods",
      "Choose what you're storing",
      "Set the servings and time",
    ]);
    for (const guide of guideArticles) {
      expect(guide.body, guide.slug).not.toMatch(/On \*\*Home\*\*|in the bottom bar/);
      for (const retired of ["meal-1-open", "serve-1-menu", "recipe-1-add"]) {
        expect(guide.body).not.toContain(retired);
        expect(existsSync(path.join(repoRoot, `client/public/guides/${retired}.webp`)), retired).toBe(false);
      }
    }
  });

  it("image file numbers match their step numbers", () => {
    for (const guide of guideArticles) {
      for (const section of guide.body.split(/^## /m).slice(1)) {
        const step = section.match(/^(\d+)\. /)?.[1];
        const src = section.match(/\]\(\/guides\/[a-z]+-(\d+)-/)?.[1];
        expect(src, `${guide.slug} step ${step}`).toBe(step);
      }
    }
  });

  it("add-to-storage warns that Free-form items have no Serve (label-only items withhold it)", () => {
    // The add-to-storage guide offers Free-form; resolveStorageItemMenuActions
    // gives a label-only item only Edit and Remove, so the step that offers
    // it says so (item 725; it used to sit in the serve guide's retired step 1).
    expect(resolveStorageItemMenuActions({ status: "active", foods: [], recipeTitle: null }).serve).toBe(false);
    const body = getGuide("how-to-add-to-storage")?.body ?? "";
    const step1 = body.split(/^## /m).find((s) => s.startsWith("1. ")) ?? "";
    expect(step1).toContain(
      "For foods you can pick several, then tap **Done**. **Free-form** items can't be served, so tap **Remove** when they're used up.",
    );
    expect(getGuide("how-to-serve-from-storage")?.body).not.toContain("Free-form");
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

// Item 727: each guide screenshot has a -dark twin, and the renderer shows the
// one matching the app's resolved theme (in-app data-theme first, else the OS).
describe("dark guide screenshots", () => {
  const render = (content: string) =>
    renderToString(createElement(MemoryRouter, null, createElement(Markdown, { content })));
  // Pixel size from the WebP header: VP8X stores width-1/height-1 as 24-bit LE
  // at bytes 24/27; a simple lossy VP8 file stores 14-bit sizes at 26/28.
  const size = (file: string) => {
    const b = readFileSync(file);
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X") return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
    expect(chunk, file).toBe("VP8 ");
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  };

  afterEach(() => vi.unstubAllGlobals());

  it("every guide image has a <name>-dark.webp twin with the same pixel size, and the MDX names only the light file", () => {
    for (const guide of guideArticles) {
      expect(guide.body, guide.slug).not.toContain("-dark.webp");
      for (const [, , src = ""] of guide.body.matchAll(IMAGE_RE)) {
        const light = path.join(repoRoot, "client/public", src);
        const dark = light.replace(/\.webp$/, "-dark.webp");
        expect(existsSync(dark), dark).toBe(true);
        expect(size(dark), src).toEqual(size(light));
      }
    }
  });

  it("follows the OS through a <source> media query when the app is on System", () => {
    const html = render("![A screenshot of the form](/guides/x-1-y.webp)");
    expect(html).toContain(
      '<picture class="block"><source srcSet="/guides/x-1-y-dark.webp" media="(prefers-color-scheme: dark)"/><source srcSet="/guides/x-1-y.webp"/><img src="/guides/x-1-y.webp"',
    );
    expect(html.match(/<img /g)).toHaveLength(1);
  });

  it("follows the in-app override, and the <img> src is already the matching file (one download, no flash)", () => {
    for (const [theme, media, src] of [
      ["dark", "all", "/guides/x-1-y-dark.webp"],
      ["light", "not all", "/guides/x-1-y.webp"],
    ] as const) {
      vi.stubGlobal("document", { documentElement: { getAttribute: (name: string) => (name === "data-theme" ? theme : null) } });
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "all" }));
      const html = render("![A screenshot of the form](/guides/x-1-y.webp)");
      expect(html, theme).toContain(`<source srcSet="/guides/x-1-y-dark.webp" media="${media}"/>`);
      expect(html, theme).toContain(`<img src="${src}"`);
    }
  });

  it("resolves the OS preference for the <img> src on System", () => {
    vi.stubGlobal("document", { documentElement: { getAttribute: () => null } });
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(prefers-color-scheme: dark)" }));
    expect(render("![A screenshot of the form](/guides/x-1-y.webp)")).toContain('<img src="/guides/x-1-y-dark.webp"');
  });

  it("leaves other images alone (no twin is assumed outside /guides/*.webp)", () => {
    const html = render("![A diagram](/images/x.png)");
    expect(html).not.toContain("<picture");
    expect(html).toContain('src="/images/x.png"');
  });

  it("precaches no images: both variants reach the offline cache only when viewed", () => {
    const config = readFileSync(path.join(repoRoot, "client/vite.config.ts"), "utf8");
    expect(config).not.toMatch(/globPatterns|webp/);
    expect(config).toMatch(/request\.destination === "image",\s*handler: "CacheFirst"/);
  });
});
