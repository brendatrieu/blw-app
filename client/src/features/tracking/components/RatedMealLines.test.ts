// Ledger 944: a logged meal's lines with stars, on Home's Up next card
// (home) and a Meal Plan card (plan); the meal page's look went with it
// (966). Markup through renderToString with the save hook mocked (node env, no DOM).
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealItem } from "@blw/shared";

const h = vi.hoisted(() => ({ offline: false, isError: false, babyIds: [] as unknown[], meals: [] as unknown[], mutations: [] as unknown[] }));
vi.mock("../../../lib/online.js", () => ({ useIsOffline: () => h.offline }));
vi.mock("../hooks.js", () => ({
  useMeals: () => ({ data: { items: h.meals } }),
  useUpdateMeal: (babyId: unknown) => {
    h.babyIds.push(babyId);
    return { mutate: (variables: unknown) => h.mutations.push(variables), isPending: false, isError: h.isError };
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
  h.mutations.length = 0;
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

  // Ledger 977: a container has no line of its own; each food or recipe it
  // held is its own line in its place, rated by its part id, each linking
  // to the batch (item 162). Fresh lines are unchanged.
  const CONTAINER = {
    ...MEAL,
    items: [
      MEAL.items![0],
      {
        kind: "storage",
        storageItemId: id(30),
        label: "Veg mix",
        location: "fridge",
        servings: 1,
        parts: [
          { kind: "food", id: id(31), food: { id: id(32), slug: "broccoli", name: "Broccoli", category: "veg" }, rating: 4 },
          { kind: "recipe", id: id(33), recipe: { id: id(34), title: "Carrot mash", deleted: true }, rating: null },
        ],
      },
      MEAL.items![1],
    ],
  } as unknown as typeof MEAL;
  const renderContainer = (look: "home" | "plan") =>
    renderToString(createElement(MemoryRouter, null, createElement(RatedMealLines, { meal: CONTAINER, look }))).replace(/<!-- -->/g, "");

  it("a container's parts are lines of their own, in its place, each with its stars and From storage (ledger 977)", () => {
    for (const look of ["home", "plan"] as const) {
      const html = renderContainer(look);
      const lines = html.match(/<li [^>]*>.*?<\/li>/g)!;
      expect(lines).toHaveLength(4);
      const names = lines.map((line) => /break-words text-\[var\(--color-text\)\]">([^<]*)/.exec(line)![1]);
      expect(names).toEqual(["Egg", "Broccoli", "Carrot mash", "Pear"]);
      // Each line has one plate that lets the tap through to the card (968), and one star row.
      for (const line of lines) {
        expect(line.match(/role="radiogroup"/g)).toHaveLength(1);
        expect(line.match(/pointer-events-none/g)!.length).toBeGreaterThanOrEqual(2);
      }
      expect(lines[1]).toContain('aria-label="Rating for Broccoli"');
      expect(lines[2]).toContain('aria-label="Rating for Carrot mash"');
      expect(lines[2]).toContain("(deleted)");
      // From storage under each part, to the batch; none under a fresh food.
      const link = '<a class="relative z-10 -mt-3.5 -mb-2.5 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] underline';
      expect([lines[0], lines[1], lines[2], lines[3]].map((line) => line!.includes(link))).toEqual([false, true, true, false]);
      expect(html.match(/href="\/storage\/[^"]*"/g)).toEqual([`href="/storage/${id(30)}"`, `href="/storage/${id(30)}"`]);
      // No container line, no label over stars, no two-plate icon.
      expect(html).not.toContain("Veg mix");
      expect(html).not.toContain("Broccoli, Carrot");
      expect(html).not.toContain("mt-1 ml-[9px]");
      expect(html).not.toContain("relative block shrink-0");
    }
  });

  it("a part's star tap saves that part's rating, keyed by the part id (ledger 977)", () => {
    // Called as a plain function: it has no React hooks of its own.
    const tree = (RatedMealLines as unknown as (props: unknown) => unknown)({ meal: CONTAINER, look: "plan" });
    const stars: { props: { label: string; onChange: (value: number) => void } }[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const el = node as { type: unknown; props: Record<string, unknown> };
      if (typeof el.props.label === "string" && typeof el.props.onChange === "function") stars.push(el as never);
      walk(el.props.children);
    };
    walk(tree);
    expect(stars.map((star) => star.props.label)).toEqual(["Rating for Egg", "Rating for Broccoli", "Rating for Carrot mash", "Rating for Pear"]);
    stars[2]!.props.onChange(5);
    expect(h.mutations).toEqual([{ id: id(90), input: { itemRatings: { [id(33)]: 5 } } }]);
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
