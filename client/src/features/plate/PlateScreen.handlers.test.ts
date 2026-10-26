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
import { Textarea } from "../../components/ui/Input.js";
import { Switch } from "../../components/ui/Switch.js";
import { AddMoreSheet } from "../storage/components/AddMoreSheet.js";
import { LeftoversFields } from "../storage/components/LeftoversFields.js";
import { PlateItemRow } from "./PlateItemRow.js";
import { PlateForm, type PlateMode } from "./PlateScreen.js";
import { containerEntry, fromMeal, type PlateAction, type PlateEntry } from "./plate.js";

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
const submit = () => (again().props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
const saveButton = (tree: El) => one(tree, (element) => element.type === Button && element.props.type === "submit");

beforeEach(() => {
  props = {};
  h.creates.length = 0;
  h.updates.length = 0;
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
