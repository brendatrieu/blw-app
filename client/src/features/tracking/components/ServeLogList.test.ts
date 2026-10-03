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
  MealCard,
  ServeLogList,
  servedLine,
  timeLabel,
} from "./ServeLogList.js";
import { MealActionsMenu } from "./MealActionsMenu.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function findElement(node: unknown, type: unknown): El | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const el = node as El;
  return el.type === type ? el : findElement(el.props.children, type);
}

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
            onRequestDelete: () => {},
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

// The card's title line (item 192): every food's name, comma-joined, never
// the recipe title. `<!-- -->` is React's text-node separator in SSR output.
describe("MealCard title (item 192, ledger 555)", () => {
  const titleOf = (foods: MealFood[]) => {
    const html = renderMealCard({ ...baseMeal, recipeId: "r1", recipeTitle: "Iron-Rich Purée", foods });
    return /<span class="text-sm font-medium text-\[var\(--color-text\)\]">([\s\S]*?)<\/span><span/.exec(html)![1]!.replace(/<!-- -->/g, "");
  };

  it("comma-joins every food name", () => {
    expect(titleOf([food({ name: "Avocado" }), food({ id: "f2", name: "Chicken" })])).toBe("Avocado, Chicken");
  });

  it("is just the name for a single food", () => {
    expect(titleOf([food({ name: "Avocado" })])).toBe("Avocado");
  });

  it("marks a food its owner deleted with the one muted mark (ledger 543/555)", () => {
    expect(titleOf([food({ name: "Banana bread", deleted: true }), food({ id: "f2", name: "Chicken" })])).toBe(
      '<span>Banana bread<span class="font-normal text-[var(--color-text-muted)]">\u00a0(deleted)</span>, Chicken</span>',
    );
  });
});

describe("emojiCluster (items 192, 658)", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => food({ id: `f${i}` }));

  it("returns one tinted plate per food with no overflow up to three", () => {
    const cluster = emojiCluster([food({ slug: "avocado" }), food({ id: "f2", slug: "chicken", category: "protein" })]);
    expect(cluster).toEqual({
      plates: [
        { emoji: "🥑", tint: "fruit" },
        { emoji: "🍗", tint: "protein" },
      ],
      overflow: 0,
    });
    expect(emojiCluster(many(3))).toMatchObject({ overflow: 0 });
    expect(emojiCluster(many(3)).plates).toHaveLength(3);
  });

  it("shows the first two plates and counts the rest from four foods on", () => {
    expect(emojiCluster(many(4)).plates).toHaveLength(2);
    expect(emojiCluster(many(4)).overflow).toBe(2);
    expect(emojiCluster(many(5)).plates).toHaveLength(2);
    expect(emojiCluster(many(5)).overflow).toBe(3);
  });

  it("prefers a custom food's own emoji, tinted by its category", () => {
    expect(emojiCluster([food({ slug: "made-up-thing", category: "fruit", emoji: "🫐" })]).plates).toEqual([
      { emoji: "🫐", tint: "fruit" },
    ]);
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
    expect(html).toMatch(/<li class="[^"]*border border-\[var\(--color-divider\)\][^"]*"/);
    expect(html).toMatch(/<li class="[^"]*bg-\[var\(--color-bg-elevated\)\][^"]*"/);
    expect(html).toMatch(/<li class="[^"]*\bp-3\b/);
  });

  it("titles the card with the food names joined by ', '", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toContain("Avocado, Chicken");
    // The old per-food chip markup is gone — one title line, not two pills.
    expect(html).not.toContain("rounded-[var(--radius-pill)] bg-[var(--color-bg-inset)]");
  });

  it("renders the leading plates in one fixed aria-hidden 48x44 slot", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toContain('<span aria-hidden="true" class="relative block h-[44px] w-[48px] shrink-0">');
    for (const { emoji } of emojiCluster(baseMeal.foods).plates) expect(html).toContain(emoji);
  });

  it("shows two plates and a +N count from four foods on (5 foods: +3)", () => {
    const html = renderMealCard({
      ...baseMeal,
      foods: Array.from({ length: 5 }, (_, i) => food({ id: `food-${i}`, name: `Food ${i}` })),
    });
    expect(html).toContain(">+3</span>");
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
    const html = renderMealCard(baseMeal, undefined, null);
    expect(html).not.toContain('aria-label="Actions"');
  });

  it("renders a caller-supplied actions slot instead of the kebab", () => {
    const html = renderMealCard(
      baseMeal,
      undefined,
      createElement("button", { type: "button" }, "Actions slot marker"),
    );
    expect(html).toContain("Actions slot marker");
    expect(html).not.toContain('aria-label="Actions"');
  });

  it("never shows a confirm of its own — its kebab's Delete asks the list, with the meal (item 599)", () => {
    const asked: MealItem[] = [];
    const card = (MealCard as unknown as (props: unknown) => unknown)({
      meal: baseMeal,
      onRequestDelete: (meal: MealItem) => asked.push(meal),
    });
    expect(renderMealCard(baseMeal)).not.toContain("Delete this meal?");
    const menu = findElement(card, MealActionsMenu);
    (menu!.props.onRequestDelete as () => void)();
    expect(asked).toEqual([baseMeal]);
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
    expect((renderMealCard(baseMeal, false).match(editHref) ?? []).length).toBe(0);
  });

  it("keeps the kebab outside the info anchor (no nested-interactive markup)", () => {
    const html = renderMealCard(baseMeal);
    const anchorClose = html.indexOf("</a>");
    const kebabIndex = html.indexOf('aria-label="Actions"');
    expect(anchorClose).toBeGreaterThan(-1);
    expect(kebabIndex).toBeGreaterThan(anchorClose);
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
  });
});

