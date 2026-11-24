import { createElement } from "react";
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
  MealSheet,
  ServeLogList,
  servedLine,
  timeLabel,
} from "./ServeLogList.js";
import { Button } from "../../../components/ui/Button.js";
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

function renderMealCard(meal: MealItem, extra: { lead?: string[]; subline?: string } = {}) {
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
            onOpen: () => {},
            ...extra,
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

/** The whole meal as its sheet lists it (ledger 1121): every line, its stars. */
function renderSheet(meal: MealItem) {
  const el = (MealSheet as unknown as (p: unknown) => El)({ meal, onClose: () => {}, onRequestDelete: () => {} });
  return renderToString(createElement(MemoryRouter, null, el.props.children as never));
}

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
// in plate order. Since ledger 1146 every list shows the one-line row and
// these lines live in the meal's sheet only.
// `<!-- -->` is React's text-node separator in SSR output.
describe("MealSheet lines (CD-Food-Log, ledgers 902, 973)", () => {
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
  const lisOf = (html: string) => {
    const list = /<ul class="flex flex-col">([\s\S]*?)<\/ul>/.exec(html)![1]!;
    return [...list.matchAll(/<li ([^>]*)>([\s\S]*?)<\/li>/g)].map((m) => ({ attrs: m[1]!, inner: m[2]! }));
  };
  // A line's own row, without its stars (ledger 966): a container's rated
  // parts sit on lines of their own under it, in a row div of its own.
  const ROW = '<div class="flex items-center gap-2">';
  const rowOf = (inner: string) => (inner.startsWith(ROW) ? inner.slice(ROW.length, inner.indexOf("</div>")) : inner);
  const STARS = /<span role="img"[^>]*>(?:<svg[\s\S]*?<\/svg>)*<\/span>/g;
  const linesOf = (html: string) => lisOf(html).map(({ inner }) => rowOf(inner).replace(STARS, ""));
  const names = (html: string) =>
    linesOf(html).map((line) => /<span class="min-w-0[^"]*">([\s\S]*)<\/span>$/.exec(line)![1]!.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"));

  // Ledger 973: a container gets no line of its own; each thing it held is
  // a line like a fresh one, in its place.
  it("one line per item in plate order: the recipe, each of the container's foods in its place, the food", () => {
    expect(names(renderSheet(PLATE_MEAL))).toEqual(["Creamy Cashew & Broccoli Pasta", "Broccoli", "Carrot", "Egg\u00a0(deleted)"]);
  });

  it("a one-part container reads as that part, never its label; a recipe part wears the pot (ledger 973)", () => {
    const meal: MealItem = {
      ...baseMeal,
      items: [
        {
          kind: "storage",
          storageItemId: uuid(30),
          label: "Muffins (old batch)",
          location: "fridge",
          servings: 1,
          parts: [{ kind: "recipe", id: uuid(11), recipe: { id: uuid(21), title: "Egg Muffins" }, rating: null }],
        },
      ],
    };
    const html = renderSheet(meal);
    expect(names(html)).toEqual(["Egg Muffins"]);
    expect(html).not.toContain("Muffins (old batch)");
    expect(linesOf(html)[0]).toContain('style="width:28px;height:28px;font-size:14px;background:var(--color-plate-neutral)">🍲</span>');
    expect(html).toMatch(/📦 (?:<!-- -->)?From storage/);
  });

  it("each line leads with its own 28px plate: the pot for a recipe, each container food its own (ledger 973)", () => {
    const html = renderSheet(PLATE_MEAL);
    const [recipe, broccoli, carrot, egg] = linesOf(html);
    expect(recipe).toContain('style="width:28px;height:28px;font-size:14px;background:var(--color-plate-neutral)">🍲</span>');
    expect(broccoli).toMatch(/^<span aria-hidden="true"[^>]*style="width:28px;height:28px[^"]*">🥦<\/span>/);
    expect(carrot).toMatch(/^<span aria-hidden="true"[^>]*style="width:28px;height:28px[^"]*">🥕<\/span>/);
    // No overlapped pair any more.
    expect(html).not.toContain("relative block shrink-0 size-7");
    expect(html).not.toContain("width:20px;height:20px");
    expect(egg).toContain("width:28px;height:28px");
    // The deleted mark is the one muted mark (ledger 543/555).
    expect(egg).toContain('<span class="font-normal text-[var(--color-text-muted)]">\u00a0<!-- -->(deleted)</span>');
  });

  it("a cached body from before items lists its foods, one line each", () => {
    expect(names(renderSheet(baseMeal))).toEqual(["Avocado", "Chicken"]);
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
    expect(names(renderSheet(meal))).toEqual(["Lentil mash\u00a0(deleted)", "Pear bake\u00a0(deleted)"]);
    const [recipe] = linesOf(renderSheet(meal));
    expect(recipe).toContain('Lentil mash<span class="font-normal text-[var(--color-text-muted)]">\u00a0<!-- -->(deleted)</span>');
    expect(names(renderSheet(PLATE_MEAL))[0]).toBe("Creamy Cashew & Broccoli Pasta");
  });

  it("the badge follows the plate: a container on it, not the foods' links", () => {
    expect(fromStorage(PLATE_MEAL)).toBe(true);
    expect(fromStorage({ ...PLATE_MEAL, items: PLATE_MEAL.items!.filter((item) => item.kind !== "storage") })).toBe(false);
    // A cached body from before items: a food served from a batch.
    expect(fromStorage({ ...baseMeal, foods: [food({ storageItemId: "storage-1" })] })).toBe(true);
    expect(fromStorage(baseMeal)).toBe(false);
    expect(renderSheet(PLATE_MEAL)).toMatch(/📦 (?:<!-- -->)?From storage/);
  });
  // Ledger 966b: ratings at a glance, read-only.
  it("puts a rated item's stars, read-only, at the end of its line; an unrated line is exactly as before", () => {
    const html = renderSheet(PLATE_MEAL).replace(/<!-- -->/g, "");
    const [recipe, broccoli, carrot, egg] = lisOf(html);
    // The recipe (5): one image at the end of its row, five small filled stars.
    expect(recipe!.attrs).toBe('class="flex items-center gap-2 py-[3px]"');
    const stars = /<span role="img" aria-label="Rated 5 stars" class="flex shrink-0 ml-auto mr-2">([\s\S]*?)<\/span><\/li>$/.exec(`<li ${recipe!.attrs}>${recipe!.inner}</li>`);
    expect(stars).not.toBeNull();
    expect(stars![1]!.match(/<svg aria-hidden="true" width="14" height="14"/g)).toHaveLength(5);
    expect(stars![1]!.match(/fill-current/g)).toHaveLength(5);
    // The unrated egg: the plate and the name, nothing else, same classes.
    expect(egg!.attrs).toBe('class="flex items-center gap-2 py-[3px]"');
    expect(egg!.inner).not.toContain('role="img"');
    expect(egg!.inner).toMatch(/^<span aria-hidden="true"[\s\S]*<\/span><span class="min-w-0 text-sm leading-\[1\.3\] font-medium break-words text-\[var\(--color-text\)\]">Egg<span class="font-normal[^"]*">\u00a0\(deleted\)<\/span><\/span>$/);
    // Ledger 973: the container's rated Broccoli (4) is a plain line with its
    // stars at the end, its unrated Carrot just the plate and name; no
    // container line and no grey sub-lines.
    for (const part of [broccoli, carrot]) expect(part!.attrs).toBe('class="flex items-center gap-2 py-[3px]"');
    expect(broccoli!.inner).toMatch(/>Broccoli<\/span><span role="img" aria-label="Rated 4 stars" class="flex shrink-0 ml-auto mr-2">/);
    expect(broccoli!.inner.match(/fill-current/g)).toHaveLength(4);
    expect(carrot!.inner).not.toContain('role="img"');
    expect(carrot!.inner).toMatch(/<span class="min-w-0 text-sm leading-\[1\.3\] font-medium break-words text-\[var\(--color-text\)\]">Carrot<\/span>$/);
    expect(html).not.toContain("pl-9");
    expect(html).not.toContain("text-xs text-[var(--color-text-muted)]\"><span");
    // Read-only: no star buttons in the list.
    expect(html).not.toContain('role="radio"');
    const list = /<ul class="flex flex-col">([\s\S]*?)<\/ul>/.exec(html)![1]!;
    expect(list).not.toContain("<button");
    expect(list.match(/role="img"/g)).toHaveLength(2);
  });

  it("a container of one thing carries its stars at the end of its own line; one star reads 'Rated 1 star'", () => {
    const meal: MealItem = {
      ...baseMeal,
      items: [
        {
          kind: "storage",
          storageItemId: uuid(30),
          label: null,
          location: "fridge",
          servings: 1,
          parts: [{ kind: "food", id: uuid(11), food: BROCCOLI, rating: 1 }],
        },
      ],
    };
    const [line] = lisOf(renderSheet(meal).replace(/<!-- -->/g, ""));
    expect(line!.attrs).toBe('class="flex items-center gap-2 py-[3px]"');
    expect(line!.inner).toMatch(/>Broccoli<\/span><span role="img" aria-label="Rated 1 star" class="flex shrink-0 ml-auto mr-2">/);
    expect(line!.inner.match(/fill-current/g)).toHaveLength(1);
    // No ratings at all (a cached body from before items): no stars.
    expect(renderSheet(baseMeal)).not.toContain('role="img"');
  });
});

