// Plan SPEC §5 (ledger 902): the plate as plain data. The reducer, the
// identity rule (799), a saved meal as a plate, and the request that saves it,
// checked against the shared schemas the server parses with.
import { describe, expect, it } from "vitest";
import {
  PLATE_NOT_AN_INGREDIENT,
  createPlateMealInputSchema,
  plannedItemsInputSchema,
  plateInputFromItems,
  plateKey,
  updatePlateMealInputSchema,
  type MealItem,
  type PlateItem,
  type StorageItem,
} from "@blw/shared";
import { ApiError } from "../../lib/api.js";
import { addMoreDiff, type AddMoreChange, type AddMoreIds, type FreshFood } from "../storage/addMoreSelection.js";
import {
  PLATE_FIELD_ORDER,
  attachContainers,
  containerEntry,
  deletedFoodEntry,
  entryKey,
  RECIPE_PLATE,
  fromMeal,
  fromPlanned,
  hasLeftovers,
  mealLines,
  nothingCounts,
  plateAddMoreServing,
  plateLeftoverSource,
  plateReducer,
  planningFlagLine,
  ranOut,
  ranOutEntry,
  restockPrefill,
  servePlanned,
  servingsMax,
  shortOf,
  staleLeaveOut,
  toMealInput,
  toPlanInput,
  validatePlate,
  type ContainerEntry,
  type PlateEntry,
  type PlateFoodRef,
  type RecipeEntry,
} from "./plate.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BROCCOLI = { id: id(1), slug: "broccoli", name: "Broccoli", category: "veg" as const, emoji: null };
const CARROT = { id: id(2), slug: "carrot", name: "Carrot", category: "veg" as const, emoji: null };
const EGG = { id: id(3), slug: "egg", name: "Egg", category: "protein" as const, emoji: null };
const CASHEW = { id: id(4), slug: "cashew", name: "Cashews", category: "legume" as const, emoji: null };
const GARLIC = { id: id(5), slug: "garlic", name: "Garlic", category: "veg" as const, emoji: null };
const PASTA = { id: id(10), title: "Creamy Cashew & Broccoli Pasta" };
const MUFFINS = { id: id(11), title: "Broccoli Cheese Egg Muffins" };
const PATTIES = { id: id(12), title: "Salmon Oat Patties" };

const CONTAINER: StorageItem = {
  id: id(20),
  label: null,
  foods: [
    { id: BROCCOLI.id, slug: "broccoli", name: "Broccoli", emoji: null },
    { id: CARROT.id, slug: "carrot", name: "Carrot", emoji: null },
  ],
  recipeId: null,
  recipeTitle: null,
  preparedAt: "2026-10-14T10:00:00.000Z",
  location: "freezer",
  status: "active",
  statusChangedAt: "2026-10-14T10:00:00.000Z",
  expiresAt: "2026-11-14T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: 4,
  servingsLeft: 4,
  bestBy: null,
  notes: null,
};
const MUFFIN_TUB: StorageItem = {
  ...CONTAINER,
  id: id(21),
  foods: [],
  recipeId: MUFFINS.id,
  recipeTitle: MUFFINS.title,
  location: "fridge",
  servingsTotal: 6,
  servingsLeft: 2,
};
const NONE = { itemIds: [], recipeIds: [], foodIds: [] };

/** Add more's Done, as the sheet builds it: ticks in, the change out. */
function done(plate: PlateEntry[], ticks: Partial<AddMoreIds>, picks: Partial<AddMoreChange> = {}) {
  const serving = plateAddMoreServing(plate);
  const { removed } = addMoreDiff(serving, { ...NONE, ...ticks });
  return plateReducer(plate, { type: "addMore", change: { removed, items: [], recipes: [], foods: [], ...picks } });
}
const add = (change: { items?: StorageItem[]; recipes?: { id: string; title: string }[]; foods?: FreshFood[] }) =>
  plateReducer([], { type: "addMore", change: { removed: NONE, items: [], recipes: [], foods: [], ...change } });

describe("identity (ledger 799)", () => {
  it("keys each entry exactly as the server's plateKey does", () => {
    const plate = add({ items: [CONTAINER], recipes: [PASTA], foods: [EGG] });
    expect(plate.map(entryKey)).toEqual([
      plateKey({ kind: "storage", storageItemId: CONTAINER.id }),
      plateKey({ kind: "recipe", recipeId: PASTA.id }),
      plateKey({ kind: "food", foodId: EGG.id }),
    ]);
  });

  it("a fresh Broccoli beside a Broccoli + Carrot container, and fresh muffins beside a tub of them, are four items", () => {
    const plate = add({ items: [CONTAINER, MUFFIN_TUB], recipes: [MUFFINS], foods: [BROCCOLI] });
    expect(plate.map((entry) => entry.kind)).toEqual(["storage", "storage", "recipe", "food"]);
  });

  it("Add more hides nothing behind what is on the plate: no food or recipe is covered", () => {
    const plate = add({ items: [CONTAINER, MUFFIN_TUB], recipes: [PASTA], foods: [EGG] });
    expect(plateAddMoreServing(plate)).toEqual({
      itemIds: [CONTAINER.id, MUFFIN_TUB.id],
      recipeIds: [PASTA.id],
      foodIds: [EGG.id],
    });
  });

  it("the exact same thing is never added twice", () => {
    const plate = add({ items: [CONTAINER], foods: [EGG] });
    const again = plateReducer(plate, {
      type: "addMore",
      change: { removed: NONE, items: [CONTAINER], recipes: [PASTA, PASTA], foods: [EGG] },
    });
    expect(again.map(entryKey)).toEqual([...plate.map(entryKey), plateKey({ kind: "recipe", recipeId: PASTA.id })]);
  });
});

