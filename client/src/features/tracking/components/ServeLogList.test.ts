import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { MealFood, MealItem } from "@blw/shared";
import {
  dayKey,
  dayLabel,
  emojiCluster,
  hasStorageFood,
  HOME_MEAL_LIMIT,
  limitMeals,
  MealCard,
  mealTitle,
  ServeLogList,
  servedLine,
  timeLabel,
} from "./ServeLogList.js";

function food(overrides: Partial<MealFood> = {}): MealFood {
  return {
    id: "food-1",
    slug: "avocado",
    name: "Avocado",
    category: "fruit",
    storageItemId: null,
    ...overrides,
  };
}

function renderMealCard(
  meal: MealItem,
  pendingDeleteId: string | null = null,
  linkable?: boolean,
  actions?: ReactNode,
) {
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
            ...(actions === undefined ? {} : { actions }),
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

describe("mealTitle (item 192)", () => {
  it("comma-joins every food name", () => {
    expect(mealTitle([food({ name: "Avocado" }), food({ id: "f2", name: "Chicken" })])).toBe("Avocado, Chicken");
  });

  it("is just the name for a single food", () => {
    expect(mealTitle([food({ name: "Avocado" })])).toBe("Avocado");
  });

  it("is empty for no foods (defensive — the API always sends at least one)", () => {
    expect(mealTitle([])).toBe("");
  });
});

describe("emojiCluster (item 192)", () => {
  it("returns one emoji per food with no overflow under the cap", () => {
    const cluster = emojiCluster([food(), food({ id: "f2", slug: "chicken", category: "protein" })]);
    expect(cluster.emojis).toHaveLength(2);
    expect(cluster.overflow).toBe(0);
    expect(cluster.emojis.every((emoji) => emoji.length > 0)).toBe(true);
  });

  it("caps at three and reports the rest as overflow", () => {
    const foods = Array.from({ length: 5 }, (_, i) => food({ id: `f${i}` }));
    const cluster = emojiCluster(foods);
    expect(cluster.emojis).toHaveLength(3);
    expect(cluster.overflow).toBe(2);
  });

  it("honors an explicit max", () => {
    const foods = Array.from({ length: 4 }, (_, i) => food({ id: `f${i}` }));
    expect(emojiCluster(foods, 1).emojis).toHaveLength(1);
    expect(emojiCluster(foods, 1).overflow).toBe(3);
    expect(emojiCluster(foods, 10).emojis).toHaveLength(4);
    expect(emojiCluster(foods, 10).overflow).toBe(0);
  });

  it("prefers a custom food's own emoji", () => {
    expect(emojiCluster([food({ slug: "made-up-thing", emoji: "🫐" })]).emojis).toEqual(["🫐"]);
  });
});

describe("servedLine (item 192)", () => {
  it("joins the day label and the time with a middot", () => {
    const iso = new Date(2026, 7, 26, 14, 5).toISOString();
    expect(servedLine(iso)).toBe(`${dayLabel(dayKey(iso))} · ${timeLabel(iso)}`);
    expect(servedLine(iso)).toMatch(/·/);
  });

  it("says 'Today' for a meal served today", () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    expect(servedLine(now.toISOString())).toMatch(/^Today · /);
  });
});

