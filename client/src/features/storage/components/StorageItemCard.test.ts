import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { StorageItem } from "@blw/shared";
import { CelebrationProvider } from "../../../components/ui/Celebration.js";
import { StorageItemCard, storageItemCluster, storageItemEmoji } from "./StorageItemCard.js";

/** A container food, as the server now sends them (item 347). */
function itemFood(slug: string, name: string, emoji: string | null = null) {
  return { id: `food-${slug}`, slug, name, emoji };
}

const BASE_ITEM: StorageItem = {
  id: "11111111-1111-1111-1111-111111111111",
  label: null,
  foods: [itemFood("avocado", "Avocado")],
  recipeId: null,
  recipeTitle: null,
  preparedAt: "2026-08-20T10:00:00.000Z",
  location: "fridge",
  status: "active",
  statusChangedAt: "2026-08-20T10:00:00.000Z",
  expiresAt: "2026-08-23T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: null,
  servingsLeft: null,
  bestBy: null,
  notes: null,
};

/** A `YYYY-MM-DD` best-by date `days` from today on the LOCAL calendar — the
 * same clock `resolveFreshness` compares against, so these pins mean the same
 * thing in every timezone and on every day the suite is run. */
function ymd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface RenderOptions {
  linkable?: boolean;
  actions?: ReactNode;
}

function renderCard(item: StorageItem, options: RenderOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        CelebrationProvider,
        null,
        createElement(
          MemoryRouter,
          null,
          createElement("ul", null, createElement(StorageItemCard, { item, busy: false, ...options })),
        ),
      ),
    ),
  );
}

describe("StorageItemCard (render)", () => {
  it("shows the derived use-within countdown when untracked and no best-by is set", () => {
    const html = renderCard({ ...BASE_ITEM, expiresAt: new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString() });
    expect(html).not.toContain("servings left");
    expect(html).not.toContain("Best by");
    expect(html).toMatch(/Use within/);
  });

  it("shows 'N of M servings left' when the item is servings-tracked", () => {
    const html = renderCard({ ...BASE_ITEM, servingsTotal: 6, servingsLeft: 2 });
    expect(html).toContain("2 of 6 servings left");
  });

  it("shows the best-by label instead of the derived countdown when bestBy is set", () => {
    const html = renderCard({ ...BASE_ITEM, bestBy: "2026-08-29" });
    expect(html).toContain("Best by Sat, Aug 29");
    expect(html).not.toMatch(/Use within/);
  });

  it("shows the freshness badge AND the best-by date together — the badge warns, the date says why", () => {
    const html = renderCard({ ...BASE_ITEM, bestBy: ymd(-1) });
    expect(html).toContain("Expired");
    expect(html).toContain("Best by");
  });

  it("hides the Serve action for a label-only item (nothing the serve endpoint could log)", () => {
    const html = renderCard({ ...BASE_ITEM, foods: [], label: "Leftover soup" }, {});
    expect(html).not.toMatch(/>Serve</);
  });

  it("shows the item's general note when set", () => {
    const html = renderCard({ ...BASE_ITEM, notes: "smells a little off, use soon" });
    expect(html).toContain("smells a little off, use soon");
  });

  it("omits any note line when unset", () => {
    const html = renderCard(BASE_ITEM);
    expect(html).not.toContain("smells a little off");
  });

  it("renders the actions slot content next to the location badge", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          CelebrationProvider,
          null,
          createElement(
            MemoryRouter,
            null,
            createElement(
              "ul",
              null,
              createElement(StorageItemCard, {
                item: BASE_ITEM,
                busy: false,
                actions: createElement("button", { type: "button" }, "Actions slot marker"),
              }),
            ),
          ),
        ),
      ),
    );
    expect(html).toContain("Actions slot marker");
  });
});