describe("containerEntry: a container as the server expands it", () => {
  it("a food container: one part per food, one serving, its live counts", () => {
    expect(containerEntry(CONTAINER)).toEqual({
      kind: "storage",
      storageItemId: CONTAINER.id,
      title: "Broccoli, Carrot",
      location: "freezer",
      servings: 1,
      container: CONTAINER,
      parts: [
        { kind: "food", food: CONTAINER.foods[0], rating: null },
        { kind: "food", food: CONTAINER.foods[1], rating: null },
      ],
    });
  });

  it("recipes first (every recipe of a leftovers container), then held foods", () => {
    const both: StorageItem = { ...MUFFIN_TUB, recipes: [MUFFINS, PATTIES], foods: [CONTAINER.foods[0]!] };
    expect(containerEntry(both).parts.map((part) => (part.kind === "food" ? part.food.id : part.recipe.id))).toEqual([
      MUFFINS.id,
      PATTIES.id,
      BROCCOLI.id,
    ]);
    expect(containerEntry(MUFFIN_TUB).parts).toEqual([{ kind: "recipe", recipe: MUFFINS, rating: null }]);
    expect(containerEntry(MUFFIN_TUB).title).toBe(MUFFINS.title);
  });
});

describe("plateReducer", () => {
  const start = () => add({ items: [CONTAINER], recipes: [PASTA], foods: [EGG] });

  it("Done (ledger 878): unticked things come off, new picks go on at the end, the rest keeps its stars and servings", () => {
    let plate = start();
    plate = plateReducer(plate, { type: "rate", key: entryKey(plate[2]!), rating: 4 });
    plate = plateReducer(plate, { type: "servings", key: entryKey(plate[0]!), servings: 3 });
    const next = done(plate, { itemIds: [CONTAINER.id], foodIds: [EGG.id] }, { items: [MUFFIN_TUB], recipes: [], foods: [GARLIC] });
    expect(next.map(entryKey)).toEqual([entryKey(plate[0]!), entryKey(plate[2]!), `storage:${MUFFIN_TUB.id}`, `food:${GARLIC.id}`]);
    expect(next[0]).toBe(plate[0]);
    expect(next[1]).toBe(plate[2]);
    expect((next[0] as ContainerEntry).servings).toBe(3);
    expect((next[2] as ContainerEntry).servings).toBe(1);
  });

  it("Done with everything still ticked and nothing new changes nothing", () => {
    const plate = start();
    const serving = plateAddMoreServing(plate);
    expect(done(plate, serving)).toEqual(plate);
  });

  it("× takes off exactly that item", () => {
    const plate = start();
    expect(plateReducer(plate, { type: "remove", key: `recipe:${PASTA.id}` }).map(entryKey)).toEqual([
      `storage:${CONTAINER.id}`,
      `food:${EGG.id}`,
    ]);
  });

  it("stars: an item's own, or one part of a container; null clears", () => {
    let plate = start();
    plate = plateReducer(plate, { type: "rate", key: `food:${EGG.id}`, rating: 5 });
    plate = plateReducer(plate, { type: "rate", key: `storage:${CONTAINER.id}`, partId: CARROT.id, rating: 2 });
    plate = plateReducer(plate, { type: "rate", key: `recipe:${PASTA.id}`, rating: 3 });
    plate = plateReducer(plate, { type: "rate", key: `recipe:${PASTA.id}`, rating: null });
    expect((plate[2] as { rating: number | null }).rating).toBe(5);
    expect((plate[1] as RecipeEntry).rating).toBeNull();
    expect((plate[0] as ContainerEntry).parts.map((part) => part.rating)).toEqual([null, 2]);
  });

  it("leave out: unticking adds the food (A–Z), ticking it again takes it back, only on that recipe", () => {
    let plate = add({ recipes: [PASTA, PATTIES] });
    plate = plateReducer(plate, { type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: GARLIC });
    plate = plateReducer(plate, { type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: CASHEW });
    expect((plate[0] as RecipeEntry).leftOut.map((food) => food.name)).toEqual(["Cashews", "Garlic"]);
    expect((plate[1] as RecipeEntry).leftOut).toEqual([]);
    plate = plateReducer(plate, { type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: GARLIC });
    expect((plate[0] as RecipeEntry).leftOut).toEqual([CASHEW]);
  });

  it("servings stay between 1 and what the container can give", () => {
    let plate = add({ items: [MUFFIN_TUB] });
    const key = `storage:${MUFFIN_TUB.id}`;
    plate = plateReducer(plate, { type: "servings", key, servings: 0 });
    expect((plate[0] as ContainerEntry).servings).toBe(1);
    plate = plateReducer(plate, { type: "servings", key, servings: 5 });
    expect((plate[0] as ContainerEntry).servings).toBe(2);
  });
});

