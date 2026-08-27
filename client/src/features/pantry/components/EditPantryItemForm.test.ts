import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { PantryItem } from "@blw/shared";
import { EditPantryItemForm } from "./EditPantryItemForm.js";

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
  expiresAt: "2026-08-23T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: "2 cubes left",
};

function renderForm(item: PantryItem = ITEM) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(QueryClientProvider, { client: queryClient }, createElement(EditPantryItemForm, { item, onDone: () => {} })),
  );
}

describe("EditPantryItemForm (render)", () => {
  it("renders location segments, the Prepared field, and the quantity note prefilled from the item", () => {
    const html = renderForm();
    expect(html).toContain(">Location<");
    expect(html).toContain(">Prepared<");
    expect(html).toContain("Quantity note (optional)");
    expect(html).toContain("2 cubes left");
  });

  it("marks the item's current location segment as pressed", () => {
    const html = renderForm();
    expect(html).toMatch(/aria-pressed="true"[^>]*>\s*Fridge/);
  });

  it("renders Save (not Saving…) and Cancel while idle", () => {
    const html = renderForm();
    expect(html).toContain(">Save<");
    expect(html).toContain(">Cancel<");
  });
});
