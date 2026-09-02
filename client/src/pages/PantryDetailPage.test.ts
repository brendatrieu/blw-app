import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { PantryItem } from "@blw/shared";
import { pantryKeys } from "../features/pantry/hooks.js";
import { PantryDetailPage } from "./PantryDetailPage.js";

// `PantryDetailPage` reads `:id` via `useParams`, which only resolves inside
// a matching `<Route>` — a bare `MemoryRouter` (fine for PantryEditPage's
// id-independent loading-state test) leaves `id` undefined, so every render
// here goes through an actual `Route` at the real path.
function renderAtPantryDetailRoute(itemId: string) {
  return createElement(
    MemoryRouter,
    { initialEntries: [`/pantry/${itemId}`] },
    createElement(Routes, null, createElement(Route, { path: "/pantry/:id", element: createElement(PantryDetailPage, null) })),
  );
}

const ITEM: PantryItem = {
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

describe("PantryDetailPage", () => {
  it("renders the loading state (Back control, skeleton) while both pantry views are still loading", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, renderAtPantryDetailRoute(ITEM.id)),
    );
    expect(html).toContain("Back");
    expect(html).not.toContain(ITEM.foodName!);
  });

  it("renders the found item's title, servings, and notes once loaded from the active view", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(pantryKeys.list("active"), { items: [ITEM] });
    queryClient.setQueryData(pantryKeys.list("history"), { items: [] });

    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, renderAtPantryDetailRoute(ITEM.id)),
    );

    expect(html).toContain("Avocado");
    expect(html).toContain("2 of 6 servings left");
    expect(html).toContain("smells great");
    // The card renders standalone here, not as a Link to itself.
    expect(html).not.toContain(`href="/pantry/${ITEM.id}"`);
  });

  it("finds a finished item from the history view and offers Restore instead of Remove/Edit", () => {
    const finished: PantryItem = { ...ITEM, status: "finished" };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(pantryKeys.list("active"), { items: [] });
    queryClient.setQueryData(pantryKeys.list("history"), { items: [finished] });

    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, renderAtPantryDetailRoute(finished.id)),
    );

    expect(html).toContain("Restore to active");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain(">Remove<");
  });
});
