import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BottomNav, isMoreTabPath, resolveActiveTab } from "./BottomNav.js";

function renderAt(pathname: string): string {
  return renderToString(
    createElement(MemoryRouter, { initialEntries: [pathname] }, createElement(BottomNav, null)),
  );
}

/**
 * Which tab is lit, read the way a parent reads the bar: the one label
 * wearing the accent color. Every other label is muted, so this doubles as a
 * "only one tab is active" assertion.
 */
function activeTabLabel(html: string): string | undefined {
  const labels = [...html.matchAll(/<span class="font-caption" style="color:([^"]+)">(?:<!-- -->)?([^<]+)</g)];
  const lit = labels.filter(([, color]) => color === "var(--color-accent)");
  expect(lit.length).toBeLessThanOrEqual(1);
  return lit[0]?.[2];
}

describe("BottomNav", () => {
  it("renders five tabs in Home/Storage/Foods/Recipes/More order, Recipes pointing at /recipes", () => {
    const html = renderAt("/");

    const labels = ["Home", "Storage", "Foods", "Recipes", "More"];
    let cursor = -1;
    for (const label of labels) {
      const index = html.indexOf(`>${label}<`);
      expect(index).toBeGreaterThan(cursor);
      cursor = index;
    }

    expect(html).toContain('href="/recipes"');
    // Learn left the bar for the More page (items 272, 274).
    expect(html).not.toContain(">Learn<");
    expect(html).not.toContain('href="/safety"');
    expect(html).not.toContain(">Log<");
    expect(html).not.toContain('href="/log"');
  });

  it("draws every tab, Recipes included, as an inline 24-box outline icon — no emoji, no images", () => {
    const html = renderAt("/");
    expect(html.match(/viewBox="0 0 24 24"/g)).toHaveLength(5);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("🍳");
  });

  it("lights the Recipes tab across the whole recipe section, not just the list", () => {
    expect(activeTabLabel(renderAt("/recipes"))).toBe("Recipes");
    expect(activeTabLabel(renderAt("/recipes/new"))).toBe("Recipes");
    expect(activeTabLabel(renderAt("/recipes/abc123"))).toBe("Recipes");
    expect(activeTabLabel(renderAt("/recipes/abc123/edit"))).toBe("Recipes");
  });

  it("lights the More tab on the safety library, which no longer has a tab of its own", () => {
    expect(activeTabLabel(renderAt("/more"))).toBe("More");
    expect(activeTabLabel(renderAt("/safety"))).toBe("More");
    expect(activeTabLabel(renderAt("/safety/choking"))).toBe("More");
  });

  it("keeps Home exact — a nested route lights its own tab, not Home", () => {
    expect(activeTabLabel(renderAt("/"))).toBe("Home");
    expect(activeTabLabel(renderAt("/foods/banana"))).toBe("Foods");
    expect(activeTabLabel(renderAt("/storage/add"))).toBe("Storage");
  });
});

describe("isMoreTabPath (the More tab's active rule)", () => {
  it("covers /more and the safety library, nested articles included", () => {
    expect(isMoreTabPath("/more")).toBe(true);
    expect(isMoreTabPath("/safety")).toBe(true);
    expect(isMoreTabPath("/safety/choking")).toBe(true);
  });

  it("does not spill onto unrelated paths that merely share a prefix", () => {
    expect(isMoreTabPath("/")).toBe(false);
    expect(isMoreTabPath("/recipes")).toBe(false);
    expect(isMoreTabPath("/safetyville")).toBe(false);
    expect(isMoreTabPath("/moreish")).toBe(false);
  });
});

describe("resolveActiveTab (one rule for highlight AND aria-current)", () => {
  it("maps every route family to exactly one tab, More owning its whole page's destinations", () => {
    expect(resolveActiveTab("/")).toBe("/");
    expect(resolveActiveTab("/storage/abc/edit")).toBe("/storage");
    expect(resolveActiveTab("/foods/avocado")).toBe("/foods");
    expect(resolveActiveTab("/recipes/new")).toBe("/recipes");
    for (const path of ["/more", "/safety", "/safety/choking", "/settings", "/favorites", "/chat/t1", "/symptom-check"]) {
      expect(resolveActiveTab(path), path).toBe("/more");
    }
    expect(resolveActiveTab("/log-meal")).toBeNull();
    expect(resolveActiveTab("/recipesville")).toBeNull();
  });

  it("emits aria-current=\"page\" on the More tab for the safety library (a NavLink could not)", () => {
    const html = renderToString(
      createElement(MemoryRouter, { initialEntries: ["/safety/choking"] }, createElement(BottomNav)),
    );
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/aria-current="page"[^>]*href="\/more"|href="\/more"[^>]*aria-current="page"/);
  });
});
