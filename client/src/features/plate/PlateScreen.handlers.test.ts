// Drives the plate's OWN state without a DOM (ledger 902): what actually
// reaches the meal request after the parent adds through Add more, rates,
// leaves an ingredient out, steps servings, picks a time and saves; the
// leftovers half of Log meal; Serve's run-out hold; Edit's 409; offline.
// Ported from the LogFoodForm, ServeSheet and LogFoodPage suites, whose
// pins still apply on the one page.
//
// Harness idiom: the vi.hoisted hook store (ServeSheet.handlers.test.ts).
// React's useState/useRef are a store, so the form is called as a plain
// function, its element tree read and its callbacks invoked.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PLATE_NOT_AN_INGREDIENT, PLATE_NOTHING_COUNTS, type MealItem, type StorageItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], refs: [] as { current: unknown }[], i: 0, r: 0 };
  const mutation = { isPending: false, isError: false, error: null as unknown };
  type Call = { input: unknown; options: { onSuccess?: (value?: unknown) => void; onError?: (error: unknown) => void } };
  return {
    store,
    mutation,
    network: { offline: false },
    creates: [] as Call[],
    updates: [] as Call[],
    planSaves: [] as Call[],
    containersSaved: [] as Call[],
    storage: { isPending: false },
    usage: [] as unknown[],
    taps: { guarded: 0 },
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
  };
});

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useState: h.useState,
  useRef: h.useRef,
}));

const recorder = (calls: typeof h.creates) => ({
  mutate: (input: unknown, options: (typeof h.creates)[number]["options"] = {}) => calls.push({ input, options }),
  get isPending() {
    return h.mutation.isPending;
  },
  get isError() {
    return h.mutation.isError;
  },
  get error() {
    return h.mutation.error;
  },
});
vi.mock("../tracking/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCreateMeal: (_babyId: string, usage: unknown) => {
    h.usage.push(usage);
    return recorder(h.creates);
  },
  useUpdateMeal: () => recorder(h.updates),
}));
vi.mock("../plan/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSavePlannedMeal: () => recorder(h.planSaves),
}));
vi.mock("../storage/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCreateStorageItem: () => ({
    mutate: (input: unknown, options: (typeof h.creates)[number]["options"] = {}) => h.containersSaved.push({ input, options }),
    get isPending() {
      return h.storage.isPending;
    },
  }),
}));
vi.mock("../../lib/online.js", () => ({ useIsOffline: () => h.network.offline }));
vi.mock("../../lib/tapGuard.js", () => ({ ignoreTapsBriefly: () => h.taps.guarded++ }));

import { ApiError } from "../../lib/api.js";
import { Button } from "../../components/ui/Button.js";
import { DateTimeField } from "../../components/ui/DateTimeField.js";
import { Field } from "../../components/ui/Field.js";
import { Textarea } from "../../components/ui/Input.js";
import { Switch } from "../../components/ui/Switch.js";
import { Sheet } from "../../components/ui/Sheet.js";
import { AddMoreSheet } from "../storage/components/AddMoreSheet.js";
import { AddStorageItemForm } from "../storage/components/AddStorageItemForm.js";
import { LeftoversFields } from "../storage/components/LeftoversFields.js";
import { PlateItemRow } from "./PlateItemRow.js";
import { PlateForm, planServeStart, type PlateMode } from "./PlateScreen.js";
import { containerEntry, fromMeal, fromPlanned, type PlateAction, type PlateEntry } from "./plate.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EGG = { id: id(3), slug: "egg", name: "Egg", category: "protein" as const, emoji: null };
const BANANA = { id: id(4), slug: "banana", name: "Banana", category: "fruit" as const, emoji: null };
const PASTA = { id: id(10), title: "Creamy Cashew & Broccoli Pasta" };
const CASHEWS = { id: id(5), slug: "cashews", name: "Cashews", emoji: null };
const TUB: StorageItem = {
  id: id(20),
  label: null,
  foods: [{ id: id(1), slug: "broccoli", name: "Broccoli", emoji: null }],
  recipeId: null,
  recipeTitle: null,
  preparedAt: "2026-10-14T10:00:00.000Z",
  location: "fridge",
  status: "active",
  statusChangedAt: "2026-10-14T10:00:00.000Z",
  expiresAt: "2026-11-14T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: 6,
  servingsLeft: 2,
  bestBy: null,
  notes: null,
};
const MUFFINS: StorageItem = { ...TUB, id: id(21), foods: [], recipeId: id(11), recipeTitle: "Egg Muffins", servingsLeft: 6 };

/** A saved meal as GET /api/meals/:id answers it. */
const MEAL: MealItem = {
  id: id(90),
  babyId: "baby-1",
  servedAt: "2026-10-14T12:20:00.000Z",
  reactionNote: null,
  notes: "Loved the pasta",
  recipeId: PASTA.id,
  recipeTitle: PASTA.title,
  foods: [],
  items: [
    { kind: "recipe", id: id(100), recipe: PASTA, leftOut: [], inferred: false, rating: 5 },
    {
      kind: "storage",
      storageItemId: TUB.id,
      label: null,
      location: "fridge",
      servings: 1,
      parts: [{ kind: "food", id: id(101), food: { ...TUB.foods[0]!, category: "veg" }, rating: 4 }],
    },
  ],
};

