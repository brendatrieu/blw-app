import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { MealFood, MealItem } from "@blw/shared";
import { emojiCluster } from "../../catalog/foodEmoji.js";
import {
  dayKey,
  dayLabel,
  fromStorage,
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

// CD-Food-Log (PP-NOTES round 5, decision 8): one line per item on the plate,
// in plate order, replacing the comma list of every food plus the 🍳 lines.
// `<!-- -->` is React's text-node separator in SSR output.
describe("MealCard lines (CD-Food-Log, ledger 902)", () => {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const BROCCOLI = { id: uuid(1), slug: "broccoli", name: "Broccoli", category: "veg" as const };
  const CARROT = { id: uuid(2), slug: "carrot", name: "Carrot", category: "veg" as const };
  const EGG = { id: uuid(3), slug: "egg", name: "Egg", category: "protein" as const };
  const PLATE_MEAL: MealItem = {
    ...baseMeal,
    items: [
      { kind: "recipe", id: uuid(10), recipe: { id: uuid(20), title: "Creamy Cashew & Broccoli Pasta" }, leftOut: [], inferred: false, rating: 5 },
      {
        kind: "storage",
        storageItemId: uuid(30),
        label: null,
        location: "fridge",
        servings: 1,
        parts: [
          { kind: "food", id: uuid(11), food: BROCCOLI, rating: 4 },
          { kind: "food", id: uuid(12), food: CARROT, rating: null },
        ],
      },
      { kind: "food", id: uuid(13), food: { ...EGG, deleted: true }, rating: null },
    ],
  };
  const linesOf = (html: string) => {
    const list = /<ul aria-label="On the plate"[^>]*>([\s\S]*?)<\/ul>/.exec(html)![1]!;
    return [...list.matchAll(/<li [^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]!);
  };
  const names = (html: string) =>
    linesOf(html).map((line) => /<span class="min-w-0[^"]*">([\s\S]*)<\/span>$/.exec(line)![1]!.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"));

  it("one line per item in plate order: the recipe, the container under its name, the food", () => {
    expect(names(renderMealCard(PLATE_MEAL))).toEqual(["Creamy Cashew & Broccoli Pasta", "Broccoli, Carrot", "Egg\u00a0(deleted)"]);
  });

  it("each line leads with a 28px plate: the pot for a recipe, a container's first two foods overlapped at 20px", () => {
    const [recipe, container, egg] = linesOf(renderMealCard(PLATE_MEAL));
    expect(recipe).toContain('style="width:28px;height:28px;font-size:14px;background:var(--color-plate-neutral)">🍲</span>');
    expect(container).toMatch(/^<span aria-hidden="true" class="relative block shrink-0 size-7 ">/);
    expect(container!.match(/width:20px;height:20px/g)).toHaveLength(2);
    expect(container).toContain("ring-2 ring-[var(--color-bg-elevated)]");
    expect(egg).toContain("width:28px;height:28px");
    // The deleted mark is the one muted mark (ledger 543/555).
    expect(egg).toContain('<span class="font-normal text-[var(--color-text-muted)]">\u00a0<!-- -->(deleted)</span>');
  });

  it("a cached body from before items lists its foods, one line each", () => {
    expect(names(renderMealCard(baseMeal))).toEqual(["Avocado", "Chicken"]);
  });

  // Ledger 957: a recipe deleted since the meal was logged stays on it, with
  // the same muted mark; a container named by a deleted recipe says so too.
  it("marks a deleted recipe, and a container named by one, with the muted mark", () => {
    const meal: MealItem = {
      ...baseMeal,
      items: [
        { kind: "recipe", id: uuid(10), recipe: { id: uuid(20), title: "Lentil mash", deleted: true }, leftOut: [], inferred: false, rating: 5 },
        {
          kind: "storage",
          storageItemId: uuid(30),
          label: null,
          location: "fridge",
          servings: 1,
          parts: [{ kind: "recipe", id: uuid(11), recipe: { id: uuid(21), title: "Pear bake", deleted: true }, rating: null }],
        },
      ],
    };
    expect(names(renderMealCard(meal))).toEqual(["Lentil mash\u00a0(deleted)", "Pear bake\u00a0(deleted)"]);
    const [recipe] = linesOf(renderMealCard(meal));
    expect(recipe).toContain('Lentil mash<span class="font-normal text-[var(--color-text-muted)]">\u00a0<!-- -->(deleted)</span>');
    expect(names(renderMealCard(PLATE_MEAL))[0]).toBe("Creamy Cashew & Broccoli Pasta");
  });

  it("keeps every line inside the edit link, the date line, badge and kebab above them", () => {
    const html = renderMealCard(PLATE_MEAL);
    const link = /<a [^>]*href="\/log-meal\?edit=meal-1"[^>]*>([\s\S]*?)<\/a>/.exec(html)![1]!;
    expect(link).toContain('<ul aria-label="On the plate"');
    expect(link).toContain("Broccoli, Carrot");
    expect(html.indexOf(servedLine(baseMeal.servedAt))).toBeLessThan(html.indexOf("<a "));
    expect(html.indexOf("From storage")).toBeLessThan(html.indexOf("<a "));
    expect(html.indexOf('aria-label="Actions"')).toBeLessThan(html.indexOf("<a "));
  });

  it("the badge follows the plate: a container on it, not the foods' links", () => {
    expect(fromStorage(PLATE_MEAL)).toBe(true);
    expect(fromStorage({ ...PLATE_MEAL, items: PLATE_MEAL.items!.filter((item) => item.kind !== "storage") })).toBe(false);
    // A cached body from before items: a food served from a batch.
    expect(fromStorage({ ...baseMeal, foods: [food({ storageItemId: "storage-1" })] })).toBe(true);
    expect(fromStorage(baseMeal)).toBe(false);
    expect(renderMealCard(PLATE_MEAL)).toMatch(/📦 (?:<!-- -->)?From storage/);
  });
});

