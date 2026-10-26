// The plate page's frame (ledger 902): which page /log-meal is, its title and
// way out, its guide, and what it opens with — Log meal's ?food= / ?recipe=
// prefill (items 213, LogFoodPage), Serve's container, Edit's meal or "gone".
// Markup by renderToString against a seeded query cache; GET /api/meals/:id
// is the one query stubbed, since a server render never fetches.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { Baby, FoodListItem, MealItem, StorageItem } from "@blw/shared";

const h = vi.hoisted(() => ({ meal: { data: undefined as unknown, isError: false } }));
vi.mock("../tracking/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMeal: () => ({ ...h.meal, refetch: async () => ({}) }),
}));

import { CelebrationProvider } from "../../components/ui/Celebration.js";
import { ApiError } from "../../lib/api.js";
import { babyKeys } from "../babies/api.js";
import { catalogKeys } from "../catalog/hooks.js";
import { storageKeys } from "../storage/hooks.js";
import {
  PLATE_TITLE,
  PlateScreen,
  isMealChanged,
  plateMode,
  resolvePlateHeaderAffordance,
  resolvePlateStart,
  resolveSubmitAction,
} from "./PlateScreen.js";

const BABY: Baby = {
  id: "baby-1",
  name: "Baby",
  birthDate: "2026-01-01",
  notes: null,
  archived: false,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const AVOCADO = { id: id(1), slug: "avocado", name: "Avocado", category: "fruit", allergens: [] as string[], emoji: null } as FoodListItem;
const RECIPE = { id: id(10), title: "Iron-Rich Puree" };
const TUB: StorageItem = {
  id: id(20),
  label: null,
  foods: [],
  recipeId: id(11),
  recipeTitle: "Broccoli Cheese Egg Muffins",
  preparedAt: "2026-10-14T10:00:00.000Z",
  location: "fridge",
  status: "active",
  statusChangedAt: "2026-10-14T10:00:00.000Z",
  expiresAt: "2026-11-14T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: 6,
  servingsLeft: 6,
  bestBy: null,
  notes: null,
};
const MEAL: MealItem = {
  id: id(90),
  babyId: BABY.id,
  servedAt: "2026-10-14T12:20:00.000Z",
  reactionNote: null,
  notes: null,
  recipeId: RECIPE.id,
  recipeTitle: RECIPE.title,
  foods: [],
  items: [{ kind: "recipe", id: id(100), recipe: RECIPE, leftOut: [], inferred: false, rating: 5 }],
};

function renderAt(url: string, seed: { baby?: boolean; active?: StorageItem[]; history?: StorageItem[] } = {}): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed.baby !== false) queryClient.setQueryData(babyKeys.list(false), [BABY]);
  queryClient.setQueryData(catalogKeys.foodsList({}), { foods: [AVOCADO] });
  queryClient.setQueryData(catalogKeys.recipe(RECIPE.id), { ...RECIPE, ingredients: [] });
  queryClient.setQueryData(storageKeys.list("active"), { items: seed.active ?? [] });
  queryClient.setQueryData(storageKeys.list("history"), { items: seed.history ?? [] });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        CelebrationProvider,
        null,
        createElement(MemoryRouter, { initialEntries: [url] }, createElement(PlateScreen, null)),
      ),
    ),
  );
}

describe("which page /log-meal is", () => {
  it("?edit= is Edit meal, ?storage= is Serve, anything else is Log meal", () => {
    expect(plateMode(new URLSearchParams("edit=m1&storage=s1"))).toBe("edit");
    expect(plateMode(new URLSearchParams("storage=s1"))).toBe("serve");
    expect(plateMode(new URLSearchParams("food=f1"))).toBe("log");
    expect(plateMode(new URLSearchParams(""))).toBe("log");
    expect(PLATE_TITLE).toEqual({ log: "Log meal", serve: "Serve", edit: "Edit meal" });
  });

  // Items 196/258: one way out — the X for a task, the chevron for a drill-in.
  it("Log meal and Serve are tasks with the X; Edit meal is a drill-in with the chevron", () => {
    expect(resolvePlateHeaderAffordance("log")).toBe("close");
    expect(resolvePlateHeaderAffordance("serve")).toBe("close");
    expect(resolvePlateHeaderAffordance("edit")).toBe("back");
  });
});

