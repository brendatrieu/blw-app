// The plate page's frame (ledger 902): which page /log-meal is, its title and
// way out, its guide, and what it opens with — Log meal's ?food= / ?recipe=
// prefill (items 213, LogFoodPage), Serve's container, Edit's meal or "gone".
// Markup by renderToString against a seeded query cache; GET /api/meals/:id
// is the one query stubbed, since a server render never fetches.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Baby, FoodListItem, MealItem, PlannedMeal, PlanResponse, StorageItem } from "@blw/shared";

const h = vi.hoisted(() => ({ meal: { data: undefined as unknown, isError: false }, offline: false }));
vi.mock("../../lib/online.js", () => ({ useIsOffline: () => h.offline }));
// The sheet portals to body, which the server renderer can't: a marker instead (ledger 944).
vi.mock("../storage/components/AddMoreSheet.js", () => ({ AddMoreSheet: () => "[Add more sheet]" }));
vi.mock("../tracking/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMeal: () => ({ ...h.meal, refetch: async () => ({}) }),
}));

import { CelebrationProvider } from "../../components/ui/Celebration.js";
import { ApiError } from "../../lib/api.js";
import { babyKeys } from "../babies/api.js";
import { catalogKeys } from "../catalog/hooks.js";
import { storageKeys } from "../storage/hooks.js";
import { planKeys } from "../plan/hooks.js";
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
    expect(PLATE_TITLE).toEqual({ log: "Log meal", serve: "Serve", edit: "Edit meal", plan: "Plan a meal", planServe: "Serve" });
  });

  // Items 196/258: one way out — the X for a task, the chevron for a drill-in.
  it("Log meal and Serve are tasks with the X; Edit meal is a drill-in with the chevron", () => {
    expect(resolvePlateHeaderAffordance("log")).toBe("close");
    expect(resolvePlateHeaderAffordance("serve")).toBe("close");
    expect(resolvePlateHeaderAffordance("edit")).toBe("back");
    expect(resolvePlateHeaderAffordance("plan")).toBe("back");
    // A planned meal's Serve is a task too (CD-Serve-Ran-Out).
    expect(resolvePlateHeaderAffordance("planServe")).toBe("close");
  });
});