describe("servingsMax", () => {
  const entry = (patch: Partial<ContainerEntry>, container: Partial<StorageItem> | null = {}): ContainerEntry => ({
    ...containerEntry(MUFFIN_TUB),
    ...patch,
    container: container ? { ...MUFFIN_TUB, ...container } : undefined,
  });

  it("new to the plate: what is left", () => {
    expect(servingsMax(entry({}))).toBe(2);
  });
  it("kept: what the meal took plus what is left, while active", () => {
    expect(servingsMax(entry({ savedServings: 3 }))).toBe(5);
    expect(servingsMax(entry({ savedServings: 3 }, { status: "finished", servingsLeft: 0 }))).toBe(3);
    expect(servingsMax(entry({ savedServings: 3 }, { status: "discarded" }))).toBe(3);
  });
  it("untracked and active: the input's ceiling; unknown live state: never more than the meal took", () => {
    expect(servingsMax(entry({ savedServings: 2 }, { servingsTotal: null, servingsLeft: null }))).toBe(99);
    expect(servingsMax(entry({ savedServings: 2 }, null))).toBe(2);
  });
});

// A saved meal as GET /api/meals/:id answers it: every item kind.
const ITEMS: PlateItem[] = [
  {
    kind: "recipe",
    id: id(100),
    recipe: PASTA,
    leftOut: [CASHEW],
    inferred: false,
    rating: 5,
  },
  { kind: "food", id: id(101), food: EGG, rating: null },
  {
    kind: "storage",
    storageItemId: CONTAINER.id,
    label: null,
    location: "freezer",
    servings: 2,
    parts: [
      { kind: "food", id: id(102), food: BROCCOLI, rating: 4 },
      { kind: "food", id: id(103), food: CARROT, rating: null },
    ],
  },
  { kind: "recipe", id: id(104), recipe: PATTIES, leftOut: [], inferred: true, rating: null },
  {
    kind: "storage",
    storageItemId: MUFFIN_TUB.id,
    label: "Muffins (old batch)",
    location: "fridge",
    servings: null,
    parts: [{ kind: "recipe", id: id(105), recipe: MUFFINS, rating: 3 }],
  },
];
const MEAL = { items: ITEMS } as Pick<MealItem, "items">;
const FIELDS = { servedAt: new Date("2026-10-14T12:20:00.000Z"), reactionNote: "  ", notes: " Loved the pasta. " };

describe("fromMeal", () => {
  it("a saved meal as a plate: kept items by id, stars, leave-out, servings as taken", () => {
    const plate = fromMeal(MEAL, [CONTAINER]);
    expect(plate[0]).toEqual({
      kind: "recipe",
      id: id(100),
      recipe: PASTA,
      leftOut: [CASHEW],
      savedLeftOut: [CASHEW.id],
      inferred: false,
      rating: 5,
    });
    // A legacy (inferred) recipe says so, so the row offers no Ingredients (VERIFY-p2-c1 #1).
    expect(plate[3]).toMatchObject({ kind: "recipe", recipe: PATTIES, inferred: true });
    expect(plate[1]).toEqual({ kind: "food", id: id(101), food: EGG, rating: null });
    expect(plate[2]).toEqual({
      kind: "storage",
      storageItemId: CONTAINER.id,
      title: "Broccoli, Carrot",
      location: "freezer",
      servings: 2,
      savedServings: 2,
      container: CONTAINER,
      parts: [
        { kind: "food", food: BROCCOLI, rating: 4 },
        { kind: "food", food: CARROT, rating: null },
      ],
    });
    // A container's label wins; one served before 0020 has no servings and no live counts here.
    expect(plate[4]).toMatchObject({ title: "Muffins (old batch)", servings: null, savedServings: null, container: undefined });
  });

  it("a container with no label is named by its recipe, else its foods", () => {
    const plate = fromMeal({ items: [{ ...ITEMS[4]!, label: null } as PlateItem] });
    expect((plate[0] as ContainerEntry).title).toBe(MUFFINS.title);
  });

  it("an older cached body without items is an empty plate", () => {
    expect(fromMeal({})).toEqual([]);
  });
});

