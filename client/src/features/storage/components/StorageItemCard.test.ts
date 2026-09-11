import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { StorageItem } from "@blw/shared";
import { CelebrationProvider } from "../../../components/ui/Celebration.js";
import { StorageItemCard } from "./StorageItemCard.js";

const BASE_ITEM: StorageItem = {
  id: "11111111-1111-1111-1111-111111111111",
  label: null,
  foodSlug: "avocado",
  foodName: "Avocado",
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

  it("shows the Expired badge AND the best-by date together (badges warn, the date informs)", () => {
    const html = renderCard({ ...BASE_ITEM, bestBy: "2026-08-29", expired: true });
    expect(html).toContain("Expired");
    expect(html).toContain("Best by Sat, Aug 29");
  });

  it("hides the Serve action for a label-only item (nothing the serve endpoint could log)", () => {
    const html = renderCard({ ...BASE_ITEM, foodSlug: null, foodName: null, label: "Leftover soup" }, {});
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