describe("PlateScreen (render)", () => {
  it("Log meal with no baby yet: the title, the X before it, its guide, and the add-a-baby state", () => {
    const html = renderAt("/log-meal", { baby: false });
    expect(html).toContain("Log meal");
    expect(html).toContain('aria-label="Close"');
    expect(html).not.toContain('<span class="sr-only">Back</span>');
    expect(html.indexOf('aria-label="Close"')).toBeLessThan(html.indexOf("</h1>"));
    expect(html).toContain("How to log a meal");
  });

  it("a plain Log meal opens empty: On the plate, + Add more, When, the notes, the leftovers switch and Save", () => {
    const html = renderAt("/log-meal").replace(/<!-- -->/g, "");
    expect(html).toContain(">On the plate</span>");
    expect(html).not.toContain("Stars are optional.");
    const order = ["+ Add more", 'id="plate-when"', "Reaction", "Notes", "Save leftovers to storage", ">Save</button>"];
    const at = order.map((needle) => html.indexOf(needle));
    expect(at.every((index) => index > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).not.toContain("Remove ");
  });

  it("?food= and ?recipe= put that food or recipe on the plate (item 213)", () => {
    expect(renderAt(`/log-meal?food=${AVOCADO.id}`)).toContain('aria-label="Remove Avocado"');
    const recipe = renderAt(`/log-meal?recipe=${RECIPE.id}`);
    expect(recipe).toContain('aria-label="Remove Iron-Rich Puree"');
    expect(recipe).toContain("Stars are optional.");
    // One the lists don't have is simply left off.
    expect(renderAt("/log-meal?food=nope")).not.toContain("Remove ");
  });

  it("Serve: titled Serve with its guide and X, the container on the plate, and a Serve button", () => {
    const html = renderAt(`/log-meal?storage=${TUB.id}`, { active: [TUB] }).replace(/<!-- -->/g, "");
    expect(html).toMatch(/<h1[^>]*>Serve<\/h1>|>Serve<\/h1>/);
    expect(html).toContain("How to serve from storage");
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain(">Broccoli Cheese Egg Muffins</p>");
    expect(html).toContain(">Fridge · 6 of 6 left</p>");
    expect(html).toContain(">Serve</button>");
    expect(html).not.toContain("Save leftovers to storage");
  });

  it("Serve of a container Storage has since finished opens it flagged (CD-Serve-Ran-Out)", () => {
    const html = renderAt(`/log-meal?storage=${TUB.id}`, { history: [{ ...TUB, status: "finished", servingsLeft: 0 }] });
    expect(html).toContain("None left. Remove it to serve the rest.");
    expect(html).toContain("has run out, so this meal isn&#x27;t served yet.");
  });

  it("Edit meal: the chevron, the meal's plate; a meal that can't be loaded is gone, not a blank form", () => {
    h.meal = { data: MEAL, isError: false };
    const html = renderAt(`/log-meal?edit=${MEAL.id}`);
    expect(html).toContain("Edit meal");
    expect(html).toContain('<span class="sr-only">Back</span>');
    expect(html).not.toContain('aria-label="Close"');
    expect(html).toContain('aria-label="Remove Iron-Rich Puree"');
    expect(html).toContain("How to log a meal");

    h.meal = { data: undefined, isError: true };
    const gone = renderAt(`/log-meal?edit=${MEAL.id}`);
    expect(gone).toContain("That meal is gone");
    expect(gone).not.toContain('id="plate-when"');
    h.meal = { data: undefined, isError: false };
  });
});

describe("resolvePlateStart", () => {
  const base = {
    meal: { isError: false, data: undefined },
    storageId: null,
    containers: [] as StorageItem[],
    storageQueries: [] as { isPending: boolean; isFetching: boolean }[],
    prefill: { loading: false, food: undefined, recipe: undefined },
  };
  const settled = { isPending: false, isFetching: false };

  it("Edit: loading until the meal answers, missing when it fails", () => {
    expect(resolvePlateStart({ ...base, mode: "edit" })).toEqual({ status: "loading" });
    expect(resolvePlateStart({ ...base, mode: "edit", meal: { isError: true, data: undefined } })).toEqual({ status: "missing" });
    const ready = resolvePlateStart({ ...base, mode: "edit", meal: { isError: false, data: MEAL } });
    expect(ready.status === "ready" && ready.plate.map((entry) => entry.kind)).toEqual(["recipe"]);
  });

  it("Serve: the container from either list; missing only once both lists have answered without it", () => {
    const serve = { ...base, mode: "serve" as const, storageId: TUB.id };
    expect(resolvePlateStart({ ...serve, storageQueries: [{ isPending: true, isFetching: true }, settled] })).toEqual({
      status: "loading",
    });
    // A restored list from before the container existed, still refetching.
    expect(resolvePlateStart({ ...serve, storageQueries: [{ isPending: false, isFetching: true }, settled] })).toEqual({
      status: "loading",
    });
    expect(resolvePlateStart({ ...serve, storageQueries: [settled, settled] })).toEqual({ status: "missing" });
    const ready = resolvePlateStart({ ...serve, containers: [TUB], storageQueries: [{ isPending: true, isFetching: true }] });
    expect(ready.status === "ready" && ready.plate.map((entry) => entry.kind === "storage" && entry.servings)).toEqual([1]);
  });

  it("Log meal: waits for what was asked for, then puts it on", () => {
    expect(resolvePlateStart({ ...base, mode: "log", prefill: { ...base.prefill, loading: true } })).toEqual({ status: "loading" });
    expect(resolvePlateStart({ ...base, mode: "log" })).toEqual({ status: "ready", plate: [] });
    const ready = resolvePlateStart({ ...base, mode: "log", prefill: { loading: false, food: AVOCADO, recipe: RECIPE } });
    expect(ready.status === "ready" && ready.plate.map((entry) => entry.kind)).toEqual(["recipe", "food"]);
  });
});

describe("isMealChanged", () => {
  it("is the server's 409 meal_changed only", () => {
    expect(isMealChanged(new ApiError(409, "meal_changed", { error: "meal_changed" }))).toBe(true);
    expect(isMealChanged(new ApiError(409, "conflict", { error: "conflict", storageItemId: TUB.id }))).toBe(false);
    expect(isMealChanged(new ApiError(400, "meal_changed", { error: "meal_changed" }))).toBe(false);
    expect(isMealChanged(new Error("meal_changed"))).toBe(false);
  });
});

describe("resolveSubmitAction (no-double-meal guard)", () => {
  it("allows create only before any meal has been saved", () => {
    expect(resolveSubmitAction(false, false)).toBe("create");
    expect(resolveSubmitAction(false, true)).toBe("create");
  });

  it("NEVER returns create once the meal is saved (kills the double-meal mutant)", () => {
    expect(resolveSubmitAction(true, true)).toBe("retry-storage");
    expect(resolveSubmitAction(true, false)).toBe("noop");
  });
});
