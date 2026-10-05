import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FoodListItem, StorageItem } from "@blw/shared";
import { catalogKeys } from "../../catalog/hooks.js";
import {
  EDIT_STORAGE_ITEM_FIELD_ORDER,
  EditStorageItemForm,
  buildContentsPatch,
  storageItemKind,
  validateEditStorageItem,
  type EditStorageItemValues,
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

const AVOCADO: FoodListItem = {
  id: "food-1",
  slug: "avocado",
  name: "Avocado",
  category: "fruit",
  ironLevel: "low",
  vitaminCLevel: "low",
  fiberLevel: "moderate",
  chokingRisk: "low",
  minAgeMonths: 6,
  allergens: [],
  isCustom: false,
  emoji: null,
};

function renderForm(item: StorageItem = ITEM) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(catalogKeys.foodsList({}), { foods: [AVOCADO] });
  return renderToString(
    createElement(QueryClientProvider, { client: queryClient }, createElement(EditStorageItemForm, { item, onDone: () => {} })),
  );
}

// Item 333: the one rule this form has — and the reason it grew a validator
// at all. Both halves of the comparison live on this form, so an edit that
// moves Prepared forward is judged the same way one that moves Best by back.
describe("validateEditStorageItem", () => {
  const prepared = new Date(2026, 8, 14, 10, 0);
  const base: Omit<EditStorageItemValues, "bestBy" | "preparedAt"> = { kind: "food", foodIds: ["food-1"], label: "" };

  it("accepts an unset best-by, the prepared day itself, and any day after", () => {
    expect(validateEditStorageItem({ ...base, bestBy: "", preparedAt: prepared })).toEqual({});
    expect(validateEditStorageItem({ ...base, bestBy: "2026-09-14", preparedAt: prepared })).toEqual({});
    expect(validateEditStorageItem({ ...base, bestBy: "2026-09-20", preparedAt: prepared })).toEqual({});
  });

  it("rejects a best-by date behind the prepared day", () => {
    expect(validateEditStorageItem({ ...base, bestBy: "2026-09-13", preparedAt: prepared }).bestBy).toBe(
      "Best by can't be before the prepared date",
    );
  });

  it("catches it from the other side too — Prepared moved past a stored best-by", () => {
    expect(validateEditStorageItem({ ...base, bestBy: "2026-09-13", preparedAt: new Date(2026, 8, 20, 8, 0) }).bestBy).toBe(
      "Best by can't be before the prepared date",
    );
  });

  // Item 729: the same answers the Add form gives for the same mistakes.
  it("needs at least one food in a food container, and a name on a Free-form item", () => {
    expect(validateEditStorageItem({ ...base, foodIds: [], bestBy: "", preparedAt: prepared }).food).toBe(
      "Add at least one food",
    );
    expect(validateEditStorageItem({ ...base, kind: "label", label: "  ", bestBy: "", preparedAt: prepared }).label).toBe(
      "Enter what it is",
    );
    // Neither rule reaches a kind it does not belong to.
    expect(validateEditStorageItem({ ...base, kind: "recipe", foodIds: [], bestBy: "", preparedAt: prepared })).toEqual({});
  });

  it("focuses in visual order: the foods or the name, then best by", () => {
    expect(EDIT_STORAGE_ITEM_FIELD_ORDER).toEqual(["food", "label", "bestBy"]);
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

// Item 729: what goes into the PATCH for the container's contents.
describe("buildContentsPatch", () => {
  const foodItem = { foods: ITEM.foods, recipeId: null, label: null };

  it("sends nothing for an untouched food list, so a plain Save never rewrites it", () => {
    expect(buildContentsPatch(foodItem, ["food-1"], "")).toEqual({});
  });

  it("sends the whole list, in order, once it changes (added, removed or reordered)", () => {
    expect(buildContentsPatch(foodItem, ["food-1", "food-2"], "")).toEqual({ foodIds: ["food-1", "food-2"] });
    const two = { ...foodItem, foods: [...ITEM.foods, { id: "food-2", slug: "pea", name: "Pea", emoji: null }] };
    expect(buildContentsPatch(two, ["food-2", "food-1"], "")).toEqual({ foodIds: ["food-2", "food-1"] });
    expect(buildContentsPatch(two, ["food-2"], "")).toEqual({ foodIds: ["food-2"] });
  });

  it("renames a Free-form item, trimmed, and never touches a recipe item", () => {
    expect(buildContentsPatch({ foods: [], recipeId: null, label: "Soup" }, [], "  Lentil soup ")).toEqual({
      label: "Lentil soup",
    });
    expect(buildContentsPatch({ foods: [], recipeId: "r-1", label: null }, ["x"], "y")).toEqual({});
  });

  it("reads a legacy item with foods AND a recipe as a recipe item", () => {
    expect(storageItemKind({ foods: ITEM.foods, recipeId: "r-1" })).toBe("recipe");
  });
});

describe("EditStorageItemForm (What's in it, item 729)", () => {
  it("shows a food container's foods as removable chips ABOVE an 'Add a food…' search, with the hint", () => {
    const html = renderForm();
    expect(html).toContain(">What&#x27;s in it<");
    expect(html).toContain("Changes apply to future serves. Meals already served keep what they had.");
    expect(html).toContain('placeholder="Add a food…"');
    const chip = html.indexOf('aria-label="Remove Avocado"');
    expect(chip).toBeGreaterThan(-1);
    expect(chip).toBeLessThan(html.indexOf('id="storage-edit-food"'));
    // The field leads the form, and the "N selected" badge is not shown here.
    expect(html.indexOf("What&#x27;s in it")).toBeLessThan(html.indexOf(">Location<"));
    expect(html).not.toMatch(/1(?:<!--\s*-->)? selected/);
  });

  it("keeps a food its owner deleted as a '(deleted)' chip", () => {
    const html = renderForm({ ...ITEM, foods: [{ id: "gone-1", slug: "x", name: "Old squash", emoji: null, deleted: true }] });
    expect(html).toContain('aria-label="Remove Old squash\u00a0(deleted)"');
  });

  it("gives a recipe item no contents field and no name field", () => {
    const html = renderForm({ ...ITEM, foods: [], recipeId: "r-1", recipeTitle: "Banana porridge" });
    expect(html).not.toContain("What&#x27;s in it");
    expect(html).not.toContain("What is it?");
    expect(html).not.toContain("Changes apply to future serves.");
  });

  it("gives a Free-form item its name, editable, and no food search", () => {
    const html = renderForm({ ...ITEM, foods: [], label: "Leftover soup" });
    expect(html).toContain(">What is it?<");
    expect(html).toMatch(/id="storage-edit-label"[^>]*value="Leftover soup"/);
    expect(html).not.toContain("What&#x27;s in it");
  });
});
