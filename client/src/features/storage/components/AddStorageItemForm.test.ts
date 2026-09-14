import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FoodListItem, RecipeListItem } from "@blw/shared";
import { catalogKeys } from "../../catalog/hooks.js";
import {
  ADD_STORAGE_ITEM_FIELD_ORDER,
  AddStorageItemForm,
  resolveStoragePrefill,
  validateAddStorageItem,
  type AddStorageItemValues,
  type StoragePrefill,
} from "./AddStorageItemForm.js";

/** Prepared "now" and no best-by date — what the form opens with. */
function values(overrides: Partial<AddStorageItemValues> = {}): AddStorageItemValues {
  return {
    source: "food",
    foodIds: ["food-1"],
    recipeId: "",
    label: "",
    bestBy: "",
    preparedAt: new Date(2026, 8, 14, 10, 0),
    ...overrides,
  };
}

describe("validateAddStorageItem", () => {
  it("accepts each source tab once its own field is answered", () => {
    expect(validateAddStorageItem(values())).toEqual({});
    expect(validateAddStorageItem(values({ source: "recipe", recipeId: "recipe-1" }))).toEqual({});
    expect(validateAddStorageItem(values({ source: "label", label: "Lentil soup" }))).toEqual({});
  });

  it("asks for a food on the food tab, phrased as a list error", () => {
    expect(validateAddStorageItem(values({ foodIds: [] })).food).toBe("Add at least one food");
  });

  it("asks for a recipe on the recipe tab", () => {
    expect(validateAddStorageItem(values({ source: "recipe" })).recipe).toBe("Recipe is required");
  });

  it("asks what it is on the free-form tab, treating whitespace as blank", () => {
    expect(validateAddStorageItem(values({ source: "label" })).label).toBe("Enter what it is");
    expect(validateAddStorageItem(values({ source: "label", label: "   " })).label).toBe("Enter what it is");
  });

  // Only the tab on screen is judged: a food id left behind by a tab the
  // parent moved away from is not an error (and is not sent either).
  it("judges only the visible tab", () => {
    expect(validateAddStorageItem(values({ source: "recipe", foodIds: [], recipeId: "recipe-1" }))).toEqual({});
    expect(validateAddStorageItem(values({ source: "label", foodIds: [], label: "Soup" }))).toEqual({});
    expect(validateAddStorageItem(values({ source: "food", recipeId: "", label: "" }))).toEqual({});
  });

  // Item 333: best-by now decides the Use soon / Expired chip, so a date
  // behind the prepared date would file a just-cooked container as expired.
  describe("best by vs prepared", () => {
    it("rejects a best-by date before the prepared day", () => {
      expect(validateAddStorageItem(values({ bestBy: "2026-09-13" })).bestBy).toBe(
        "Best by can't be before the prepared date",
      );
    });

    it("accepts the prepared day itself, and any day after it", () => {
      expect(validateAddStorageItem(values({ bestBy: "2026-09-14" })).bestBy).toBeUndefined();
      expect(validateAddStorageItem(values({ bestBy: "2026-09-15" })).bestBy).toBeUndefined();
      expect(validateAddStorageItem(values({ bestBy: "2027-01-01" })).bestBy).toBeUndefined();
    });

    it("leaves the optional field alone when it is unset", () => {
      expect(validateAddStorageItem(values({ bestBy: "" }))).toEqual({});
    });

    it("compares local calendar days, not instants — a late-evening prepare is fine", () => {
      // 23:30 local on the 14th, best by the 14th: the same day, so valid —
      // which a raw timestamp comparison would have rejected.
      expect(
        validateAddStorageItem(values({ preparedAt: new Date(2026, 8, 14, 23, 30), bestBy: "2026-09-14" })).bestBy,
      ).toBeUndefined();
    });

    it("reports it alongside the visible tab's own missing answer, and is focused second", () => {
      const errors = validateAddStorageItem(values({ foodIds: [], bestBy: "2026-09-13" }));
      expect(errors.food).toBe("Add at least one food");
      expect(errors.bestBy).toBeDefined();
      expect(ADD_STORAGE_ITEM_FIELD_ORDER.indexOf("bestBy")).toBe(ADD_STORAGE_ITEM_FIELD_ORDER.length - 1);
    });
  });
});

// Item 284: "Add to storage" from a food or recipe page arrives as
// /storage/add?food=<id> | ?recipe=<id>, the same idiom /log-meal?food=<id>
// uses. The rule is pure, so it is pinned without rendering anything.
describe("resolveStoragePrefill", () => {
  const prefill = (query: string): StoragePrefill => resolveStoragePrefill(new URLSearchParams(query));

  it("reads ?food= as the food tab with that food chosen", () => {
    expect(prefill("food=food-1")).toEqual({ source: "food", foodId: "food-1" });
  });

  it("reads ?recipe= as the recipe tab with that recipe chosen", () => {
    expect(prefill("recipe=recipe-1")).toEqual({ source: "recipe", recipeId: "recipe-1" });
  });

  it("asks for nothing when neither param is there", () => {
    expect(prefill("")).toEqual({ source: null });
    expect(prefill("edit=storage-1&location=freezer")).toEqual({ source: null });
  });

  it("ignores a blank or whitespace-only id rather than opening an empty tab", () => {
    expect(prefill("food=")).toEqual({ source: null });
    expect(prefill("food=%20%20")).toEqual({ source: null });
    expect(prefill("recipe=")).toEqual({ source: null });
  });

  it("falls through to ?recipe= when ?food= is blank", () => {
    expect(prefill("food=&recipe=recipe-1")).toEqual({ source: "recipe", recipeId: "recipe-1" });
  });

  it("breaks a both-params tie toward food — the form's own default tab", () => {
    expect(prefill("food=food-1&recipe=recipe-1")).toEqual({ source: "food", foodId: "food-1" });
  });

  it("trims the id it hands on", () => {
    expect(prefill("food=%20food-1%20")).toEqual({ source: "food", foodId: "food-1" });
  });
});

