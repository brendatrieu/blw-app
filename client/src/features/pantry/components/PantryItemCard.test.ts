import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { PantryItem } from "@blw/shared";
import { CelebrationProvider } from "../../../components/ui/Celebration.js";
import { buildServeInput, PantryItemCard, ServeControl } from "./PantryItemCard.js";

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

interface RenderOptions {
  babyId?: string;
  editHref?: string;
  onFinish?: () => void;
  onDiscard?: () => void;
  onRestore?: () => void;
}

function renderCard(item: PantryItem, options: RenderOptions = {}) {
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
          createElement("ul", null, createElement(PantryItemCard, { item, busy: false, ...options })),
        ),
      ),
    ),
  );
}

describe("PantryItemCard (render)", () => {
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

  it("shows the Serve action when a babyId is given for an active, food-sourced item", () => {
    const html = renderCard(BASE_ITEM, { babyId: "baby-1" });
    expect(html).toMatch(/>Serve</);
  });

  it("hides the Serve action when no babyId is given", () => {
    const html = renderCard(BASE_ITEM);
    expect(html).not.toMatch(/>Serve</);
  });

  it("hides the Serve action for a label-only item (nothing the serve endpoint could log)", () => {
    const html = renderCard(
      { ...BASE_ITEM, foodSlug: null, foodName: null, label: "Leftover soup" },
      { babyId: "baby-1" },
    );
    expect(html).not.toMatch(/>Serve</);
  });

  it("hides the Serve action for a non-active item even with a babyId", () => {
    const html = renderCard({ ...BASE_ITEM, status: "finished" }, { babyId: "baby-1" });
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
              createElement(PantryItemCard, {
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

describe("buildServeInput (item 108)", () => {
  it("passes babyId and servings through and trims both notes to null when blank", () => {
    expect(buildServeInput("baby-1", 3, "  ", "")).toEqual({
      babyId: "baby-1",
      servings: 3,
      reactionNote: null,
      notes: null,
    });
  });

  it("keeps trimmed note text", () => {
    expect(buildServeInput("baby-1", 1, " mild rash ", " froze the rest ")).toEqual({
      babyId: "baby-1",
      servings: 1,
      reactionNote: "mild rash",
      notes: "froze the rest",
    });
  });
});

describe("ServeControl startExpanded (kebab-menu path)", () => {
  function renderServe(startExpanded?: boolean) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          CelebrationProvider,
          null,
          createElement(MemoryRouter, null, createElement(ServeControl, { item: BASE_ITEM, babyId: "baby-1", startExpanded })),
        ),
      ),
    );
  }

  it("renders the stepper immediately with no inner Serve button when startExpanded", () => {
    const html = renderServe(true);
    expect(html).toContain(">Confirm<");
    expect(html).not.toContain(">Serve<");
  });

  it("still starts collapsed by default (Pantry page path)", () => {
    const html = renderServe();
    expect(html).toContain(">Serve<");
    expect(html).not.toContain(">Confirm<");
  });
});
