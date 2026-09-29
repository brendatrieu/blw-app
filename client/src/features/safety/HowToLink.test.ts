import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { getGuide } from "./content.js";
import { HowToLink } from "./HowToLink.js";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Every `<HowToLink slug="…" />` in the app's source, as [file, slug]. */
function howToLinkUses(): [string, string][] {
  const uses: [string, string][] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".tsx")) {
        for (const match of readFileSync(full, "utf8").matchAll(/<HowToLink\s+slug="([^"]+)"/g)) {
          uses.push([path.relative(srcRoot, full), match[1]!]);
        }
      }
    }
  };
  walk(srcRoot);
  return uses.sort();
}

const render = (slug: string) =>
  renderToString(createElement(MemoryRouter, null, createElement(HowToLink, { slug })));

describe("HowToLink (item 603)", () => {
  it("sits on the four screens, each pointing at a real guide", () => {
    expect(howToLinkUses()).toEqual([
      ["features/storage/components/ServeSheet.tsx", "how-to-serve-from-storage"],
      ["pages/LogFoodPage.tsx", "how-to-log-a-meal"],
      ["pages/RecipeCreatePage.tsx", "how-to-custom-recipe"],
      ["pages/StorageAddPage.tsx", "how-to-add-to-storage"],
    ]);
    for (const [file, slug] of howToLinkUses()) {
      expect(getGuide(slug), `${file} → ${slug}`).toBeDefined();
    }
  });

  it("names the guide in its text and is a button, not a link that leaves the form", () => {
    const html = render("how-to-log-a-meal");
    expect(html).toContain('<button type="button"');
    expect(html).not.toContain("href=");
    expect(html).toContain("How to log a meal");
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders nothing for an unknown slug rather than a dead link", () => {
    expect(render("no-such-guide")).toBe("");
  });
});
