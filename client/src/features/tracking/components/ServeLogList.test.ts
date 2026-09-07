import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { MealItem } from "@blw/shared";
import { dayKey, dayLabel, timeLabel, limitMeals, HOME_MEAL_LIMIT, MealCard, ServeLogList } from "./ServeLogList.js";

function renderMealCard(meal: MealItem, pendingDeleteId: string | null = null, linkable?: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        null,
        createElement("ul", null, [
          createElement(MealCard, {
            key: meal.id,
            meal,
            babyId: "baby-1",
            pendingDeleteId,
            onRequestDelete: () => {},
            onCancelDelete: () => {},
            ...(linkable === undefined ? {} : { linkable }),
          }),
        ]),
      ),
    ),
  );
}

describe("dayKey", () => {
  it("formats an ISO timestamp as local yyyy-mm-dd", () => {
    expect(dayKey(new Date(2026, 7, 6, 23, 30).toISOString())).toBe("2026-08-06");
  });

  it("pads single-digit months and days", () => {
    expect(dayKey(new Date(2026, 0, 5, 9, 0).toISOString())).toBe("2026-01-05");
  });
});

describe("dayLabel", () => {
  it("labels today's key as 'Today'", () => {
    const todayKey = dayKey(new Date().toISOString());
    expect(dayLabel(todayKey)).toBe("Today");
  });

  it("labels yesterday's key as 'Yesterday'", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(dayLabel(dayKey(yesterday.toISOString()))).toBe("Yesterday");
  });

  it("labels an older date with weekday, month, and day", () => {
    const olderDate = new Date();
    olderDate.setDate(olderDate.getDate() - 10);
    const label = dayLabel(dayKey(olderDate.toISOString()));
    expect(label).toMatch(/^\w+, \w{3} \d{1,2}$/);
  });
});

describe("timeLabel", () => {
  it("formats an ISO timestamp as a localized hour:minute", () => {
    const label = timeLabel(new Date(2026, 7, 26, 14, 5).toISOString());
    expect(label).toMatch(/2:05\s?PM/);
  });

  it("pads minutes under 10", () => {
    const label = timeLabel(new Date(2026, 7, 26, 9, 5).toISOString());
    expect(label).toMatch(/:05/);
  });
});

describe("ServeLogList (render)", () => {
  it("renders the Food log heading (empty/loading branches need a live query client, out of reach here)", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, createElement(ServeLogList, { babyId: "baby-1" })),
    );
    expect(html).toContain("Food log");
  });
});

describe("MealCard (render)", () => {
  const baseMeal: MealItem = {
    id: "meal-1",
    babyId: "baby-1",
    servedAt: new Date(2026, 7, 26, 14, 5).toISOString(),
    reactionNote: null,
    notes: null,
    recipeId: null,
    recipeTitle: null,
    foods: [
      { id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", pantryItemId: null },
      { id: "food-2", slug: "chicken", name: "Chicken", category: "protein", pantryItemId: null },
    ],
  };

  it("renders each food's chip with its name and emoji", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toContain("Avocado");
    expect(html).toContain("Chicken");
    // getFoodEmoji resolves a real emoji for both slugs; just assert an
    // aria-hidden emoji span precedes each name rather than pin the glyph.
    expect(html).toMatch(/<span aria-hidden="true">[^<]+<\/span>\s*Avocado/);
  });

  it("shows a 'from pantry' marker on a food whose pantryItemId is set", () => {
    const html = renderMealCard({
      ...baseMeal,
      foods: [
        { id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", pantryItemId: "pantry-1" },
        { id: "food-2", slug: "chicken", name: "Chicken", category: "protein", pantryItemId: null },
      ],
    });
    expect(html).toContain('aria-label="from pantry"');
    expect((html.match(/aria-label="from pantry"/g) ?? []).length).toBe(1);
  });

  it("omits the 'from pantry' marker when no food has a pantryItemId", () => {
    const html = renderMealCard(baseMeal);
    expect(html).not.toContain('aria-label="from pantry"');
  });

  it("shows the recipe title line when the meal has one", () => {
    const html = renderMealCard({ ...baseMeal, recipeId: "recipe-1", recipeTitle: "Iron-Rich Purée" });
    expect(html).toContain("🍳");
    expect(html).toContain("Iron-Rich Purée");
  });

  it("omits the recipe title line when the meal has none", () => {
    const html = renderMealCard(baseMeal);
    expect(html).not.toContain("🍳");
  });

  it("renders the served time label", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toMatch(/2:05\s?PM/);
  });

  it("shows the reaction note when present", () => {
    const html = renderMealCard({ ...baseMeal, reactionNote: "mild rash around mouth" });
    expect(html).toContain("Reaction: ");
    expect(html).toContain("mild rash around mouth");
  });

  it("omits the reaction note when absent", () => {
    const html = renderMealCard(baseMeal);
    expect(html).not.toContain("Reaction:");
  });

  it("shows the general note as a plain line, distinct from the reaction note", () => {
    const html = renderMealCard({ ...baseMeal, notes: "ate the whole thing", reactionNote: "mild rash" });
    expect(html).toContain("ate the whole thing");
    expect(html).toContain("Reaction: ");
    expect(html).toContain("mild rash");
    // The general note text must not itself be prefixed "Reaction:".
    expect(html).not.toMatch(/Reaction:\s*ate the whole thing/);
  });

  it("omits the general note line when absent", () => {
    const html = renderMealCard(baseMeal);
    expect(html).not.toContain("ate the whole thing");
  });

  it("makes the whole card the edit link — no separate Edit link", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toContain(`href="/log-meal?edit=${baseMeal.id}"`);
    expect(html).not.toContain(">Edit<");
    // Stretched link: the anchor's overlay covers the card, the card is the
    // positioning context, and the delete control floats above the overlay.
    expect(html).toMatch(/<a [^>]*class="[^"]*after:absolute after:inset-0[^"]*"[^>]*href="\/log-meal\?edit=meal-1"/);
    expect(html).toMatch(/<li [^>]*class="[^"]*\brelative\b/);
    expect(html).toMatch(/<div class="relative z-10[^"]*"><button/);
  });

  it("shows a Delete button when not confirming a delete", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Delete<\/button>/);
  });

  it("hides Edit/Delete and shows the confirm row while a delete is pending for this meal", () => {
    const html = renderMealCard(baseMeal, baseMeal.id);
    expect(html).not.toContain(">Edit<");
    expect(html).toContain("Remove this meal?");
    expect(html).toContain("Yes, delete");
  });
});