interface El {
  type: unknown;
  props: Record<string, unknown>;
}
function findAll(node: unknown, match: (element: El) => boolean, out: El[] = []): El[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, match, out);
    return out;
  }
  const element = node as El;
  if (match(element)) out.push(element);
  for (const value of Object.values(element.props ?? {})) findAll(value, match, out);
  return out;
}
const byType = (type: unknown) => (element: El) => element.type === type;
const one = (tree: El, match: (element: El) => boolean) => {
  const [found] = findAll(tree, match);
  if (!found) throw new Error("no such element");
  return found;
};
/** Every string any element renders as a child. */
const text = (tree: El) =>
  findAll(tree, () => true).flatMap((element) => {
    const children = element.props?.children;
    return (Array.isArray(children) ? children : [children]).filter((child): child is string => typeof child === "string");
  });

let props: Record<string, unknown> = {};
/** A fresh plate page (its state starts over). */
function render(mode: PlateMode = "log", initialPlate: PlateEntry[] = [], extra: Record<string, unknown> = {}): El {
  h.store.states = [];
  h.store.refs = [];
  props = {
    mode,
    babyId: "baby-1",
    initialPlate,
    containers: [],
    onDone: () => doneCalls.push(mode),
    onMealChanged: () => mealChanged.push(mode),
    reloaded: false,
    ...extra,
  };
  return again();
}
/** The same page rendered again, with whatever its handlers set. */
function again(): El {
  h.store.i = 0;
  h.store.r = 0;
  return (PlateForm as unknown as (p: unknown) => El)(props);
}
const doneCalls: string[] = [];
const mealChanged: string[] = [];

