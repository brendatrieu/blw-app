import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Navigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ session: null as object | null, isPending: false, state: null as unknown }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLocation: () => ({ pathname: "/about", search: "", hash: "", key: "k", state: h.state }),
}));

vi.mock("../lib/auth.js", () => ({
  useSession: () => ({ data: h.session, isPending: h.isPending }),
}));

import { ABOUT_FEATURES, ABOUT_GLOWS, ABOUT_STORY, AboutPage } from "./AboutPage.js";
import { BackButton } from "../components/ui/BackButton.js";
import { LANDING_SLIDES } from "../features/landing/slides.js";

/** The first BackButton anywhere in an element tree (a plain function call, no render). */
function findBack(node: ReactNode): ReactElement<{ fallback: string }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findBack(child);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === BackButton) return node as ReactElement<{ fallback: string }>;
  return findBack((node.props as { children?: ReactNode }).children);
}

function render(): string {
  return renderToString(createElement(MemoryRouter, { initialEntries: ["/about"] }, createElement(AboutPage, null)));
}

const count = (html: string, needle: string | RegExp) => html.split(needle).length - 1;
const SIGNED_IN = { user: { id: "u1" } };
const BACK = '<span class="sr-only">Back</span>';

beforeEach(() => {
  h.session = null;
  h.isPending = false;
  h.state = null;
});