describe("StorageItemCard tap-through link (item 139)", () => {
  it("wraps the info block in a Link to /storage/:id by default", () => {
    const html = renderCard(BASE_ITEM);
    expect(html).toContain(`href="/storage/${BASE_ITEM.id}"`);
  });

  it("keeps the kebab/actions slot outside the anchor (no nested-interactive markup)", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          CelebrationProvider,
          null,
          createElement(
            MemoryRouter,
            null,
            createElement(
              "ul",
              null,
              createElement(StorageItemCard, {
                item: BASE_ITEM,
                busy: false,
                actions: createElement("button", { type: "button" }, "Actions slot marker"),
              }),
            ),
          ),
        ),
      ),
    );
    // The anchor's own markup ends before the actions slot content appears —
    // a crude but effective check that the button isn't nested inside it.
    const anchorClose = html.indexOf("</a>");
    const actionsIndex = html.indexOf("Actions slot marker");
    expect(anchorClose).toBeGreaterThan(-1);
    expect(actionsIndex).toBeGreaterThan(anchorClose);
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
  });

  it("stretches the anchor over the whole card and floats the actions slot above it", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          CelebrationProvider,
          null,
          createElement(
            MemoryRouter,
            null,
            createElement(
              "ul",
              null,
              createElement(StorageItemCard, {
                item: BASE_ITEM,
                busy: false,
                actions: createElement("button", { type: "button" }, "Actions slot marker"),
              }),
            ),
          ),
        ),
      ),
    );
    expect(html).toMatch(/<li class="relative /);
    expect(html).toMatch(/<a [^>]*class="[^"]*after:absolute after:inset-0[^"]*"[^>]*href="\/storage\//);
    expect(html).toMatch(/<div class="relative z-10 [^"]*">(?:(?!<\/div>).)*Actions slot marker/s);
  });

  it("renders the info block as plain content (no anchor) when linkable is false", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          CelebrationProvider,
          null,
          createElement(
            MemoryRouter,
            null,
            createElement("ul", null, createElement(StorageItemCard, { item: BASE_ITEM, busy: false, linkable: false })),
          ),
        ),
      ),
    );
    expect(html).not.toContain(`href="/storage/${BASE_ITEM.id}"`);
    expect(html).not.toContain("<a ");
  });
});

describe("StorageItemCard action row (items 262/264)", () => {
  it("renders no footer row at all for a list card (kebab-only, item 264)", () => {
    const html = renderCard(BASE_ITEM, {});
    expect(html).not.toContain(">Serve<");
    expect(html).not.toContain(">Remove<");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain("border-t border-[var(--color-border)] pt-2");
  });

  it("has no footer path left at all — the detail page passes the kebab like every list (item 264)", () => {
    const html = renderCard(BASE_ITEM, { actions: createElement("button", { type: "button" }, "Kebab marker") });
    expect(html).toContain("Kebab marker");
    expect(html).not.toContain("border-t border-[var(--color-border)] pt-2");
    expect(html).not.toContain(">Serve<");
    expect(html).not.toContain(">Remove<");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain("Restore to active");
  });

});

// Item 333: the chip used to come from the server's window-derived flags and
// ignore the best-by date entirely, so two containers with the same date
// disagreed whenever their foods carried different storage windows.
describe("StorageItemCard freshness chip (item 333)", () => {
  it("badges a past best-by Expired, whatever the server's flags say", () => {
    const html = renderCard({ ...BASE_ITEM, bestBy: ymd(-1), expired: false, useSoon: false });
    expect(html).toContain("Expired");
    expect(html).not.toContain("Use soon");
    expect(html).toContain("Best by");
  });

  it("badges a best-by today, and one tomorrow, Use soon", () => {
    for (const offset of [0, 1]) {
      const html = renderCard({ ...BASE_ITEM, bestBy: ymd(offset), expired: false, useSoon: false });
      expect(html).toContain("Use soon");
      expect(html).not.toContain(">Expired<");
      expect(html).toContain("Best by");
    }
  });

  it("badges a best-by further out with nothing at all, and still shows the date", () => {
    const html = renderCard({ ...BASE_ITEM, bestBy: ymd(5), expired: false, useSoon: false });
    expect(html).not.toContain("Use soon");
    expect(html).not.toContain(">Expired<");
    expect(html).toContain("Best by");
    expect(html).not.toMatch(/Use within/);
  });

  it("lets a future best-by clear a server-expired item's badge", () => {
    const html = renderCard({ ...BASE_ITEM, bestBy: ymd(5), expired: true, useSoon: true });
    expect(html).not.toContain(">Expired<");
    expect(html).not.toContain("Use soon");
  });

  it("falls back to the server's flags, and the countdown, with no best-by date", () => {
    const soon = renderCard({ ...BASE_ITEM, bestBy: null, useSoon: true });
    expect(soon).toContain("Use soon");
    // The countdown is dropped once a badge is warning — "Expired" under an
    // Expired badge says nothing new.
    expect(soon).not.toMatch(/Use within/);

    const fresh = renderCard({
      ...BASE_ITEM,
      bestBy: null,
      expiresAt: new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(),
    });
    expect(fresh).toMatch(/Use within/);
    expect(fresh).not.toContain("Use soon");
  });

  it("shows no freshness row at all on a finished or discarded item", () => {
    const html = renderCard({ ...BASE_ITEM, status: "finished", bestBy: ymd(-1) });
    expect(html).toContain("Finished");
    expect(html).not.toContain(">Expired<");
    expect(html).not.toContain("Best by");
  });
});

