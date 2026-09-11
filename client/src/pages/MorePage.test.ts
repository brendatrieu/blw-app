import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MorePage } from "./MorePage.js";

function render(): string {
  return renderToString(createElement(MemoryRouter, null, createElement(MorePage, null)));
}

describe("MorePage (item 274)", () => {
  it("opens with 'Learn' — the safety library, under the name its bottom-nav tab had", () => {
    const html = render();
    expect(html).toContain(">Learn<");
    expect(html).toContain('href="/safety"');
    expect(html).not.toContain(">Safety Library<");
  });

  it("puts Learn first, ahead of every other entry", () => {
    const html = render();
    const learn = html.indexOf(">Learn<");
    expect(learn).toBeGreaterThan(-1);
    for (const label of ["Favorites", "Symptom Check", "Chat", "Settings"]) {
      expect(html.indexOf(`>${label}<`)).toBeGreaterThan(learn);
    }
  });

  it("gives every row its own emoji, in its own row", () => {
    // Split at each <a>: one chunk per row, so an emoji can only satisfy the
    // row it actually sits in. Without this the rows' emoji are unpinned —
    // any of them could be swapped for another and nothing would notice.
    const rows = render().split("<a ").slice(1);
    const expected = [
      { href: "/safety", emoji: "🛟", label: "Learn" },
      { href: "/favorites", emoji: "❤️", label: "Favorites" },
      { href: "/symptom-check", emoji: "🩺", label: "Symptom Check" },
      { href: "/chat", emoji: "💬", label: "Chat" },
      { href: "/tour", emoji: "🧭", label: "Take the tour" },
      { href: "/settings", emoji: "⚙️", label: "Settings" },
    ];

    expect(rows.length).toBe(expected.length);
    expected.forEach((row, index) => {
      const html = rows[index]!;
      expect(html, `row ${index + 1} destination`).toContain(`href="${row.href}"`);
      expect(html, `row ${index + 1} emoji`).toContain(`>${row.emoji}</span>`);
      expect(html, `row ${index + 1} label`).toContain(`>${row.label}<`);
    });
  });

  it("offers the tour as a replay row, after the content rows and before Settings (item 305)", () => {
    const html = render();

    expect(html).toContain(">Take the tour<");
    expect(html).toContain('href="/tour"');
    expect(html).toContain(">A quick look around the app<");
    // The compass, exactly (item 305) — not the map, not the globe.
    expect(html).toContain(">🧭</span>");

    const tour = html.indexOf(">Take the tour<");
    for (const label of ["Learn", "Favorites", "Symptom Check", "Chat"]) {
      expect(html.indexOf(`>${label}<`)).toBeLessThan(tour);
    }
    // Settings stays the end of the list.
    expect(html.indexOf(">Settings<")).toBeGreaterThan(tour);
  });

  it("changes nothing else on the page — same entries, same destinations", () => {
    const html = render();
    for (const [label, href] of [
      ["Favorites", "/favorites"],
      ["Symptom Check", "/symptom-check"],
      ["Chat", "/chat"],
      ["Settings", "/settings"],
    ]) {
      expect(html).toContain(`>${label}<`);
      expect(html).toContain(`href="${href}"`);
    }
  });
});
