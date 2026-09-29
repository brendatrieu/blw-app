import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { guideArticles, safetyArticles } from "../features/safety/content.js";
import { SafetyArticlePage } from "./SafetyArticlePage.js";
import { SafetyPage } from "./SafetyPage.js";

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
      ),
    ),
  );

describe("Learn: the Using the app group (item 601)", () => {
  it("lists the guides under their own heading, after the safety articles, in order", () => {
    const html = at("/safety");
    const heading = html.indexOf(">Using the app</h2>");
    expect(heading).toBeGreaterThan(-1);
    const lastArticle = html.indexOf(`href="/safety/${safetyArticles.at(-1)!.slug}"`);
    const guideLinks = guideArticles.map((guide) => html.indexOf(`href="/safety/${guide.slug}"`));
    expect(lastArticle).toBeLessThan(heading);
    expect(guideLinks.every((index) => index > heading)).toBe(true);
    expect(guideLinks).toEqual([...guideLinks].sort((a, b) => a - b));
  });

  it("opens a guide on the article page, screenshots included", () => {
    const html = at("/safety/how-to-log-a-meal");
    expect(html).toContain("How to log a meal");
    expect(html).toContain('src="/guides/meal-1-open.webp"');
  });
});
