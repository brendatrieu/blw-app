import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BottomNav } from "./BottomNav.js";

describe("BottomNav", () => {
  it("renders five tabs in Home/Pantry/Foods/Learn/More order, Learn pointing at /safety", () => {
    const html = renderToString(createElement(MemoryRouter, null, createElement(BottomNav, null)));

    const labels = ["Home", "Pantry", "Foods", "Learn", "More"];
    let cursor = -1;
    for (const label of labels) {
      const index = html.indexOf(`>${label}<`);
      expect(index).toBeGreaterThan(cursor);
      cursor = index;
    }

    expect(html).toContain('href="/safety"');
    expect(html).not.toContain(">Log<");
    expect(html).not.toContain('href="/log"');
  });
});
