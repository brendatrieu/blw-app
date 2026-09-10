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
