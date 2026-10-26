// Ledger 901, step 1b (plan SPEC §1.3-1.5, §2.5, §4.1, §8 row 1): the plate
// API. `items` writes go through ONE service (writePlate + syncLegacy) for
// create, serve and edit; legacy shapes run their own code and then the
// per-meal heal. After every write the §2.2 invariants hold and a second
// heal changes nothing.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import type { FastifyInstance } from "fastify";
import {
  mealItemSchema,
  plateInputFromItems,
  type AllergenProgressResponse,
  type Baby,
  type CreateStorageItemResponse,
  type MealItem,
  type PlateItem,
  type PlateItemInput,
  type RatingHistoryResponse,
  type RatingsResponse,
} from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import { findDriftedMeals, healMealItems, healMealRecipes } from "../db/migrate.js";
import { checkPlateInvariants, comparePlateParity, recordPlateParity } from "../db/plateParity.js";
import * as schema from "../db/schema.js";
import { loadMeals } from "../services/meals.js";
import { B1, F, M, R, X, plateCorpusSql } from "./plateCorpus.js";

async function seedFixtures(db: Database) {
  await db
    .insert(schema.storageGuidelines)
    .values({ category: "produce_cooked", fridgeHours: 48, freezerDays: 60, roomTempHours: 2, notes: "Cooked." });
  const [milkAllergen] = await db
    .insert(schema.allergens)
    .values({ slug: "milk", name: "Milk", introGuidance: "Yogurt first." })
    .returning();
  const food = (slug: string, name: string, kind: "food" | "info" = "food") => ({
    slug,
    name,
    kind,
    category: "fruit" as const,
    ironLevel: "low" as const,
    vitaminCLevel: "moderate" as const,
    chokingRisk: "low" as const,
    minAgeMonths: 6,
    prep6m: "strip",
    prep9m: "chop",
    prep12m: "slice",
    storageCategory: "produce_cooked",
  });
  const [egg, banana, oats, pear, carrot, milk] = await db
    .insert(schema.foods)
    .values([
      food("egg", "Egg"),
      food("banana", "Banana"),
      food("oats", "Oats"),
      food("pear", "Pear"),
      food("carrot", "Carrot"),
      food("milk", "Whole Milk", "info"),
    ])
    .returning();
  await db
    .insert(schema.foodAllergens)
    .values({ foodId: milk!.id, allergenId: milkAllergen!.id, countsTowardProgress: false, countsWhenAlone: true });
  const recipe = async (slug: string, title: string, foodIds: string[]) => {
    const [row] = await db.insert(schema.recipes).values({ slug, title, minAgeMonths: 6, prepMinutes: 5 }).returning();
    if (foodIds.length > 0) {
      await db.insert(schema.recipeIngredients).values(foodIds.map((foodId) => ({ recipeId: row!.id, foodId, quantityNote: "1" })));
    }
    return row!;
  };
  // muffins = egg + banana, porridge = oats + banana, egg bake = egg + milk.
  const muffins = await recipe("muffins", "Egg Muffins", [egg!.id, banana!.id]);
  const porridge = await recipe("porridge", "Porridge", [oats!.id, banana!.id]);
  const eggBake = await recipe("egg-bake", "Egg Bake", [egg!.id, milk!.id]);
  const drizzle = await recipe("oil-drizzle", "Oil Drizzle", []);
  return { egg: egg!, banana: banana!, oats: oats!, pear: pear!, carrot: carrot!, milk: milk!, muffins, porridge, eggBake, drizzle };
}

/** Everything the plate must keep true, after any write. */
async function expectExact(db: Database) {
  expect((await checkPlateInvariants(db)).violations).toEqual([]);
  expect(await findDriftedMeals(db)).toEqual([]);
  const before = await db.select().from(schema.mealItems).orderBy(asc(schema.mealItems.id));
  await db.transaction((tx) => healMealItems(tx));
  expect(await db.select().from(schema.mealItems).orderBy(asc(schema.mealItems.id))).toEqual(before);
}

