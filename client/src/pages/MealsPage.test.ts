import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby, MealItem } from "@blw/shared";
import { babyKeys } from "../features/babies/api.js";
import { trackingKeys } from "../features/tracking/hooks.js";
import { MealsPage } from "./MealsPage.js";

const baby: Baby = {
  id: "baby-1",
  name: "Baby",
  birthDate: "2026-01-01",
  notes: null,
  archived: false,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function meal(i: number): MealItem {
  return {
    id: `meal-${i}`,
    babyId: baby.id,
    servedAt: new Date(2026, 7, 26 - i, 12, 0).toISOString(),
    reactionNote: null,
    notes: null,
    recipeId: null,
    recipeTitle: null,
    foods: [{ id: `food-${i}`, slug: "avocado", name: `Meal food ${i}`, category: "fruit", storageItemId: null }],
  };
}

function render(withBaby: boolean, mealCount = 5) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(babyKeys.list(false), withBaby ? [baby] : []);
  if (withBaby) {
    queryClient.setQueryData([...trackingKeys.meals(baby.id), { limit: 100 }], {
      items: Array.from({ length: mealCount }, (_, i) => meal(i)),
    });
  }
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, null, createElement(MealsPage, null)),
    ),
  );
}

describe("MealsPage (/meals — Home's See all)", () => {
  it("titles the page Food log once, with a back button and a Log meal action", () => {
    const html = render(true);
    expect((html.match(/Food log/g) ?? []).length).toBe(1);
    expect(html).toContain("<h1");
    // Item 258: the chevron is inline with the h1, sr-only labelled.
    expect(html).toContain('<span class="sr-only">Back</span>');
    expect(html.indexOf('<span class="sr-only">Back</span>')).toBeLessThan(html.indexOf("</h1>"));
    expect(html).toMatch(/<a [^>]*href="\/log-meal"[^>]*>(?:(?!<\/a>).)*Log meal/s);
  });

  it("lists every meal with no cap and no See all link", () => {
    const html = render(true, 5);
    expect((html.match(/href="\/log-meal\?edit=meal-/g) ?? []).length).toBe(5);
    expect(html).not.toContain(">See all<");
  });

  it("asks for a baby profile when there is none", () => {
    const html = render(false);
    expect(html).toContain("Add a baby");
    expect(html).not.toContain("meal-0");
  });
});