function addMore(change: Partial<{ items: StorageItem[]; foods: unknown[]; recipes: unknown[]; removed: Record<string, string[]> }>) {
  (one(again(), (element) => element.props?.id === "plate-add-more").props.onClick as () => void)();
  const sheet = one(again(), byType(AddMoreSheet));
  (sheet.props.onDone as (value: unknown) => void)({
    items: [],
    foods: [],
    recipes: [],
    ...change,
    removed: { itemIds: [], recipeIds: [], foodIds: [], ...change.removed },
  });
}
const rows = (tree: El) => findAll(tree, byType(PlateItemRow));
const dispatch = (action: PlateAction) => (rows(again())[0]!.props.dispatch as (a: PlateAction) => void)(action);
// The page is the plate's form, then (outside it) CD-Ran-Out-Add's sheet.
const submit = () => (one(again(), byType("form")).props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
const saveButton = (tree: El) => one(tree, (element) => element.type === Button && element.props.type === "submit");

beforeEach(() => {
  props = {};
  h.creates.length = 0;
  h.updates.length = 0;
  h.planSaves.length = 0;
  h.containersSaved.length = 0;
  h.usage.length = 0;
  h.mutation.isPending = false;
  h.mutation.isError = false;
  h.mutation.error = null;
  h.network.offline = false;
  h.storage.isPending = false;
  h.taps.guarded = 0;
  doneCalls.length = 0;
  mealChanged.length = 0;
});

describe("Log meal: Add more is the only adder (ledger 902)", () => {
  it("opens Add more with the plate ticked, needing no container; Done puts the picks on, × and stars go through the reducer", () => {
    render("log");
    addMore({ recipes: [PASTA], foods: [EGG] });
    let sheetOpen = findAll(again(), byType(AddMoreSheet));
    expect(sheetOpen).toHaveLength(0); // Done closes it
    expect(rows(again()).map((row) => (row.props.entry as PlateEntry).kind)).toEqual(["recipe", "food"]);

    (one(again(), (element) => element.props?.id === "plate-add-more").props.onClick as () => void)();
    sheetOpen = findAll(again(), byType(AddMoreSheet));
    expect(sheetOpen[0]!.props.serving).toEqual({ itemIds: [], recipeIds: [PASTA.id], foodIds: [EGG.id] });
    expect(sheetOpen[0]!.props.requireContainer).toBe(false);
    (sheetOpen[0]!.props.onClose as () => void)();
    expect(findAll(again(), byType(AddMoreSheet))).toHaveLength(0);
  });

  it("saves the whole plate: a fresh recipe with its stars and leave-out, a fresh Egg with its own stars, When and the notes", () => {
    render("log");
    addMore({ recipes: [PASTA], foods: [EGG] });
    dispatch({ type: "rate", key: `recipe:${PASTA.id}`, rating: 4 });
    dispatch({ type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: CASHEWS });
    dispatch({ type: "rate", key: `food:${EGG.id}`, rating: 2 });
    const picked = new Date(2026, 9, 14, 12, 5);
    (one(again(), byType(DateTimeField)).props.onChange as (value: Date) => void)(picked);
    const [reaction, notes] = findAll(again(), byType(Textarea));
    (reaction!.props.onChange as (event: unknown) => void)({ target: { value: "  " } });
    (notes!.props.onChange as (event: unknown) => void)({ target: { value: " ate it all " } });
    submit();
    expect(h.creates.map((call) => call.input)).toEqual([
      {
        items: [
          { kind: "recipe", recipeId: PASTA.id, rating: 4, leftOutFoodIds: [CASHEWS.id] },
          { kind: "food", foodId: EGG.id, rating: 2 },
        ],
        servedAt: picked.toISOString(),
        reactionNote: null,
        notes: "ate it all",
      },
    ]);
    expect(h.updates).toEqual([]);
  });

  it("asks for something on the plate before saving anything, and keeps Save enabled (item 235)", () => {
    const tree = render("log");
    expect(saveButton(tree).props.disabled).toBe(false);
    submit();
    expect(h.creates).toEqual([]);
    expect(text(again())).toContain("Add at least one food");
  });

  it("leaves when the meal saves, arming the brief tap guard (ledger 767)", () => {
    render("log", [{ kind: "food", food: EGG, rating: null }]);
    submit();
    h.creates[0]!.options.onSuccess!();
    expect(doneCalls).toEqual(["log"]);
    expect(h.taps.guarded).toBe(1);
  });

  it("reads Saving… and saves once while the request is in flight", () => {
    render("log", [{ kind: "food", food: EGG, rating: null }]);
    h.mutation.isPending = true;
    expect(saveButton(again()).props.children).toBe("Saving…");
    expect(saveButton(again()).props.disabled).toBe(true);
    submit();
    expect(h.creates).toEqual([]);
  });

  it("leaving every ingredient of the only recipe out holds the save, in its own words (VERIFY-p2-c1 #3)", () => {
    render("log");
    addMore({ recipes: [PASTA] });
    dispatch({ type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: CASHEWS, ingredientIds: [CASHEWS.id, EGG.id] });
    dispatch({ type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: EGG });
    expect(saveButton(again()).props.disabled).toBe(false);
    submit();
    expect(h.creates).toEqual([]);
    expect(text(again())).toContain("Leave at least one food on the plate.");
    expect(text(again())).not.toContain("Couldn't save that — try again.");
    // Ticking one back lets it save.
    dispatch({ type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: EGG });
    expect(text(again())).not.toContain("Leave at least one food on the plate.");
    submit();
    expect(h.creates).toHaveLength(1);
  });

  it("the server's own nothing-counts 400 says the same, not \"try again\"; any other 400 stays generic", () => {
    render("edit", fromMeal(MEAL), { meal: MEAL });
    h.mutation.isError = true;
    h.mutation.error = new ApiError(400, "invalid_request", { error: "invalid_request", details: { items: PLATE_NOTHING_COUNTS } });
    expect(text(again())).toContain("Leave at least one food on the plate.");
    expect(text(again())).not.toContain("Couldn't save that — try again.");
    h.mutation.error = new ApiError(400, "invalid_request", { error: "invalid_request", details: { items: "at most 50 foods per meal" } });
    expect(text(again())).toContain("Couldn't save that — try again.");
  });

  // VERIFY-p3-c1 #6: another device took an ingredient out of the recipe while the plate was open.
  it("a stale leave-out 400 says the recipe changed, drops that leave-out, and the next save goes through", () => {
    const stale = new ApiError(400, "invalid_request", {
      error: "invalid_request",
      details: { leftOutFoodIds: PLATE_NOT_AN_INGREDIENT, recipeId: PASTA.id, foodIds: [CASHEWS.id] },
    });
    render("log");
    addMore({ recipes: [PASTA] });
    dispatch({ type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: CASHEWS });
    dispatch({ type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: EGG });
    submit();
    expect(h.creates[0]!.input).toMatchObject({ items: [{ kind: "recipe", leftOutFoodIds: [CASHEWS.id, EGG.id] }] });
    h.creates[0]!.options.onError!(stale);
    h.mutation.isError = true;
    h.mutation.error = stale;
    expect(text(again())).toContain("This recipe changed. Check its ingredients and save again.");
    expect(text(again())).not.toContain("Couldn't save that — try again.");
    h.mutation.isError = false;
    submit();
    expect(h.creates[1]!.input).toMatchObject({ items: [{ kind: "recipe", leftOutFoodIds: [EGG.id] }] });
  });

  it("Edit: the same 400 drops the stale leave-out too; a 409 meal_changed still reloads", () => {
    const stale = new ApiError(400, "invalid_request", {
      error: "invalid_request",
      details: { leftOutFoodIds: PLATE_NOT_AN_INGREDIENT, recipeId: PASTA.id, foodIds: [CASHEWS.id] },
    });
    render("edit", fromMeal(MEAL), { meal: MEAL });
    dispatch({ type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: CASHEWS });
    dispatch({ type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: EGG });
    submit();
    h.updates[0]!.options.onError!(stale);
    expect(mealChanged).toEqual([]);
    submit();
    expect((h.updates[1]!.input as { input: { items: unknown[] } }).input.items[0]).toMatchObject({ leftOutFoodIds: [EGG.id] });
  });

  it("says Couldn't save that when a save fails", () => {
    render("log", [{ kind: "food", food: EGG, rating: null }]);
    h.mutation.isError = true;
    h.mutation.error = new ApiError(500, "internal_error");
    expect(text(again())).toContain("Couldn't save that — try again.");
  });
});

describe("Log meal's leftovers (items 152-153, 348; ledger 759)", () => {
  const openLeftovers = () => (one(again(), byType(Switch)).props.onChange as (open: boolean) => void)(true);
  const fields = () => one(again(), byType(LeftoversFields));
  /** Saves, then lets the meal succeed: the leftovers start only after. */
  const saveAndSettle = () => {
    submit();
    expect(h.creates).toHaveLength(1);
    h.creates[0]!.options.onSuccess!();
  };
  const THREE: PlateEntry[] = [EGG, BANANA, { ...EGG, id: id(6), name: "Pear" }].map((food) => ({ kind: "food", food, rating: null }));

  it("the switch is off with nothing fresh on the plate: a container is already in storage", () => {
    expect(one(render("log", []), byType(Switch)).props.disabled).toBe(true);
    expect(one(render("log", [containerEntry(TUB)]), byType(Switch)).props.disabled).toBe(true);
    expect(one(render("log", THREE), byType(Switch)).props.disabled).toBe(false);
  });

  it("is Log meal's only: Serve and Edit have no switch", () => {
    expect(findAll(render("serve", [containerEntry(TUB)]), byType(Switch))).toHaveLength(0);
    expect(findAll(render("edit", fromMeal(MEAL), { meal: MEAL }), byType(Switch))).toHaveLength(0);
  });

  it("saves a three-food meal's leftovers as ONE container when nobody touches the choice, after the meal", () => {
    render("log", THREE);
    openLeftovers();
    expect(fields().props.containerChoice).toBe("one");
    expect(fields().props.source).toEqual({ kind: "foods", foodIds: [EGG.id, BANANA.id, id(6)] });
    saveAndSettle();
    expect(h.containersSaved).toHaveLength(1);
    expect(h.containersSaved[0]!.input).toMatchObject({ foodIds: [EGG.id, BANANA.id, id(6)], separateItems: false, location: "fridge" });
    expect(doneCalls).toEqual([]);
    h.containersSaved[0]!.options.onSuccess!();
    expect(doneCalls).toEqual(["log"]);
  });

  it("saves separate containers only once the parent asks for them; the recipes win over the foods", () => {
    render("log", [{ kind: "recipe", recipe: PASTA, leftOut: [], savedLeftOut: [], rating: null }, ...THREE]);
    openLeftovers();
    (fields().props.onContainerChoiceChange as (choice: string) => void)("separate");
    saveAndSettle();
    expect(h.containersSaved[0]!.input).toMatchObject({ recipeId: PASTA.id });
    expect(h.containersSaved[0]!.input).not.toHaveProperty("foodIds");
  });

  it("tells meal_logged the switch was on", () => {
    render("log", THREE);
    openLeftovers();
    again();
    expect(h.usage[h.usage.length - 1]).toMatchObject({ leftoversSaved: true });
  });

  it("a failed leftovers save keeps the meal, says so, and Retry (or Enter) retries the container alone — never a second meal", () => {
    render("log", THREE);
    openLeftovers();
    saveAndSettle();
    h.containersSaved[0]!.options.onError!(new Error("nope"));
    const tree = again();
    expect(text(tree)).toContain("Meal saved — couldn't save leftovers. Try again, or close this page to skip it.");
    expect(findAll(tree, byType(Switch))).toHaveLength(0);
    const retry = one(tree, (element) => element.type === Button && element.props.children === "Retry");
    (retry.props.onClick as () => void)();
    submit(); // implicit submission while the banner shows
    expect(h.creates).toHaveLength(1);
    expect(h.containersSaved).toHaveLength(3);
    h.containersSaved[2]!.options.onSuccess!();
    expect(doneCalls).toEqual(["log"]);
    submit();
    expect(h.creates).toHaveLength(1);
  });

  it("judges the leftovers' Best by only while the switch is on", () => {
    render("log", THREE);
    openLeftovers();
    (fields().props.onBestByChange as (value: string) => void)("2000-01-01");
    submit();
    expect(h.creates).toEqual([]);
    expect(fields().props.bestByError).toBe("Best by can't be before the prepared date");
  });
});

describe("Serve (/log-meal?storage=, CD-Serve-From-Storage)", () => {
  it("is titled by its button: Serve, then Serving… while in flight", () => {
    render("serve", [containerEntry(TUB)]);
    expect(saveButton(again()).props.children).toBe("Serve");
    h.mutation.isPending = true;
    expect(saveButton(again()).props.children).toBe("Serving…");
  });

  it("Add more needs a container ticked here (ledger 878b)", () => {
    render("serve", [containerEntry(TUB)]);
    (one(again(), (element) => element.props?.id === "plate-add-more").props.onClick as () => void)();
    const sheet = one(again(), byType(AddMoreSheet));
    expect(sheet.props.requireContainer).toBe(true);
    expect(sheet.props.serving).toEqual({ itemIds: [TUB.id], recipeIds: [], foodIds: [] });
  });

  it("serves the container with its servings, stepped within what is left, and its stars; a fresh recipe beside a tub of it is its own item (799)", () => {
    render("serve", [containerEntry(MUFFINS)], { containers: [MUFFINS] });
    addMore({ recipes: [{ id: MUFFINS.recipeId!, title: "Egg Muffins" }], items: [TUB] });
    dispatch({ type: "servings", key: `storage:${MUFFINS.id}`, servings: 9 });
    dispatch({ type: "rate", key: `storage:${MUFFINS.id}`, partId: MUFFINS.recipeId!, rating: 5 });
    submit();
    expect((h.creates[0]!.input as { items: unknown[] }).items).toEqual([
      { kind: "storage", storageItemId: MUFFINS.id, servings: 6, ratings: { [MUFFINS.recipeId!]: 5 } },
      { kind: "storage", storageItemId: TUB.id, servings: 1 },
      { kind: "recipe", recipeId: MUFFINS.recipeId, rating: null },
    ]);
  });

  it("passes the containers as Storage had them, so a serve that empties one can say so", () => {
    render("serve", [containerEntry(TUB)], { containers: [TUB] });
    expect(h.usage[h.usage.length - 1]).toEqual({ leftoversSaved: false, containers: [TUB] });
  });

  it("says Couldn't serve when a serve fails", () => {
    render("serve", [containerEntry(TUB)]);
    h.mutation.isError = true;
    h.mutation.error = new ApiError(500, "internal_error");
    expect(text(again())).toContain("Couldn't serve — try again.");
  });
});

// CD-Serve-Ran-Out: Storage (or the server's 409, once storage refetches)
// says a container on the plate has nothing left.
describe("a container that has run out", () => {
  const empty = { ...TUB, status: "finished" as const, servingsLeft: 0 };

  it("holds the save with a status line naming it, until × takes it off", () => {
    const tree = render("serve", [containerEntry(TUB), containerEntry(MUFFINS)], { containers: [empty] });
    expect(text(tree)).toContain("Broccoli has run out, so this meal isn't served yet.");
    expect(one(tree, (element) => element.props?.id === "plate-ran-out").props.role).toBe("status");
    expect(saveButton(tree).props.disabled).toBe(true);
    expect(saveButton(tree).props["aria-describedby"]).toBe("plate-ran-out");
    submit();
    expect(h.creates).toEqual([]);
    dispatch({ type: "remove", key: `storage:${TUB.id}` });
    const after = again();
    expect(findAll(after, (element) => element.props?.id === "plate-ran-out")).toHaveLength(0);
    expect(saveButton(after).props.disabled).toBe(false);
    submit();
    expect((h.creates[0]!.input as { items: unknown[] }).items).toEqual([
      { kind: "storage", storageItemId: MUFFINS.id, servings: 1 },
    ]);
  });

  it("on Log meal the line says saved, not served; the server's own refusal shows no second error", () => {
    const tree = render("log", [containerEntry(TUB)], { containers: [empty] });
    expect(text(tree)).toContain("Broccoli has run out, so this meal isn't saved yet.");
    h.mutation.isError = true;
    h.mutation.error = new ApiError(409, "conflict", { error: "conflict", storageItemId: TUB.id });
    expect(text(again())).not.toContain("Couldn't save that — try again.");
  });
});

// SPEC §3.5: a past day's Serve, and today's after a blocked one tap, go
// through the plate, linked to the planned meal (CD-Serve-Ran-Out,
// CD-Ran-Out-Add, CD-Ran-Out-Added).
describe("a planned meal's Serve (/plan/:date/:slotId?serve=1)", () => {
  const PLAN = { date: "2026-10-14", today: "2026-10-14", slotId: id(51), name: "Lunch", time: "12:00" };
  const finished = { ...MUFFINS, status: "finished" as const, servingsLeft: 0 };
  const NEW_BATCH: StorageItem = { ...MUFFINS, id: id(22), servingsLeft: 6, preparedAt: "2026-10-14T16:05:00.000Z" };
  let gone: Array<string | null> = [];
  const renderServe = (initialPlate: PlateEntry[], plan: Record<string, unknown> = {}, containers: StorageItem[] = []) =>
    render("planServe", initialPlate, { plan: { ...PLAN, ...plan }, containers, onPlanGone: (mealId: string | null) => gone.push(mealId) });
  const planned = () =>
    fromPlanned([
      { kind: "recipe", id: id(60), recipe: PASTA, leftOut: [{ ...CASHEWS, category: "legume" }] },
      { kind: "storage", id: id(61), servings: 2, container: MUFFINS },
    ]);
  const form = (tree: El) => one(tree, byType("form"));
  beforeEach(() => {
    gone = [];
  });

  it("is the plate with its stars, When, Reaction and Notes, no plan fields; Serve sends the planned items linked to the meal", () => {
    const tree = renderServe(planned());
    expect(findAll(tree, (element) => element.props?.id === "plan-name")).toHaveLength(0);
    expect(rows(tree).map((row) => row.props.planning)).toEqual([false, false]);
    expect(findAll(tree, byType(Textarea))).toHaveLength(2);
    expect(saveButton(tree).props.children).toBe("Serve");
    // Today: When is now.
    expect(Math.abs((one(tree, byType(DateTimeField)).props.value as Date).getTime() - Date.now())).toBeLessThan(60_000);
    // Add more doesn't insist on a container here.
    (one(tree, (element) => element.props?.id === "plate-add-more").props.onClick as () => void)();
    expect(one(again(), byType(AddMoreSheet)).props.requireContainer).toBe(false);
    submit();
    const input = h.creates[0]!.input as Record<string, unknown>;
    expect(input).toMatchObject({
      plannedMealId: id(51),
      // The planned leave-out is new to this meal, so it is sent.
      items: [
        { kind: "recipe", recipeId: PASTA.id, rating: null, leftOutFoodIds: [CASHEWS.id] },
        { kind: "storage", storageItemId: MUFFINS.id, servings: 2 },
      ],
      reactionNote: null,
      notes: null,
    });
    expect(typeof input.tz).toBe("string");
    expect(doneCalls).toEqual([]);
    h.creates[0]!.options.onSuccess!();
    expect(doneCalls).toEqual(["planServe"]);
  });

  it("a past day starts When at its planned time, or noon without one; today at now", () => {
    const at = (time: string | null) => planServeStart({ date: "2026-10-13", today: "2026-10-14", time });
    expect(at("07:30")).toEqual(new Date(2026, 9, 13, 7, 30));
    expect(at(null)).toEqual(new Date(2026, 9, 13, 12, 0));
    const now = new Date(2026, 9, 14, 9, 41, 27);
    expect(planServeStart({ date: "2026-10-14", today: "2026-10-14", time: "07:30" }, now)).toEqual(new Date(2026, 9, 14, 9, 41));
    const tree = renderServe(planned(), { date: "2026-10-13", time: "07:30" });
    expect(one(tree, byType(DateTimeField)).props.value).toEqual(new Date(2026, 9, 13, 7, 30));
  });

  it("a run-out container holds Serve with the meal's own line (finished, or discarded), until it comes off", () => {
    let tree = renderServe(planned(), {}, [finished]);
    expect(text(tree)).toContain("Egg Muffins has run out, so Lunch isn't served yet.");
    expect(saveButton(tree).props.disabled).toBe(true);
    submit();
    expect(h.creates).toEqual([]);
    tree = renderServe(planned(), {}, [{ ...MUFFINS, status: "discarded" }]);
    expect(text(tree)).toContain("Egg Muffins was discarded, so Lunch isn't served yet.");
    dispatch({ type: "remove", key: `storage:${MUFFINS.id}` });
    expect(saveButton(again()).props.disabled).toBe(false);
  });

  it("Add to storage on the spot: the app's form in a sheet outside the plate's form, prefilled from the empty one; the new batch takes its place; nothing is logged", () => {
    renderServe(planned(), {}, [finished]);
    expect(findAll(again(), byType(Sheet))).toHaveLength(0);
    (rows(again())[1]!.props.onAddToStorage as (entry: PlateEntry) => void)(rows(again())[1]!.props.entry as PlateEntry);
    const tree = again();
    const addForm = one(tree, byType(AddStorageItemForm));
    expect(one(tree, byType(Sheet)).props).toMatchObject({ open: true, title: "Add to storage", showClose: true, fixedHeight: true });
    expect(findAll(form(tree), byType(AddStorageItemForm))).toHaveLength(0);
    expect(addForm.props.prefill).toEqual({ source: "recipe", recipeId: MUFFINS.recipeId, location: "fridge", servingsTotal: 6 });
    expect(addForm.props.via).toBe("plate_ran_out");
    (addForm.props.onAdded as (items: StorageItem[]) => void)([NEW_BATCH]);
    (addForm.props.onDone as () => void)();
    const after = again();
    expect(findAll(after, byType(Sheet))).toHaveLength(0);
    expect(rows(after).map((row) => (row.props.entry as PlateEntry & { storageItemId?: string }).storageItemId ?? "fresh")).toEqual([
      "fresh",
      NEW_BATCH.id,
    ]);
    expect(findAll(after, (element) => element.props?.id === "plate-ran-out")).toHaveLength(0);
    expect(h.creates).toEqual([]);
    submit();
    expect((h.creates[0]!.input as { items: unknown[] }).items[1]).toEqual({ kind: "storage", storageItemId: NEW_BATCH.id, servings: 2 });
  });

  it("closing Add to storage changes nothing: still flagged, both ways forward", () => {
    renderServe(planned(), {}, [finished]);
    (rows(again())[1]!.props.onAddToStorage as (entry: PlateEntry) => void)(rows(again())[1]!.props.entry as PlateEntry);
    (one(again(), byType(Sheet)).props.onClose as () => void)();
    const tree = again();
    expect(findAll(tree, byType(Sheet))).toHaveLength(0);
    expect(text(tree)).toContain("Egg Muffins has run out, so Lunch isn't served yet.");
    expect((rows(tree)[1]!.props.entry as { storageItemId: string }).storageItemId).toBe(MUFFINS.id);
    expect(h.containersSaved).toEqual([]);
  });

  it("a planned food deleted since holds Serve in its own line until × takes it off", () => {
    renderServe(fromPlanned([{ kind: "food", id: id(62), food: { ...EGG, deleted: true } }, { kind: "food", id: id(63), food: BANANA }]));
    expect(text(again())).toContain("Egg was deleted, so Lunch isn't served yet.");
    expect(saveButton(again()).props.disabled).toBe(true);
    // Enter submits a form whatever the button says: still nothing is sent.
    submit();
    expect(h.creates).toEqual([]);
    dispatch({ type: "remove", key: `food:${EGG.id}` });
    expect(saveButton(again()).props.disabled).toBe(false);
    // Elsewhere a deleted food never holds a save (Edit keeps one by id).
    render("log", fromPlanned([{ kind: "food", id: id(62), food: { ...EGG, deleted: true } }]));
    expect(saveButton(again()).props.disabled).toBe(false);
  });

  it("served elsewhere meanwhile: off to that meal; gone from its day: the page says so; neither shows an error", () => {
    renderServe(planned());
    submit();
    const served = new ApiError(409, "already_served", { error: "already_served", mealId: id(90) });
    h.creates[0]!.options.onError!(served);
    h.creates[0]!.options.onError!(new ApiError(409, "plan_changed", { error: "plan_changed", message: "…" }));
    expect(gone).toEqual([id(90), null]);
    h.mutation.isError = true;
    h.mutation.error = served;
    expect(findAll(again(), (element) => element.props?.role === "alert")).toHaveLength(0);
    h.mutation.error = new ApiError(500, "boom");
    expect(text(again())).toContain("Couldn't serve — try again.");
  });
});

describe("Edit meal (/log-meal?edit=, CD-Edit-Meal + chair decision)", () => {
  it("opens with the meal's When and notes, and an untouched save PATCHes the plate as it was", () => {
    const tree = render("edit", fromMeal(MEAL), { meal: MEAL });
    expect((one(tree, byType(DateTimeField)).props.value as Date).toISOString()).toBe(MEAL.servedAt);
    submit();
    expect(h.creates).toEqual([]);
    expect(h.updates.map((call) => call.input)).toEqual([
      {
        id: MEAL.id,
        input: {
          items: [
            { kind: "recipe", id: id(100), recipeId: PASTA.id, rating: 5 },
            { kind: "storage", storageItemId: TUB.id, ratings: { [id(1)]: 4 } },
          ],
          servedAt: MEAL.servedAt,
          reactionNote: null,
          notes: "Loved the pasta",
        },
      },
    ]);
    h.updates[0]!.options.onSuccess!();
    expect(doneCalls).toEqual(["edit"]);
  });

  it("a kept container's stepper and × change what it took: resized sends the new count, × leaves it out", () => {
    render("edit", fromMeal(MEAL), { meal: MEAL, containers: [TUB] });
    (rows(again())[1]!.props.dispatch as (a: PlateAction) => void)({ type: "servings", key: `storage:${TUB.id}`, servings: 3 });
    submit();
    expect((h.updates[0]!.input as { input: { items: unknown[] } }).input.items[1]).toEqual({
      kind: "storage",
      storageItemId: TUB.id,
      servings: 3,
      ratings: { [id(1)]: 4 },
    });
    dispatch({ type: "remove", key: `storage:${TUB.id}` });
    submit();
    expect((h.updates[1]!.input as { input: { items: unknown[] } }).input.items).toHaveLength(1);
  });

  it("a 409 meal_changed asks the page to reload the meal, and shows no error of its own", () => {
    render("edit", fromMeal(MEAL), { meal: MEAL });
    submit();
    const changed = new ApiError(409, "meal_changed", { error: "meal_changed", message: "…" });
    h.updates[0]!.options.onError!(changed);
    expect(mealChanged).toEqual(["edit"]);
    h.mutation.isError = true;
    h.mutation.error = changed;
    expect(text(again())).not.toContain("Couldn't save that — try again.");
    h.updates[0]!.options.onError!(new ApiError(500, "internal_error"));
    expect(mealChanged).toEqual(["edit"]);
  });

  it("the reloaded plate says why it changed", () => {
    expect(text(render("edit", fromMeal(MEAL), { meal: MEAL, reloaded: true }))).toContain(
      "This meal was changed somewhere else, so it's been reloaded. Make your changes again.",
    );
  });
});

describe("offline (ledger 766)", () => {
  it("disables Save with exactly \"You're offline.\" in a live region under it, and re-enables online", () => {
    render("log", [{ kind: "food", food: EGG, rating: null }]);
    h.network.offline = true;
    const tree = again();
    expect(saveButton(tree).props.disabled).toBe(true);
    expect(saveButton(tree).props["aria-describedby"]).toBe("plate-offline");
    expect(text(tree)).toContain("You're offline.");
    submit();
    expect(h.creates).toEqual([]);
    h.network.offline = false;
    expect(saveButton(again()).props.disabled).toBe(false);
    expect(text(again())).not.toContain("You're offline.");
  });

  it("never reads Saving… offline, even with a paused request, hides the generic error, and keeps the plate editable (M9)", () => {
    render("serve", [containerEntry(TUB)]);
    h.network.offline = true;
    h.mutation.isPending = true;
    h.mutation.isError = true;
    const tree = again();
    expect(saveButton(tree).props.children).toBe("Serve");
    expect(text(tree)).not.toContain("Couldn't serve — try again.");
    expect(rows(tree)[0]!.props.disabled).toBe(false);
    expect(one(tree, (element) => element.props?.id === "plate-add-more").props.disabled).toBe(false);
    expect(one(tree, byType(DateTimeField)).props.disabled).toBe(false);
  });

  it("online, every control waits while the save is in flight", () => {
    render("serve", [containerEntry(TUB)]);
    h.mutation.isPending = true;
    const tree = again();
    expect(rows(tree)[0]!.props.disabled).toBe(true);
    expect(one(tree, (element) => element.props?.id === "plate-add-more").props.disabled).toBe(true);
    expect(one(tree, byType(DateTimeField)).props.disabled).toBe(true);
  });
});

describe("Plan a meal (/plan/:date/:slotId, CD-Plan-Meal)", () => {
  const PLAN = { date: "2026-10-16", today: "2026-10-14", slotId: id(51), name: "Lunch", time: "12:00" };
  const planned = (): PlateEntry[] =>
    fromPlanned([
      { kind: "recipe", id: id(60), recipe: PASTA, leftOut: [{ ...CASHEWS, category: "legume" }] },
      { kind: "storage", id: id(61), servings: 1, container: MUFFINS },
    ]);
  const renderPlan = (plan: Record<string, unknown> = {}, initialPlate = planned()) =>
    render("plan", initialPlate, { plan: { ...PLAN, ...plan }, onPlanGone: (mealId: string | null) => gone.push(mealId) });
  const field = (tree: El, fieldId: string) => one(tree, (element) => element.props?.id === fieldId);
  const type = (fieldId: string, value: string) =>
    (field(again(), fieldId).props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
  let gone: Array<string | null> = [];
  beforeEach(() => {
    gone = [];
  });

  it("has Name, Day and Time, the plate without stars, and no When, Reaction, Notes or leftovers", () => {
    const tree = renderPlan();
    expect(field(tree, "plan-name").props.value).toBe("Lunch");
    expect(text(tree)).toContain("Fri, Oct 16");
    expect(field(tree, "plan-time").props).toMatchObject({ type: "time", value: "12:00" });
    expect(rows(tree).map((row) => row.props.planning)).toEqual([true, true]);
    expect(findAll(tree, byType(DateTimeField))).toHaveLength(0);
    expect(findAll(tree, byType(Textarea))).toHaveLength(0);
    expect(findAll(tree, byType(Switch))).toHaveLength(0);
    expect(text(tree)).not.toContain("Stars are optional.");
    expect(saveButton(tree).props.children).toBe("Save");
    // Add more here never needs a container.
    (field(tree, "plate-add-more").props.onClick as () => void)();
    expect(one(again(), byType(AddMoreSheet)).props.requireContainer).toBe(false);
  });

  it("saves the name, the time and the plate as planned (leave-outs and servings, no stars), then leaves", () => {
    renderPlan();
    type("plan-name", "  Picnic ");
    type("plan-time", "12:30:00");
    dispatch({ type: "servings", key: `storage:${MUFFINS.id}`, servings: 2 });
    submit();
    expect(h.planSaves.map((call) => call.input)).toEqual([
      {
        date: "2026-10-16",
        slotId: id(51),
        today: "2026-10-14",
        input: {
          name: "Picnic",
          time: "12:30",
          items: [
            { kind: "recipe", recipeId: PASTA.id, leftOutFoodIds: [CASHEWS.id] },
            { kind: "storage", storageItemId: MUFFINS.id, servings: 2 },
          ],
        },
      },
    ]);
    expect(doneCalls).toEqual([]);
    h.planSaves[0]!.options.onSuccess!();
    expect(doneCalls).toEqual(["plan"]);
    expect(h.creates).toEqual([]);
    expect(h.updates).toEqual([]);
  });

  it("a time can be cleared; nothing planned is fine; an untouched meal leaves without a write", () => {
    renderPlan();
    submit();
    expect(h.planSaves).toEqual([]);
    expect(doneCalls).toEqual(["plan"]);

    renderPlan();
    type("plan-time", "");
    addMore({ removed: { itemIds: [MUFFINS.id], recipeIds: [PASTA.id], foodIds: [] } });
    submit();
    expect(h.planSaves.map((call) => (call.input as { input: unknown }).input)).toEqual([{ name: "Lunch", time: null, items: [] }]);
  });

  it("+ Add a meal: no slot yet, so even an untouched one saves (POST); its name is required, focus goes there", () => {
    renderPlan({ slotId: null, name: "", time: null }, []);
    submit();
    expect(h.planSaves).toEqual([]);
    expect(one(again(), (element) => element.type === Field && element.props.htmlFor === "plan-name").props.error).toBe("Name is required");
    type("plan-name", "Tea");
    expect(one(again(), (element) => element.type === Field && element.props.htmlFor === "plan-name").props.error).toBeUndefined();
    submit();
    expect(h.planSaves.map((call) => call.input)).toEqual([
      { date: "2026-10-16", slotId: null, today: "2026-10-14", input: { name: "Tea", time: null, items: [] } },
    ]);
  });

  it("a planned container with nothing left (or finished) holds nothing: no ran-out line, and Save goes through", () => {
    renderPlan({}, fromPlanned([{ kind: "storage", id: id(61), servings: 1, container: { ...MUFFINS, servingsLeft: 0, status: "finished" } }]));
    type("plan-name", "Picnic");
    expect(text(again()).join(" ")).not.toContain("has run out");
    expect(saveButton(again()).props.disabled).toBe(false);
    submit();
    expect((h.planSaves[0]!.input as { input: { items: unknown[] } }).input.items).toEqual([
      { kind: "storage", storageItemId: MUFFINS.id, servings: 1 },
    ]);
  });

  it("a plate where nothing counts holds the save in its own words", () => {
    renderPlan({}, []);
    addMore({ recipes: [PASTA] });
    dispatch({ type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: CASHEWS, ingredientIds: [CASHEWS.id] });
    submit();
    expect(h.planSaves).toEqual([]);
    expect(text(again())).toContain("Leave at least one food on the plate.");
  });

  it("served meanwhile: off to the logged meal; gone from its day: the page says so; neither shows an error here", () => {
    renderPlan();
    type("plan-name", "Picnic");
    submit();
    const served = new ApiError(409, "already_served", { error: "already_served", mealId: id(90) });
    h.planSaves[0]!.options.onError!(served);
    const changed = new ApiError(409, "plan_changed", { error: "plan_changed", message: "…" });
    h.planSaves[0]!.options.onError!(changed);
    expect(gone).toEqual([id(90), null]);
    for (const error of [served, changed]) {
      h.mutation.isError = true;
      h.mutation.error = error;
      expect(findAll(again(), (element) => element.props?.role === "alert")).toHaveLength(0);
    }
    h.mutation.error = new ApiError(500, "boom");
    expect(text(again())).toContain("Couldn't save that — try again.");
  });

  it("a stale leave-out drops it and says the recipe changed; the next save goes through without it", () => {
    renderPlan();
    type("plan-name", "Picnic");
    submit();
    const stale = new ApiError(400, "invalid_request", {
      details: { leftOutFoodIds: PLATE_NOT_AN_INGREDIENT, recipeId: PASTA.id, foodIds: [CASHEWS.id] },
    });
    h.planSaves[0]!.options.onError!(stale);
    h.mutation.isError = true;
    h.mutation.error = stale;
    expect(text(again())).toContain("This recipe changed. Check its ingredients and save again.");
    expect(gone).toEqual([]);
    h.mutation.isError = false;
    submit();
    expect((h.planSaves[1]!.input as { input: { items: unknown[] } }).input.items[0]).toEqual({ kind: "recipe", recipeId: PASTA.id, leftOutFoodIds: [] });
  });

  it("offline: Save waits with You're offline.; in flight it reads Saving… and every field waits", () => {
    h.network.offline = true;
    let tree = renderPlan();
    expect(saveButton(tree).props.disabled).toBe(true);
    type("plan-name", "Picnic");
    submit();
    expect(h.planSaves).toEqual([]);
    h.network.offline = false;
    h.mutation.isPending = true;
    tree = again();
    expect(saveButton(tree).props.children).toBe("Saving…");
    expect(field(tree, "plan-name").props.disabled).toBe(true);
    expect(field(tree, "plan-time").props.disabled).toBe(true);
  });
});
