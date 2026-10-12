// Ledger 785: a serve raises no banner (the sheet closes and the counts
// update; deleting the meal reverses it), while Remove keeps its 6 s Undo on
// the Storage tab and a container's page. Pages are called as plain functions
// with their hooks mocked (the HomePaging.handlers idiom) and the returned
// element tree is read.
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  recentChange: null as null | { id: string; title: string; from: string; to: string },
  setStatus: vi.fn(),
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
  return {
    ...actual,
    useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, () => {}],
    useRef: (current: unknown) => ({ current }),
  };
});
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useParams: () => ({ id: h.item.id }),
}));
vi.mock("../features/storage/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useStorageItems: () => ({ data: { items: [h.item] }, isLoading: false, isError: false, isFetching: false, isSuccess: true }),
  useStorageStatusChange: () => ({ recentChange: h.recentChange, setStatus: h.setStatus, undo: h.undo, isPending: false }),
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
import { PageTrack } from "../components/ui/Pager.js";

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
  // Home's paged lists render their rows through the swipe track (item 775).
  if (element.type === PageTrack) findAll(PageTrack(element.props as never), type, out);
  for (const value of Object.values(element.props ?? {})) findAll(value, type, out);
  return out;
}
const call = (component: unknown, props: Record<string, unknown> = {}) => (component as (p: unknown) => El)(props);

describe("Undo after Remove only (ledger 785)", () => {
  it.each([
    ["the Storage tab", () => call(StoragePage)],
    ["a container's page", () => call(StorageDetailPage)],
  ])("%s shows Remove's banner with its Undo, and no banner otherwise", (_name, page) => {
    h.recentChange = null;
    expect(findAll(page(), StorageStatusBanner)).toHaveLength(0);

    h.recentChange = { id: h.item.id, title: "Avocado", from: "active", to: "discarded" };
    const banners = findAll(page(), StorageStatusBanner);
    expect(banners).toHaveLength(1);
    expect(banners[0]!.props.label).toBe("Marked discarded: Avocado");
    expect(banners[0]!.props.onUndo).toBe(h.undo);
    h.recentChange = null;
  });

  it.each([
    ["the Storage tab", () => call(StoragePage)],
    ["a container's page", () => call(StorageDetailPage)],
  ])("%s runs the kebab's Remove through the undoable setter", (_name, page) => {
    h.setStatus.mockClear();
    const [menu] = findAll(page(), StorageItemActionsMenu);
    (menu!.props.onRemove as () => void)();
    expect(h.setStatus).toHaveBeenCalledWith(h.item, "discarded", true);
  });

  it("Home renders no Undo banner at all", () => {
    expect(findAll(call(DashboardPage), StorageStatusBanner)).toHaveLength(0);
  });

  it.each([
    ["the Storage tab", () => call(StoragePage)],
    ["a container's page", () => call(StorageDetailPage)],
    ["Home's Up next", () => call(UpNextCard, { babyId: "baby-1" })],
    ["Home's Storage", () => call(StorageSection, { babyId: "baby-1" })],
  ])("%s hands nothing to a serve: no kebab carries onServed", (_name, page) => {
    const menus = findAll(page(), StorageItemActionsMenu);
    expect(menus.length).toBeGreaterThan(0);
    for (const menu of menus) expect(menu.props).not.toHaveProperty("onServed");
  });

  it("the kebab's Serve sheet carries no onServed", () => {
    const tree = call(StorageItemActionsMenu, { item: h.item, babyId: "baby-1" });
    expect(findAll(tree, ServeSheet)[0]!.props).not.toHaveProperty("onServed");
  });
});
