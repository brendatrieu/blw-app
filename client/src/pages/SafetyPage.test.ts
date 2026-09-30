import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { guideArticles, safetyArticles } from "../features/safety/content.js";
import { SafetyArticlePage } from "./SafetyArticlePage.js";
import { SafetyPage } from "./SafetyPage.js";
import { GuidePage, GuidesPage } from "./GuidesPage.js";

const at = (url: string) =>
  renderToString(
    createElement(
      MemoryRouter,
      { initialEntries: [url] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: "/safety", element: createElement(SafetyPage) }),
        createElement(Route, { path: "/safety/:slug", element: createElement(SafetyArticlePage) }),
        createElement(Route, { path: "/guides", element: createElement(GuidesPage) }),
        createElement(Route, { path: "/guides/:slug", element: createElement(GuidePage) }),
      ),
    ),
  );

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

describe("Learn lists the safety articles only (item 608)", () => {
  it("is headed Learn, like the More row that opens it (item 609)", () => {
    const html = at("/safety");
    expect(html).toMatch(/<h1[^>]*>(?:<[^>]+>)*Learn</);
    expect(html).not.toContain("Safety Library");
  });

  it("has no Using the app group and no guide links", () => {
    const html = at("/safety");
    expect(html).not.toContain("Using the app");
    for (const guide of guideArticles) expect(html).not.toContain(guide.slug);
    expect(hrefs(html)).toEqual(safetyArticles.map((article) => `/safety/${article.slug}`));
  });

  it("no longer serves a guide at /safety/:slug (falls back to the Learn index)", () => {
    expect(at("/safety/how-to-log-a-meal")).not.toContain("How to log a meal");
  });
});

describe("How-to guides under More (item 608)", () => {
  it("/guides lists exactly the four guides, in order, with a way back", () => {
    const html = at("/guides");
    expect(html).toContain("How-to guides");
    const links = hrefs(html);
    expect(links).toEqual(guideArticles.map((guide) => `/guides/${guide.slug}`));
    expect(links).toHaveLength(4);
    expect(html).toContain("Back");
  });

  it("/guides/:slug renders the guide, screenshots included", () => {
    const html = at("/guides/how-to-log-a-meal");
    expect(html).toContain("How to log a meal");
    expect(html).toContain('src="/guides/meal-1-open.webp"');
    expect(html).not.toContain("Not found");
  });

  it("/guides/:slug is Not found for a safety slug or an unknown slug", () => {
    expect(at(`/guides/${safetyArticles[0]!.slug}`)).toContain("Not found");
    expect(at("/guides/no-such-guide")).toContain("Not found");
  });
});
