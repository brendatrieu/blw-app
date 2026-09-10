import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FridgeItem } from "@blw/shared";
import { fridgeKeys } from "../features/fridge/hooks.js";
import { FridgeDetailPage } from "./FridgeDetailPage.js";
import { fridgeMenuRows } from "../features/fridge/components/FridgeItemActionsMenu.js";

// `FridgeDetailPage` reads `:id` via `useParams`, which only resolves inside
// a matching `<Route>` — a bare `MemoryRouter` (fine for FridgeEditPage's
// id-independent loading-state test) leaves `id` undefined, so every render
// here goes through an actual `Route` at the real path.
function renderAtFridgeDetailRoute(itemId: string) {
  return createElement(
    MemoryRouter,
    { initialEntries: [`/fridge/${itemId}`] },
    createElement(Routes, null, createElement(Route, { path: "/fridge/:id", element: createElement(FridgeDetailPage, null) })),
  );
}

const ITEM: FridgeItem = {
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
  expiresAt: new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(),
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: 6,
  servingsLeft: 2,
  bestBy: null,
  notes: "smells great",
};

describe("FridgeDetailPage", () => {
  it("renders the loading state (Back control, skeleton) while both fridge views are still loading", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, renderAtFridgeDetailRoute(ITEM.id)),
    );
    expect(html).toContain("Back");
    expect(html).not.toContain(ITEM.foodName!);
  });

  it("renders the found item's title, servings, and notes once loaded from the active view", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(fridgeKeys.list("active"), { items: [ITEM] });
    queryClient.setQueryData(fridgeKeys.list("history"), { items: [] });

    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, renderAtFridgeDetailRoute(ITEM.id)),
    );

    expect(html).toContain("Avocado");
    expect(html).toContain("2 of 6 servings left");
    expect(html).toContain("smells great");
    // The card renders standalone here, not as a Link to itself.
    expect(html).not.toContain(`href="/fridge/${ITEM.id}"`);
  });

  it("finds a finished item from the history view and offers Restore instead of Remove/Edit", () => {
    const finished: FridgeItem = { ...ITEM, status: "finished" };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(fridgeKeys.list("active"), { items: [] });
    queryClient.setQueryData(fridgeKeys.list("history"), { items: [finished] });

    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, renderAtFridgeDetailRoute(finished.id)),
    );

    // The detail card carries the same kebab as every list; its rows only
    // render open, so pin the trigger here and the row set via the pure resolver.
    expect(html).toContain('aria-label="Actions"');
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain(">Remove<");
    expect(html).not.toContain("Restore to active");
    expect(fridgeMenuRows(finished, { hasBaby: true, canRestore: true })).toEqual(["restore"]);
  });
});