describe("MealCard (render, storage-card styling — item 192)", () => {
  it("uses the card chrome of the boards (relative li, rounded-lg, the card glass with its border; 6/6/10/12 padding for the 44px kebab)", () => {
    const html = renderMealCard(baseMeal);
    // Ledger 1083: the card glass (index.css .app-card), not the opaque elevated fill.
    expect(html).toMatch(/<li class="app-card relative [^"]*rounded-\[var\(--radius-lg\)\] border [^"]*"/);
    expect(html).not.toMatch(/<li class="[^"]*bg-\[var\(--color-bg-elevated\)\][^"]*"/);
    expect(html).toMatch(/<li class="[^"]*\bpt-1\.5 pr-1\.5 pb-2\.5 pl-3\b/);
  });

  it("no emoji cluster: the old per-meal title is gone", () => {
    const html = renderMealCard(baseMeal);
    expect(html).not.toContain("h-[44px] w-[48px]");
    expect(html).not.toContain("🍳");
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
    expect(html).toMatch(/title="From storage"[^>]*>📦<span class="sr-only"> (?:<!-- -->)?From storage<\/span>/);
    expect(html).toContain("bg-[var(--color-neutral-soft)]");
    // One badge for the meal, not one marker per food.
    expect((html.match(/> (?:<!-- -->)?From storage/g) ?? []).length).toBe(1);
  });

  it("omits the 'From storage' badge when no food has a storageItemId", () => {
    expect(renderMealCard(baseMeal)).not.toContain("From storage");
  });

  // Ledger 1146: a small red "Reaction" label on the date line, before the
  // badge and the kebab; the note itself waits in the sheet.
  // Wrapper is flex so the pill centers with the date, 📦 and ⋮ (V-1146 c1: a block wrapper left it 2px low on the text baseline).
  const REACTION = '<span aria-hidden="true" class="flex"><span class="inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-medium whitespace-nowrap bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-text)]">Reaction</span></span>';
  it("labels a meal with a reaction 'Reaction' (danger soft) before the badge and the kebab, never the note", () => {
    const html = renderMealCard({
      ...baseMeal,
      reactionNote: "mild rash around mouth",
      foods: [food({ id: "food-1", storageItemId: "storage-1" })],
    }).replace(/<!-- -->/g, "");
    expect(html).toContain(REACTION);
    const label = html.indexOf(REACTION);
    expect(html.indexOf(servedLine(baseMeal.servedAt))).toBeLessThan(label);
    expect(label).toBeLessThan(html.indexOf('title="From storage"'));
    expect(html.indexOf('title="From storage"')).toBeLessThan(html.indexOf('aria-label="Avocado actions"'));
    expect(html).not.toContain("mild rash");
  });

  // Ledger 1159a: the row badge is the 📦 alone on EVERY row at every width,
  // with or without Reaction (plain sr-only, no breakpoint), still named "From storage".
  it("the row's From storage badge is the 📦 alone at every width, with or without Reaction, its text for screen readers", () => {
    const ALONE = /title="From storage"[^>]*>📦<span class="sr-only"> From storage<\/span><\/span>/;
    const both = renderMealCard({ ...baseMeal, reactionNote: "mild rash", foods: [food({ id: "food-1", storageItemId: "storage-1" })] }).replace(/<!-- -->/g, "");
    expect(both).toMatch(ALONE);
    const storageOnly = renderMealCard({ ...baseMeal, foods: [food({ id: "food-1", storageItemId: "storage-1" })] }).replace(/<!-- -->/g, "");
    expect(storageOnly).toMatch(ALONE);
    for (const html of [both, storageOnly]) expect(html).not.toMatch(/\]:sr-only|:not-sr-only/);
  });

  it("names the row's button 'Reaction: …' when the label shows (the label itself is hidden from screen readers)", () => {
    const html = renderMealCard({ ...baseMeal, reactionNote: "mild rash" }).replace(/<!-- -->/g, "");
    const button = /<button type="button" aria-haspopup="dialog"[^>]*>([\s\S]*)<\/button>/.exec(html)![1]!;
    expect(button).toMatch(/^<span class="flex h-\[34px\] items-center gap-2"><span class="sr-only">Reaction: <\/span>/);
    expect(button).toContain("Avocado, Chicken");
  });

  it("no label and no 'Reaction' anywhere on a meal without one", () => {
    expect(renderMealCard(baseMeal)).not.toContain("Reaction");
  });

  it("never shows the general note on the row", () => {
    expect(renderMealCard({ ...baseMeal, notes: "ate the whole thing" })).not.toContain("ate the whole thing");
  });

  // Ledger 1146, an allergen's page: its carrying items first, by item.
  it("lead names the given items first, the rest in plate order; +N counts the rest", () => {
    const item = (n: number, name: string) => ({
      kind: "food" as const,
      id: `item-${n}`,
      food: { id: `food-${n}`, slug: name.toLowerCase(), name, category: "fruit" as const },
      rating: null,
    });
    const meal: MealItem = { ...baseMeal, items: [item(1, "Pear"), item(2, "Oats"), item(3, "Yogurt"), item(4, "Banana")] };
    const names = (html: string) => /<span class="min-w-0 truncate text-sm[^"]*">([\s\S]*?)<\/span>/.exec(html.replace(/<!-- -->/g, ""))![1];
    expect(names(renderMealCard(meal))).toBe("Pear, Oats");
    expect(names(renderMealCard(meal, { lead: ["item-3"] }))).toBe("Yogurt, Pear");
    expect(names(renderMealCard(meal, { lead: ["item-4", "item-2"] }))).toBe("Oats, Banana");
    expect(renderMealCard(meal, { lead: ["item-3"] })).toMatch(/>\+(?:<!-- -->)?2</);
    // An older server sends no lead: plate order.
    expect(names(renderMealCard(meal, { lead: undefined }))).toBe("Pear, Oats");
  });

  it("a subline is one muted line under the food line, outside the button", () => {
    const html = renderMealCard(baseMeal, { subline: "Didn't count toward the 3 servings" }).replace(/<!-- -->/g, "");
    expect(html).toMatch(/<\/button><p class="text-xs text-\[var\(--color-text-muted\)\]">Didn&#x27;t count toward the 3 servings<\/p><\/li><\/ul>$/);
    expect(renderMealCard(baseMeal)).not.toContain("<p ");
  });
});

