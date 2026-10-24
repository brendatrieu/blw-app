// The Up next allergen kebab's rows (item 660), driven without a DOM: Menu
// renders its panel straight away, so renderToString shows what the open
// menu offers.
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../components/ui/Menu.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../components/ui/Menu.js")>();
  return {
    ...actual,
    Menu: ({ label, children }: { label: string; children: (close: () => void) => ReactNode }) =>
      createElement("div", { "data-label": label }, children(() => {})),
  };
});

import { AllergenUpNextMenu } from "./AllergenUpNextMenu.js";

function render(): string {
  return renderToString(
    createElement(
      MemoryRouter,
      null,
      createElement(AllergenUpNextMenu, {
        babyId: "baby-1",
        item: { allergenSlug: "peanut", allergenName: "Peanut" },
        label: "Peanut actions",
      }),
    ),
  );
}

describe("AllergenUpNextMenu (item 660)", () => {
  it("names the kebab as given", () => {
    expect(render()).toContain('data-label="Peanut actions"');
  });

  // Ledger 890 (owner): no pre-picked food; Log meal opens empty, like everywhere else.
  it("offers an empty Log meal and Open <Name>", () => {
    const items = [...render().matchAll(/<a role="menuitem"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(items).toEqual([
      ["/log-meal", "Log meal"],
      ["/babies/baby-1/allergens/peanut", "Open <!-- -->Peanut"],
    ]);
  });
});