describe("mealLines (CD-Food-Log)", () => {
  it("one line per item in plate order: a container under its own name, its first foods' plates", () => {
    expect(mealLines({ items: ITEMS, foods: [] })).toEqual([
      {
        key: id(100),
        name: PASTA.title,
        plates: [RECIPE_PLATE],
        ratings: [{ id: id(100), label: PASTA.title, rating: 5 }],
        leftOut: [CASHEW],
      },
      {
        key: id(101),
        name: "Egg",
        deleted: undefined,
        plates: [{ emoji: "🥚", tint: "dairy" }],
        ratings: [{ id: id(101), label: "Egg", rating: null }],
        leftOut: [],
      },
      {
        key: CONTAINER.id,
        name: "Broccoli, Carrot",
        plates: [
          { emoji: "🥦", tint: "veg" },
          { emoji: "🥕", tint: "veg" },
        ],
        // Ledger 939/944: a container rates each thing it held, by its own item id.
        ratings: [
          { id: id(102), label: "Broccoli", rating: 4 },
          { id: id(103), label: "Carrot", rating: null },
        ],
        leftOut: [],
        storageItemId: CONTAINER.id,
      },
      { key: id(104), name: PATTIES.title, plates: [RECIPE_PLATE], ratings: [{ id: id(104), label: PATTIES.title, rating: null }], leftOut: [] },
      // A recipe container wears the pot; its label names it.
      {
        key: MUFFIN_TUB.id,
        name: "Muffins (old batch)",
        plates: [RECIPE_PLATE],
        ratings: [{ id: id(105), label: MUFFINS.title, rating: 3 }],
        leftOut: [],
        storageItemId: MUFFIN_TUB.id,
      },
    ]);
  });

  it("a recipe rebuilt from a meal logged before the plate says nothing left out (chair §10.1)", () => {
    const inferred = { ...ITEMS[0]!, inferred: true } as PlateItem;
    expect(mealLines({ items: [inferred], foods: [] })[0]!.leftOut).toEqual([]);
  });

  it("marks a deleted food; a cached body from before items lists its foods", () => {
    const gone = { ...EGG, deleted: true };
    expect(mealLines({ items: [{ kind: "food", id: id(101), food: gone, rating: null }], foods: [] })[0]).toMatchObject({ name: "Egg", deleted: true });
    expect(mealLines({ foods: [{ ...BROCCOLI, storageItemId: null }, { ...gone, storageItemId: null }] }).map((line) => [line.key, line.name, line.deleted])).toEqual([
      [BROCCOLI.id, "Broccoli", undefined],
      [EGG.id, "Egg", true],
    ]);
    // No item ids to rate before items.
    expect(mealLines({ foods: [{ ...BROCCOLI, storageItemId: null }] })[0]!.ratings).toEqual([]);
  });

  // Ledger 957: a recipe deleted since stays on the meal, marked, fresh or
  // as a container's part (its star label too).
  it("marks a deleted recipe, fresh or in a container", () => {
    const gone = { id: id(102), title: "Lentil mash", deleted: true };
    const lines = mealLines({
      items: [
        { kind: "recipe", id: id(103), recipe: gone, leftOut: [], inferred: false, rating: 4 },
        {
          kind: "storage",
          storageItemId: id(104),
          label: null,
          location: "fridge",
          servings: 1,
          parts: [
            { kind: "recipe", id: id(105), recipe: gone, rating: null },
            { kind: "food", id: id(106), food: EGG, rating: null },
          ],
        },
      ],
      foods: [],
    });
    expect(lines.map((line) => [line.name, line.deleted])).toEqual([
      ["Lentil mash", true],
      ["Lentil mash\u00a0(deleted)", undefined],
    ]);
    expect(lines[1]!.ratings.map((rating) => [rating.label, rating.deleted])).toEqual([
      ["Lentil mash", true],
      ["Egg", undefined],
    ]);
  });
});

describe("toMealInput", () => {
  it("an untouched saved meal saves as the shared no-op input (ids kept, no servings, no leave-out)", () => {
    const input = toMealInput(fromMeal(MEAL, [CONTAINER, MUFFIN_TUB]), FIELDS);
    expect(input.items).toEqual(plateInputFromItems(ITEMS));
    expect(input).toMatchObject({ servedAt: "2026-10-14T12:20:00.000Z", reactionNote: null, notes: "Loved the pasta." });
    expect(updatePlateMealInputSchema.safeParse(input).success).toBe(true);
  });

  it("an edit sends only what changed: a new leave-out, a resized container; a toggle undone sends nothing", () => {
    let plate = fromMeal(MEAL, [CONTAINER]);
    plate = plateReducer(plate, { type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: GARLIC });
    plate = plateReducer(plate, { type: "toggleLeftOut", key: `recipe:${PATTIES.id}`, food: EGG });
    plate = plateReducer(plate, { type: "toggleLeftOut", key: `recipe:${PATTIES.id}`, food: EGG });
    plate = plateReducer(plate, { type: "servings", key: `storage:${CONTAINER.id}`, servings: 3 });
    const items = toMealInput(plate, FIELDS).items;
    expect(items[0]).toEqual({ kind: "recipe", id: id(100), recipeId: PASTA.id, rating: 5, leftOutFoodIds: [CASHEW.id, GARLIC.id] });
    expect(items[3]).toEqual({ kind: "recipe", id: id(104), recipeId: PATTIES.id, rating: null });
    expect(items[2]).toEqual({ kind: "storage", storageItemId: CONTAINER.id, servings: 3, ratings: { [BROCCOLI.id]: 4, [CARROT.id]: null } });
  });

  it("ticking every ingredient back on a kept recipe sends an empty leave-out", () => {
    const plate = plateReducer(fromMeal(MEAL), { type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: CASHEW });
    expect(toMealInput(plate, FIELDS).items[0]).toMatchObject({ leftOutFoodIds: [] });
  });

  it("× on a kept container leaves it out of the items, which puts its servings back", () => {
    const plate = plateReducer(fromMeal(MEAL), { type: "remove", key: `storage:${CONTAINER.id}` });
    expect(toMealInput(plate, FIELDS).items.map((item) => item.kind)).toEqual(["recipe", "food", "recipe", "storage"]);
  });

  it("a new plate: no ids; a container's servings and only its given stars; a leave-out only when there is one", () => {
    let plate = add({ items: [CONTAINER], recipes: [PASTA, PATTIES], foods: [EGG] });
    plate = plateReducer(plate, { type: "rate", key: `storage:${CONTAINER.id}`, partId: CARROT.id, rating: 2 });
    plate = plateReducer(plate, { type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: CASHEW });
    const input = toMealInput(plate, { ...FIELDS, reactionNote: " mild rash " });
    expect(input.items).toEqual([
      { kind: "storage", storageItemId: CONTAINER.id, servings: 1, ratings: { [CARROT.id]: 2 } },
      { kind: "recipe", recipeId: PASTA.id, rating: null, leftOutFoodIds: [CASHEW.id] },
      { kind: "recipe", recipeId: PATTIES.id, rating: null },
      { kind: "food", foodId: EGG.id, rating: null },
    ]);
    expect(input.reactionNote).toBe("mild rash");
    expect(createPlateMealInputSchema.safeParse(input).success).toBe(true);
    // An unrated new container sends no ratings at all.
    expect(toMealInput(add({ items: [MUFFIN_TUB] }), FIELDS).items).toEqual([
      { kind: "storage", storageItemId: MUFFIN_TUB.id, servings: 1 },
    ]);
  });
});