describe("hasStorageFood (item 192)", () => {
  it("is true when any food carries a storageItemId", () => {
    expect(hasStorageFood([food(), food({ id: "f2", storageItemId: "storage-1" })])).toBe(true);
  });

  it("is false when no food does", () => {
    expect(hasStorageFood([food(), food({ id: "f2" })])).toBe(false);
    expect(hasStorageFood([])).toBe(false);
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

const baseMeal: MealItem = {
  id: "meal-1",
  babyId: "baby-1",
  servedAt: new Date(2026, 7, 26, 14, 5).toISOString(),
  reactionNote: null,
  notes: null,
  recipeId: null,
  recipeTitle: null,
  foods: [
    food({ id: "food-1", slug: "avocado", name: "Avocado", category: "fruit" }),
    food({ id: "food-2", slug: "chicken", name: "Chicken", category: "protein" }),
  ],
};

describe("MealCard (render, storage-card styling — item 192)", () => {
  it("uses the same card chrome as StorageItemCard (relative li, rounded-lg, border, elevated bg, p-3)", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toMatch(/<li class="relative [^"]*rounded-\[var\(--radius-lg\)\][^"]*"/);
    expect(html).toMatch(/<li class="[^"]*border border-\[var\(--color-border\)\][^"]*"/);
    expect(html).toMatch(/<li class="[^"]*bg-\[var\(--color-bg-elevated\)\][^"]*"/);
    expect(html).toMatch(/<li class="[^"]*\bp-3\b/);
  });

  it("titles the card with the food names joined by ', '", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toContain("Avocado, Chicken");
    // The old per-food chip markup is gone — one title line, not two pills.
    expect(html).not.toContain("rounded-[var(--radius-pill)] bg-[var(--color-bg-inset)]");
  });

  it("renders the leading emoji cluster as a single aria-hidden run", () => {
    const html = renderMealCard(baseMeal);
    const { emojis } = emojiCluster(baseMeal.foods);
    expect(html).toMatch(new RegExp(`<span aria-hidden="true" class="[^"]*text-xl[^"]*">${emojis.join("")}`));
  });

  it("caps the cluster at three emoji and shows a +N overflow count", () => {
    const html = renderMealCard({
      ...baseMeal,
      foods: Array.from({ length: 5 }, (_, i) => food({ id: `food-${i}`, name: `Food ${i}` })),
    });
    expect(html).toMatch(/\+(?:<!-- -->)?2/);
  });

  it("shows no overflow count when every food fits", () => {
    expect(renderMealCard(baseMeal)).not.toMatch(/\+(?:<!-- -->)?\d/);
  });

  it("renders the muted day · time line that replaced the day headers", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toContain(servedLine(baseMeal.servedAt));
    expect(html).toMatch(/2:05\s?PM/);
  });

  it("shows the neutral 'From storage' badge when any food came out of storage", () => {
    const html = renderMealCard({
      ...baseMeal,
      foods: [food({ id: "food-1", storageItemId: "storage-1" }), food({ id: "food-2", name: "Chicken" })],
    });
    expect(html).toMatch(/📦 (?:<!-- -->)?From storage/);
    expect(html).toContain("bg-[var(--color-neutral-soft)]");
    // One badge for the meal, not one marker per food.
    expect((html.match(/From storage/g) ?? []).length).toBe(1);
  });

  it("omits the 'From storage' badge when no food has a storageItemId", () => {
    expect(renderMealCard(baseMeal)).not.toContain("From storage");
  });

  it("shows the recipe title line when the meal has one", () => {
    const html = renderMealCard({ ...baseMeal, recipeId: "recipe-1", recipeTitle: "Iron-Rich Purée" });
    expect(html).toContain("🍳");
    expect(html).toContain("Iron-Rich Purée");
  });

  it("omits the recipe title line when the meal has none", () => {
    expect(renderMealCard(baseMeal)).not.toContain("🍳");
  });

  it("shows the reaction note in danger text when present", () => {
    const html = renderMealCard({ ...baseMeal, reactionNote: "mild rash around mouth" });
    expect(html).toContain("mild rash around mouth");
    expect(html).toMatch(/class="text-xs text-\[var\(--color-danger\)\]">Reaction: /);
  });

  it("omits the reaction note when absent", () => {
    expect(renderMealCard(baseMeal)).not.toContain("Reaction:");
  });

  it("shows the general note as a muted line, distinct from the reaction note", () => {
    const html = renderMealCard({ ...baseMeal, notes: "ate the whole thing", reactionNote: "mild rash" });
    expect(html).toContain("ate the whole thing");
    expect(html).toContain("Reaction: ");
    expect(html).toContain("mild rash");
    expect(html).not.toMatch(/Reaction:\s*(?:<!-- -->)?ate the whole thing/);
  });

  it("omits the general note line when absent", () => {
    expect(renderMealCard(baseMeal)).not.toContain("ate the whole thing");
  });
});