describe("MealCard tap-through link (item 164)", () => {
  const baseMeal: MealItem = {
    id: "meal-1",
    babyId: "baby-1",
    servedAt: new Date(2026, 7, 26, 14, 5).toISOString(),
    reactionNote: null,
    notes: null,
    recipeId: null,
    recipeTitle: null,
    foods: [{ id: "food-1", slug: "avocado", name: "Avocado", category: "fruit", pantryItemId: null }],
  };

  it("wraps the info block in a Link to /meals/:id by default", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toContain(`href="/log-meal?edit=${baseMeal.id}"`);
  });

  it("renders the info block as plain content when linkable is false (no anchor at all)", () => {
    const editHref = new RegExp(`href="/log-meal\\?edit=${baseMeal.id}"`, "g");
    expect((renderMealCard(baseMeal).match(editHref) ?? []).length).toBe(1);
    expect((renderMealCard(baseMeal, null, false).match(editHref) ?? []).length).toBe(0);
  });

  it("keeps Delete outside the info anchor (no nested-interactive markup)", () => {
    const html = renderMealCard(baseMeal);
    const anchorClose = html.indexOf("</a>");
    const deleteIndex = html.indexOf(">Delete<");
    expect(anchorClose).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(anchorClose);
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
  });
});

describe("limitMeals + Home cap", () => {
  const meals = ["a", "b", "c", "d", "e"];

  it("keeps the first N (the API orders newest first) and leaves the array alone without a limit", () => {
    expect(limitMeals(meals, 3)).toEqual(["a", "b", "c"]);
    expect(limitMeals(meals, undefined)).toEqual(meals);
    expect(limitMeals(meals, 0)).toEqual([]);
    expect(limitMeals(meals, 10)).toEqual(meals);
  });

  it("Home shows three", () => {
    expect(HOME_MEAL_LIMIT).toBe(3);
  });

  function mealAt(i: number): MealItem {
    return {
      id: `meal-${i}`,
      babyId: "baby-1",
      servedAt: new Date(2026, 7, 26 - i, 12, 0).toISOString(),
      reactionNote: null,
      notes: null,
      recipeId: null,
      recipeTitle: null,
      foods: [{ id: `food-${i}`, slug: "avocado", name: `Food ${i}`, category: "fruit", pantryItemId: null }],
    };
  }

  function renderList(limit: number | undefined, seeAllHref?: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["meals", "baby-1", { limit: 100 }], { items: Array.from({ length: 5 }, (_, i) => mealAt(i)) });
    return renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          null,
          createElement(ServeLogList, { babyId: "baby-1", limit, ...(seeAllHref ? { seeAllHref } : {}) }),
        ),
      ),
    );
  }

  it("with limit 3 and seeAllHref renders exactly three meals and a See all link", () => {
    const html = renderList(3, "/meals");
    expect((html.match(/href="\/log-meal\?edit=meal-/g) ?? []).length).toBe(3);
    expect(html).toContain("Food 0");
    expect(html).not.toContain("Food 3");
    expect(html).toMatch(/<a [^>]*href="\/meals"[^>]*>See all<\/a>/);
  });

  it("without a limit renders every meal and no See all link", () => {
    const html = renderList(undefined);
    expect((html.match(/href="\/log-meal\?edit=meal-/g) ?? []).length).toBe(5);
    expect(html).not.toContain(">See all<");
  });
});
