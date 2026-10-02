import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
 * wearing the apricot text color. Every other label is muted, so this doubles as a
 * "only one tab is active" assertion.
 */
function activeTabLabel(html: string): string | undefined {
  const labels = [...html.matchAll(/<span class="font-caption" style="color:([^;"]+);font-weight:(\d+)">(?:<!-- -->)?([^<]+)</g)];
  expect(labels).toHaveLength(5);
  const lit = labels.filter(([, color]) => color === "var(--color-apricot-text)");
  expect(lit.length).toBeLessThanOrEqual(1);
  // Item 652: the lit label is 800, every other label 700.
  for (const [, color, weight] of labels) expect(weight).toBe(color === "var(--color-apricot-text)" ? "800" : "700");
  return lit[0]?.[3];
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

  it("draws the active tab as an apricot pill with the on-fill ink, inactive tabs bare and muted (item 635)", () => {
    const html = renderAt("/recipes");
    const pills = [...html.matchAll(/style="background-color:([^;]+);color:([^;"]+)"/g)].map(([, bg, fg]) => [bg, fg]);
    expect(pills).toHaveLength(5);
    expect(pills.filter(([bg]) => bg === "var(--color-apricot)")).toEqual([["var(--color-apricot)", "var(--color-apricot-ink)"]]);
    expect(pills.filter(([bg]) => bg === "transparent")).toHaveLength(4);
    expect(pills.every(([bg, fg]) => bg !== "transparent" || fg === "var(--color-text-muted)")).toBe(true);
    expect(html).not.toContain("var(--color-primary)");
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

  it("lights the More tab on the how-to guides, list and guide (item 608)", () => {
    expect(activeTabLabel(renderAt("/guides"))).toBe("More");
    expect(activeTabLabel(renderAt("/guides/how-to-log-a-meal"))).toBe("More");
  });

  it("keeps Home exact — a nested route lights its own tab, not Home", () => {
    expect(activeTabLabel(renderAt("/"))).toBe("Home");
    expect(activeTabLabel(renderAt("/foods/banana"))).toBe("Foods");
    expect(activeTabLabel(renderAt("/storage/add"))).toBe("Storage");
  });
});

describe("BottomNav position (item 379 — the Storage band)", () => {
  it("is a sticky, in-flow bar at the end of the shell column, never a fixed overlay", () => {
    const html = renderAt("/");

    const navClass = html.match(/<nav class="([^"]+)"/)?.[1] ?? "";
    expect(navClass.split(" ")).toEqual(
      expect.arrayContaining(["sticky", "bottom-0", "mt-auto", "z-10", "max-w-lg"]),
    );
    // A fixed bar hangs off WebKit's layout viewport, which is what painted
    // the band under the tab bar in the installed iOS app.
    expect(navClass).not.toContain("fixed");
    expect(navClass).not.toContain("inset-x-0");
  });

  it("keeps its --nav-height + safe-area height and stacking level", () => {
    const html = renderAt("/");

    expect(html).toContain("height:calc(var(--nav-height) + env(safe-area-inset-bottom))");
    // Below the Sheet/Dialog overlays (z-30) and the Celebration toast (z-40).
    expect(html).toMatch(/<nav class="[^"]*\bz-10\b/);
  });
});

describe("isMoreTabPath (the More tab's active rule)", () => {
  it("covers /more and the safety library, nested articles included", () => {
    expect(isMoreTabPath("/more")).toBe(true);
    expect(isMoreTabPath("/safety")).toBe(true);
    expect(isMoreTabPath("/safety/choking")).toBe(true);
  });

  it("keeps the More tab lit on Send feedback, which is only reachable from it (item 360)", () => {
    expect(isMoreTabPath("/feedback")).toBe(true);
  });

  it("does not spill onto unrelated paths that merely share a prefix", () => {
    expect(isMoreTabPath("/")).toBe(false);
    expect(isMoreTabPath("/feedbackery")).toBe(false);
    expect(isMoreTabPath("/recipes")).toBe(false);
    expect(isMoreTabPath("/safetyville")).toBe(false);
    expect(isMoreTabPath("/guidesville")).toBe(false);
    expect(isMoreTabPath("/moreish")).toBe(false);
  });
});

