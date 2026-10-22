// Ledger 855/856: whole milk (kind 'info') is offered like any food by the
// meal and container pickers (Log meal, Add to storage, Edit storage) and by
// "Replace with…". A closed server render never shows the option list, so
// MultiCombobox is swapped for a stub that records the options it is handed.
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { FoodListItem } from "@blw/shared";

const seen = vi.hoisted(() => ({ options: [] as { value: string }[] }));

vi.mock("../../../components/ui/MultiCombobox.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  MultiCombobox: (props: { options: { value: string }[] }) => {
    seen.options = props.options;
    return null;
  },
}));

import { catalogKeys } from "../hooks.js";
import { FoodPicker, SingleFoodPicker } from "./FoodPicker.js";

function food(overrides: Partial<FoodListItem>): FoodListItem {
  return {
    id: "banana-id",
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
    ...overrides,
  };
}

const FOODS = [
  food({}),
  food({ id: "milk-id", slug: "milk", name: "Whole Milk", category: "dairy", allergens: ["milk"], kind: "info" }),
];

function offered(picker: ReactElement): string[] {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(catalogKeys.foodsList({}), { foods: FOODS });
  seen.options = [];
  renderToString(createElement(QueryClientProvider, { client: queryClient }, picker));
  return seen.options.map((o) => o.value);
}

describe("pickers offer whole milk even when nothing is picked yet (ledger 855)", () => {
  it.each([
    ["Log meal", { id: "log-food-food", value: [], onChange: () => {}, keptFoods: [] }],
    ["Add to storage", { id: "storage-add-food", value: [], onChange: () => {} }],
    ["Edit storage", { id: "storage-edit-food", value: [], onChange: () => {}, keptFoods: [], placeholder: "Add a food…", chipsFirst: true }],
  ])("FoodPicker (%s)", (_, props) => {
    expect(offered(createElement(FoodPicker, props))).toEqual(["banana-id", "milk-id"]);
  });

  it("SingleFoodPicker (Replace with…)", () => {
    const props = { id: "replace-food", value: "", onChange: () => {}, excludeId: "custom-id", inline: true };
    expect(offered(createElement(SingleFoodPicker, props))).toEqual(["banana-id", "milk-id"]);
  });
});