// CD-Serve-Ran-Out: a container new to the plate that Storage says can give
// nothing more holds the save until it comes off.
describe("ranOut", () => {
  const tub = (patch: Partial<StorageItem>) => containerEntry({ ...MUFFIN_TUB, ...patch });

  it("a new container that is finished, discarded or tracked at 0 left; not one with servings, or untracked", () => {
    expect(ranOut(tub({ servingsLeft: 0 }))).toBe(true);
    expect(ranOut(tub({ status: "finished", servingsLeft: 0 }))).toBe(true);
    expect(ranOut(tub({ status: "discarded" }))).toBe(true);
    expect(ranOut(tub({}))).toBe(false);
    expect(ranOut(tub({ servingsTotal: null, servingsLeft: null }))).toBe(false);
  });

  it("never one the saved meal already holds, nor one whose live copy is unknown", () => {
    expect(ranOut({ ...tub({ status: "finished", servingsLeft: 0 }), savedServings: 2 })).toBe(false);
    expect(ranOut({ ...tub({}), container: undefined })).toBe(false);
  });

  it("attachContainers keeps each container current, so a refetch that finds it empty flags it", () => {
    const plate = add({ items: [CONTAINER, MUFFIN_TUB], foods: [EGG] });
    expect(ranOutEntry(plate)).toBeUndefined();
    const emptied = { ...MUFFIN_TUB, status: "finished" as const, servingsLeft: 0 };
    const live = attachContainers(plate, [emptied]);
    expect(ranOutEntry(live)?.storageItemId).toBe(MUFFIN_TUB.id);
    expect((live[0] as ContainerEntry).container).toBe(CONTAINER); // not in the list: kept as it was
    expect(live[2]).toBe(plate[2]);
  });
});

// Item 152 on the plate: the fresh recipes are the leftovers, else the fresh
// foods; a container is already in storage.
describe("plateLeftoverSource", () => {
  it("fresh recipes win, then fresh foods; a container alone leaves nothing to save", () => {
    const plate = add({ items: [MUFFIN_TUB], recipes: [PASTA, PATTIES], foods: [EGG] });
    expect(plateLeftoverSource(plate)).toEqual({ kind: "recipe", recipeIds: [PASTA.id, PATTIES.id] });
    expect(plateLeftoverSource(add({ items: [MUFFIN_TUB], foods: [EGG, BROCCOLI] }))).toEqual({
      kind: "foods",
      foodIds: [EGG.id, BROCCOLI.id],
    });
    const containerOnly = plateLeftoverSource(add({ items: [MUFFIN_TUB] }));
    expect(hasLeftovers(containerOnly)).toBe(false);
    expect(hasLeftovers(plateLeftoverSource(add({ foods: [EGG] })))).toBe(true);
  });
});

