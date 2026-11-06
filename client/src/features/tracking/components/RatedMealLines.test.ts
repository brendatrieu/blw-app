// Ledger 939/944: a logged meal's lines with stars, on the meal page (log),
// Home's Up next card (home) and a Meal Plan card (plan). Markup through
// renderToString with the save hook mocked (node env, no DOM).
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealItem } from "@blw/shared";

const h = vi.hoisted(() => ({ offline: false, isError: false, babyIds: [] as unknown[] }));
vi.mock("../../../lib/online.js", () => ({ useIsOffline: () => h.offline }));
vi.mock("../hooks.js", () => ({
  useMeals: () => ({ data: { items: [] } }),
  useUpdateMeal: (babyId: unknown) => {
    h.babyIds.push(babyId);
    return { mutate: () => {}, isPending: false, isError: h.isError };
  },
}));

import { RatedMealLines, addMoreHref } from "./RatedMealLines.js";

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
const render = (look?: "log" | "home" | "plan") =>
  renderToString(createElement(MemoryRouter, null, createElement(RatedMealLines, { meal: MEAL, ...(look && { look }) }))).replace(/<!-- -->/g, "");

beforeEach(() => {
  h.offline = false;
  h.isError = false;
  h.babyIds.length = 0;
});

describe("RatedMealLines (ledger 939/944)", () => {
  it("saves through the logged meal's own baby", () => {
    render();
    expect(h.babyIds).toEqual(["baby-7"]);
  });

  it("each look keeps its card's plate and name, the stars lined up under the name and above a stretched link", () => {
    expect(render()).toContain('class="relative z-10 ml-[27px] @max-[246px]:-ml-[9px]"');
    const home = render("home");
    expect(home).toContain("width:36px;height:36px");
    expect(home).toContain('class="text-[15px] leading-[1.3] font-semibold break-words text-[var(--color-text)]">Egg</p>');
    expect(home).toContain('class="relative z-10 ml-[37px] @max-[256px]:-ml-[9px]"');
    // Home's divided rows: a divider above every line but the first.
    expect(home.match(/border-t border-\[var\(--color-divider\)\]/g)).toHaveLength(1);
    expect(render("plan")).toContain("width:24px;height:24px");
    expect(render("plan")).toContain('class="relative z-10 ml-[21px] @max-[240px]:-ml-[9px]"');
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

  it("Add more opens the logged meal's Edit with Add more open", () => {
    expect(addMoreHref(id(90))).toBe(`/log-meal?edit=${id(90)}&add=1`);
  });
});