describe("AboutPage content (item 611, ledger 1052)", () => {
  it.each([
    ["signed out", null],
    ["signed in", SIGNED_IN],
  ])("shows the same hero and cards when %s", (_label, session) => {
    h.session = session;
    const html = render();
    expect(count(html, "<h1")).toBe(1);
    expect(html).toMatch(/<h1[^>]*>Little Meals<\/h1>/);
    expect(html).toContain("Starting solids, made simpler.");
    const order = ["Features", "From one parent to another"].map((t) => html.indexOf(`>${t}</h2>`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(count(html, "<h2")).toBe(2);
    // The logo above the name, decorative, 88px with the landing's shadow.
    const icon = html.indexOf('<img src="/icons/icon-512.png" alt="" width="88" height="88"');
    expect(icon).toBeGreaterThan(-1);
    expect(icon).toBeLessThan(html.indexOf("<h1"));
    expect(html).toContain("box-shadow:var(--shadow-landing-icon)");
  });

  it("says exactly what each feature does, in order, with the new Meal Plan line", () => {
    const expected = [
      ["Storage", "track what you prepped and when to use it by."],
      ["Foods and recipes", "iron- and vitamin C-rich foods, with prep by age."],
      ["Allergens", "introduce the top 9 and keep them in rotation."],
      ["Meal log", "what your baby ate, how it went, and any reactions."],
      ["Meal Plan", "plan the week ahead, then serve in one tap."],
      ["Learn", "safety guides you can read offline, How-To Guides, and Symptom Check."],
    ];
    expect(ABOUT_FEATURES.map((f) => [f.name, f.text])).toEqual(expected);
    const html = render();
    let last = -1;
    for (const [name, text] of expected) {
      const at = html.indexOf(`<strong class="font-semibold">${name}<!-- -->:</strong> <!-- -->${text}`);
      expect(at, name).toBeGreaterThan(last);
      last = at;
    }
    for (const f of ABOUT_FEATURES) expect(html).toContain(`<span aria-hidden="true" class="text-xl leading-[1.2]">${f.emoji}</span>`);
    expect(count(html, '<strong class="font-semibold">')).toBe(ABOUT_FEATURES.length);
    expect(count(html, "<strong")).toBe(ABOUT_FEATURES.length);
  });

  it("tells the story verbatim with no signature, then the centered italic disclaimer ends the page", () => {
    expect(ABOUT_STORY).toEqual([
      "When my baby started solids, I tried a few apps, but none had quite what I needed. I kept losing track of what I’d prepped and how long it would last. I wanted to make sure my baby got enough iron and vitamin C. I also needed help introducing allergens, then keeping them in the rotation.",
      "Parents already juggle so much. I hope Little Meals makes this part a little easier, with tools and resources to guide you along the way.",
    ]);
    const html = render();
    for (const p of ABOUT_STORY) expect(html).toContain(`>${p}</p>`);
    expect(html).toMatch(/to guide you along the way\.<\/p><\/section>/);
    expect(html).toMatch(
      /<p class="[^"]*\btext-center\b[^"]*\bitalic\b[^"]*text-\[var\(--color-landing-muted\)\]">Little Meals is educational, not medical advice\. Consult your pediatrician\.<\/p><\/div><\/div>$/,
    );
  });

  it("draws both cards as frosted glass at --radius-lg, with Fraunces headings", () => {
    const html = render();
    const sections = html.match(/<section [^>]*>/g) ?? [];
    expect(sections).toHaveLength(2);
    for (const tag of sections) {
      expect(tag).toMatch(/\bglass-card\b/);
      expect(tag).toContain("rounded-[var(--radius-lg)]");
    }
    expect(count(html, /<h2 [^>]*class="font-h2[^"]*"[^>]*font-family:var\(--font-family-display\)/g)).toBe(2);
  });
});

describe("AboutPage ground (ledger 1052a)", () => {
  it("is the page color with the landing's own glow tokens, full-bleed and decorative, never fixed", () => {
    const html = render();
    expect(html).toMatch(/^<div class="relative"><div aria-hidden="true" class="pointer-events-none absolute inset-x-0 bottom-0 bg-\[var\(--color-bg\)\]"/);
    expect(html).not.toMatch(/\bfixed\b|background-attachment/);
    expect(ABOUT_GLOWS).not.toMatch(/rgba?\(|#[0-9a-f]{3,6}\b/i);
    expect(count(ABOUT_GLOWS, "var(--color-landing-glow-sea)")).toBe(6);
    expect(count(ABOUT_GLOWS, "var(--color-landing-glow-apricot)")).toBe(6);
  });

  it("puts the first screen's glows where the landing intro has them, sized to one screen, then alternates", () => {
    const intro = LANDING_SLIDES[0]!.glow;
    expect(intro).toEqual({ sea: "50% 28%", apricot: "84% 84%" });
    // The landing: sea gone at 55% of the farthest corner, apricot at 50%.
    expect(ABOUT_GLOWS).toContain("radial-gradient(circle calc(0.55 * hypot(50vw, 72svh)) at 50% 28svh, var(--color-landing-glow-sea), transparent)");
    expect(ABOUT_GLOWS).toContain("radial-gradient(circle calc(0.5 * hypot(84vw, 84svh)) at 84% 84svh, var(--color-landing-glow-apricot), transparent)");
    // Next screen: sea left, apricot right; then the intro's again.
    expect(ABOUT_GLOWS).toContain("at 10% 128svh, var(--color-landing-glow-sea)");
    expect(ABOUT_GLOWS).toContain("at 85% 160svh, var(--color-landing-glow-apricot)");
    expect(ABOUT_GLOWS).toContain("at 50% 228svh, var(--color-landing-glow-sea)");
  });

  it("runs up under OutsideAppLayout's top clearance and leaves the inset to the route", () => {
    const html = render();
    expect(html).toContain("top:calc(-1 * (env(safe-area-inset-top) + var(--top-edge-clearance)))");
    expect(html).not.toMatch(/padding-top:[^;"]*safe-area-inset-top/);
  });

  it("keeps the content in the app's max-w-lg column, 24px sides like the mockup", () => {
    const column = render().match(/<\/div><div class="([^"]*)"/)?.[1]?.split(" ") ?? [];
    expect(column).toEqual(expect.arrayContaining(["relative", "mx-auto", "max-w-lg", "px-6"]));
  });
});

describe("AboutPage signed out (ledger 992, 1052c)", () => {
  it("offers one Create an account and one Sign in, the landing's, above the cards", () => {
    const html = render();
    expect(count(html, /<a[^>]*href="\/signup"[^>]*>Create an account<\/a>/g)).toBe(1);
    expect(count(html, /<a[^>]*href="\/login"[^>]*>Sign in<\/a>/g)).toBe(1);
    expect(html).toMatch(/Already have an account\?<a class="inline-flex min-h-11 items-center[^"]*" href="\/login"/);
    expect(html.indexOf(">Sign in<")).toBeLessThan(html.indexOf(">Features<"));
  });

  it("has a back chevron to the landing, above the logo", () => {
    const html = render();
    expect(count(html, BACK)).toBe(1);
    expect(html.indexOf(BACK)).toBeLessThan(html.indexOf("/icons/icon-512.png"));
    expect(findBack((AboutPage as () => ReactElement)())?.props.fallback).toBe("/");
  });
});

describe("AboutPage signed in (item 611, ledger 1052c)", () => {
  it("shows no buttons, and a back chevron to More", () => {
    h.session = SIGNED_IN;
    const html = render();
    expect(html).not.toContain('href="/signup"');
    expect(html).not.toContain('href="/login"');
    expect(count(html, BACK)).toBe(1);
    expect(findBack((AboutPage as () => ReactElement)())?.props.fallback).toBe("/more");
  });
});

describe("AboutPage while the session loads (item 611)", () => {
  it("shows neither the buttons nor a back chevron, so nothing flashes", () => {
    h.isPending = true;
    const html = render();
    expect(html).not.toContain('href="/signup"');
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain(BACK);
    expect(html).toContain("Starting solids, made simpler.");
  });
});

describe("AboutPage is no longer the front door (ledger 992)", () => {
  it.each([
    ["signed out", null],
    ["signed in", SIGNED_IN],
  ])("shows itself when %s, whatever the history state", (_label, session) => {
    h.session = session;
    h.state = { frontDoor: true };
    expect((AboutPage as () => ReactElement)().type).not.toBe(Navigate);
  });
});

describe("glass card CSS (ledger 1052d)", () => {
  const css = readFileSync(new URL("../styles/index.css", import.meta.url), "utf8");
  const block = (selector: string, from = 0) => {
    const at = css.indexOf(selector, from);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  };

  it("declares the glass tokens in :root and both dark blocks", () => {
    const dark = css.indexOf("@media (prefers-color-scheme: dark)");
    const blocks = [block("\n:root {"), block(':root:not([data-theme="light"]) {', dark), block(':root[data-theme="dark"] {')];
    for (const text of blocks) {
      for (const token of ["--color-glass:", "--color-glass-border:", "--shadow-glass:", "--glass-filter:"]) expect(text).toContain(token);
    }
    expect(blocks[0]).toContain("--color-glass: rgba(255, 255, 255, 0.55);");
    expect(blocks[0]).toContain("--glass-filter: blur(22px);");
    expect(css).toContain("--_dark-glass: rgba(255, 255, 255, 0.07);");
    expect(css).toContain("--_dark-glass-filter: blur(22px) saturate(140%);");
  });

  it("blurs through the card, with a near-opaque card when blur is missing or less transparency is asked", () => {
    expect(block("\n.glass-card {")).toMatch(/backdrop-filter: var\(--glass-filter\)/);
    const noBlur = css.slice(css.indexOf("@supports not ((backdrop-filter"));
    expect(noBlur).toMatch(/^@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\s*\.glass-card \{\s*background-color: color-mix\(in srgb, var\(--color-bg-elevated\) 94%, transparent\);/);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-transparency: reduce)"));
    expect(reduced).toMatch(/^@media \(prefers-reduced-transparency: reduce\) \{\s*\.glass-card \{\s*background-color: color-mix\(in srgb, var\(--color-bg-elevated\) 94%, transparent\);\s*-webkit-backdrop-filter: none;\s*backdrop-filter: none;/);
  });
});