describe("MealCard (render, storage-card styling — item 192)", () => {
  it("uses the card chrome of the boards (relative li, rounded-lg, border, elevated bg; 6/6/10/12 padding for the 44px kebab)", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toMatch(/<li class="relative [^"]*rounded-\[var\(--radius-lg\)\][^"]*"/);
    expect(html).toMatch(/<li class="[^"]*border border-\[var\(--color-divider\)\][^"]*"/);
    expect(html).toMatch(/<li class="[^"]*bg-\[var\(--color-bg-elevated\)\][^"]*"/);
    expect(html).toMatch(/<li class="[^"]*\bpt-1\.5 pr-1\.5 pb-2\.5 pl-3\b/);
  });

  it("no comma list and no emoji cluster: the old per-meal title is gone", () => {
    const html = renderMealCard(baseMeal);
    expect(html).not.toContain("Avocado, Chicken");
    expect(html).not.toContain("h-[44px] w-[48px]");
    expect(html).not.toContain("🍳");
  });

  it("wraps the badge + kebab under the date line instead of overflowing at 320px (ledger 776)", () => {
    for (const html of [renderMealCard(baseMeal), renderMealCard(baseMeal, false)]) {
      expect(html).toMatch(/<div class="flex flex-wrap items-center justify-between gap-x-2"><span class="text-xs text-\[var\(--color-text-muted\)\]">/);
      expect(html).toContain('<div class="relative z-10 flex shrink-0 items-center gap-0.5 ml-auto">');
    }
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

  it("shows the reaction note in danger text when present", () => {
    const html = renderMealCard({ ...baseMeal, reactionNote: "mild rash around mouth" });
    expect(html).toContain("mild rash around mouth");
    expect(html).toMatch(/class="mt-1 text-xs text-\[var\(--color-danger\)\]">Reaction: /);
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
    const anchorOpen = html.indexOf("<a ");
    const anchorClose = html.indexOf("</a>");
    const kebabIndex = html.indexOf('aria-label="Actions"');
    expect(anchorClose).toBeGreaterThan(-1);
    // CD-Food-Log: the kebab sits on the date line, before the lines' anchor.
    expect(kebabIndex).toBeLessThan(anchorOpen);
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

  /** The log's own list, not a card's "On the plate" lines. */
  const LIST_UL = /<ul\b(?! aria-label="On the plate")/g;

  // Item 775: every page is a slide on the swipe track; off-screen slides are
  // inert, so the one without `inert` is the page on show.
  const shownSlides = (html: string) =>
    html
      .split('<div class="w-full shrink-0 snap-start')
      .slice(1)
      .filter((slide) => !slide.slice(0, slide.indexOf(">")).includes("inert"));

  it("with limit 3 and seeAllHref shows exactly three meals and a See all link", () => {
    const html = renderList(3, "/meals");
    const [shown, ...more] = shownSlides(html);
    expect(more).toEqual([]);
    expect((shown!.match(/href="\/log-meal\?edit=meal-/g) ?? []).length).toBe(3);
    expect(shown).toContain("Food 0");
    expect(shown).not.toContain("Food 3");
    // The rest wait on the next, inert, slide.
    expect(html).toMatch(/<div class="w-full shrink-0 snap-start[^"]*" inert="">.*Food 3/);
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
    // The range is announced (item 775), not the rows, which all sit on slides.
    expect(html).toMatch(/<span aria-live="polite"[^>]*>1–3 of 5<\/span>/);
    expect(html).not.toMatch(/<ul [^>]*aria-live/);
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
    const [html] = shownSlides(renderList(3, "/meals", true));
    expect((html!.match(LIST_UL) ?? []).length).toBe(1);
    expect(html).toMatch(/<ul class="rounded-\[var\(--radius-lg\)\] border border-\[var\(--color-border\)\] bg-\[var\(--color-bg-elevated\)\][^"]*"/);
    const rows = html!.match(/<li class="relative[^"]*"/g) ?? [];
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
    const [html] = shownSlides(renderList(3, "/meals"));
    expect(html).toMatch(/<ul class="flex flex-col gap-2">/);
    expect(html).not.toContain("not-first:before");
    expect((html!.match(/aria-label="Actions"/g) ?? []).length).toBe(3);
  });

  it("renders one flat newest-first <ul> with no day headers (item 193)", () => {
    const html = renderList(undefined);
    expect(html).not.toContain("<h3");
    expect((html.match(LIST_UL) ?? []).length).toBe(1);
    // Newest first: the meals arrive newest-first and the list preserves that.
    expect(html.indexOf("Food 0")).toBeLessThan(html.indexOf("Food 1"));
    expect(html.indexOf("Food 1")).toBeLessThan(html.indexOf("Food 4"));
  });
});