// Item 347: a storage container holds a whole meal, so its card reads like a
// meal row — the emoji cluster and the comma-joined names, sharing
// `emojiCluster` with `MealCard` rather than a second copy of the rule.
describe("StorageItemCard food cluster (item 347)", () => {
  const threeFoods = [itemFood("chicken", "Chicken"), itemFood("carrot", "Carrot"), itemFood("rice", "Rice")];

  it("titles a multi-food container with every name, comma-joined in saved order", () => {
    expect(renderCard({ ...BASE_ITEM, foods: threeFoods })).toContain("Chicken, Carrot, Rice");
  });

  it("renders one emoji per food as a single aria-hidden run, with no overflow count at three", () => {
    const html = renderCard({ ...BASE_ITEM, foods: threeFoods });
    const { emojis, overflow } = storageItemCluster({ ...BASE_ITEM, foods: threeFoods });
    expect(emojis).toHaveLength(3);
    expect(overflow).toBe(0);
    expect(html).toMatch(new RegExp(`<span aria-hidden="true" class="[^"]*text-xl[^"]*">${emojis.join("")}`));
    expect(html).not.toMatch(/\+(?:<!-- -->)?\d/);
  });

  it("caps the cluster at three and shows a +N for the rest", () => {
    const foods = Array.from({ length: 5 }, (_, i) => itemFood("avocado", `Food ${i}`));
    const html = renderCard({ ...BASE_ITEM, foods });
    expect(storageItemCluster({ ...BASE_ITEM, foods }).emojis).toHaveLength(3);
    expect(html).toMatch(/\+(?:<!-- -->)?2/);
  });

  it("renders a one-food container exactly as it always did: one emoji, one name", () => {
    const html = renderCard(BASE_ITEM);
    expect(html).toContain("Avocado");
    expect(storageItemCluster(BASE_ITEM)).toEqual({ emojis: ["🥑"], overflow: 0 });
    expect(html).not.toMatch(/\+(?:<!-- -->)?\d/);
  });

  it("prefers a custom food's own emoji over the slug map", () => {
    const foods = [itemFood("made-up-thing", "Priya's mash", "🫐")];
    expect(storageItemCluster({ ...BASE_ITEM, foods }).emojis).toEqual(["🫐"]);
  });

  it("uses the same markup the meal row does — a shrink-0 flex run, so a long title never squeezes it", () => {
    const html = renderCard({ ...BASE_ITEM, foods: threeFoods });
    expect(html).toContain('<span aria-hidden="true" class="flex shrink-0 items-center text-xl leading-none">');
  });

  it("falls back to one stand-in glyph for a recipe container and for a label-only one", () => {
    const recipe = { ...BASE_ITEM, foods: [], recipeId: "r1", recipeTitle: "Iron-Rich Purée" };
    expect(storageItemCluster(recipe)).toEqual({ emojis: ["🍲"], overflow: 0 });
    expect(renderCard(recipe)).toContain("Iron-Rich Purée");

    const labelOnly = { ...BASE_ITEM, foods: [], label: "Leftover soup" };
    expect(storageItemCluster(labelOnly)).toEqual({ emojis: ["📝"], overflow: 0 });
    expect(renderCard(labelOnly)).toContain("Leftover soup");
  });
});

// The single-glyph form the detail page's PageHeader needs, which has room
// for exactly one.
describe("storageItemEmoji", () => {
  it("is the first food's emoji for a food container", () => {
    expect(storageItemEmoji({ ...BASE_ITEM, foods: [itemFood("chicken", "Chicken"), itemFood("rice", "Rice")] })).toBe(
      "🍗",
    );
  });

  it("is a pot for a recipe container and a note for a label-only one", () => {
    expect(storageItemEmoji({ ...BASE_ITEM, foods: [], recipeTitle: "Iron-Rich Purée" })).toBe("🍲");
    expect(storageItemEmoji({ ...BASE_ITEM, foods: [], label: "Leftover soup" })).toBe("📝");
  });
});
