import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { PantryItem } from "@blw/shared";
import { CelebrationProvider } from "../../../components/ui/Celebration.js";
import { PantryItemActionsMenu } from "./PantryItemActionsMenu.js";

const BASE_ITEM: PantryItem = {
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

function renderMenu(item: PantryItem = BASE_ITEM) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        CelebrationProvider,
        null,
        createElement(MemoryRouter, null, createElement(PantryItemActionsMenu, { item, babyId: "baby-1" })),
      ),
    ),
  );
}

describe("PantryItemActionsMenu (render)", () => {
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
