import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { FoodListItem } from "@blw/shared";
import { catalogKeys } from "../hooks.js";
import { addCustomFoodLabel } from "../constants.js";
import { FoodPicker, foodPickerOption } from "./FoodPicker.js";

function food(overrides: Partial<FoodListItem> = {}): FoodListItem {
  return {
    id: "food-1",
    slug: "banana",
    name: "Banana",
    category: "fruit",
    ironLevel: "low",
    vitaminCLevel: "moderate",
    chokingRisk: "moderate",
    minAgeMonths: 6,
    allergens: [],
    isCustom: false,
    emoji: null,
    ...overrides,
  };
}

const CUSTOM = food({
  id: "food-2",
  slug: "banana-bread-k3f9q1",
  name: "Banana bread",
  category: "grain",
  isCustom: true,
  emoji: "🍞",
});

function renderPicker(foods: FoodListItem[], value: string[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(catalogKeys.foodsList({}), { foods });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(FoodPicker, { id: "log-food-food", value, onChange: () => {} }),
    ),
  );
}

describe("foodPickerOption", () => {
  it("selects by food id and shows the food's OWN emoji when it has one (item 177)", () => {
    expect(foodPickerOption(CUSTOM)).toEqual({ value: "food-2", label: "Banana bread", emoji: "🍞" });
  });

  it("falls back to the slug map for a catalog food", () => {
    expect(foodPickerOption(food())).toEqual({ value: "food-1", label: "Banana", emoji: "🍌" });
  });

  it("falls back to the category when a custom food carries no emoji", () => {
    expect(foodPickerOption(food({ id: "food-3", slug: "oat-slice-aa11bb", isCustom: true, category: "grain" })).emoji)
      .toBe("🌾");
  });
});

describe("FoodPicker (render)", () => {
  it("renders the combobox against the cached foods, enabled once they've loaded", () => {
    const html = renderPicker([food(), CUSTOM]);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('id="log-food-food"');
    expect(html).not.toContain("Loading foods…");
    expect(html).toContain('placeholder="Search foods…"');
  });

  it("shows a loading placeholder and a disabled field before the foods arrive", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(FoodPicker, { id: "log-food-food", value: [], onChange: () => {} }),
      ),
    );
    expect(html).toContain("Loading foods…");
    expect(html).toContain("disabled");
  });

  it("renders a selected custom food as a chip carrying its own emoji", () => {
    const html = renderPicker([food(), CUSTOM], [CUSTOM.id]);
    expect(html).toContain("Banana bread");
    expect(html).toContain("🍞");
    expect(html).toContain('aria-label="Remove Banana bread"');
  });

  it("keeps the create sheet closed until the create row is chosen", () => {
    // `Sheet` renders nothing while closed, so a static render is exactly the
    // "before anyone typed" state: no form, no dialog.
    const html = renderPicker([food()]);
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Add a custom food");
    expect(html).not.toContain(">Name<");
  });
});

describe("addCustomFoodLabel", () => {
  it("quotes the query as typed, trimmed", () => {
    expect(addCustomFoodLabel("Kale chips")).toBe("Add 'Kale chips' as a custom food");
    expect(addCustomFoodLabel("  Kale chips  ")).toBe("Add 'Kale chips' as a custom food");
  });
});
