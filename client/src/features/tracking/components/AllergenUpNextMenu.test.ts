// The Up next allergen kebab's rows (item 660), driven without a DOM: the
// detail hook is mocked (vi.hoisted, the Menu.handlers.test idiom) and Menu
// renders its panel straight away, so renderToString shows what the open
// menu offers for each state of the detail query.
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  calls: [] as unknown[][],
}));

vi.mock("../hooks.js", () => ({
  useAllergenDetail: (...args: unknown[]) => {
    h.calls.push(args);
    return { data: h.detail };
  },
}));

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

const food = (id: string, deleted?: boolean) => ({
  id,
  slug: id,
  name: id,
  category: "legume",
  emoji: null,
  isCustom: false,
  ...(deleted === undefined ? {} : { deleted }),
});

beforeEach(() => {
  h.detail = undefined;
  h.calls = [];
});

describe("AllergenUpNextMenu (item 660)", () => {
  it("reads this allergen's detail and names the kebab as given", () => {
    const html = render();
    expect(h.calls).toEqual([["baby-1", "peanut"]]);
    expect(html).toContain('data-label="Peanut actions"');
  });

  it("offers Log meal (an empty form while the detail loads) and Open <Name>", () => {
    const html = render();
    const items = [...html.matchAll(/<a role="menuitem"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(items).toEqual([
      ["/log-meal", "Log meal"],
      ["/babies/baby-1/allergens/peanut", "Open <!-- -->Peanut"],
    ]);
  });

  it("prefills the food served last time once the detail is in", () => {
    h.detail = {
      foods: [food("peanut-butter")],
      exposures: [{ mealId: "m", servedAt: "", foods: [{ id: "puffs", name: "Puffs", emoji: null }], reaction: null, notes: null }],
    };
    expect(render()).toMatch(/href="\/log-meal\?food=puffs"[^>]*>Log meal</);
  });

  it("falls back to an empty form when no food can be logged", () => {
    h.detail = { foods: [food("gone", true)], exposures: [] };
    expect(render()).toMatch(/href="\/log-meal"[^>]*>Log meal</);
  });
});