describe("nothingCounts (VERIFY-p2-c1 #3)", () => {
  const PASTA_IDS = [CASHEW.id, GARLIC.id];
  const leaveOut = (plate: PlateEntry[], key: string, ...foods: PlateFoodRef[]) =>
    foods.reduce((acc, food) => plateReducer(acc, { type: "toggleLeftOut", key, food, ingredientIds: PASTA_IDS }), plate);

  it("is a plate of recipes each with every current ingredient left out", () => {
    const plate = leaveOut(add({ recipes: [PASTA] }), `recipe:${PASTA.id}`, CASHEW, GARLIC);
    expect((plate[0] as RecipeEntry).ingredientIds).toEqual(PASTA_IDS);
    expect(nothingCounts(plate)).toBe(true);
    // Ticking one back: it counts again.
    expect(nothingCounts(leaveOut(plate, `recipe:${PASTA.id}`, GARLIC))).toBe(false);
  });

  it("is false while anything else is on the plate, or one ingredient is still ticked, or the ingredients never loaded", () => {
    expect(nothingCounts(leaveOut(add({ recipes: [PASTA] }), `recipe:${PASTA.id}`, CASHEW))).toBe(false);
    expect(nothingCounts(leaveOut(add({ recipes: [PASTA], foods: [EGG] }), `recipe:${PASTA.id}`, CASHEW, GARLIC))).toBe(false);
    expect(nothingCounts(leaveOut(add({ items: [CONTAINER], recipes: [PASTA] }), `recipe:${PASTA.id}`, CASHEW, GARLIC))).toBe(false);
    expect(nothingCounts(add({ recipes: [PASTA] }))).toBe(false);
    expect(nothingCounts([])).toBe(false);
  });

  it("a toggle that names no ingredients keeps the ones already known", () => {
    let plate = leaveOut(add({ recipes: [PASTA] }), `recipe:${PASTA.id}`, CASHEW);
    plate = plateReducer(plate, { type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: GARLIC });
    expect(nothingCounts(plate)).toBe(true);
  });
});

describe("a stale leave-out (VERIFY-p3-c1 #6)", () => {
  const details = { leftOutFoodIds: PLATE_NOT_AN_INGREDIENT, recipeId: PASTA.id, foodIds: [CASHEW.id] };
  it("reads the server's 400, and nothing else", () => {
    expect(staleLeaveOut(new ApiError(400, "invalid_request", { error: "invalid_request", details }))).toEqual({
      recipeId: PASTA.id,
      foodIds: [CASHEW.id],
    });
    expect(staleLeaveOut(new ApiError(409, "conflict", { details }))).toBeNull();
    expect(staleLeaveOut(new ApiError(400, "invalid_request", { details: { ...details, recipeId: undefined } }))).toBeNull();
    expect(staleLeaveOut(new ApiError(400, "invalid_request", { details: { items: "x" } }))).toBeNull();
    expect(staleLeaveOut(new Error("network"))).toBeNull();
  });

  it("drops those leave-outs from that recipe only; another recipe leaving out the same food keeps it", () => {
    let plate = add({ recipes: [PASTA, PATTIES] });
    plate = plateReducer(plate, { type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: CASHEW, ingredientIds: [CASHEW.id, GARLIC.id] });
    plate = plateReducer(plate, { type: "toggleLeftOut", key: `recipe:${PASTA.id}`, food: GARLIC });
    plate = plateReducer(plate, { type: "toggleLeftOut", key: `recipe:${PATTIES.id}`, food: CASHEW });
    plate = plateReducer(plate, { type: "dropLeftOut", recipeId: PASTA.id, foodIds: [CASHEW.id] });
    const [pasta, patties] = plate as RecipeEntry[];
    expect(pasta!.leftOut.map((food) => food.id)).toEqual([GARLIC.id]);
    expect(pasta!.ingredientIds).toEqual([GARLIC.id]);
    expect(patties!.leftOut.map((food) => food.id)).toEqual([CASHEW.id]);
  });
});

// Item 235's rules, ported from LogFoodForm's validateLogFood.
describe("validatePlate", () => {
  it("needs something on the plate, phrased as a list error, and clears once there is", () => {
    expect(validatePlate({ itemCount: 0 }).items).toBe("Add at least one food");
    expect(validatePlate({ itemCount: 1 })).toEqual({});
  });

  it("refuses a plate where nothing counts, in its own words (VERIFY-p2-c1 #3)", () => {
    expect(validatePlate({ itemCount: 1, nothingCounts: true }).items).toBe("Leave at least one food on the plate.");
    expect(validatePlate({ itemCount: 0, nothingCounts: true }).items).toBe("Add at least one food");
    expect(validatePlate({ itemCount: 1, nothingCounts: false })).toEqual({});
  });

  // Item 333: leftovers are prepared NOW, so a best-by date behind today
  // would file a container the parent just saved as already expired.
  describe("leftovers best-by", () => {
    const prepared = new Date(2026, 8, 14, 18, 0);
    const base = { itemCount: 1, leftoversOpen: true, leftoverPreparedAt: prepared };

    it("rejects a date before the day the leftovers are being saved", () => {
      expect(validatePlate({ ...base, leftoverBestBy: "2026-09-13" }).leftoverBestBy).toBe(
        "Best by can't be before the prepared date",
      );
    });

    it("accepts today and any later day, and an unset field", () => {
      expect(validatePlate({ ...base, leftoverBestBy: "2026-09-14" }).leftoverBestBy).toBeUndefined();
      expect(validatePlate({ ...base, leftoverBestBy: "2026-09-21" }).leftoverBestBy).toBeUndefined();
      expect(validatePlate({ ...base, leftoverBestBy: "" }).leftoverBestBy).toBeUndefined();
    });

    it("ignores the date entirely while the leftovers switch is off", () => {
      expect(validatePlate({ ...base, leftoversOpen: false, leftoverBestBy: "2026-09-13" }).leftoverBestBy).toBeUndefined();
    });

    it("is judged after the plate, which is what a failed save focuses first", () => {
      const errors = validatePlate({ ...base, itemCount: 0, leftoverBestBy: "2026-09-13" });
      expect(errors.items).toBeDefined();
      expect(errors.leftoverBestBy).toBeDefined();
      expect(PLATE_FIELD_ORDER).toEqual(["name", "items", "leftoverBestBy"]);
    });
  });
});