describe("resolveActiveTab (one rule for highlight AND aria-current)", () => {
  it("maps every route family to exactly one tab, More owning its whole page's destinations", () => {
    expect(resolveActiveTab("/")).toBe("/");
    expect(resolveActiveTab("/storage/abc/edit")).toBe("/storage");
    expect(resolveActiveTab("/foods/avocado")).toBe("/foods");
    expect(resolveActiveTab("/recipes/new")).toBe("/recipes");
    for (const path of [
      "/more",
      "/safety",
      "/safety/choking",
      "/guides",
      "/guides/how-to-log-a-meal",
      "/settings",
      "/favorites",
      "/chat/t1",
      "/symptom-check",
      "/feedback",
    ]) {
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

describe("BottomNav matches A-Home's nav (items 687-689)", () => {
  const css = readFileSync(fileURLToPath(new URL("../styles/index.css", import.meta.url)), "utf8");

  it("is page-colored (not elevated) with a 1px top border (item 687)", () => {
    const html = renderAt("/");
    const nav = html.match(/<nav class="([^"]+)" style="([^"]+)"/);
    expect(nav?.[1]?.split(" ")).toContain("border-t");
    expect(nav?.[2]).toContain("background-color:var(--color-bg);");
    expect(nav?.[2]).toContain("border-color:var(--color-border)");
    expect(html).not.toContain("--color-bg-elevated");
  });

  it("draws Home as the mockup's simple house, no door (item 688), every glyph 22px in a 24 box", () => {
    const html = renderAt("/");
    const home = html.slice(html.indexOf('href="/"'), html.indexOf('href="/storage"'));
    expect([...home.matchAll(/<path d="([^"]+)"/g)].map(([, d]) => d)).toEqual(["M3 10.5 12 3l9 7.5", "M5 9.5V20h14V9.5"]);
    expect(home).toContain('stroke-width="1.8"');
    expect(html.match(/<svg width="22" height="22" viewBox="0 0 24 24"/g)).toHaveLength(5);
  });

  it("pads 6px 4px 10px + safe area and top-aligns pill, 2px gap, label (item 689)", () => {
    const html = renderAt("/");
    const nav = html.match(/<nav class="([^"]+)" style="([^"]+)"/);
    expect(nav?.[1]?.split(" ")).toEqual(expect.arrayContaining(["pt-1.5", "px-1", "items-stretch"]));
    expect(nav?.[2]).toContain("padding-bottom:calc(10px + env(safe-area-inset-bottom))");
    const links = [...html.matchAll(/<a [^>]*class="([^"]+)"/g)].map(([, c]) => (c ?? "").split(" "));
    expect(links).toHaveLength(5);
    for (const c of links) {
      // min-h-11: every tab target stays at least 44px tall.
      expect(c).toEqual(expect.arrayContaining(["justify-start", "gap-0.5", "min-h-11", "flex-1"]));
      expect(c).not.toContain("justify-center");
    }
    // Every pill is the mockup's 52x30, active or not (no shrink on inactive tabs).
    expect(html.match(/class="flex h-\[30px\] w-\[52px\] /g)).toHaveLength(5);
    expect(html).not.toContain("scale(");
  });

  it("sizes --nav-height to the mockup's content: 1 + 6 + 30 + 2 + 16.8 + 10 = 65.8 <= 66px", () => {
    expect(css).toMatch(/--nav-height: 4\.125rem;/);
    // 66px less border, top and bottom padding leaves the tab 49px (>= 44px).
    expect(66 - 1 - 6 - 10).toBeGreaterThanOrEqual(44);
    // The label line (caption, 0.75rem/1.4) is what the 16.8 assumes.
    expect(css).toMatch(/--font-caption: 600 0\.75rem\/1\.4 /);
  });
});