describe("plate writes (ledger 901, step 1b)", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let fx: Awaited<ReturnType<typeof seedFixtures>>;
  let parent: TestUser;
  let babyId: string;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    fx = await seedFixtures(db);
    parent = await signUpUser(app);
    const baby = await app.inject({
      method: "POST",
      url: "/api/babies",
      headers: { cookie: parent.cookie },
      payload: { name: "Robin", birthDate: "2025-01-15" },
    });
    babyId = baby.json<Baby>().id;
  });

  afterEach(async () => {
    await close();
  });

  const inject = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown, user = parent) =>
    app.inject({ method, url, headers: { cookie: user.cookie }, ...(payload === undefined ? {} : { payload: payload as object }) });
  const create = (payload: Record<string, unknown>) => inject("POST", `/api/babies/${babyId}/meals`, payload);
  const patch = (id: string, payload: Record<string, unknown>) => inject("PATCH", `/api/meals/${id}`, payload);
  async function created(items: PlateItemInput[], extra: Record<string, unknown> = {}): Promise<MealItem> {
    const response = await create({ items, ...extra });
    if (response.statusCode !== 201) throw new Error(`create failed: ${response.statusCode} ${response.body}`);
    return mealItemSchema.parse(response.json());
  }
  async function patched(id: string, payload: Record<string, unknown>): Promise<MealItem> {
    const response = await patch(id, payload);
    if (response.statusCode !== 200) throw new Error(`patch failed: ${response.statusCode} ${response.body}`);
    return mealItemSchema.parse(response.json());
  }
  async function container(payload: Record<string, unknown>): Promise<string> {
    const response = await inject("POST", "/api/storage", { location: "fridge", ...payload });
    if (response.statusCode !== 201) throw new Error(`storage create failed: ${response.body}`);
    return response.json<CreateStorageItemResponse>().items[0]!.id;
  }
  async function box(id: string) {
    const [row] = await db
      .select({ left: schema.storageItems.servingsLeft, status: schema.storageItems.status })
      .from(schema.storageItems)
      .where(eq(schema.storageItems.id, id));
    return row;
  }
  /** The legacy rows older readers see, for "unchanged" checks. */
  async function legacy(mealId: string) {
    const foods = await db
      .select({ foodId: schema.mealFoods.foodId, storageItemId: schema.mealFoods.storageItemId, rating: schema.mealFoods.rating })
      .from(schema.mealFoods)
      .where(eq(schema.mealFoods.mealId, mealId))
      .orderBy(asc(schema.mealFoods.foodId));
    const recipes = await db
      .select({ recipeId: schema.mealRecipes.recipeId, position: schema.mealRecipes.position, rating: schema.mealRecipes.rating })
      .from(schema.mealRecipes)
      .where(eq(schema.mealRecipes.mealId, mealId))
      .orderBy(asc(schema.mealRecipes.position));
    const [mirror] = await db
      .select({ recipeId: schema.meals.recipeId, recipeRating: schema.meals.recipeRating })
      .from(schema.meals)
      .where(eq(schema.meals.id, mealId));
    return { foods, recipes, mirror };
  }
  const served = (mealId: string) =>
    db
      .select({ storageItemId: schema.mealStorageItems.storageItemId, servings: schema.mealStorageItems.servings })
      .from(schema.mealStorageItems)
      .where(eq(schema.mealStorageItems.mealId, mealId))
      .orderBy(asc(schema.mealStorageItems.storageItemId));
  const storageOf = (meal: MealItem, id: string) =>
    meal.items!.find((item): item is Extract<PlateItem, { kind: "storage" }> => item.kind === "storage" && item.storageItemId === id);

  describe("create, read and the legacy rows", () => {
    it("saves a fresh food, a recipe with one left out and a container, each with its own stars", async () => {
      const muffinBox = await container({ recipeId: fx.muffins.id, servingsTotal: 4 });
      const meal = await created([
        { kind: "food", foodId: fx.egg.id, rating: 5 },
        { kind: "recipe", recipeId: fx.porridge.id, leftOutFoodIds: [fx.banana.id], rating: 3 },
        { kind: "storage", storageItemId: muffinBox, servings: 2, ratings: { [fx.muffins.id]: 4 } },
      ]);

      expect(meal.items!.map((item) => item.kind)).toEqual(["food", "recipe", "storage"]);
      expect(meal.items![1]).toMatchObject({ recipe: { id: fx.porridge.id }, leftOut: [{ id: fx.banana.id, name: "Banana" }], inferred: false, rating: 3 });
      expect(storageOf(meal, muffinBox)).toMatchObject({ servings: 2, location: "fridge", parts: [{ kind: "recipe", rating: 4 }] });
      // Egg beside egg muffins keeps its own stars (ledger 800); the legacy
      // rows are the exposure union, recipes in plate order, ratings mirrored.
      expect(await legacy(meal.id)).toEqual({
        foods: [
          { foodId: fx.egg.id, storageItemId: muffinBox, rating: 5 },
          { foodId: fx.banana.id, storageItemId: muffinBox, rating: null },
          { foodId: fx.oats.id, storageItemId: null, rating: null },
        ].sort((a, b) => (a.foodId < b.foodId ? -1 : 1)),
        recipes: [
          { recipeId: fx.porridge.id, position: 0, rating: 3 },
          { recipeId: fx.muffins.id, position: 1, rating: 4 },
        ],
        mirror: { recipeId: fx.porridge.id, recipeRating: 3 },
      });
      expect(await box(muffinBox)).toEqual({ left: 2, status: "active" });
      expect(await served(meal.id)).toEqual([{ storageItemId: muffinBox, servings: 2 }]);

      // GET /api/meals/:id returns the same meal; another account's is a 404.
      const one = await inject("GET", `/api/meals/${meal.id}`);
      expect(one.statusCode).toBe(200);
      expect(mealItemSchema.parse(one.json())).toEqual(meal);
      expect((await inject("GET", `/api/meals/${meal.id}`, undefined, await signUpUser(app))).statusCode).toBe(404);
      // The list carries the plate too.
      const list = await inject("GET", `/api/babies/${babyId}/meals`);
      expect(list.json<{ items: MealItem[] }>().items[0]!.items).toEqual(meal.items);
      await expectExact(db);
    });

    it("refuses what the plate cannot hold, and writes nothing", async () => {
      const empty = await container({ foodIds: [fx.pear.id], servingsTotal: 1 });
      await created([{ kind: "storage", storageItemId: empty, servings: 1 }]);
      const before = await db.select().from(schema.meals);
      const cases: [Record<string, unknown>, number][] = [
        [{ items: [{ kind: "food", foodId: fx.egg.id }, { kind: "food", foodId: fx.egg.id }] }, 400],
        [{ items: [{ kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.oats.id] }] }, 400],
        [{ items: [{ kind: "recipe", recipeId: fx.drizzle.id }] }, 400],
        [{ items: [{ kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.egg.id, fx.banana.id] }] }, 400],
        [{ items: [{ kind: "food", foodId: fx.egg.id }], foodIds: [fx.egg.id] }, 400],
        [{ items: [{ kind: "storage", storageItemId: fx.egg.id, servings: 1 }] }, 400],
        [{ items: [{ kind: "storage", storageItemId: empty }] }, 400],
        [{ items: [{ kind: "food", foodId: fx.egg.id }, { kind: "storage", storageItemId: empty, servings: 1 }] }, 409],
      ];
      for (const [payload, code] of cases) {
        const response = await create(payload);
        expect(response.statusCode, JSON.stringify(payload)).toBe(code);
      }
      expect(await db.select().from(schema.meals)).toEqual(before);
    });

    it("counts a cup of milk beside the egg bake, never the egg bake's milk alone (864)", async () => {
      const milkRow = async () =>
        (await inject("GET", `/api/babies/${babyId}/allergen-progress`))
          .json<AllergenProgressResponse>()
          .items.find((item) => item.allergenSlug === "milk")!;
      await created([{ kind: "recipe", recipeId: fx.eggBake.id }]);
      expect((await milkRow()).exposures).toBe(0);
      await created([{ kind: "recipe", recipeId: fx.eggBake.id }, { kind: "food", foodId: fx.milk.id }]);
      expect((await milkRow()).exposures).toBe(1);
      // The same plate through the legacy shape stays as 864 reads it.
      const legacyMeal = await create({ recipeIds: [fx.eggBake.id], foodIds: [fx.egg.id, fx.milk.id] });
      expect(legacyMeal.statusCode).toBe(201);
      expect((await milkRow()).exposures).toBe(1);
      await created([{ kind: "storage", storageItemId: await container({ foodIds: [fx.milk.id] }), servings: 1 }]);
      expect((await milkRow()).exposures).toBe(2);
      await expectExact(db);
    });

    it("rates per item: one food in two items is two points, the first on the plate is the latest", async () => {
      const eggBox = await container({ foodIds: [fx.egg.id], servingsTotal: 3 });
      await created(
        [
          { kind: "food", foodId: fx.egg.id, rating: 5 },
          { kind: "storage", storageItemId: eggBox, servings: 1, ratings: { [fx.egg.id]: 3 } },
        ],
        { servedAt: "2026-03-01T08:00:00.000Z" },
      );
      const summary = (await inject("GET", `/api/babies/${babyId}/ratings`)).json<RatingsResponse>().foods[fx.egg.id];
      expect(summary).toEqual({ average: 4, count: 2, latest: 5, lastRatedAt: "2026-03-01T08:00:00.000Z" });
      const history = (await inject("GET", `/api/babies/${babyId}/ratings/history?foodId=${fx.egg.id}`)).json<RatingHistoryResponse>();
      expect(history.points.map((point) => point.rating)).toEqual([3, 5]);
      expect(history.servedCount).toBe(1);
      // The legacy mirror is the first rated row.
      expect((await db.select({ rating: schema.mealFoods.rating }).from(schema.mealFoods))[0]).toEqual({ rating: 5 });
    });
  });

  describe("edit: containers, servings and 409s", () => {
    it("removing ONE muffin container returns exactly its servings and changes no exposure, recipe or rating", async () => {
      const fridge = await container({ recipeId: fx.muffins.id, servingsTotal: 3 });
      const freezer = await container({ recipeId: fx.muffins.id, servingsTotal: 4, location: "freezer" });
      const meal = await created([
        { kind: "storage", storageItemId: fridge, servings: 1, ratings: { [fx.muffins.id]: 4 } },
        { kind: "storage", storageItemId: freezer, servings: 2 },
        { kind: "food", foodId: fx.pear.id, rating: 2 },
      ]);
      expect([await box(fridge), await box(freezer)]).toEqual([
        { left: 2, status: "active" },
        { left: 2, status: "active" },
      ]);
      const before = await legacy(meal.id);

      const input = plateInputFromItems(meal.items!).filter((item) => item.kind !== "storage" || item.storageItemId !== freezer);
      const after = await patched(meal.id, { items: input });
      expect(after.items!.map((item) => (item.kind === "storage" ? item.storageItemId : item.kind))).toEqual([fridge, "food"]);
      expect([await box(fridge), await box(freezer)]).toEqual([
        { left: 2, status: "active" },
        { left: 4, status: "active" },
      ]);
      expect(await served(meal.id)).toEqual([{ storageItemId: fridge, servings: 1 }]);
      expect(await legacy(meal.id)).toEqual(before);
      await expectExact(db);
    });

    it("removing the container a food links to moves the link to the one that stays", async () => {
      const fridge = await container({ recipeId: fx.muffins.id, servingsTotal: 3 });
      const freezer = await container({ recipeId: fx.muffins.id, servingsTotal: 3, location: "freezer" });
      const meal = await created([
        { kind: "storage", storageItemId: fridge, servings: 1 },
        { kind: "storage", storageItemId: freezer, servings: 1 },
      ]);
      expect(meal.foods.map((food) => food.storageItemId)).toEqual([fridge, fridge]);
      const after = await patched(meal.id, { items: [{ kind: "storage", storageItemId: freezer }] });
      expect(after.foods.map((food) => food.storageItemId)).toEqual([freezer, freezer]);
      expect(await box(fridge)).toEqual({ left: 3, status: "active" });
      await expectExact(db);
    });

    it("a new servings count moves only the difference, both ways", async () => {
      const pears = await container({ foodIds: [fx.pear.id], servingsTotal: 5 });
      const meal = await created([{ kind: "storage", storageItemId: pears, servings: 2 }]);
      expect(await box(pears)).toEqual({ left: 3, status: "active" });
      await patched(meal.id, { items: [{ kind: "storage", storageItemId: pears, servings: 5 }] });
      expect(await box(pears)).toEqual({ left: 0, status: "finished" });
      expect(await served(meal.id)).toEqual([{ storageItemId: pears, servings: 5 }]);
      // Finished by this meal, and the parent lowers it: active again.
      await patched(meal.id, { items: [{ kind: "storage", storageItemId: pears, servings: 1 }] });
      expect(await box(pears)).toEqual({ left: 4, status: "active" });
      // Up again past what is left: takes what there is.
      await patched(meal.id, { items: [{ kind: "storage", storageItemId: pears, servings: 9 }] });
      expect(await box(pears)).toEqual({ left: 0, status: "finished" });
      expect(await served(meal.id)).toEqual([{ storageItemId: pears, servings: 5 }]);
      // Absent servings on a kept container: unchanged, even on a finished one.
      await patched(meal.id, { items: [{ kind: "storage", storageItemId: pears, ratings: { [fx.pear.id]: 4 } }] });
      expect(await served(meal.id)).toEqual([{ storageItemId: pears, servings: 5 }]);
      // More from a finished container is today's 409.
      const more = await patch(meal.id, { items: [{ kind: "storage", storageItemId: pears, servings: 6 }] });
      expect(more.statusCode).toBe(409);
      expect(more.json()).toMatchObject({ error: "conflict", storageItemId: pears });
      // Removing it gives back exactly what the meal holds.
      await patched(meal.id, { items: [{ kind: "food", foodId: fx.egg.id }] });
      expect(await box(pears)).toEqual({ left: 5, status: "active" });
      expect(await served(meal.id)).toEqual([]);
      await expectExact(db);
    });

    // REVIEW-c2 R2-2: a decrease on a discarded container is no 409; nothing
    // goes back into it (returnServings skips discarded), the meal records 1.
    it("lowering the servings of a container discarded since is no 409 and returns nothing", async () => {
      const pears = await container({ foodIds: [fx.pear.id], servingsTotal: 5 });
      const meal = await created([{ kind: "storage", storageItemId: pears, servings: 3 }]);
      expect((await inject("PATCH", `/api/storage/${pears}`, { status: "discarded" })).statusCode).toBe(200);
      await patched(meal.id, { items: [{ kind: "storage", storageItemId: pears, servings: 1 }] });
      expect(await box(pears)).toEqual({ left: 2, status: "discarded" });
      expect(await served(meal.id)).toEqual([{ storageItemId: pears, servings: 1 }]);
      await expectExact(db);
    });

    it("a container served before servings were recorded can be removed, not resized", async () => {
      const pears = await container({ foodIds: [fx.pear.id], servingsTotal: 5 });
      const meal = await created([{ kind: "storage", storageItemId: pears, servings: 2 }]);
      await db.delete(schema.mealStorageItems).where(eq(schema.mealStorageItems.mealId, meal.id));
      const read = mealItemSchema.parse((await inject("GET", `/api/meals/${meal.id}`)).json());
      expect(storageOf(read, pears)?.servings).toBeNull();
      expect((await patch(meal.id, { items: [{ kind: "storage", storageItemId: pears, servings: 1 }] })).statusCode).toBe(400);
      await patched(meal.id, { items: [{ kind: "food", foodId: fx.egg.id }] });
      expect(await box(pears)).toEqual({ left: 3, status: "active" });
    });

    it("answers 409 meal_changed for an id another write replaced, and writes nothing", async () => {
      const pears = await container({ foodIds: [fx.pear.id], servingsTotal: 5 });
      const meal = await created([
        { kind: "food", foodId: fx.egg.id },
        { kind: "recipe", recipeId: fx.porridge.id },
      ]);
      const [eggItem, porridgeItem] = meal.items!.map((item) => (item.kind === "storage" ? "" : item.id));
      // An old bundle's legacy PATCH changes the foods: the heal rebuilds the
      // items with new ids.
      await patched(meal.id, { foodIds: [fx.egg.id, fx.oats.id, fx.banana.id, fx.carrot.id] });
      const before = await db.select().from(schema.mealItems).orderBy(asc(schema.mealItems.id));
      for (const payload of [
        { itemRatings: { [eggItem!]: 4 } },
        { items: [{ kind: "food", id: eggItem, foodId: fx.egg.id }] },
        { items: [{ kind: "recipe", id: porridgeItem, recipeId: fx.porridge.id }] },
        { items: [{ kind: "storage", storageItemId: pears }] },
      ]) {
        const response = await patch(meal.id, payload);
        expect(response.statusCode, JSON.stringify(payload)).toBe(409);
        expect(response.json()).toMatchObject({ error: "meal_changed" });
      }
      // A kept id whose food is not the one it holds is the same 409.
      const current = mealItemSchema.parse((await inject("GET", `/api/meals/${meal.id}`)).json()).items!;
      const egg = current.find((item): item is Extract<PlateItem, { kind: "food" }> => item.kind === "food" && item.food.id === fx.egg.id)!;
      expect((await patch(meal.id, { items: [{ kind: "food", id: egg.id, foodId: fx.pear.id }] })).statusCode).toBe(409);
      expect(await db.select().from(schema.mealItems).orderBy(asc(schema.mealItems.id))).toEqual(before);
      expect(await box(pears)).toEqual({ left: 5, status: "active" });

      // A star tap with a current id merges into that item only.
      const rated = await patched(meal.id, { itemRatings: { [egg.id]: 4 } });
      expect(rated.items!.find((item) => item.kind !== "storage" && item.id === egg.id)).toMatchObject({ rating: 4 });
      expect(rated.foods.find((food) => food.id === fx.egg.id)?.rating).toBe(4);
      expect((await patch(meal.id, { items: plateInputFromItems(rated.items!), itemRatings: {} })).statusCode).toBe(400);
      await expectExact(db);
    });

    it("an edit keeps a deleted custom food it already had, and refuses adding one", async () => {
      const mine = (await inject("POST", "/api/foods", { name: "My mash", category: "veg" })).json<{ id: string }>();
      const meal = await created([{ kind: "food", foodId: mine.id }]);
      expect((await inject("DELETE", `/api/foods/${mine.id}`)).statusCode).toBe(204);
      const kept = await patched(meal.id, { items: [...plateInputFromItems(meal.items!), { kind: "food", foodId: fx.egg.id }] });
      expect(kept.items!.map((item) => (item.kind === "food" ? [item.food.id, item.food.deleted] : null))).toEqual([
        [mine.id, true],
        [fx.egg.id, false],
      ]);
      expect((await patch(meal.id, { items: [{ kind: "food", foodId: mine.id }] })).statusCode).toBe(400);
    });
  });

  describe("legacy shapes and Replace", () => {
    it("legacy create, serve and PATCH keep today's answers and give the meal its items", async () => {
      const pears = await container({ foodIds: [fx.pear.id], servingsTotal: 3 });
      const loose = await create({ foodIds: [fx.egg.id, fx.banana.id], foodRatings: { [fx.egg.id]: 4 } });
      expect(loose.statusCode).toBe(201);
      const looseMeal = mealItemSchema.parse(loose.json());
      expect(looseMeal.items!.map((item) => (item.kind === "food" ? [item.food.name, item.rating] : null))).toEqual([
        ["Banana", null],
        ["Egg", 4],
      ]);
      const serve = await inject("POST", "/api/storage/serve", { babyId, parts: [{ storageItemId: pears, servings: 1 }] });
      expect(serve.statusCode).toBe(201);
      expect(mealItemSchema.parse(serve.json<{ meal: unknown }>().meal).items).toMatchObject([{ kind: "storage", servings: 1 }]);
      // The legacy rating rule still answers 400 on the legacy shape...
      const refused = await patch(looseMeal.id, { recipeIds: [fx.muffins.id], foodRatings: { [fx.banana.id]: 3 } });
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toMatchObject({ details: { foodRatings: "rated as part of its recipe" } });
      // ...and a legacy rating lands on the first item of that food.
      const rerated = await patched(looseMeal.id, { foodRatings: { [fx.egg.id]: 2 } });
      expect(rerated.items!.find((item) => item.kind === "food" && item.food.id === fx.egg.id)).toMatchObject({ rating: 2 });
      await expectExact(db);
    });

    it("never shows Left out on an inferred recipe item, until the parent says what was left out", async () => {
      // A legacy create of the muffins with banana left out: the rebuilt
      // item cannot tell that from an ingredient the recipe gained later.
      const response = await create({ recipeIds: [fx.muffins.id], foodIds: [fx.egg.id] });
      const meal = mealItemSchema.parse(response.json());
      expect(meal.items).toMatchObject([{ kind: "recipe", inferred: true, leftOut: [] }]);
      const [item] = plateInputFromItems(meal.items!);
      const edited = await patched(meal.id, { items: [{ ...item!, leftOutFoodIds: [fx.banana.id] }] });
      expect(edited.items).toMatchObject([{ kind: "recipe", inferred: false, leftOut: [{ id: fx.banana.id }] }]);
      expect(edited.foods.map((food) => food.id)).toEqual([fx.egg.id]);
      await expectExact(db);
    });

    it("Replace re-points items and counted snapshots and merges what became identical", async () => {
      const mine = (await inject("POST", "/api/foods", { name: "My mash", category: "veg" })).json<{ id: string }>();
      await db.insert(schema.recipeIngredients).values({ recipeId: fx.porridge.id, foodId: mine.id, quantityNote: "1" });
      const pears = await container({ foodIds: [mine.id, fx.pear.id], servingsTotal: 3 });
      const meal = await created([
        { kind: "food", foodId: mine.id, rating: 3 },
        { kind: "food", foodId: fx.banana.id },
        { kind: "recipe", recipeId: fx.porridge.id },
        { kind: "storage", storageItemId: pears, servings: 1, ratings: { [mine.id]: 5 } },
      ]);
      const replaced = await inject("POST", `/api/foods/${mine.id}/replace`, { replacementId: fx.banana.id });
      expect(replaced.statusCode).toBe(200);

      const after = mealItemSchema.parse((await inject("GET", `/api/meals/${meal.id}`)).json());
      // The fresh Banana row stays and takes My mash's 3 stars; the porridge
      // counts Banana once; the container's part is Banana now, rated 5.
      expect(after.items!.map((item) => (item.kind === "storage" ? item.parts.map((part) => part.kind === "food" && [part.food.name, part.rating]) : item.kind === "food" ? [item.food.name, item.rating] : item.recipe.title))).toEqual([
        ["Banana", 3],
        "Porridge",
        [
          ["Banana", 5],
          ["Pear", null],
        ],
      ]);
      const [porridgeRow] = await db.select().from(schema.mealItems).where(eq(schema.mealItems.recipeId, fx.porridge.id));
      expect(porridgeRow!.countedFoodIds).toEqual([fx.oats.id, fx.banana.id].sort());
      expect(after.foods.find((food) => food.id === fx.banana.id)?.rating).toBe(3);
      // REVIEW-c2 R2-5: only My mash's row had a link (the container); the
      // replacement keeps it.
      expect(after.foods.find((food) => food.id === fx.banana.id)?.storageItemId).toBe(pears);
      await expectExact(db);
    });

    // Verifier p1-c2 blocker 1 (probe Q10): a restored Postgres runs its
    // first ANALYZE on its own, often between the dry run's two records. On
    // identical data the record must not change: readers that leave ties to
    // the plan (one meal's foods in the snapshot, the profile's reactive
    // foods) moved with it.
    it("the parity record is the same before and after ANALYZE on identical data", async () => {
      // 40 legacy meals of 3-4 foods each, sent in reverse name order, every
      // fourth one with a reaction note (the AI profile's reactive foods).
      const pool = [fx.pear, fx.oats, fx.egg, fx.carrot, fx.banana].map((food) => food.id);
      for (let k = 0; k < 40; k++) {
        const response = await create({
          foodIds: pool.slice(k % 2, (k % 2) + 3 + (k % 3 === 0 ? 1 : 0)),
          servedAt: new Date(Date.UTC(2026, 8, 1 + Math.floor(k / 2), 8 + (k % 2) * 6)).toISOString(),
          ...(k % 4 === 0 ? { reactionNote: "rash" } : {}),
        });
        expect(response.statusCode, response.body).toBe(201);
      }
      const before = await recordPlateParity(db);
      await db.execute(sql`ANALYZE`);
      const after = await recordPlateParity(db);
      expect(Object.fromEntries(Object.entries(comparePlateParity(before, after)).filter(([, n]) => n > 0))).toEqual({});
    });

    // Verifier p1-c3 probe Q11: no query PLAN may change the record either,
    // same-name ties included (a custom food named like a catalog one), which
    // ANALYZE alone does not reach.
    it("the parity record is the same under every forced plan shape, same-name foods included", async () => {
      const twin = await inject("POST", "/api/foods", { name: "Whole Milk", category: "dairy", allergenSlugs: ["milk"] });
      expect(twin.statusCode, twin.body).toBe(201);
      const twinId = twin.json<{ id: string }>().id;
      const egg2 = (await inject("POST", "/api/foods", { name: "Egg", category: "protein" })).json<{ id: string }>().id;
      for (let k = 0; k < 24; k++) {
        const pair = k % 2 ? [twinId, fx.milk.id] : [fx.milk.id, twinId];
        const eggs = k % 3 ? [fx.egg.id, egg2] : [egg2, fx.egg.id];
        const response = await create({
          foodIds: [...pair, ...eggs, fx.pear.id],
          servedAt: new Date(Date.UTC(2026, 8, 1 + Math.floor(k / 2), 9)).toISOString(),
          ...(k % 4 === 0 ? { reactionNote: "rash" } : {}),
        });
        expect(response.statusCode, response.body).toBe(201);
      }
      const shapes = [
        "SET enable_indexscan = off; SET enable_bitmapscan = off; SET enable_indexonlyscan = off",
        "SET enable_hashjoin = off; SET enable_nestloop = off",
        "SET enable_mergejoin = off; SET enable_nestloop = off",
        "SET enable_hashjoin = off; SET enable_mergejoin = off",
        "SET random_page_cost = 0.01; SET cpu_tuple_cost = 5",
        "ANALYZE",
      ];
      const reset =
        "RESET enable_indexscan; RESET enable_bitmapscan; RESET enable_indexonlyscan; RESET enable_hashjoin; RESET enable_nestloop; RESET enable_mergejoin; RESET random_page_cost; RESET cpu_tuple_cost";
      const client = (db as unknown as { $client: PGlite }).$client;
      const base = await recordPlateParity(db);
      const found: Record<string, number> = {};
      for (const shape of shapes) {
        await client.exec(reset);
        await client.exec(shape);
        for (const [name, n] of Object.entries(comparePlateParity(base, await recordPlateParity(db)))) if (n > 0) found[`${shape} | ${name}`] = n;
      }
      await client.exec(reset);
      expect(found).toEqual({});
    });
  });

  // SPEC §8 row 1, test 3: random sequences of every writer, old and new.
  it("keeps invariants 1-5, a no-op second heal and every container's servings across random write sequences", async () => {
    const customs: string[] = [];
    for (const name of ["Mash A", "Mash B", "Mash C"]) {
      customs.push((await inject("POST", "/api/foods", { name, category: "veg" })).json<{ id: string }>().id);
    }
    await db.insert(schema.recipeIngredients).values({ recipeId: fx.muffins.id, foodId: customs[0]!, quantityNote: "1" });
    const catalog = [fx.egg.id, fx.banana.id, fx.oats.id, fx.pear.id, fx.carrot.id, fx.milk.id];
    const recipeIds = [fx.muffins.id, fx.porridge.id, fx.eggBake.id];
    const boxes = [
      await container({ recipeId: fx.muffins.id, servingsTotal: 6 }),
      await container({ recipeId: fx.muffins.id, servingsTotal: 6, location: "freezer" }),
      await container({ foodIds: [fx.pear.id, customs[1]!], servingsTotal: 6 }),
      await container({ foodIds: [fx.egg.id] }),
      await container({ recipeIds: [fx.porridge.id, fx.eggBake.id], servingsTotal: 6 }),
    ];

    let seed = 901;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    const live = async () => (await db.select({ id: schema.foods.id }).from(schema.foods)).map((row) => row.id);
    const stars = () => (random() < 0.3 ? null : 1 + Math.floor(random() * 5));
    const newItem = async (): Promise<PlateItemInput> => {
      const r = random();
      const alive = new Set(await live());
      if (r < 0.4) return { kind: "food", foodId: pick([...catalog, ...customs].filter((id) => alive.has(id))), rating: stars() };
      if (r < 0.7) {
        const recipeId = pick(recipeIds);
        const ingredients = (
          await db.select({ foodId: schema.recipeIngredients.foodId }).from(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, recipeId))
        ).map((row) => row.foodId);
        return { kind: "recipe", recipeId, leftOutFoodIds: ingredients.filter(() => random() < 0.3), rating: stars() };
      }
      return { kind: "storage", storageItemId: pick(boxes), servings: 1 + Math.floor(random() * 2) };
    };
    const meals = async () => (await db.select({ id: schema.meals.id }).from(schema.meals).orderBy(asc(schema.meals.id))).map((row) => row.id);
    const read = async (id: string) => mealItemSchema.parse((await inject("GET", `/api/meals/${id}`)).json());
    const statuses: Record<string, number> = {};

    for (let step = 0; step < 90; step += 1) {
      const op = random();
      const mealIds = await meals();
      let label: string;
      let status: number;
      if (op < 0.2 || mealIds.length === 0) {
        label = "create";
        const items: PlateItemInput[] = [];
        for (let n = 1 + Math.floor(random() * 3); n > 0; n -= 1) items.push(await newItem());
        status = (await create({ items })).statusCode;
      } else if (op < 0.45) {
        label = "edit";
        const meal = await read(pick(mealIds));
        let input = plateInputFromItems(meal.items!);
        const change = random();
        if (change < 0.3 && input.length > 1) input.splice(Math.floor(random() * input.length), 1);
        else if (change < 0.55) input.push(await newItem());
        else if (change < 0.75) {
          input = input.map((item) =>
            item.kind === "storage" && random() < 0.6
              ? { ...item, servings: 1 + Math.floor(random() * 3) }
              : item.kind === "recipe" && random() < 0.5
                ? { ...item, leftOutFoodIds: [] }
                : item,
          );
        } else {
          input = input.map((item) => (item.kind === "storage" ? item : { ...item, rating: stars() }));
        }
        status = (await patch(meal.id, { items: input })).statusCode;
      } else if (op < 0.55) {
        label = "rate";
        const id = pick(mealIds);
        const rows = await db.select({ id: schema.mealItems.id }).from(schema.mealItems).where(eq(schema.mealItems.mealId, id));
        status = (await patch(id, { itemRatings: Object.fromEntries(rows.filter(() => random() < 0.5).map((row) => [row.id, stars()])) })).statusCode;
      } else if (op < 0.6) {
        label = "replace";
        const alive = new Set(await live());
        const old = customs.find((id) => alive.has(id));
        status = old ? (await inject("POST", `/api/foods/${old}/replace`, { replacementId: pick(catalog) })).statusCode : 0;
      } else if (op < 0.78) {
        label = "legacy patch";
        const id = pick(mealIds);
        const current = (await db.select({ foodId: schema.mealFoods.foodId }).from(schema.mealFoods).where(eq(schema.mealFoods.mealId, id))).map(
          (row) => row.foodId,
        );
        const shape = random();
        const payload =
          shape < 0.35
            ? { foodIds: [...current.filter(() => random() < 0.7), pick(catalog)] }
            : shape < 0.6
              ? { recipeIds: recipeIds.filter(() => random() < 0.4) }
              : shape < 0.85
                ? { foodRatings: { [pick(current)]: stars() } }
                : { notes: `step ${step}` };
        status = (await patch(id, payload)).statusCode;
      } else if (op < 0.92) {
        label = "legacy serve";
        status = (
          await inject("POST", "/api/storage/serve", {
            babyId,
            parts: [{ storageItemId: pick(boxes), servings: 1 }],
            ...(random() < 0.5 ? { foodIds: [pick(catalog)] } : {}),
          })
        ).statusCode;
      } else {
        label = "delete";
        status = (await inject("DELETE", `/api/meals/${pick(mealIds)}`)).statusCode;
      }
      statuses[`${label} ${status}`] = (statuses[`${label} ${status}`] ?? 0) + 1;
      expect([0, 200, 201, 204, 400, 409], `${label} at step ${step}`).toContain(status);

      try {
        await expectExact(db);
        // Chair §10.1: an inferred recipe item never shows Left out.
        for (const meal of (await loadMeals(db, await meals())).values()) {
          for (const item of meal.items ?? []) if (item.kind === "recipe" && item.inferred) expect(item.leftOut, item.id).toEqual([]);
        }
        // What every tracked container gave is exactly what its meals hold.
        for (const id of boxes) {
          const [row] = await db
            .select({ left: schema.storageItems.servingsLeft, total: schema.storageItems.servingsTotal })
            .from(schema.storageItems)
            .where(eq(schema.storageItems.id, id));
          if (row!.total === null) continue;
          const taken = (await db.select().from(schema.mealStorageItems).where(eq(schema.mealStorageItems.storageItemId, id))).reduce(
            (sum, entry) => sum + entry.servings,
            0,
          );
          expect(row!.left! + taken, `container ${id}`).toBe(row!.total);
        }
      } catch (error) {
        throw new Error(`after ${label} (${status}) at step ${step}: ${String(error)}`);
      }
    }
    // The sequence really exercised every writer, accepted and refused.
    for (const label of ["create 201", "edit 200", "rate 200", "replace 200", "legacy patch 200", "legacy serve 201", "delete 204"]) {
      expect(statuses[label] ?? 0, `${label} in ${JSON.stringify(statuses)}`).toBeGreaterThan(0);
    }
  }, 600_000);
});