describe("MealCard actions slot (item 194)", () => {
  it("renders the kebab Actions menu by default, with no standalone Delete button", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toContain('aria-label="Actions"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toMatch(/<button[^>]*>Delete<\/button>/);
  });

  it("keeps the badge + kebab slot above the stretched overlay (relative z-10)", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toMatch(/<div class="relative z-10 [^"]*">(?:(?!<\/div>).)*aria-label="Actions"/s);
  });

  it("renders nothing in the slot when actions is explicitly null (read-only card)", () => {
    const html = renderMealCard(baseMeal, null, undefined, null);
    expect(html).not.toContain('aria-label="Actions"');
  });

  it("renders a caller-supplied actions slot instead of the kebab", () => {
    const html = renderMealCard(
      baseMeal,
      null,
      undefined,
      createElement("button", { type: "button" }, "Actions slot marker"),
    );
    expect(html).toContain("Actions slot marker");
    expect(html).not.toContain('aria-label="Actions"');
  });

  it("shows the confirm row (and no kebab-triggered delete of its own) while a delete is pending for this meal", () => {
    const html = renderMealCard(baseMeal, baseMeal.id);
    expect(html).toContain("Remove this meal?");
    expect(html).toContain("Yes, delete");
    // Item 257: the destructive confirm keeps a dismiss, but as an
    // icon-only × with an accessible name — never a "Cancel" text button.
    expect(html).not.toContain(">Cancel<");
    expect(html).toContain('aria-label="Keep it"');
    // The confirm row rides above the stretched overlay like the kebab does.
    expect(html).toMatch(/<div class="relative z-10">(?:(?!<\/div>).)*Remove this meal\?/s);
  });

  it("shows no confirm row when the pending id belongs to a different meal", () => {
    expect(renderMealCard(baseMeal, "some-other-meal")).not.toContain("Remove this meal?");
  });
});

describe("MealCard tap-through link (item 195)", () => {
  it("makes the whole card the edit link — no separate Edit link in the card body", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toContain(`href="/log-meal?edit=${baseMeal.id}"`);
    expect(html).toMatch(/<a [^>]*class="[^"]*after:absolute after:inset-0[^"]*"[^>]*href="\/log-meal\?edit=meal-1"/);
    expect(html).toMatch(/<li [^>]*class="[^"]*\brelative\b/);
  });

  it("renders the info block as plain content when linkable is false (no anchor at all)", () => {
    const editHref = new RegExp(`href="/log-meal\\?edit=${baseMeal.id}"`, "g");
    expect((renderMealCard(baseMeal).match(editHref) ?? []).length).toBe(1);
    // linkable=false still leaves the closed kebab, which holds no href until opened.
    expect((renderMealCard(baseMeal, null, false).match(editHref) ?? []).length).toBe(0);
  });

  it("keeps the kebab outside the info anchor (no nested-interactive markup)", () => {
    const html = renderMealCard(baseMeal);
    const anchorClose = html.indexOf("</a>");
    const kebabIndex = html.indexOf('aria-label="Actions"');
    expect(anchorClose).toBeGreaterThan(-1);
    expect(kebabIndex).toBeGreaterThan(anchorClose);
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
  });

  it("keeps the confirm row's buttons outside the anchor too", () => {
    const html = renderMealCard(baseMeal, baseMeal.id);
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
      foods: [food({ id: `food-${i}`, name: `Food ${i}` })],
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

  it("renders one flat newest-first <ul> with no day headers (item 193)", () => {
    const html = renderList(undefined);
    expect(html).not.toContain("<h3");
    expect((html.match(/<ul\b/g) ?? []).length).toBe(1);
    // Newest first: the meals arrive newest-first and the list preserves that.
    expect(html.indexOf("Food 0")).toBeLessThan(html.indexOf("Food 1"));
    expect(html.indexOf("Food 1")).toBeLessThan(html.indexOf("Food 4"));
  });
});
