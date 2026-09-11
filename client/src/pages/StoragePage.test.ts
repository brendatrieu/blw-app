import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby, StorageItem } from "@blw/shared";
import { CelebrationProvider } from "../components/ui/Celebration.js";
import { babyKeys } from "../features/babies/api.js";
import { storageKeys } from "../features/storage/hooks.js";
import { StoragePage } from "./StoragePage.js";

const BABY: Baby = {
  id: "baby-1",
  name: "Baby",
  birthDate: "2026-01-01",
  notes: null,
  archived: false,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const ITEM: StorageItem = {
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

function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(babyKeys.list(false), [BABY]);
  queryClient.setQueryData(storageKeys.list("active"), { items: [ITEM] });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        CelebrationProvider,
        null,
        createElement(MemoryRouter, { initialEntries: ["/storage"] }, createElement(StoragePage, null)),
      ),
    ),
  );
}

describe("StoragePage cards (item 264 — kebab everywhere)", () => {
  const html = render();

  it("gives each card the same three-dot Actions menu Home uses", () => {
    expect(html).toContain('aria-label="Actions"');
    expect(html).toContain('aria-haspopup="menu"');
  });

  it("drops the Serve/Remove/Edit footer row from the list card entirely", () => {
    expect(html).not.toContain(">Serve<");
    expect(html).not.toContain(">Remove<");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain("Restore to active");
    expect(html).not.toContain("border-t border-[var(--color-border)] pt-2");
  });

  it("keeps the card body a stretched link into the item's detail page", () => {
    expect(html).toMatch(/<a [^>]*class="[^"]*after:absolute after:inset-0[^"]*"[^>]*href="\/storage\//);
  });

  it("keeps the page's own header untouched — no chevron on a tab root", () => {
    expect(html).toContain("Storage</h1>");
    expect(html).not.toContain('<span class="sr-only">Back</span>');
    expect(html).toMatch(/<a [^>]*href="\/storage\/add"/);
  });
});
