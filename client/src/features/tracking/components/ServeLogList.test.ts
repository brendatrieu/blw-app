import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { MealItem } from "@blw/shared";
import { dayKey, dayLabel, timeLabel, MealCard, ServeLogList } from "./ServeLogList.js";

function renderMealCard(meal: MealItem, pendingDeleteId: string | null = null) {
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
    recipeId: null,
    recipeTitle: null,
    foods: [
      { id: "food-1", slug: "avocado", name: "Avocado", category: "fruit" },
      { id: "food-2", slug: "chicken", name: "Chicken", category: "protein" },
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

  it("links Edit to /log-meal?edit=<id>", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toContain(`href="/log-meal?edit=${baseMeal.id}"`);
    expect(html).toContain(">Edit<");
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