describe("a no-op items edit of every corpus meal (SPEC §8 row 1, test 2)", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let parent: TestUser;

  beforeEach(async () => {
    // The random walk below sends a few hundred requests a minute.
    ({ app, db, close } = await createTestApp({ GLOBAL_RATE_LIMIT_MAX: 1_000_000 }));
    parent = await signUpUser(app);
    const [user] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, parent.email));
    await (db as unknown as { $client: PGlite }).$client.exec(plateCorpusSql(user!.id, { withUser: false }));
    // What production's boot does.
    await healMealRecipes(db);
    await db.transaction((tx) => healMealItems(tx));
  });

  afterEach(async () => {
    await close();
  });

  const inject = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie: parent.cookie }, ...(payload ? { payload } : {}) });
  const itemIds = async (mealId: string) =>
    (await db.select({ id: schema.mealItems.id }).from(schema.mealItems).where(eq(schema.mealItems.mealId, mealId))).map((row) => row.id).sort();

  it("GET -> plateInputFromItems -> PATCH changes nothing, links included", async () => {
    const before = await recordPlateParity(db);
    const mealIds = Array.from({ length: 29 }, (_, i) => M(i + 1));
    const idsBefore = await Promise.all(mealIds.map(itemIds));

    for (const mealId of mealIds) {
      const meal = mealItemSchema.parse((await inject("GET", `/api/meals/${mealId}`)).json());
      const response = await inject("PATCH", `/api/meals/${mealId}`, { items: plateInputFromItems(meal.items!) });
      expect(response.statusCode, `${mealId}: ${response.body}`).toBe(200);
      expect(mealItemSchema.parse(response.json()).items).toEqual(mealId === M(21) ? expect.any(Array) : meal.items);
    }

    const after = await recordPlateParity(db);
    // The two known shapes: split container recipes renumber to plate order
    // (SPEC §2.2 "Known limit"), and the V4 meal's orphan mirror rating goes,
    // as on any legacy PATCH (writeMealMirror).
    expect(before.mealRecipes![M(21)]).toEqual([
      { recipe_id: R(1), position: 0, rating: null },
      { recipe_id: R(3), position: 1, rating: null },
      { recipe_id: R(2), position: 2, rating: null },
    ]);
    expect(after.mealRecipes![M(21)]).toEqual([
      { recipe_id: R(1), position: 0, rating: null },
      { recipe_id: R(2), position: 1, rating: null },
      { recipe_id: R(3), position: 2, rating: null },
    ]);
    expect([before.meals![M(23)], after.meals![M(23)]].map((rows) => (rows as { recipe_rating: unknown }[])[0]!.recipe_rating)).toEqual([3, null]);
    const mismatches = comparePlateParity(before, after);
    expect(mismatches).toMatchObject({ mealRecipes: 1, meals: 1, loadMeals: 1 });
    expect(Object.entries(mismatches).filter(([name, n]) => n !== 0 && !["mealRecipes", "meals", "loadMeals"].includes(name))).toEqual([]);
    for (const name of ["mealRecipes", "meals", "loadMeals"]) {
      for (const key of [M(21), M(23)]) {
        delete before[name]![key];
        delete after[name]![key];
      }
    }
    expect(after).toEqual(before);
    // Every item kept its row.
    expect(await Promise.all(mealIds.map(itemIds))).toEqual(idsBefore);
    expect(await checkPlateInvariants(db)).toEqual({ violations: [], orphans: 2 });
    await expectExact(db);
  }, 600_000);

  it("removing the unlinked muffin container of a backfilled meal returns exactly its serving", async () => {
    const meal = mealItemSchema.parse((await inject("GET", `/api/meals/${M(12)}`)).json());
    const box = async (id: string) =>
      (await db.select({ left: schema.storageItems.servingsLeft }).from(schema.storageItems).where(eq(schema.storageItems.id, id)))[0]!.left;
    const legacyBefore = await recordPlateParity(db);
    const [leftX5, leftX6] = [await box(X(5)), await box(X(6))];
    const input = plateInputFromItems(meal.items!).filter((item) => item.kind !== "storage" || item.storageItemId !== X(5));
    expect((await inject("PATCH", `/api/meals/${M(12)}`, { items: input })).statusCode).toBe(200);
    expect([await box(X(5)), await box(X(6))]).toEqual([leftX5! + 1, leftX6]);
    const after = await recordPlateParity(db);
    expect(after.mealFoods![M(12)]).toEqual(legacyBefore.mealFoods![M(12)]);
    expect(after.mealRecipes![M(12)]).toEqual(legacyBefore.mealRecipes![M(12)]);
    expect(after.ratingSummaries).toEqual(legacyBefore.ratingSummaries);
    expect(after.allergenProgress).toEqual(legacyBefore.allergenProgress);
    expect(after.mealStorageItems![M(12)]).toEqual([{ storage_item_id: X(6), servings: 1 }]);
    await expectExact(db);
  });

  // Verifier p1-c3 V6/V6b (901b): adding fresh what an ORPHAN container (one
  // edited in Storage after it was served) holds now makes it fillable. The
  // write's own trailing heal regroups it, so the answer is the rebuilt plate
  // and the invariants hold right after the write.
  it("adding fresh what an orphan recipe container holds now regroups it in the write's own answer", async () => {
    expect(await findDriftedMeals(db)).toEqual([]);
    const meal = mealItemSchema.parse((await inject("GET", `/api/meals/${M(16)}`)).json());
    // X(12) was served to M(16) as Banana Pancakes and holds Broccoli Egg now.
    const response = await inject("PATCH", `/api/meals/${M(16)}`, {
      items: [...plateInputFromItems(meal.items!), { kind: "recipe", recipeId: R(6), rating: 1 }],
    });
    expect(response.statusCode, response.body).toBe(200);
    const written = mealItemSchema.parse(response.json());
    const shape = written.items!.map((i) =>
      i.kind === "storage"
        ? `storage ${i.storageItemId}: ${i.parts.map((p) => (p.kind === "recipe" ? `${p.recipe.id} ${p.rating}` : p.food.id)).join(",")}`
        : i.kind === "recipe"
          ? `recipe ${i.recipe.id} inferred=${i.inferred}`
          : `food ${i.food.id}`,
    );
    // The fresh Broccoli Egg reads as X(12)'s part, its stars kept.
    expect(shape).toEqual([`recipe ${R(1)} inferred=true`, `storage ${X(12)}: ${R(6)} 1`]);
    await expectExact(db);
    // The answer's ids are current: sending it back is a no-op, not a 409.
    const again = await inject("PATCH", `/api/meals/${M(16)}`, { items: plateInputFromItems(written.items!) });
    expect(again.statusCode, again.body).toBe(200);
    expect(mealItemSchema.parse(again.json()).items).toEqual(written.items);
  });

  it("the same for a FOOD orphan: fresh Carrot on M(17), whose X(14) held Banana and holds Carrot now", async () => {
    const meal = mealItemSchema.parse((await inject("GET", `/api/meals/${M(17)}`)).json());
    expect(meal.items!.some((i) => i.kind === "food" && i.food.id === F(3))).toBe(false);
    const response = await inject("PATCH", `/api/meals/${M(17)}`, {
      items: [...plateInputFromItems(meal.items!), { kind: "food", foodId: F(3), rating: 2 }],
    });
    expect(response.statusCode, response.body).toBe(200);
    const written = mealItemSchema.parse(response.json());
    expect(written.items!.some((i) => i.kind === "storage" && i.storageItemId === X(14))).toBe(true);
    await expectExact(db);
  });

  // Verifier p1-c3: random edits over every backfilled shape (orphans, pass C
  // groups, split container recipes, merged serves, pre-0020 containers),
  // which the fresh-fixture walk above cannot reach. Ids are random, so a
  // walk's path differs from run to run (without the trailing heal, about one
  // walk in six hits the orphan case the two tests above pin exactly).
  it.each([77, 4096])("random edits over every backfilled corpus shape keep invariants 1-5, a no-op heal and chair §10.1 (seed %i)", async (start) => {
    let seed = start;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    const stars = () => (random() < 0.3 ? null : 1 + Math.floor(random() * 5));
    const foodPool = Array.from({ length: 9 }, (_, i) => F(i + 1));
    const recipePool = Array.from({ length: 6 }, (_, i) => R(i + 1));
    const boxes = Array.from({ length: 18 }, (_, i) => X(i + 1));
    const statuses: Record<string, number> = {};
    const mealIds = async () => (await db.select({ id: schema.meals.id }).from(schema.meals).orderBy(asc(schema.meals.id))).map((r) => r.id);
    for (let step = 0; step < 200; step += 1) {
      const ids = await mealIds();
      const op = random();
      let label: string;
      let status: number;
      if (op < 0.45 && ids.length > 0) {
        label = "edit";
        const id = pick(ids);
        const meal = mealItemSchema.parse((await inject("GET", `/api/meals/${id}`)).json());
        let input = plateInputFromItems(meal.items!);
        const c = random();
        if (c < 0.25 && input.length > 1) input.splice(Math.floor(random() * input.length), 1);
        else if (c < 0.4) input.push({ kind: "food", foodId: pick(foodPool), rating: stars() });
        else if (c < 0.5) input.push({ kind: "recipe", recipeId: pick(recipePool), rating: stars() });
        else if (c < 0.6) input.push({ kind: "storage", storageItemId: pick(boxes), servings: 1 + Math.floor(random() * 2) });
        else if (c < 0.75) input = input.map((it) => (it.kind === "storage" && random() < 0.5 ? { ...it, servings: 1 + Math.floor(random() * 3) } : it));
        else if (c < 0.85) input = input.map((it) => (it.kind === "recipe" && random() < 0.5 ? { ...it, leftOutFoodIds: [] } : it));
        else input = input.map((it) => (it.kind === "storage" ? it : { ...it, rating: stars() }));
        status = (await inject("PATCH", `/api/meals/${id}`, { items: input })).statusCode;
      } else if (op < 0.6 && ids.length > 0) {
        label = "rate";
        const id = pick(ids);
        const rows = await db.select({ id: schema.mealItems.id }).from(schema.mealItems).where(eq(schema.mealItems.mealId, id));
        status = (await inject("PATCH", `/api/meals/${id}`, { itemRatings: Object.fromEntries(rows.filter(() => random() < 0.5).map((r) => [r.id, stars()])) }))
          .statusCode;
      } else if (op < 0.8 && ids.length > 0) {
        label = "legacy patch";
        const id = pick(ids);
        const current = (await db.select({ foodId: schema.mealFoods.foodId }).from(schema.mealFoods).where(eq(schema.mealFoods.mealId, id))).map(
          (r) => r.foodId,
        );
        const shape = random();
        const payload =
          shape < 0.3
            ? { foodIds: [...current.filter(() => random() < 0.8), pick(foodPool)] }
            : shape < 0.55
              ? { recipeIds: recipePool.filter(() => random() < 0.3) }
              : shape < 0.85
                ? { foodRatings: { [pick(current)]: stars() } }
                : { notes: `s${step}` };
        status = (await inject("PATCH", `/api/meals/${id}`, payload)).statusCode;
      } else if (op < 0.95) {
        label = "legacy serve";
        status = (await inject("POST", "/api/storage/serve", { babyId: B1, parts: [{ storageItemId: pick(boxes), servings: 1 }] })).statusCode;
      } else {
        label = "delete";
        status = ids.length > 0 ? (await inject("DELETE", `/api/meals/${pick(ids)}`)).statusCode : 0;
      }
      statuses[`${label} ${status}`] = (statuses[`${label} ${status}`] ?? 0) + 1;
      expect([0, 200, 201, 204, 400, 409], `${label} at step ${step}`).toContain(status);
      try {
        await expectExact(db);
        for (const meal of (await loadMeals(db, await mealIds())).values()) {
          for (const item of meal.items ?? []) if (item.kind === "recipe" && item.inferred) expect(item.leftOut, item.id).toEqual([]);
        }
      } catch (error) {
        throw new Error(`after ${label} (${status}) at step ${step}: ${String(error)}`);
      }
    }
    for (const label of ["edit 200", "rate 200", "legacy patch 200", "legacy serve 201"]) {
      expect(statuses[label] ?? 0, `${label} in ${JSON.stringify(statuses)}`).toBeGreaterThan(0);
    }
  }, 1_800_000);
});