describe("Plan a meal (/plan/:date/:slotId, CD-Plan-Meal)", () => {
  const LUNCH: PlannedMeal = {
    slotId: id(51),
    name: "Lunch",
    time: "12:00",
    position: 1,
    served: null,
    items: [{ kind: "storage", id: id(60), servings: 1, container: { ...TUB, servingsLeft: 2 } }],
  };
  const planWeek = (meals: PlannedMeal[]): PlanResponse => ({
    today: "2026-10-14",
    dailyMeals: [],
    days: [{ date: "2026-10-14", planned: true, meals }],
  });
  function renderPlan(url: string, plan?: PlanResponse, active: StorageItem[] = [TUB]): string {
    vi.useFakeTimers({ now: new Date("2026-10-14T15:00:00Z"), toFake: ["Date"] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [BABY]);
    queryClient.setQueryData(storageKeys.list("active"), { items: active });
    queryClient.setQueryData(storageKeys.list("history"), { items: [] });
    if (plan) queryClient.setQueryData(planKeys.range(BABY.id, "2026-10-11", "2026-10-17"), plan);
    return renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          CelebrationProvider,
          null,
          createElement(
            MemoryRouter,
            { initialEntries: [url] },
            createElement(Routes, null, createElement(Route, { path: "/plan/:date/:slotId", element: createElement(PlateScreen, null) })),
          ),
        ),
      ),
    )
      .replace(/<!-- -->/g, "")
      .replace(/\u202f/g, " ");
  }
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is titled Plan a meal with the chevron and no guide: Name, Day, Time, the plate without stars, + Add more, Save", () => {
    const html = renderPlan(`/plan/2026-10-14/${LUNCH.slotId}`, planWeek([LUNCH]));
    expect(html).toMatch(/>Plan a meal<\/h1>/);
    expect(html).toContain('<span class="sr-only">Back</span>');
    expect(html).not.toContain('aria-label="Close"');
    expect(html).not.toContain("How to");
    expect(html).toMatch(/<input [^>]*id="plan-name"[^>]*value="Lunch"/);
    expect(html).toContain("Just for this day. Daily meals stay as they are.");
    expect(html).toMatch(/>Day<\/span><p [^>]*>.*?<span class="min-w-0 truncate">Today<\/span><\/p>/);
    expect(html).toContain('<span aria-hidden="true" class="">12:00 PM</span>');
    expect(html).toMatch(/<input id="plan-time" type="time"[^>]*value="12:00"/);
    expect(html).toContain(">Broccoli Cheese Egg Muffins</p>");
    // Storage's live copy of the container wins over the plan's (6 left, not 2).
    expect(html).toContain(">Fridge · 6 of 6 left</p>");
    expect(html).toContain('aria-label="Increase servings"');
    for (const absent of ["Rating for", "Stars are optional.", 'id="plate-when"', "Reaction", "Notes", "Save leftovers", "None left."]) {
      expect(html, absent).not.toContain(absent);
    }
    const order = ['id="plan-name"', 'id="plan-time"', ">On the plate</span>", "+ Add more", ">Save</button>"];
    const at = order.map((needle) => html.indexOf(needle));
    expect(at.every((index) => index > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("+ Add a meal opens it empty, named by the parent, with no time yet; another day says its date", () => {
    const html = renderPlan("/plan/2026-10-16/new");
    expect(html).toMatch(/<input [^>]*id="plan-name"[^>]*value=""/);
    expect(html).toContain(">Fri, Oct 16</span>");
    expect(html).toContain(">Add time</span>");
    expect(html).not.toContain("Remove ");
  });

  it("a meal no longer on its day, or a path that is no date, is gone (with the way back to the plan); a served one goes to its logged meal", () => {
    for (const url of [`/plan/2026-10-14/${id(99)}`, "/plan/someday/new"]) {
      const gone = renderPlan(url, planWeek([LUNCH]));
      expect(gone, url).toContain("That meal is gone");
      expect(gone, url).toContain(">Meal Plan</a>");
      expect(gone, url).not.toContain('id="plan-name"');
    }
    const served = renderPlan(`/plan/2026-10-14/${LUNCH.slotId}`, planWeek([{ ...LUNCH, served: { mealId: id(90), servedAt: "x" } }]));
    expect(served).not.toContain('id="plan-name"');
    expect(served).not.toContain("That meal is gone");
    // Serving one already served goes to its logged meal too.
    const again = renderPlan(`/plan/2026-10-14/${LUNCH.slotId}?serve=1`, planWeek([{ ...LUNCH, served: { mealId: id(90), servedAt: "x" } }]));
    expect(again).not.toContain(">Serve</button>");
  });

  // SPEC §3.5: today after a blocked one tap, or an earlier day.
  it("?serve=1 is the meal's Serve: titled Serve with the X and no guide, its plate with stars, When; no plan fields", () => {
    const html = renderPlan(`/plan/2026-10-14/${LUNCH.slotId}?serve=1`, planWeek([LUNCH]));
    expect(html).toMatch(/>Serve<\/h1>/);
    expect(html).toContain('aria-label="Close"');
    expect(html).not.toContain('<span class="sr-only">Back</span>');
    expect(html).not.toContain("How to");
    expect(html).not.toContain('id="plan-name"');
    expect(html).toContain("Rating for Broccoli Cheese Egg Muffins");
    expect(html).toContain('id="plate-when"');
    expect(html).toContain(">Serve</button>");
    // Storage's live copy: 6 left, so the 1 planned is served as it is.
    expect(html).toContain(">Fridge · 6 of 6 left</p>");
  });

  it("?serve=1 on a future day is just the meal (no Serve there); on a meal that ran out it opens flagged with Add to storage", () => {
    const future = renderPlan(`/plan/2026-10-16/${LUNCH.slotId}?serve=1`, {
      ...planWeek([]),
      days: [{ date: "2026-10-16", planned: true, meals: [LUNCH] }],
    });
    expect(future).toMatch(/>Plan a meal<\/h1>/);
    const ran = renderPlan(`/plan/2026-10-14/${LUNCH.slotId}?serve=1`, planWeek([LUNCH]), [{ ...TUB, status: "finished", servingsLeft: 0 }]);
    expect(ran).toContain("Broccoli Cheese Egg Muffins has run out, so Lunch isn&#x27;t served yet.");
    expect(ran).toContain("None left. Add a new batch or remove it.");
    expect(ran).toContain(">Add to storage</button>");
    expect(ran).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Serve<\/button>/);
  });

  it("?serve=1 with less left than planned: the stepper starts at what is left, and the row says so", () => {
    const html = renderPlan(
      `/plan/2026-10-14/${LUNCH.slotId}?serve=1`,
      planWeek([{ ...LUNCH, items: [{ ...LUNCH.items[0]!, servings: 3 } as PlannedMeal["items"][number]] }]),
      [{ ...TUB, servingsLeft: 2 }],
    );
    expect(html).toContain("Only 2 left.");
    expect(html).toMatch(/aria-live="polite"[^>]*>2<\/span>/);
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
    expect(html).toContain("None left. Add a new batch or remove it.");
    expect(html).toContain('aria-label="Add to storage: Broccoli Cheese Egg Muffins"');
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

  it("Edit meal with add=1 (a served meal's Add more, ledger 944) opens with Add more open; plain Edit doesn't", () => {
    h.meal = { data: MEAL, isError: false };
    expect(renderAt(`/log-meal?edit=${MEAL.id}&add=1`)).toContain("[Add more sheet]");
    expect(renderAt(`/log-meal?edit=${MEAL.id}`)).not.toContain("[Add more sheet]");
    // Only Edit reads it.
    expect(renderAt(`/log-meal?add=1`)).not.toContain("[Add more sheet]");
    h.meal = { data: undefined, isError: false };
  });

  // VERIFY-p2-c1 #6; VERIFY-p3-c1: "You're offline." once, and that is the app's banner, not this page.
  it("Edit opened offline with no meal yet shows no skeleton, no \"gone\" and no second offline line", () => {
    h.offline = true;
    for (const meal of [
      { data: undefined, isError: false },
      { data: undefined, isError: true },
    ]) {
      h.meal = meal;
      const html = renderAt(`/log-meal?edit=${MEAL.id}`);
      expect(html).not.toContain("offline");
      expect(html).toContain("Edit meal");
      expect(html).not.toContain("skeleton");
      expect(html).not.toContain("That meal is gone");
      expect(html).not.toContain('id="plate-when"');
    }
    // A meal already in hand opens as usual (Save waits, as ledger 766 has it).
    h.meal = { data: MEAL, isError: false };
    expect(renderAt(`/log-meal?edit=${MEAL.id}`)).toContain('id="plate-when"');
    h.offline = false;
    h.meal = { data: undefined, isError: false };
  });
});

describe("resolvePlateStart", () => {
  const base = {
    offline: false,
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

  it("Edit offline: offline until the meal answers, whatever the paused fetch says; a meal in hand is ready", () => {
    const offline = { ...base, mode: "edit" as const, offline: true };
    expect(resolvePlateStart(offline)).toEqual({ status: "offline" });
    expect(resolvePlateStart({ ...offline, meal: { isError: true, data: undefined } })).toEqual({ status: "offline" });
    expect(resolvePlateStart({ ...offline, meal: { isError: false, data: MEAL } }).status).toBe("ready");
    // Log meal and Serve are unchanged offline.
    expect(resolvePlateStart({ ...base, mode: "log", offline: true })).toEqual({ status: "ready", plate: [] });
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

  it("Plan a meal: a new meal is an empty plate; a planned one its items; gone once the plan has answered without it", () => {
    const plan = { date: "2026-10-14", isNew: false, meal: undefined, settled: false, gone: false };
    const planned: PlannedMeal = { slotId: id(51), name: "Lunch", time: null, position: 0, served: null, items: [{ kind: "recipe", id: id(61), recipe: RECIPE, leftOut: [] }] };
    expect(resolvePlateStart({ ...base, mode: "plan", plan: { ...plan, isNew: true } })).toEqual({ status: "ready", plate: [] });
    expect(resolvePlateStart({ ...base, mode: "plan", plan })).toEqual({ status: "loading" });
    expect(resolvePlateStart({ ...base, mode: "plan", offline: true, plan })).toEqual({ status: "offline" });
    expect(resolvePlateStart({ ...base, mode: "plan", plan: { ...plan, settled: true } })).toEqual({ status: "missing" });
    expect(resolvePlateStart({ ...base, mode: "plan", plan: { ...plan, date: null, isNew: true } })).toEqual({ status: "missing" });
    const ready = resolvePlateStart({ ...base, mode: "plan", plan: { ...plan, meal: planned } });
    expect(ready.status === "ready" && ready.plate.map((entry) => entry.kind)).toEqual(["recipe"]);
    // The save said it is gone: missing, whatever the plan still holds.
    expect(resolvePlateStart({ ...base, mode: "plan", plan: { ...plan, meal: planned, gone: true } })).toEqual({ status: "missing" });
  });

  it("a planned meal's Serve waits for Storage's lists too, then opens each container as it is now", () => {
    const planned: PlannedMeal = {
      slotId: id(51),
      name: "Lunch",
      time: null,
      position: 0,
      served: null,
      items: [{ kind: "storage", id: id(60), servings: 3, container: TUB }],
    };
    const serve = { ...base, mode: "planServe" as const, plan: { date: "2026-10-14", isNew: false, meal: planned, settled: true, gone: false } };
    expect(resolvePlateStart({ ...serve, storageQueries: [{ isPending: false, isFetching: true }, settled] })).toEqual({ status: "loading" });
    const ready = resolvePlateStart({ ...serve, containers: [{ ...TUB, servingsLeft: 2 }], storageQueries: [settled, settled] });
    expect(ready.status === "ready" && ready.plate.map((entry) => entry.kind === "storage" && [entry.servings, entry.planned])).toEqual([[2, 3]]);
    // Plan a meal never waits on Storage, and keeps what was planned.
    const plan = resolvePlateStart({ ...serve, mode: "plan", containers: [{ ...TUB, servingsLeft: 2 }], storageQueries: [{ isPending: true, isFetching: true }] });
    expect(plan.status === "ready" && plan.plate.map((entry) => entry.kind === "storage" && entry.servings)).toEqual([3]);
  });

  it("Log meal: waits for what was asked for, then puts it on", () => {
    expect(resolvePlateStart({ ...base, mode: "log", prefill: { ...base.prefill, loading: true } })).toEqual({ status: "loading" });
    expect(resolvePlateStart({ ...base, mode: "log" })).toEqual({ status: "ready", plate: [] });
    const ready = resolvePlateStart({ ...base, mode: "log", prefill: { loading: false, food: AVOCADO, recipe: RECIPE } });
    expect(ready.status === "ready" && ready.plate.map((entry) => entry.kind)).toEqual(["recipe", "food"]);
  });

  it("Log meal: a deleted recipe is left off, like a deleted food (957, verifier B c1)", () => {
    const deleted = { ...RECIPE, deletedAt: "2026-11-07T10:00:00.000Z" };
    expect(resolvePlateStart({ ...base, mode: "log", prefill: { loading: false, food: undefined, recipe: deleted } })).toEqual({
      status: "ready",
      plate: [],
    });
    const live = resolvePlateStart({ ...base, mode: "log", prefill: { loading: false, food: undefined, recipe: { ...RECIPE, deletedAt: null } } });
    expect(live.status === "ready" && live.plate.map((entry) => entry.kind)).toEqual(["recipe"]);
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
