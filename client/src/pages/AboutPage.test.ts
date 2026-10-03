import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ session: null as object | null, isPending: false }));

vi.mock("../lib/auth.js", () => ({
  useSession: () => ({ data: h.session, isPending: h.isPending }),
}));

import { ABOUT_FEATURES, AboutPage } from "./AboutPage.js";
import { BackButton } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";

function render(): string {
  return renderToString(
    createElement(MemoryRouter, { initialEntries: ["/about"] }, createElement(AboutPage, null)),
  );
}

const count = (html: string, needle: string | RegExp) => html.split(needle).length - 1;

beforeEach(() => {
  h.session = null;
});

describe("AboutPage signed out (item 611)", () => {
  it("shows the hero: one h1, the tagline", () => {
    const html = render();
    expect(count(html, "<h1")).toBe(1);
    expect(html).toMatch(/<h1[^>]*>Little Meals<\/h1>/);
    expect(html).toContain("Starting solids, made simpler.");
    expect(html).not.toContain("calm companion");
  });

  it("lists the five features in order, each emoji hidden from assistive tech", () => {
    const html = render();
    expect(ABOUT_FEATURES.map((f) => f.name)).toEqual([
      "Storage",
      "Foods and recipes",
      "Allergens",
      "Meal log",
      "Learn",
    ]);
    let last = -1;
    for (const f of ABOUT_FEATURES) {
      const at = html.indexOf(`<strong>${f.name}<!-- -->:</strong>`);
      expect(at, f.name).toBeGreaterThan(last);
      last = at;
      expect(html).toContain(
        `<span aria-hidden="true" class="text-xl leading-none">${f.emoji}</span>`,
      );
    }
  });

  it("says exactly what each feature does (copy is verbatim from the plan)", () => {
    const html = render();
    const expected = [
      ["Storage", "track what you prepped and when to use it by."],
      ["Foods and recipes", "iron- and vitamin C-rich foods, with prep by age."],
      ["Allergens", "introduce the top 9 and keep them in rotation."],
      ["Meal log", "what your baby ate, how it went, and any reactions."],
      ["Learn", "safety guides you can read offline."],
    ];
    expect(ABOUT_FEATURES.map((f) => [f.name, f.text])).toEqual(expected);
    for (const [name, text] of expected) {
      expect(html).toContain(`<strong>${name}<!-- -->:</strong> <!-- -->${text}`);
    }
  });

  it("has two section headings, Features before the story, and no Good to know", () => {
    const html = render();
    const order = ["Features", "From one parent to another"].map((t) => html.indexOf(`>${t}</h2>`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(count(html, "<h2")).toBe(2);
    expect(html).not.toContain("Good to know");
    expect(html).not.toContain("What it helps with");
    expect(html).not.toContain("Why I made this");
  });

  it("tells the story with no signature", () => {
    const html = render();
    const p = '<p class="text-sm text-[var(--color-text)]">';
    expect(html).toContain(
      `${p}When my baby started solids, I tried a few apps, but none had quite what I needed. I kept losing track of what I’d prepped and how long it would last. I wanted to make sure my baby got enough iron and vitamin C. I also needed help introducing allergens, then keeping them in the rotation.</p>`,
    );
    expect(html).toContain(
      `${p}Parents already juggle so much. I hope Little Meals makes this part a little easier, with tools and resources to guide you along the way.</p>`,
    );
    // The story's last paragraph is the end of its section: no sign-off line.
    expect(html).toMatch(/to guide you along the way\.<\/p><\/section>/);
  });

  it("ends with a small gray italic disclaimer, not a section (owner, 2026-09-30)", () => {
    const html = render();
    expect(html).toContain(
      '<p class="text-xs italic text-[var(--color-text-muted)]">Little Meals is educational, not medical advice. Consult your pediatrician.</p>',
    );
    expect(html.indexOf("not medical advice")).toBeGreaterThan(html.indexOf("along the way."));
    expect(html).not.toContain("Your data is yours");
  });

  it("offers Create an account and Sign in once, at the top only (owner, 2026-09-30), and no back button", () => {
    const html = render();
    expect(count(html, /<a[^>]*href="\/signup"[^>]*>Create an account<\/a>/)).toBe(1);
    expect(count(html, /<a[^>]*href="\/login"[^>]*>Sign in<\/a>/)).toBe(1);
    expect(html.indexOf(">Create an account<")).toBeLessThan(html.indexOf(">Features<"));
    // Nothing after the disclaimer: it ends the page.
    expect(html.indexOf(">Sign in<")).toBeLessThan(html.indexOf("not medical advice"));
    expect(html).toMatch(/Consult your pediatrician\.<\/p><\/div>$/);
    expect(html).not.toContain(">Back<");
  });
});

describe("AboutPage app icon (owner, 2026-09-30)", () => {
  it("shows the app icon above the headline for a signed-out visitor, as decoration", () => {
    const html = render();
    const icon = html.indexOf('<img src="/icons/icon-192.png" alt=""');
    expect(icon).toBeGreaterThan(-1);
    expect(icon).toBeLessThan(html.indexOf("<h1"));
    expect(html).toContain('width="72" height="72"');
  });

  it("is not on the signed-in page, which keeps its plain header", () => {
    h.session = { user: { id: "u1" } };
    expect(render()).not.toContain("/icons/icon-192.png");
  });
});

describe("AboutPage while the session loads (item 611)", () => {
  it("shows neither the sign-up buttons nor a back button, so nothing flashes", () => {
    h.session = null;
    h.isPending = true;
    const html = render();
    h.isPending = false;
    expect(html).not.toContain('href="/signup"');
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('<span class="sr-only">Back</span>');
    expect(html).toContain("Starting solids, made simpler.");
  });
});

describe("AboutPage width (item 703)", () => {
  // AppLayout's column is max-w-lg and a page pads p-4; About matches it
  // whether or not it sits inside that layout.
  it.each([
    ["signed out", null],
    ["signed in", { user: { id: "u1" } }],
  ])("is the app's width when %s", (_label, session) => {
    h.session = session;
    const root = render().match(/^<div class="([^"]*)"/)?.[1]?.split(" ") ?? [];
    expect(root).toEqual(expect.arrayContaining(["mx-auto", "max-w-lg", "p-4"]));
    expect(root).not.toContain("max-w-sm");
    expect(root).not.toContain("p-6");
  });
});

describe("AboutPage signed in (item 611)", () => {
  it("shows a back button and no sign-up buttons, with the same content", () => {
    h.session = { user: { id: "u1" } };
    const html = render();
    expect(html).toContain('<span class="sr-only">Back</span>');
    expect(html).not.toContain('href="/signup"');
    expect(html).not.toContain('href="/login"');
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain("Starting solids, made simpler.");
    expect(html).toContain(">From one parent to another</h2>");
  });

  it("goes Back to More when there is no history to pop (it is reached from More)", () => {
    h.session = { user: { id: "u1" } };
    const tree = (AboutPage as () => ReactElement<{ children: ReactNode }>)();
    const header = (tree.props.children as ReactNode[]).find(
      (n): n is ReactElement<{ leading: ReactElement<{ fallback: string }> }> =>
        isValidElement(n) && n.type === PageHeader,
    );
    expect(header?.props.leading.type).toBe(BackButton);
    expect(header?.props.leading.props.fallback).toBe("/more");
  });
});