describe("MealCard actions slot (item 194)", () => {
  it("renders the kebab menu named after the meal, with no standalone Delete button", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toContain('aria-label="Avocado, Chicken actions"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toMatch(/<button[^>]*>Delete<\/button>/);
  });

  it("keeps the badge + kebab slot above the stretched overlay (relative z-10)", () => {
    const html = renderMealCard(baseMeal);
    expect(html).toMatch(/<div class="relative z-10 [^"]*">(?:(?!<\/div>).)*aria-label="Avocado, Chicken actions"/s);
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

describe("MealCard tap target (items 195, 1121)", () => {
  it("makes the whole row one button (stretched over the card), with no edit link", () => {
    const html = renderMealCard(baseMeal);
    expect(html).not.toContain("href=\"/log-meal?edit=");
    expect(html).toMatch(/<button type="button" aria-haspopup="dialog" class="[^"]*after:absolute after:inset-0[^"]*"/);
    expect(html).toMatch(/<li [^>]*class="[^"]*\brelative\b/);
  });

  it("keeps the kebab outside the row's button (no nested-interactive markup)", () => {
    const html = renderMealCard(baseMeal);
    const row = html.indexOf('aria-haspopup="dialog"');
    expect(html.indexOf('aria-label="Avocado, Chicken actions"')).toBeLessThan(row);
    expect(html.slice(row)).not.toContain(' actions"');
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

  /** The log's own list, not a card's lines (the ul inside its link). */
  const LIST_UL = /(?<!<a [^>]*>)<ul\b/g;

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
    // Ledger 1121: a paged row opens the meal in a sheet (Edit stays in its kebab), not the edit page.
    expect((shown!.match(/<button type="button" aria-haspopup="dialog"/g) ?? []).length).toBe(3);
    expect(shown).not.toMatch(/<a [^>]*href="\/log-meal\?edit=meal-/);
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
    // Ledger 1146: /meals rows open the sheet too.
    expect((html.match(/<button type="button" aria-haspopup="dialog"/g) ?? []).length).toBe(5);
    expect(html).not.toContain('href="/log-meal?edit=meal-');
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
    expect(html).toMatch(/<ul class="app-card rounded-\[var\(--radius-lg\)\] border [^"]*"/);
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

  // Ledger 1152a: off Home too, each kebab is named after its meal (Home's naming, no "Actions").
  it("not grouped (/meals) keeps a card per meal, each kebab named after its meal", () => {
    const [html] = shownSlides(renderList(3, "/meals"));
    expect(html).toMatch(/<ul class="flex flex-col gap-2">/);
    expect(html).not.toContain("not-first:before");
    expect(html).not.toContain('aria-label="Actions"');
    for (const i of [0, 1, 2]) expect(html).toContain(`aria-label="Food ${i} actions"`);
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

// Ledger 1121: Home's Food log is a fixed height. Each paged row is the date
// line plus ONE food line (ledger 1143: the first plate, the first two names
// cut short, "+N" for the rest, no stars), no notes, and it opens the whole
// meal in `MealSheet` instead of the edit page.
describe("Home's fixed-height row and the full-meal sheet (ledger 1121)", () => {
  const meal = (names: string[], extra: Partial<MealItem> = {}): MealItem => ({
    ...baseMeal,
    foods: names.map((name, i) => food({ id: `food-${i}`, slug: name.toLowerCase(), name })),
    ...extra,
  });
  const renderRow = (m: MealItem, onOpen: (meal: MealItem) => void = () => {}) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement("ul", null, createElement(MealCard, { meal: m, onRequestDelete: () => {}, grouped: true, onOpen }))),
      ),
    ).replace(/<!-- -->/g, "");
  };
  /** The row's food line: everything inside its button. */
  const foodLine = (html: string) => /<button type="button" aria-haspopup="dialog"[^>]*>([\s\S]*)<\/button>/.exec(html)![1]!;
  const NAMES = '<span class="min-w-0 truncate text-sm leading-[1.3] font-medium text-[var(--color-text)]">';
  const FIVE = ["Sweet Potato", "Broccoli", "Carrot", "Lentils", "Spinach"];

  it("one 34px line: the first plate, the first two names joined in one truncating span, then +N (1/2/3/5 foods: none/none/+1/+3)", () => {
    const cases: [string[], string, string | null][] = [
      [["Egg"], "Egg", null],
      [["Egg", "Pear"], "Egg, Pear", null],
      [["Pear", "Oats", "Yogurt"], "Pear, Oats", "+1"],
      [FIVE, "Sweet Potato, Broccoli", "+3"],
    ];
    for (const [names, shown, badge] of cases) {
      const line = foodLine(renderRow(meal(names)));
      expect(line.startsWith('<span class="flex h-[34px] items-center gap-2">'), names.join()).toBe(true);
      expect((line.match(/<span class="flex h-\[34px\]/g) ?? []).length).toBe(1);
      expect(line).toContain(`${NAMES}${shown}</span>`);
      const counts = line.match(/>\+\d+</g) ?? [];
      expect(counts, names.join()).toEqual(badge ? [`>${badge}<`] : []);
      if (badge) {
        expect(line).toMatch(new RegExp(`<span class="mr-2 shrink-0"><span class="[^"]*text-\\[var\\(--color-count-text\\)\\][^"]*">\\${badge}<span class="sr-only"> more</span></span></span></span>$`));
      }
    }
    // Only the first food's plate leads the line: the same as a one-food meal's.
    const plate = (names: string[]) => foodLine(renderRow(meal(names))).split(NAMES)[0];
    expect(plate(FIVE)).toBe(plate(["Sweet Potato"]));
    expect(plate(FIVE)).not.toBe(plate(["Broccoli"]));
  });

  const plateFood = (n: number, name: string, rating: number | null, deleted?: boolean) => ({
    kind: "food" as const,
    id: `00000000-0000-4000-8000-0000000000${10 + n}`,
    food: { id: `00000000-0000-4000-8000-0000000000${20 + n}`, slug: name.toLowerCase(), name, category: "fruit" as const, ...(deleted && { deleted }) },
    rating,
  });

  it("a deleted food keeps its muted mark on the row", () => {
    const html = renderRow({ ...baseMeal, items: [plateFood(0, "Zucchini", null, true), plateFood(1, "Mango", null)] });
    expect(foodLine(html)).toContain(`${NAMES}<span>Zucchini<span class="font-normal text-[var(--color-text-muted)]">\u00a0(deleted)</span>, Mango</span></span>`);
  });

  it("no stars on the row, even for rated foods; the sheet lists every food with its stars", () => {
    const rated: MealItem = { ...baseMeal, items: FIVE.map((name, i) => plateFood(i, name, i + 1)) };
    const html = renderRow(rated);
    expect(html).not.toContain('role="img"');
    expect(html).not.toMatch(/Rated \d star/);
    const el = (MealSheet as unknown as (p: unknown) => El)({ meal: rated, onClose: () => {}, onRequestDelete: () => {} });
    const sheet = renderToString(createElement(MemoryRouter, null, el.props.children as never)).replace(/<!-- -->/g, "");
    FIVE.forEach((name, i) => expect(sheet).toMatch(new RegExp(`>${name}</span><span role="img" aria-label="Rated ${i + 1} stars?"`)));
  });

  it("the row never wraps: names truncate, the header never wraps and its date is cut short before the kebab moves", () => {
    const html = renderRow(meal(["A very long custom food name that would wrap twice", "Pear"]));
    expect(html).toContain(NAMES);
    expect(html).not.toContain("break-words");
    expect(html).toMatch(/<div class="flex items-center justify-between gap-x-2"><span class="min-w-0 truncate text-xs text-\[var\(--color-text-muted\)\]">/);
    expect(html).not.toContain("flex-wrap");
  });

  it("notes and the reaction note wait in the sheet, so they never change a row's height", () => {
    const html = renderRow(meal(["Egg"], { notes: "ate it all", reactionNote: "mild rash" }));
    expect(html).not.toContain("ate it all");
    expect(html).not.toContain("mild rash");
  });

  it("the From storage badge is the 📦 alone at every width (ledger 1159a), still named for screen readers", () => {
    const html = renderRow(meal(["Egg"], { foods: [food({ name: "Egg", storageItemId: "s-1" })] }));
    expect(html).toMatch(/<span [^>]*title="From storage"[^>]*>📦<span class="sr-only"> From storage<\/span><\/span>/);
  });

  it("the row is a button named by its lines (no edit link); a tap hands the meal to onOpen", () => {
    const m = meal(FIVE);
    const html = renderRow(m);
    expect(html).not.toContain('href="/log-meal?edit=');
    expect(html).toMatch(/<button type="button" aria-haspopup="dialog" class="-mt-1 block [^"]*after:absolute after:inset-0[^"]* w-full text-left">/);
    const opened: MealItem[] = [];
    const li = (MealCard as unknown as (p: unknown) => El)({ meal: m, onRequestDelete: () => {}, grouped: true, onOpen: (x: MealItem) => opened.push(x) });
    (findElement(li, "button")!.props.onClick as () => void)();
    expect(opened).toEqual([m]);
    // The kebab keeps Edit and Delete, above the stretched target.
    expect(findElement(li, MealActionsMenu)!.props.mealId).toBe(m.id);
  });

  it("the sheet shows every line with its stars, the badge, notes and reaction, Edit and Delete", () => {
    const m = meal(FIVE, { notes: "ate it all", reactionNote: "mild rash", foods: FIVE.map((name, i) => food({ id: `f${i}`, name, storageItemId: i === 0 ? "s-1" : null })) });
    const asked: MealItem[] = [];
    const el = (MealSheet as unknown as (p: unknown) => El)({ meal: m, onClose: () => {}, onRequestDelete: (x: MealItem) => asked.push(x) });
    expect(el.props.open).toBe(true);
    expect(el.props.title).toBe(servedLine(m.servedAt));
    expect(el.props.showClose).toBe(true);
    const html = renderToString(createElement(MemoryRouter, null, el.props.children as never)).replace(/<!-- -->/g, "");
    for (const name of FIVE) expect(html).toContain(`>${name}<`);
    expect(html).not.toContain("+4 more");
    expect(html).toContain("📦 From storage");
    expect(html).toContain("ate it all");
    expect(html).toContain("Reaction: mild rash");
    expect(html).toMatch(/<a class="[^"]*" href="\/log-meal\?edit=meal-1"[^>]*>Edit<\/a>/);
    (findElement(el.props.children, Button)!.props.onClick as () => void)();
    expect(asked).toEqual([m]);
    expect((MealSheet as unknown as (p: unknown) => El)({ meal: null, onClose: () => {}, onRequestDelete: () => {} }).props.open).toBe(false);
  });
});