describe("Home paging (item 694)", () => {
  it("Home shows three per page", () => {
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

  function renderList(limit: number | undefined, seeAllHref?: string, grouped?: boolean) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["meals", "baby-1", { limit: 100 }], { items: Array.from({ length: 5 }, (_, i) => mealAt(i)) });
    return renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          null,
          createElement(ServeLogList, { babyId: "baby-1", limit, grouped, ...(seeAllHref ? { seeAllHref } : {}) }),
        ),
      ),
    );
  }

  it("with limit 3 and seeAllHref renders exactly three meals and a See all link", () => {
    const html = renderList(3, "/meals");
    expect((html.match(/href="\/log-meal\?edit=meal-/g) ?? []).length).toBe(3);
    expect(html).toContain("Food 0");
    expect(html).not.toContain("Food 3");
    // A-Home's link style: 14px bold accent, no underline, a decorative chevron, 44px tall.
    expect(html).toMatch(
      /<a class="inline-flex min-h-11 items-center text-sm font-semibold text-\[var\(--color-accent\)\]" href="\/meals"[^>]*>See all<span aria-hidden="true">\u00a0›<\/span><\/a>/,
    );
  });

  it("with limit 3 pages the rest: range, ‹ dimmed on page one, › live, then See all, list announced", () => {
    const html = renderList(3, "/meals", true);
    expect(html).toContain(">1–3 of 5<");
    expect(html).toMatch(/<button [^>]*aria-label="Previous meals" aria-disabled="true">/);
    expect(html).toMatch(/<button [^>]*aria-label="Next meals">/);
    expect(html.indexOf('aria-label="Next meals"')).toBeLessThan(html.indexOf('href="/meals"'));
    expect(html).toMatch(/<ul [^>]*aria-live="polite"/);
  });

  it("without a limit renders every meal and no See all link", () => {
    const html = renderList(undefined);
    expect((html.match(/href="\/log-meal\?edit=meal-/g) ?? []).length).toBe(5);
    expect(html).not.toContain("See all");
    expect(html).not.toContain('href="/meals"');
    // /meals: no pager, nothing paged to announce.
    expect(html).not.toContain("Next meals");
    expect(html).not.toContain(" of 5");
    expect(html).not.toContain("aria-live");
  });

  it("grouped (Home, item 664): one card of divided rows, each kebab named after its meal", () => {
    const html = renderList(3, "/meals", true);
    expect((html.match(/<ul\b/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<ul class="rounded-\[var\(--radius-lg\)\] border border-\[var\(--color-border\)\] bg-\[var\(--color-bg-elevated\)\][^"]*"/);
    const rows = html.match(/<li class="[^"]*"/g) ?? [];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toContain("not-first:before:h-px not-first:before:bg-[var(--color-divider)]");
      expect(row).not.toContain("border");
      expect(row).not.toContain("bg-[var(--color-bg-elevated)]");
    }
    expect(html).toContain('aria-label="Food 0 actions"');
    expect(html).not.toContain('aria-label="Actions"');
  });

  it("not grouped (/meals) keeps a card per meal and the plain Actions label", () => {
    const html = renderList(3, "/meals");
    expect(html).toMatch(/<ul class="flex flex-col gap-2">/);
    expect(html).not.toContain("not-first:before");
    expect((html.match(/aria-label="Actions"/g) ?? []).length).toBe(3);
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
