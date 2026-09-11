import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { StorageItem } from "@blw/shared";
import { CelebrationProvider } from "../../../components/ui/Celebration.js";
import {
  STORAGE_MENU_ROW_LABEL,
  storageMenuRows,
  StorageItemActionsMenu,
  type StorageItemActionsMenuProps,
} from "./StorageItemActionsMenu.js";

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

function renderMenu(item: StorageItem = BASE_ITEM, props: Partial<StorageItemActionsMenuProps> = {}) {
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
          createElement(StorageItemActionsMenu, { item, babyId: "baby-1", ...props }),
        ),
      ),
    ),
  );
}

describe("StorageItemActionsMenu (render)", () => {
  it("renders a closed Actions trigger with menu ARIA wiring", () => {
    const html = renderMenu();
    expect(html).toContain('aria-label="Actions"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    // The menu panel and the Serve sheet are both closed by default.
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain('role="dialog"');
  });

  it("still renders a closed trigger for a label-only item (Serve is withheld, not the whole menu)", () => {
    const html = renderMenu({ ...BASE_ITEM, foodSlug: null, foodName: null, label: "Leftover soup" });
    expect(html).toContain('aria-label="Actions"');
  });

  it("still renders a closed trigger for a finished item (every action withheld, menu itself still present)", () => {
    const html = renderMenu({ ...BASE_ITEM, status: "finished" });
    expect(html).toContain('aria-label="Actions"');
  });
});

describe("storageMenuRows (item 264 — the kebab is a list card's only action surface)", () => {
  const labels = (rows: ReturnType<typeof storageMenuRows>) => rows.map((row) => STORAGE_MENU_ROW_LABEL[row]);
  const active = { status: "active" as const, foodSlug: "avocado", recipeTitle: null };

  it("offers Serve, Edit and Remove for an active item, in that order", () => {
    expect(labels(storageMenuRows(active, { hasBaby: true, canRestore: true }))).toEqual([
      "Serve",
      "Edit",
      "Remove",
    ]);
  });

  it("withholds Serve when no baby has resolved yet — not the whole menu", () => {
    expect(labels(storageMenuRows(active, { hasBaby: false, canRestore: true }))).toEqual(["Edit", "Remove"]);
  });

  it("withholds Serve for a label-only item but keeps Edit and Remove", () => {
    const labelOnly = { status: "active" as const, foodSlug: null, recipeTitle: null };
    expect(labels(storageMenuRows(labelOnly, { hasBaby: true, canRestore: true }))).toEqual(["Edit", "Remove"]);
  });

  it("offers Restore to active — and only that — for a finished item", () => {
    const finished = { status: "finished" as const, foodSlug: "avocado", recipeTitle: null };
    expect(labels(storageMenuRows(finished, { hasBaby: true, canRestore: true }))).toEqual(["Restore to active"]);
  });

  it("offers Restore for a discarded item too", () => {
    const discarded = { status: "discarded" as const, foodSlug: "avocado", recipeTitle: null };
    expect(labels(storageMenuRows(discarded, { hasBaby: true, canRestore: true }))).toEqual(["Restore to active"]);
  });

  it("shows no rows at all for a caller with no restore handler (Home) on a finished item", () => {
    const finished = { status: "finished" as const, foodSlug: "avocado", recipeTitle: null };
    expect(storageMenuRows(finished, { hasBaby: true, canRestore: false })).toEqual([]);
  });
});