describe("a planned meal as a plate (Plan a meal, SPEC §5)", () => {
  const planned = [
    { kind: "recipe" as const, id: id(70), recipe: PASTA, leftOut: [CASHEW] },
    { kind: "food" as const, id: id(71), food: EGG },
    { kind: "storage" as const, id: id(72), servings: 2, container: CONTAINER, flags: [{ kind: "may_run_out" as const }] },
  ];

  it("opens with the plan's items, no stars, the leave-out and the planned servings; a container is new to the plate", () => {
    const plate = fromPlanned(planned);
    expect(plate).toMatchObject([
      { kind: "recipe", recipe: PASTA, leftOut: [CASHEW], rating: null },
      { kind: "food", food: EGG, rating: null },
      { kind: "storage", storageItemId: CONTAINER.id, servings: 2, container: CONTAINER, title: "Broccoli, Carrot" },
    ]);
    // No saved item ids: a plan PUT replaces the whole list.
    expect(plate.some((entry) => "id" in entry && entry.id)).toBe(false);
    const tub = plate[2] as ContainerEntry;
    expect(tub.savedServings).toBeUndefined();
    expect(tub.parts.map((part) => part.rating)).toEqual([null, null]);
  });

  it("saves as the plan's own items: kind and ref, every leave-out, a container's servings, never a star", () => {
    let plate = fromPlanned(planned);
    plate = plateReducer(plate, { type: "rate", key: entryKey(plate[1]!), rating: 5 });
    plate = plateReducer(plate, { type: "servings", key: entryKey(plate[2]!), servings: 3 });
    const items = toPlanInput(plate);
    expect(items).toEqual([
      { kind: "recipe", recipeId: PASTA.id, leftOutFoodIds: [CASHEW.id] },
      { kind: "food", foodId: EGG.id },
      { kind: "storage", storageItemId: CONTAINER.id, servings: 3 },
    ]);
    expect(plannedItemsInputSchema.safeParse(items).success).toBe(true);
    // An untouched plan round-trips to what it was.
    expect(toPlanInput(fromPlanned(planned))).toEqual([
      { kind: "recipe", recipeId: PASTA.id, leftOutFoodIds: [CASHEW.id] },
      { kind: "food", foodId: EGG.id },
      { kind: "storage", storageItemId: CONTAINER.id, servings: 2 },
    ]);
    expect(toPlanInput([])).toEqual([]);
  });
});

