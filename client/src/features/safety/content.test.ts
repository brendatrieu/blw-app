import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { getSafetyArticle, safetyArticles } from "./content.js";
import { Markdown } from "../../lib/markdown/Markdown.js";

const EXPECTED_SLUGS = [
  "gagging-vs-choking",
  "allergic-reaction-signs",
  "unsafe-foods",
  "honey-salt-sugar",
  "allergen-introduction",
  "iron-and-nutrition-basics",
  "storage-and-reheating",
  "infant-first-aid-reference",
];

describe("safety article manifest", () => {
  it("loads exactly the 8 expected articles", () => {
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
