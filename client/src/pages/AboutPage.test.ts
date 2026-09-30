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
    expect(html).toContain("A calm companion for starting solids.");
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
      ["Storage", "what you prepped, where it is, and when to use it by."],
      ["Foods and recipes", "find iron- and vitamin C-rich foods, with safe prep for each age."],
      ["Allergens", "introduce the top 9 one at a time, then keep serving them."],
      ["Meal log", "what your baby ate, how it went, and any reactions."],
      ["Learn", "choking, allergies, storage and more, readable offline."],
    ];
    expect(ABOUT_FEATURES.map((f) => [f.name, f.text])).toEqual(expected);
    for (const [name, text] of expected) {
      expect(html).toContain(`<strong>${name}<!-- -->:</strong> <!-- -->${text}`);
    }
  });

  it("has the three section headings, features before the story", () => {
    const html = render();
    const order = ["What it helps with", "Why I made this", "Good to know"].map((t) =>
      html.indexOf(`>${t}</h2>`),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("tells the story with no signature", () => {
    const html = render();
    const p = '<p class="text-sm text-[var(--color-text)]">';
    expect(html).toContain(
      `${p}I’m a parent too. When we started solids with my own baby, I tried a few apps, but none of them had quite what I needed. I kept losing track of when I’d made foods and how long they’d last. I wanted help finding foods rich in iron and vitamin C. And I wanted to keep track of introducing allergens, and of keeping them in the rotation once they were in.</p>`,
    );
    expect(html).toContain(
      `${p}We already keep track of so much every day. I hope Little Meals makes this part a little easier, with tools and resources to guide you along the way.</p>`,
    );
    // The story's last paragraph is the end of its section: no sign-off line.
    expect(html).toMatch(/to guide you along the way\.<\/p><\/section>/);
  });

  it("says it is not medical advice and that data can be exported or deleted", () => {
    const html = render();
    expect(html).toContain(
      "<li>Little Meals is educational, not medical advice. Check with your pediatrician.</li>",
    );
    expect(html).toContain(
      "<li>Your data is yours. You can export it or delete your account anytime in Settings.</li>",
    );
  });

  it("offers Create an account and Sign in at the top and again at the bottom, and no back button", () => {
    const html = render();
    expect(count(html, /<a[^>]*href="\/signup"[^>]*>Create an account<\/a>/)).toBe(2);
    expect(count(html, /<a[^>]*href="\/login"[^>]*>Sign in<\/a>/)).toBe(2);
    expect(html.indexOf(">Create an account<")).toBeLessThan(html.indexOf(">What it helps with<"));
    expect(html.lastIndexOf(">Sign in<")).toBeGreaterThan(html.indexOf(">Good to know<"));
    expect(html).not.toContain(">Back<");
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
    expect(html).toContain("A calm companion for starting solids.");
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
    expect(html).toContain("A calm companion for starting solids.");
    expect(html).toContain(">Why I made this</h2>");
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