// SPEC §3.5 + §11: a planned meal SERVED through the plate (a past day, or
// today after a blocked one tap), and CD-Ran-Out-Add's new batch.
describe("a planned meal served through the plate", () => {
  const planned = [
    { kind: "recipe" as const, id: id(70), recipe: PASTA, leftOut: [CASHEW] },
    { kind: "storage" as const, id: id(72), servings: 3, container: CONTAINER },
    { kind: "storage" as const, id: id(73), servings: 1, container: MUFFIN_TUB },
  ];
  const NEW_TUB: StorageItem = { ...MUFFIN_TUB, id: id(22), servingsLeft: 6 };

  it("a planned leave-out is sent: no meal has saved it, so it is new to this one", () => {
    const [recipe] = servePlanned(planned, []);
    expect(recipe).toMatchObject({ kind: "recipe", leftOut: [CASHEW], savedLeftOut: [] });
    const input = toMealInput([recipe!], FIELDS);
    expect(input.items).toEqual([{ kind: "recipe", recipeId: PASTA.id, rating: null, leftOutFoodIds: [CASHEW.id] }]);
    expect(createPlateMealInputSchema.safeParse(input).success).toBe(true);
  });

  it("each container as Storage has it now: the stepper at what is left when that is less, the plan's ask kept", () => {
    const now = { ...CONTAINER, servingsLeft: 2 };
    const plate = servePlanned(planned, [now, { ...MUFFIN_TUB, status: "finished", servingsLeft: 0 }]);
    const [, veg, tub] = plate as [PlateEntry, ContainerEntry, ContainerEntry];
    expect([veg.servings, veg.planned, veg.container]).toEqual([2, 3, now]);
    expect(shortOf(veg)).toBe(2);
    // None left: flagged as run out, untouched (× or a new batch decides).
    expect(ranOut(tub)).toBe(true);
    expect([tub.servings, shortOf(tub)]).toEqual([1, null]);
    // Enough left: as planned, nothing to say.
    const plenty = servePlanned(planned, [])[1] as ContainerEntry;
    expect([plenty.servings, shortOf(plenty)]).toEqual([3, null]);
    // Untracked never runs short; a container no plan asked for never says so.
    expect(shortOf({ ...veg, container: { ...now, servingsTotal: null, servingsLeft: null } })).toBeNull();
    expect(shortOf({ ...veg, planned: undefined })).toBeNull();
  });

  it("Add to storage opens with the same recipe, else the same foods, the place and the total; never the old Best by", () => {
    const tub = fromPlanned(planned)[2] as ContainerEntry;
    expect(restockPrefill(tub)).toEqual({ source: "recipe", recipeId: MUFFINS.id, location: "fridge", servingsTotal: 6 });
    const veg = fromPlanned(planned)[1] as ContainerEntry;
    expect(restockPrefill(veg)).toEqual({ source: "food", foodIds: [BROCCOLI.id, CARROT.id], location: "freezer", servingsTotal: 4 });
    expect(restockPrefill({ ...veg, container: { ...CONTAINER, servingsTotal: null, bestBy: "2026-10-20" } })).toEqual({
      source: "food",
      foodIds: [BROCCOLI.id, CARROT.id],
      location: "freezer",
    });
  });

  it("the new batch takes the run-out one's place at the servings asked for (what it can give, at most)", () => {
    const plate = servePlanned(planned, [{ ...MUFFIN_TUB, status: "finished", servingsLeft: 0 }]);
    const key = entryKey(plate[2]!);
    const after = plateReducer(plate, { type: "replaceContainer", key, items: [NEW_TUB] });
    expect(after.map(entryKey)).toEqual([entryKey(plate[0]!), entryKey(plate[1]!), `storage:${NEW_TUB.id}`]);
    expect(after[2]).toMatchObject({ storageItemId: NEW_TUB.id, servings: 1, planned: 1, container: NEW_TUB });
    expect(ranOutEntry(after)).toBeUndefined();
    // Two containers made at once ("Separate containers") both go in its place.
    const two = plateReducer(plate, { type: "replaceContainer", key, items: [NEW_TUB, { ...NEW_TUB, id: id(23), servingsLeft: 1, servingsTotal: 1 }] });
    expect(two.map((entry) => entry.kind === "storage" && [entry.storageItemId, entry.servings])).toEqual([
      false,
      [CONTAINER.id, 3],
      [NEW_TUB.id, 1],
      [id(23), 1],
    ]);
    // A bigger ask stops at what the new batch holds.
    const big = plateReducer([{ ...containerEntry(MUFFIN_TUB), servings: 5 }], { type: "replaceContainer", key: `storage:${MUFFIN_TUB.id}`, items: [{ ...NEW_TUB, servingsLeft: 3 }] });
    expect((big[0] as ContainerEntry).servings).toBe(3);
  });

  it("a food deleted since it was planned is found only while new to the plate", () => {
    const gone = { ...EGG, deleted: true };
    expect(deletedFoodEntry(fromPlanned([{ kind: "food", id: id(74), food: gone }]))).toMatchObject({ food: gone });
    expect(deletedFoodEntry([{ kind: "food", id: id(75), food: gone, rating: null }])).toBeUndefined();
    expect(deletedFoodEntry(fromPlanned([{ kind: "food", id: id(74), food: EGG }]))).toBeUndefined();
  });
});

describe("Plan a meal's flag line under a container (ledger 971)", () => {
  // CONTAINER keeps until 2026-11-14 10:00 UTC; New York is UTC-5 then.
  const when = (date: string, time: string | null = null, today = "2026-11-12") => ({ date, time, today, timeZone: "America/New_York" });
  const tub = containerEntry(CONTAINER);
  const bestBy = containerEntry({ ...CONTAINER, bestBy: "2026-11-15" });

  it("says the card's own line for the meal's day: Best by after its date, else use within at the meal's time", () => {
    expect(planningFlagLine(bestBy, when("2026-11-15"))).toBeNull();
    expect(planningFlagLine(bestBy, when("2026-11-16"))).toBe("Past the Best by date on this day.");
    expect(planningFlagLine(tub, when("2026-11-13"))).toBeNull();
    expect(planningFlagLine(tub, when("2026-11-15"))).toBe("May not keep until this day.");
    // The window ends at 05:00 New York time on the 14th: the time decides.
    expect(planningFlagLine(tub, when("2026-11-14", "04:59"))).toBeNull();
    expect(planningFlagLine(tub, when("2026-11-14", "05:00"))).toBe("May not keep until this day.");
  });

  it("a gone container says only its gone line, on any day; a past day gets no freshness line", () => {
    const gone = containerEntry({ ...CONTAINER, bestBy: "2026-11-01", status: "discarded" });
    expect(planningFlagLine(gone, when("2026-11-20"))).toBe("Marked discarded in Storage.");
    expect(planningFlagLine(gone, when("2026-11-02"))).toBe("Marked discarded in Storage.");
    expect(planningFlagLine(containerEntry({ ...CONTAINER, bestBy: "2026-11-01" }), when("2026-11-05"))).toBeNull();
  });

  it("never says may run out (it needs the other days' plans), and nothing without a day or a container", () => {
    const short = { ...containerEntry({ ...CONTAINER, servingsLeft: 1 }), servings: 3 };
    expect(planningFlagLine(short, when("2026-11-13"))).toBeNull();
    expect(planningFlagLine(bestBy, undefined)).toBeNull();
    const { container: _container, ...unloaded } = bestBy;
    expect(planningFlagLine(unloaded, when("2026-11-20"))).toBeNull();
  });
});