const FOOD: FoodListItem = {
  id: "food-1",
  slug: "banana",
  name: "Banana",
  category: "fruit",
  ironLevel: "low",
  vitaminCLevel: "moderate",
  fiberLevel: "low",
  chokingRisk: "moderate",
  minAgeMonths: 6,
  allergens: [],
  isCustom: false,
  emoji: null,
};

const RECIPE: RecipeListItem = {
  id: "recipe-1",
  slug: "banana-porridge",
  title: "Banana porridge",
  minAgeMonths: 6,
  ironFocus: false,
  vitaminCHigh: false,
  fiberHigh: false,
  allergens: [],
  isCustom: false,
  isFavorite: false,
  ingredientNames: [],
};

function renderForm(prefill?: StoragePrefill) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(catalogKeys.foodsList({}), { foods: [FOOD] });
  queryClient.setQueryData(catalogKeys.recipesList({}), { recipes: [RECIPE] });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AddStorageItemForm, { onDone: () => {}, ...(prefill ? { prefill } : {}) }),
    ),
  );
}

describe("AddStorageItemForm (render)", () => {
  it("renders the source tabs, the default 'From a food' field, location segments, and Prepared field", () => {
    const html = renderForm();
    expect(html).toContain("From a food");
    expect(html).toContain("From a recipe");
    expect(html).toContain("Free-form");
    expect(html).toContain(">Food<");
    expect(html).toContain(">Location<");
    expect(html).toContain(">Prepared<");
    expect(html).toMatch(/Quantity note(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
  });

  it("renders the Notes field", () => {
    const html = renderForm();
    expect(html).toMatch(/Notes(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
  });

  it("renders the optional Total servings and Best by fields", () => {
    const html = renderForm();
    expect(html).toMatch(/Total servings(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    expect(html).toMatch(/Best by(?:<!-- -->)?\s*<span[^>]*>\(optional\)<\/span>/);
    // The Best by field is a DateField button, not a native date input.
    expect(html).toMatch(/aria-haspopup="dialog"[^>]*>[\s\S]*?Select a date/);
  });

  // Item 235: the submit stays enabled with nothing chosen — tapping it has
  // to say what is missing — and nothing is shown before that tap.
  it("leaves the submit enabled with nothing chosen, and shows no error markup before a submit attempt", () => {
    const html = renderForm();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Add to storage</);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Add to storage</);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Add at least one food");
  });

  // Item 236: the free-form tab carries a native `required` Input (the recipe
  // tab's picker no longer does)
  // whose bubbles would otherwise pre-empt the inline message.
  it("opts out of native constraint validation", () => {
    expect(renderForm()).toMatch(/<form[^>]*novalidate/i);
  });

  // Item 257: the page's header X is the only way out; the form itself
  // offers one button, the submit.
  it("renders no Cancel — just the single submit button", () => {
    const html = renderForm();
    expect(html).not.toContain(">Cancel<");
    expect(html).toContain(">Add to storage<");
    expect((html.match(/type="submit"/g) ?? []).length).toBe(1);
  });
});

describe("AddStorageItemForm (prefill, item 284)", () => {
  /** The tab strip marks the open tab with aria-pressed. */
  function pressedTab(html: string): string | undefined {
    return html.match(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)<\/button>/)?.[1];
  }

  it("opens on the food tab with the food chosen when given one", () => {
    const html = renderForm({ source: "food", foodId: FOOD.id });
    expect(pressedTab(html)).toBe("From a food");
    expect(html).toContain(">Food<");
    // The chosen food shows as a chip under the picker's field.
    expect(html).toContain('aria-label="Remove Banana"');
    expect(html).toMatch(/1(?:<!--\s*-->)? selected/);
  });

  it("opens on the recipe tab with the recipe chosen when given one", () => {
    const html = renderForm({ source: "recipe", recipeId: RECIPE.id });
    expect(pressedTab(html)).toBe("From a recipe");
    expect(html).toContain(">Recipe<");
    expect(html).toContain('aria-label="Remove Banana porridge"');
    // The food tab's field is not on screen at the same time.
    expect(html).not.toContain(">Food<");
  });

  it("opens on the food tab, with nothing chosen, when nothing is asked for", () => {
    const html = renderForm({ source: null });
    expect(pressedTab(html)).toBe("From a food");
    expect(html).not.toMatch(/aria-label="Remove /);
    expect(html).not.toContain("selected</span>");
  });

  // The prefill only seeds a picker; it never fills in the rest of the form.
  it("leaves the location, prepared and optional fields exactly as they were", () => {
    const html = renderForm({ source: "food", foodId: FOOD.id });
    expect(html).toContain(">Location<");
    expect(html).toContain(">Prepared<");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Add to storage</);
  });
});
