import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { StorageItem } from "@blw/shared";
import {
  EDIT_STORAGE_ITEM_FIELD_ORDER,
  EditStorageItemForm,
  validateEditStorageItem,
} from "./EditStorageItemForm.js";

const ITEM: StorageItem = {
  id: "11111111-1111-1111-1111-111111111111",
  label: null,
  foods: [{ id: "food-1", slug: "avocado", name: "Avocado", emoji: null }],
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

function renderForm(item: StorageItem = ITEM) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(QueryClientProvider, { client: queryClient }, createElement(EditStorageItemForm, { item, onDone: () => {} })),
  );
}

// Item 333: the one rule this form has — and the reason it grew a validator
// at all. Both halves of the comparison live on this form, so an edit that
// moves Prepared forward is judged the same way one that moves Best by back.
describe("validateEditStorageItem", () => {
  const prepared = new Date(2026, 8, 14, 10, 0);

  it("accepts an unset best-by, the prepared day itself, and any day after", () => {
    expect(validateEditStorageItem({ bestBy: "", preparedAt: prepared })).toEqual({});
    expect(validateEditStorageItem({ bestBy: "2026-09-14", preparedAt: prepared })).toEqual({});
    expect(validateEditStorageItem({ bestBy: "2026-09-20", preparedAt: prepared })).toEqual({});
  });

  it("rejects a best-by date behind the prepared day", () => {
    expect(validateEditStorageItem({ bestBy: "2026-09-13", preparedAt: prepared }).bestBy).toBe(
      "Best by can't be before the prepared date",
    );
  });

  it("catches it from the other side too — Prepared moved past a stored best-by", () => {
    expect(validateEditStorageItem({ bestBy: "2026-09-13", preparedAt: new Date(2026, 8, 20, 8, 0) }).bestBy).toBe(
      "Best by can't be before the prepared date",
    );
  });

  it("focuses the best-by field, the only key in the order", () => {
    expect(EDIT_STORAGE_ITEM_FIELD_ORDER).toEqual(["bestBy"]);
  });
});

describe("EditStorageItemForm (render)", () => {
  // Item 235: the form's one rule (best-by vs prepared) cannot be broken by
  // an item as it stands — both come off the same stored row — so nothing is
  // shown before a submit is attempted, and Save is enabled.
  it("has no field errors to show on open: Save is enabled and no alert markup renders", () => {
    const html = renderForm();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Save</);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Save</);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("is required");
  });

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

  // Item 257: Save alone — the page's header X is the way out.
  it("renders Save (not Saving…) while idle, with no Cancel beside it", () => {
    const html = renderForm();
    expect(html).toContain(">Save<");
    expect(html).not.toContain(">Saving…<");
    expect(html).not.toContain(">Cancel<");
    expect((html.match(/type="submit"/g) ?? []).length).toBe(1);
  });

  it("renders the Total servings and Best by fields, unset for an untracked item", () => {
    const html = renderForm();
    expect(html).toMatch(/Total servings(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/Best by(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toContain("Select a date");
  });

  it("prefills Total servings and the Best by value from a tracked item", () => {
    const html = renderForm({ ...ITEM, servingsTotal: 6, servingsLeft: 2, bestBy: "2026-08-29" });
    expect(html).toMatch(/id="storage-edit-servings"[^>]*value="6"/);
    expect(html).toContain("Aug 29, 2026");
  });

  it("renders the Notes field, empty for an item with no note", () => {
    const html = renderForm();
    expect(html).toMatch(/Notes(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
  });

  it("prefills Notes from the item's stored value", () => {
    const html = renderForm({ ...ITEM, notes: "STORAGE-NOTES-FIXTURE unlike the placeholder" });
    expect(html).toContain("STORAGE-NOTES-FIXTURE unlike the placeholder");
  });
});
