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
  servingsTotal: null,
  servingsLeft: null,
  bestBy: null,
  notes: null,
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
    expect(html).toMatch(/Quantity note(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
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

  it("renders the Total servings and Best by fields, unset for an untracked item", () => {
    const html = renderForm();
    expect(html).toMatch(/Total servings(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/Best by(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toContain("Select a date");
  });

  it("prefills Total servings and the Best by value from a tracked item", () => {
    const html = renderForm({ ...ITEM, servingsTotal: 6, servingsLeft: 2, bestBy: "2026-08-29" });
    expect(html).toMatch(/id="pantry-edit-servings"[^>]*value="6"/);
    expect(html).toContain("Aug 29, 2026");
  });

  it("renders the Notes field, empty for an item with no note", () => {
    const html = renderForm();
    expect(html).toMatch(/Notes(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
  });

  it("prefills Notes from the item's stored value", () => {
    const html = renderForm({ ...ITEM, notes: "PANTRY-NOTES-FIXTURE unlike the placeholder" });
    expect(html).toContain("PANTRY-NOTES-FIXTURE unlike the placeholder");
  });
});
