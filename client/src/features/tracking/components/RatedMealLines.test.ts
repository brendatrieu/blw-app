// Ledger 944: a logged meal's lines with stars, on Home's Up next card
// (home) and a Meal Plan card (plan); the meal page's look went with it
// (966). Markup through renderToString with the save hook mocked (node env, no DOM).
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealItem } from "@blw/shared";

const h = vi.hoisted(() => ({ offline: false, isError: false, babyIds: [] as unknown[], meals: [] as unknown[] }));
vi.mock("../../../lib/online.js", () => ({ useIsOffline: () => h.offline }));
vi.mock("../hooks.js", () => ({
  useMeals: () => ({ data: { items: h.meals } }),
  useUpdateMeal: (babyId: unknown) => {
    h.babyIds.push(babyId);
    return { mutate: () => {}, isPending: false, isError: h.isError };
  },
}));

import { RatedMealLines, ServedMealLines, addMoreHref } from "./RatedMealLines.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MEAL: MealItem = {
  id: id(90),
  babyId: "baby-7",
  servedAt: "2026-10-14T11:42:00.000Z",
  reactionNote: null,
  notes: null,
  recipeId: null,
  recipeTitle: null,
  foods: [],
  items: [
    { kind: "food", id: id(1), food: { id: id(2), slug: "egg", name: "Egg", category: "protein" }, rating: null },
    { kind: "food", id: id(3), food: { id: id(4), slug: "pear", name: "Pear", category: "fruit" }, rating: 2 },
  ],
};
const render = (look: "home" | "plan" = "plan") =>
  renderToString(createElement(MemoryRouter, null, createElement(RatedMealLines, { meal: MEAL, look }))).replace(/<!-- -->/g, "");

beforeEach(() => {
  h.offline = false;
  h.isError = false;
  h.babyIds.length = 0;
  h.meals = [];
});

describe("RatedMealLines (ledger 939/944)", () => {
  it("saves through the logged meal's own baby", () => {
    render();
    expect(h.babyIds).toEqual(["baby-7"]);
  });

  it("each look keeps its card's plate and name, the stars lined up under the name and above a stretched link", () => {
    const home = render("home");
    expect(home).toContain("width:36px;height:36px");
    expect(home).toContain('class="text-[15px] leading-[1.3] font-semibold break-words text-[var(--color-text)]">Egg</p>');
    expect(home).toContain('class="pointer-events-none relative z-10 [&amp;_button]:pointer-events-auto ml-[37px] @max-[256px]:-ml-[9px]"');
    // Home's divided rows: a divider above every line but the first.
    expect(home.match(/border-t border-\[var\(--color-divider\)\]/g)).toHaveLength(1);
    expect(render("plan")).toContain("width:24px;height:24px");
    expect(render("plan")).toContain('class="pointer-events-none relative z-10 [&amp;_button]:pointer-events-auto ml-[21px] @max-[240px]:-ml-[9px]"');
  });

  // Ledger 968: a served card's tap opens Edit through its stretched link, so
  // a star row lifts only its buttons over it. The row's width beside the
  // stars and a container's part labels must let the tap through.
  it("a star row above the stretched link takes taps on its buttons only", () => {
    const rows = render("plan").match(/<div class="[^"]*z-10[^"]*">(?=<div class="-my-1">|<p )/g) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toContain("pointer-events-none");
      expect(row).toContain("[&amp;_button]:pointer-events-auto");
    }
  });

  // A container of two foods draws a positioned two-plate icon, which paints
  // over the stretched link unless it lets the tap through (968).
  it("a line's plate never takes a tap, even a container's two-plate one", () => {
    const CONTAINER = {
      ...MEAL,
      items: [
        {
          kind: "storage",
          storageItemId: id(30),
          label: null,
          location: "fridge",
          servings: 1,
          parts: [
            { kind: "food", id: id(31), food: { id: id(32), slug: "broccoli", name: "Broccoli", category: "veg" }, rating: 4 },
            { kind: "food", id: id(33), food: { id: id(34), slug: "carrot", name: "Carrot", category: "veg" }, rating: null },
          ],
        },
      ],
    } as unknown as typeof MEAL;
    const html = renderToString(createElement(MemoryRouter, null, createElement(RatedMealLines, { meal: CONTAINER, look: "plan" })));
    const plate = /<span aria-hidden="true" class="relative block shrink-0 [^"]*"/.exec(html)?.[0];
    expect(plate).toContain("pointer-events-none");
  });

  it("a failed save says so; offline it says You're offline. instead, and every star waits", () => {
    expect(render()).not.toContain('role="alert"');
    h.isError = true;
    expect(render()).toContain('<p role="alert" class="mt-1 text-xs text-[var(--color-danger)]">Couldn&#x27;t save that rating — try again.</p>');
    h.offline = true;
    const offline = render();
    expect(offline).not.toContain('role="alert"');
    expect(offline).toContain(`<p id="rate-offline-${id(90)}" class="mt-1 text-xs text-[var(--color-text-muted)]">You&#x27;re offline.</p>`);
    expect(offline.match(/<button type="button" role="radio"[^>]*disabled=""/g)).toHaveLength(10);
  });

  it("a served card shows and rates the SERVED meal, not the newest one (verifier c3 B1)", () => {
    // A newer meal of the same baby, with other foods, comes first in the recent meals.
    const newer: MealItem = {
      ...MEAL,
      id: id(95),
      servedAt: "2026-10-14T17:00:00.000Z",
      items: [{ kind: "food", id: id(5), food: { id: id(6), slug: "broccoli", name: "Broccoli", category: "veg" }, rating: null }],
    };
    h.meals = [newer, MEAL];
    for (const look of ["home", "plan"] as const) {
      const html = renderToString(
        createElement(MemoryRouter, null, createElement(ServedMealLines, { babyId: "baby-7", mealId: id(90), look, fallback: "FALLBACK" })),
      ).replace(/<!-- -->/g, "");
      expect(html).toContain('aria-label="Rating for Egg"');
      expect(html).toContain('aria-label="Rating for Pear"');
      expect(html).not.toContain("Broccoli");
      expect(html).not.toContain("FALLBACK");
    }
  });

  it("Add more opens the logged meal's Edit with Add more open", () => {
    expect(addMoreHref(id(90))).toBe(`/log-meal?edit=${id(90)}&add=1`);
  });
});
