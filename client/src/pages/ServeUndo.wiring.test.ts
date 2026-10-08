// Ledger 760: every surface that opens the Serve sheet offers its 6 s Undo —
// the Storage tab, a container's page and Home — through the page's own
// `useServeUndo`, and the kebab hands the serve to it. Pages are called as
// plain functions with their hooks mocked (the HomePaging.handlers idiom) and
// the returned element tree is read.
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  recentServe: null as null | { mealId: string; label: string },
  announce: () => {},
  undo: () => {},
  item: {
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
    useSoon: true,
    expired: false,
    quantityNote: null,
    servingsTotal: 3,
    servingsLeft: 2,
    bestBy: null,
    notes: null,
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, () => {}] };
});
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useParams: () => ({ id: h.item.id }),
}));
vi.mock("../features/storage/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useStorageItems: () => ({ data: { items: [h.item] }, isLoading: false, isError: false, isFetching: false, isSuccess: true }),
  useStorageStatusChange: () => ({ recentChange: null, setStatus: () => {}, undo: () => {}, isPending: false }),
  useServeUndo: () => ({ recentServe: h.recentServe, announce: h.announce, undo: h.undo }),
  useUpdateStorageItem: () => ({ mutate: () => {}, isPending: false }),
}));
vi.mock("../features/babies/useActiveBaby.js", () => ({
  useActiveBaby: () => ({ activeBaby: { id: "baby-1", name: "Test" }, isLoading: false }),
}));
vi.mock("../features/tracking/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAllergenProgress: () => ({ data: { items: [] }, isLoading: false }),
}));

import { StoragePage } from "./StoragePage.js";
import { StorageDetailPage } from "./StorageDetailPage.js";
import { DashboardPage, StorageSection, UpNextCard } from "./DashboardPage.js";
import { StorageStatusBanner } from "../features/storage/components/StorageStatusBanner.js";
import { StorageItemActionsMenu } from "../features/storage/components/StorageItemActionsMenu.js";
import { ServeSheet } from "../features/storage/components/ServeSheet.js";

interface El {
  type: unknown;
  props: Record<string, unknown>;
}
function findAll(node: unknown, type: unknown, out: El[] = []): El[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, type, out);
    return out;
  }
  const element = node as El;
  if (element.type === type) out.push(element);
  for (const value of Object.values(element.props ?? {})) findAll(value, type, out);
  return out;
}
const call = (component: unknown, props: Record<string, unknown> = {}) => (component as (p: unknown) => El)(props);

describe("the serve Undo banner on every Serve surface (ledger 760)", () => {
  it.each([
    ["the Storage tab", () => call(StoragePage)],
    ["a container's page", () => call(StorageDetailPage)],
    ["Home", () => call(DashboardPage)],
  ])("%s shows it only after a serve, with the serve's label and Undo", (_name, page) => {
    h.recentServe = null;
    expect(findAll(page(), StorageStatusBanner)).toHaveLength(0);

    h.recentServe = { mealId: "m1", label: "Served: Avocado + 1 more" };
    const banners = findAll(page(), StorageStatusBanner);
    expect(banners).toHaveLength(1);
    expect(banners[0]!.props.label).toBe("Served: Avocado + 1 more");
    expect(banners[0]!.props.onUndo).toBe(h.undo);
    h.recentServe = null;
  });

  it.each([
    ["the Storage tab", () => call(StoragePage)],
    ["a container's page", () => call(StorageDetailPage)],
    ["Home's Up next", () => call(UpNextCard, { babyId: "baby-1", onServed: h.announce })],
    ["Home's Storage", () => call(StorageSection, { babyId: "baby-1", onServed: h.announce })],
  ])("%s hands each kebab's serve to the page's Undo", (_name, page) => {
    const menus = findAll(page(), StorageItemActionsMenu);
    expect(menus.length).toBeGreaterThan(0);
    for (const menu of menus) expect(menu.props.onServed).toBe(h.announce);
  });

  it("Home passes its Undo down to Up next and Storage", () => {
    const tree = call(DashboardPage);
    expect(findAll(tree, UpNextCard)[0]!.props.onServed).toBe(h.announce);
    expect(findAll(tree, StorageSection)[0]!.props.onServed).toBe(h.announce);
  });

  it("the kebab's Serve sheet reports the serve to the page", () => {
    const tree = call(StorageItemActionsMenu, { item: h.item, babyId: "baby-1", onServed: h.announce });
    expect(findAll(tree, ServeSheet)[0]!.props.onServed).toBe(h.announce);
  });
});
