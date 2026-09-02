import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Baby, PantryItem } from "@blw/shared";
import { babyKeys } from "../features/babies/api.js";
import { pantryKeys } from "../features/pantry/hooks.js";
import { trackingKeys } from "../features/tracking/hooks.js";
import { DashboardPage } from "./DashboardPage.js";

describe("DashboardPage", () => {
  it("renders without throwing (no active baby yet, in the loading/empty states)", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(DashboardPage, null)),
      ),
    );
    // With no babies loaded yet the page is in its loading skeleton state —
    // this is primarily a smoke test that the new sheet-based wiring doesn't
    // crash render, matching the loading branch already covered elsewhere.
    expect(typeof html).toBe("string");
  });

  it("renders an Expiring soon row's Actions menu trigger once a baby and a pantry item are loaded", () => {
    const baby: Baby = {
      id: "baby-1",
      name: "Baby",
      birthDate: "2026-01-01",
      notes: null,
      archived: false,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const item: PantryItem = {
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
      servingsTotal: null,
      servingsLeft: null,
      bestBy: null,
      notes: null,
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [baby]);
    queryClient.setQueryData(pantryKeys.list("active"), { items: [item] });
    queryClient.setQueryData(trackingKeys.allergenProgress(baby.id), { items: [] });
    queryClient.setQueryData([...trackingKeys.meals(baby.id), { limit: 100 }], { items: [] });

    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(DashboardPage, null)),
      ),
    );

    expect(html).toContain('aria-label="Actions"');
    expect(html).toContain('aria-haspopup="menu"');
  });

  it("titles the pantry section 'Pantry' with a See all link to /pantry, and no leftover greeting card", () => {
    const baby: Baby = {
      id: "baby-1",
      name: "Baby",
      birthDate: "2026-01-01",
      notes: null,
      archived: false,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [baby]);
    queryClient.setQueryData(pantryKeys.list("active"), { items: [] });
    queryClient.setQueryData(trackingKeys.allergenProgress(baby.id), { items: [] });
    queryClient.setQueryData([...trackingKeys.meals(baby.id), { limit: 100 }], { items: [] });

    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(DashboardPage, null)),
      ),
    );

    expect(html).toContain(">Pantry<");
    expect(html).toContain(">See all<");
    expect(html).not.toContain("Expiring soon");
    expect(html).not.toContain("See pantry");
    expect(html).not.toContain("👋");
    expect(html).not.toContain("months old");
  });
});
