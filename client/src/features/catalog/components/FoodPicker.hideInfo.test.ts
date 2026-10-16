// Ledger 842 (838 verifier, mutations C6-C7): every picker that logs a meal or
// fills a container passes `hideInfo`, so whole milk (`info`) is only ever
// brought in by a recipe. `offeredFoods` itself is pinned in FoodPicker.test.ts;
// this pins that the forms actually ask for it. FoodPicker is replaced by a
// prop recorder (a closed combobox renders no options to read).
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { StorageItem } from "@blw/shared";

const h = vi.hoisted(() => ({ pickers: [] as { id: string; hideInfo?: boolean }[] }));

vi.mock("./FoodPicker.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  FoodPicker: (props: { id: string; hideInfo?: boolean }) => {
    h.pickers.push(props);
    return null;
  },
}));

import { CelebrationProvider } from "../../../components/ui/Celebration.js";
import { AddStorageItemForm } from "../../storage/components/AddStorageItemForm.js";
import { EditStorageItemForm } from "../../storage/components/EditStorageItemForm.js";
import { LogFoodForm } from "../../tracking/components/LogFoodForm.js";

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
  quantityNote: null,
  servingsTotal: null,
  servingsLeft: null,
  bestBy: null,
  notes: null,
};

function pickersIn(element: ReactElement) {
  h.pickers.length = 0;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderToString(createElement(QueryClientProvider, { client }, createElement(CelebrationProvider, null, element)));
  return h.pickers.map(({ id, hideInfo }) => ({ id, hideInfo }));
}

describe("food pickers that log or store leave out info foods (ledger 838, 842)", () => {
  it("Log meal", () => {
    expect(pickersIn(createElement(LogFoodForm, { babyId: "baby-1", onDone: () => {} }))).toEqual([
      { id: "log-food-food", hideInfo: true },
    ]);
  });

  it("Add to storage", () => {
    expect(pickersIn(createElement(AddStorageItemForm, { onDone: () => {} }))).toEqual([
      { id: "storage-add-food", hideInfo: true },
    ]);
  });

  it("Edit a storage container", () => {
    expect(pickersIn(createElement(EditStorageItemForm, { item: ITEM, onDone: () => {} }))).toEqual([
      { id: "storage-edit-food", hideInfo: true },
    ]);
  });
});
