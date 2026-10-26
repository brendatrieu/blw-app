// Ledger 901b: the Phase 1 verifiers' probes (VERIFY-p1-c1 P-series, c2's
// Q1/Q2), kept as pins. Each one guards a rule the plate SPEC calls out and
// the main plate tests do not reach: the leave-out rule on a KEPT recipe item
// (P1, P10, Q1, Q2), 864 on inferred rows (P2, P17), orphan re-adds (P4,
// P6), first-rated mirrors (P7, P8), legacy containers (P12), the account
// boundary (P13), the step-0 heal (P14), the legacy caps (P15, P18), stray
// part ratings (P16) and Replace's final syncLegacy (P19).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import type { FastifyInstance } from "fastify";
import { plateInputFromItems } from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import { findDriftedMeals, healMealItems } from "../db/migrate.js";
import { checkPlateInvariants } from "../db/plateParity.js";
import * as schema from "../db/schema.js";
import { loadAllergenProgress } from "../services/allergens.js";
import { F, M, X, plateCorpusSql } from "./plateCorpus.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("plate pins (901b)", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let parent: TestUser;
  let babyId: string;
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    await db.insert(schema.storageGuidelines).values({ category: "produce_cooked", fridgeHours: 48, freezerDays: 60, roomTempHours: 2, notes: "x" });
    const allergenRows = await db
      .insert(schema.allergens)
      .values([
        { slug: "egg", name: "Egg", introGuidance: "x" },
        { slug: "milk", name: "Milk", introGuidance: "x" },
        { slug: "peanut", name: "Peanut", introGuidance: "x" },
      ])
      .returning();
    const food = (slug: string, name: string, kind: "food" | "info" = "food") => ({
      slug,
      name,
      kind,
      category: "fruit" as const,
      ironLevel: "low" as const,
      vitaminCLevel: "low" as const,
      chokingRisk: "low" as const,
      minAgeMonths: 6,
      prep6m: "a",
      prep9m: "b",
      prep12m: "c",
      storageCategory: "produce_cooked",
    });
    const foods = await db
      .insert(schema.foods)
      .values([food("egg", "Egg"), food("banana", "Banana"), food("peanut", "Peanut Butter"), food("milk", "Whole Milk", "info")])
      .returning();
    for (const f of foods) ids[f.slug] = f.id;
    for (const a of allergenRows) ids[`a-${a.slug}`] = a.id;
    await db.insert(schema.foodAllergens).values([
      { foodId: ids.egg!, allergenId: ids["a-egg"]!, countsTowardProgress: true, countsWhenAlone: false },
      { foodId: ids.peanut!, allergenId: ids["a-peanut"]!, countsTowardProgress: true, countsWhenAlone: false },
      { foodId: ids.milk!, allergenId: ids["a-milk"]!, countsTowardProgress: false, countsWhenAlone: true },
    ]);
    parent = await signUpUser(app);
    babyId = (await call("POST", "/api/babies", { name: "Robin", birthDate: "2025-01-15" })).json().id;
  });
  afterEach(async () => {
    await close();
  });

  const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
    app.inject({ method, url, headers: { cookie: parent.cookie }, ...(payload === undefined ? {} : { payload: payload as object }) });
  const progress = async (slug: string) =>
    ((await call("GET", `/api/babies/${babyId}/allergen-progress`)).json().items as any[]).find((row) => row.allergenSlug === slug)
      .exposures as number;
  const eaten = async (mealId: string) =>
    (await db.select({ foodId: schema.mealFoods.foodId }).from(schema.mealFoods).where(eq(schema.mealFoods.mealId, mealId)))
      .map((r) => r.foodId)
      .sort();
  const recipe = async (title: string, foodIds: string[]) =>
    (await call("POST", "/api/recipes", { title, minAgeMonths: 6, ingredients: foodIds.map((foodId) => ({ foodId, quantityNote: "1" })) })).json()
      .id as string;
  const editRecipe = async (id: string, foodIds: string[]) => {
    const res = await call("PATCH", `/api/recipes/${id}`, { ingredients: foodIds.map((foodId) => ({ foodId, quantityNote: "1" })) });
    expect(res.statusCode, res.body).toBe(200);
  };
  const box = async (payload: Record<string, unknown>) =>
    (await call("POST", "/api/storage", { location: "fridge", ...payload })).json().items[0].id as string;
  /** Each recipe item sent with `leftOutFoodIds`: `leftOut(item)`, else what it showed. */
  const withLeftOut = (items: any[], leftOut: (item: any) => string[] = (item) => item.leftOut.map((f: any) => f.id)) =>
    plateInputFromItems(items).map((x: any, i) => (x.kind === "recipe" ? { ...x, leftOutFoodIds: leftOut(items[i]) } : x));

  describe("leave-out on a KEPT recipe item never re-derives from the recipe as it is now", () => {
    it("P1: an inferred item can only lose foods: leaving banana out does not log what the recipe gained", async () => {
      const pancakes = await recipe("My pancakes", [ids.egg!, ids.banana!]);
      const meal = (await call("POST", `/api/babies/${babyId}/meals`, { foodIds: [ids.egg, ids.banana], recipeIds: [pancakes] })).json();
      await editRecipe(pancakes, [ids.egg!, ids.banana!, ids.peanut!]);
      const plate = (await call("GET", `/api/meals/${meal.id}`)).json();
      expect(plate.items.find((x: any) => x.kind === "recipe")).toMatchObject({ inferred: true, leftOut: [] });
      const res = await call("PATCH", `/api/meals/${meal.id}`, { items: withLeftOut(plate.items, () => [ids.banana!]) });
      expect(res.statusCode, res.body).toBe(200);
      expect(await eaten(meal.id)).toEqual([ids.egg!]);
      expect(await progress("peanut")).toBe(0);
    });

    it("Q1: echoing an inferred item's shown leftOut ([]) changes nothing eaten", async () => {
      const pancakes = await recipe("My pancakes", [ids.egg!, ids.banana!]);
      const meal = (await call("POST", `/api/babies/${babyId}/meals`, { foodIds: [ids.egg, ids.banana], recipeIds: [pancakes] })).json();
      await editRecipe(pancakes, [ids.egg!, ids.banana!, ids.peanut!]);
      const before = await eaten(meal.id);
      const plate = (await call("GET", `/api/meals/${meal.id}`)).json();
      const res = await call("PATCH", `/api/meals/${meal.id}`, { items: withLeftOut(plate.items), notes: "fed at grandma's" });
      expect(res.statusCode, res.body).toBe(200);
      expect(await eaten(meal.id)).toEqual(before);
      expect(await progress("peanut")).toBe(0);
    });

    it("P10: a food the recipe LOST since stays eaten when the parent leaves another one out", async () => {
      const pancakes = await recipe("Peanut pancakes", [ids.egg!, ids.peanut!]);
      const meal = (
        await call("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "recipe", recipeId: pancakes }, { kind: "food", foodId: ids.banana }] })
      ).json();
      expect(await progress("peanut")).toBe(1);
      await editRecipe(pancakes, [ids.egg!]);
      const plate = (await call("GET", `/api/meals/${meal.id}`)).json();
      expect(plate.items.find((x: any) => x.kind === "recipe")).toMatchObject({ inferred: false, leftOut: [] });
      const res = await call("PATCH", `/api/meals/${meal.id}`, { items: withLeftOut(plate.items, () => [ids.egg!]) });
      expect(res.statusCode, res.body).toBe(200);
      expect(await eaten(meal.id)).toEqual([ids.banana!, ids.peanut!].sort());
      expect(await progress("peanut")).toBe(1);
    });

    it("Q2: echoing a plate item's shown leftOut ([]) keeps a food the recipe lost since", async () => {
      const pancakes = await recipe("Peanut pancakes", [ids.egg!, ids.peanut!]);
      const meal = (await call("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "recipe", recipeId: pancakes }] })).json();
      await editRecipe(pancakes, [ids.egg!]);
      const plate = (await call("GET", `/api/meals/${meal.id}`)).json();
      const res = await call("PATCH", `/api/meals/${meal.id}`, { items: withLeftOut(plate.items) });
      expect(res.statusCode, res.body).toBe(200);
      expect(await eaten(meal.id)).toEqual([ids.egg!, ids.peanut!].sort());
      expect(await progress("peanut")).toBe(1);
    });
  });

  describe("864 on inferred food rows", () => {
    it("P2: a later recipe edit moves the Milk ladder for neither a meal saved before the plate nor one after", async () => {
      const mash = await recipe("My mash", [ids.banana!]);
      const legacyMeal = (
        await call("POST", `/api/babies/${babyId}/meals`, { foodIds: [ids.milk, ids.banana], recipeIds: [mash], servedAt: "2026-09-01T08:00:00Z" })
      ).json();
      await call("POST", `/api/babies/${babyId}/meals`, {
        items: [{ kind: "food", foodId: ids.milk }, { kind: "recipe", recipeId: mash }],
        servedAt: "2026-09-02T08:00:00Z",
      });
      expect(await progress("milk")).toBe(2);
      await editRecipe(mash, [ids.banana!, ids.milk!]);
      expect(await progress("milk")).toBe(2);
      const detail = (await call("GET", `/api/babies/${babyId}/allergen-progress/milk`)).json();
      const counted = Object.fromEntries((detail.exposures as any[]).map((x) => [x.mealId === legacyMeal.id ? "legacy" : "plate", x.counted]));
      expect(counted).toEqual({ legacy: true, plate: true });
    });

    it("P17: milk served from its own container next to a milk recipe reads as today's rule did (exact at migration)", async () => {
      const bake = await recipe("Egg bake", [ids.egg!, ids.milk!]);
      const milkBox = await box({ foodIds: [ids.milk], servingsTotal: 3 });
      const bakeBox = await box({ recipeId: bake, servingsTotal: 3 });
      // An old bundle serves both, milk first (so milk links to it: an inferred food row).
      const served = await call("POST", "/api/storage/serve", {
        babyId,
        parts: [
          { storageItemId: milkBox, servings: 1 },
          { storageItemId: bakeBox, servings: 1 },
        ],
      });
      expect(served.statusCode, served.body).toBe(201);
      const milk = async (reads?: "legacy") => (await loadAllergenProgress(db, babyId, reads)).find((x) => x.allergenSlug === "milk")!.exposures;
      expect(await milk()).toBe(await milk("legacy"));
    });
  });

  it("P4: re-adding an orphaned container adds to its row; removing it later returns both servings", async () => {
    const box1 = await box({ foodIds: [ids.banana], servingsTotal: 5 });
    const box2 = await box({ location: "freezer", foodIds: [ids.banana], servingsTotal: 5 });
    // A serve of both (the second overlaps, so it gets no link), as a pre-0024 image left it.
    const served = (
      await call("POST", "/api/storage/serve", {
        babyId,
        parts: [
          { storageItemId: box1, servings: 1 },
          { storageItemId: box2, servings: 1 },
        ],
      })
    ).json();
    const mealId = served.meal.id as string;
    expect((await call("PATCH", `/api/storage/${box2}`, { foodIds: [ids.egg] })).statusCode).toBe(200);
    await db.delete(schema.mealItems).where(eq(schema.mealItems.mealId, mealId)); // no items yet (pre-0024)
    await db.transaction((tx) => healMealItems(tx)); // the boot backfill: box2 is now an orphan
    const plate = (await call("GET", `/api/meals/${mealId}`)).json();
    expect(plate.items.map((x: any) => (x.kind === "storage" ? x.storageItemId : x.kind))).toEqual([box1]);
    const left = async () =>
      (await db.select({ l: schema.storageItems.servingsLeft }).from(schema.storageItems).where(eq(schema.storageItems.id, box2)))[0]!.l;
    const msi = async () =>
      (await db.select({ s: schema.mealStorageItems.servings }).from(schema.mealStorageItems).where(eq(schema.mealStorageItems.storageItemId, box2)))[0]
        ?.s;
    expect([await left(), await msi()]).toEqual([4, 1]);
    const add = await call("PATCH", `/api/meals/${mealId}`, {
      items: [...plateInputFromItems(plate.items), { kind: "storage", storageItemId: box2, servings: 1 }],
    });
    expect(add.statusCode, add.body).toBe(200);
    expect([await left(), await msi()]).toEqual([3, 2]);
    expect(await eaten(mealId)).toEqual([ids.banana!, ids.egg!].sort());
    const again = (await call("GET", `/api/meals/${mealId}`)).json();
    const remove = await call("PATCH", `/api/meals/${mealId}`, {
      items: plateInputFromItems(again.items).filter((x: any) => x.kind !== "storage" || x.storageItemId !== box2),
    });
    expect(remove.statusCode, remove.body).toBe(200);
    expect([await left(), await msi()]).toEqual([5, undefined]);
    expect(await eaten(mealId)).toEqual([ids.banana!]);
  });

  it("P7: a boot heal leaves the stars of one food in three rows (unrated, 4, 2) exactly as they are", async () => {
    const x1 = await box({ foodIds: [ids.egg], servingsTotal: 3 });
    const x2 = await box({ location: "freezer", foodIds: [ids.egg], servingsTotal: 3 });
    const meal = (
      await call("POST", `/api/babies/${babyId}/meals`, {
        items: [
          { kind: "storage", storageItemId: x1, servings: 1 },
          { kind: "food", foodId: ids.egg, rating: 4 },
          { kind: "storage", storageItemId: x2, servings: 1, ratings: { [ids.egg!]: 2 } },
        ],
      })
    ).json();
    const stars = async () =>
      (await db.select({ p: schema.mealItems.position, r: schema.mealItems.rating }).from(schema.mealItems).where(eq(schema.mealItems.mealId, meal.id)))
        .sort((a, b) => a.p - b.p)
        .map((x) => x.r);
    expect(await stars()).toEqual([null, 4, 2]);
    expect(await db.select({ r: schema.mealFoods.rating }).from(schema.mealFoods).where(eq(schema.mealFoods.mealId, meal.id))).toEqual([{ r: 4 }]);
    await db.transaction((tx) => healMealItems(tx));
    expect(await stars()).toEqual([null, 4, 2]);
    expect((await call("GET", `/api/babies/${babyId}/ratings`)).json().foods[ids.egg!]).toMatchObject({ count: 2 });
  });

  it("P8: one recipe (or food) rated in two items mirrors the FIRST one's stars to old clients", async () => {
    const muffins = await recipe("Muffins", [ids.egg!, ids.banana!]);
    const muffinBox = await box({ location: "freezer", recipeId: muffins, servingsTotal: 4 });
    const meal = (
      await call("POST", `/api/babies/${babyId}/meals`, {
        items: [
          { kind: "recipe", recipeId: muffins, rating: 5 },
          { kind: "storage", storageItemId: muffinBox, servings: 1, ratings: { [muffins]: 2 } },
        ],
      })
    ).json();
    expect(await db.select({ r: schema.mealRecipes.rating }).from(schema.mealRecipes).where(eq(schema.mealRecipes.mealId, meal.id))).toEqual([{ r: 5 }]);
    const [mirror] = await db.select({ r: schema.meals.recipeRating }).from(schema.meals).where(eq(schema.meals.id, meal.id));
    expect(mirror!.r).toBe(5);
    const eggBox = await box({ foodIds: [ids.egg], servingsTotal: 4 });
    const meal2 = (
      await call("POST", `/api/babies/${babyId}/meals`, {
        items: [
          { kind: "food", foodId: ids.egg, rating: 1 },
          { kind: "storage", storageItemId: eggBox, servings: 1, ratings: { [ids.egg!]: 4 } },
        ],
      })
    ).json();
    expect(await db.select({ r: schema.mealFoods.rating }).from(schema.mealFoods).where(eq(schema.mealFoods.mealId, meal2.id))).toEqual([{ r: 1 }]);
  });

  it("P12: a legacy container holding foods AND a recipe, served on the plate, counts only its foods", async () => {
    const pancakes = await recipe("Pancakes", [ids.egg!, ids.peanut!]);
    const [user] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, parent.email));
    const [legacyBox] = await db
      .insert(schema.storageItems)
      .values({ userId: user!.id, recipeId: pancakes, preparedAt: new Date(), location: "fridge", status: "active", servingsTotal: 3, servingsLeft: 3 })
      .returning();
    await db.insert(schema.storageItemFoods).values({ storageItemId: legacyBox!.id, foodId: ids.banana!, position: 0 });
    const meal = (await call("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "storage", storageItemId: legacyBox!.id, servings: 1 }] })).json();
    expect(await eaten(meal.id)).toEqual([ids.banana!]);
    expect(meal.items[0].parts.map((x: any) => x.kind)).toEqual(["recipe", "food"]);
  });

  it("P13: another account's container, custom food or recipe on the plate is refused, and nothing is written or taken", async () => {
    const other = await signUpUser(app);
    const as = (user: TestUser, method: "POST" | "PATCH", url: string, payload: unknown) =>
      app.inject({ method, url, headers: { cookie: user.cookie }, payload: payload as object });
    const theirBox = (await as(other, "POST", "/api/storage", { location: "fridge", foodIds: [ids.banana], servingsTotal: 3 })).json().items[0].id as string;
    const theirFood = (await as(other, "POST", "/api/foods", { name: "Their mash", category: "veg" })).json().id as string;
    const theirRecipe = (
      await as(other, "POST", "/api/recipes", { title: "Theirs", minAgeMonths: 6, ingredients: [{ foodId: ids.egg, quantityNote: "" }] })
    ).json().id as string;
    const before = (await db.select().from(schema.meals)).length;
    const viaBox = await call("POST", `/api/babies/${babyId}/meals`, {
      items: [
        { kind: "food", foodId: ids.egg },
        { kind: "storage", storageItemId: theirBox, servings: 1 },
      ],
    });
    const viaFood = await call("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "food", foodId: theirFood }] });
    const viaRecipe = await call("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "recipe", recipeId: theirRecipe }] });
    const mine = (await call("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "food", foodId: ids.egg }] })).json();
    const editBox = await call("PATCH", `/api/meals/${mine.id}`, {
      items: [
        { kind: "food", id: mine.items[0].id, foodId: ids.egg },
        { kind: "storage", storageItemId: theirBox, servings: 1 },
      ],
    });
    expect([viaBox.statusCode, viaFood.statusCode, viaRecipe.statusCode, editBox.statusCode]).toEqual([400, 400, 400, 400]);
    expect((await db.select({ l: schema.storageItems.servingsLeft }).from(schema.storageItems).where(eq(schema.storageItems.id, theirBox)))[0]!.l).toBe(3);
    expect((await db.select().from(schema.meals)).length).toBe(before + 1);
    expect(await eaten(mine.id)).toEqual([ids.egg!]);
  });

  it("P14: an edit from ids an outside write made stale is a 409, and the outside write's food survives (step 0)", async () => {
    const meal = (await call("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "food", foodId: ids.egg }] })).json();
    const seen = (await call("GET", `/api/meals/${meal.id}`)).json();
    // An older image (no heal) adds peanut butter to that meal's legacy rows.
    await db.insert(schema.mealFoods).values({ mealId: meal.id, foodId: ids.peanut! });
    const res = await call("PATCH", `/api/meals/${meal.id}`, { items: plateInputFromItems(seen.items).map((x: any) => ({ ...x, rating: 5 })) });
    expect(res.statusCode).toBe(409);
    expect(await eaten(meal.id)).toContain(ids.peanut!);
  });

  it("P15: the plate keeps the legacy caps: 51 foods or 11 recipes is a 400, 50 foods is fine", async () => {
    const foodIds: string[] = [];
    for (let i = 0; i < 51; i += 1) foodIds.push((await call("POST", "/api/foods", { name: `Mash ${i}`, category: "veg" })).json().id);
    const fifty = await call("POST", `/api/babies/${babyId}/meals`, { items: foodIds.slice(0, 50).map((foodId) => ({ kind: "food", foodId })) });
    const fiftyOne = await call("POST", `/api/babies/${babyId}/meals`, { items: foodIds.map((foodId) => ({ kind: "food", foodId })) });
    const recipeIds: string[] = [];
    for (let i = 0; i < 11; i += 1) recipeIds.push(await recipe(`R${i}`, [ids.egg!]));
    const eleven = await call("POST", `/api/babies/${babyId}/meals`, { items: recipeIds.map((recipeId) => ({ kind: "recipe", recipeId })) });
    expect([fifty.statusCode, fiftyOne.statusCode, eleven.statusCode]).toEqual([201, 400, 400]);
  });

  it("P16: a rating for a part a kept container does not hold is a 400 (new and kept containers alike)", async () => {
    const bananas = await box({ foodIds: [ids.banana], servingsTotal: 3 });
    const fresh = await call("POST", `/api/babies/${babyId}/meals`, {
      items: [{ kind: "storage", storageItemId: bananas, servings: 1, ratings: { [ids.egg!]: 3 } }],
    });
    const meal = (await call("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "storage", storageItemId: bananas, servings: 1 }] })).json();
    const kept = await call("PATCH", `/api/meals/${meal.id}`, { items: [{ kind: "storage", storageItemId: bananas, ratings: { [ids.egg!]: 3 } }] });
    expect([fresh.statusCode, kept.statusCode]).toEqual([400, 400]);
  });

  it("P18: a 61-item plate (50 foods + 10 recipes + 1 container) saves; 71 items is a 400", async () => {
    const foodIds: string[] = [];
    for (let i = 0; i < 50; i += 1) foodIds.push((await call("POST", "/api/foods", { name: `Mash ${i}`, category: "veg" })).json().id);
    const recipeIds: string[] = [];
    for (let i = 0; i < 10; i += 1) recipeIds.push(await recipe(`R${i}`, [foodIds[i]!]));
    const mashBox = await box({ foodIds: [foodIds[0]], servingsTotal: 2 });
    const items = [
      ...foodIds.map((foodId) => ({ kind: "food", foodId })),
      ...recipeIds.map((recipeId) => ({ kind: "recipe", recipeId })),
      { kind: "storage", storageItemId: mashBox, servings: 1 },
    ];
    const ok = await call("POST", `/api/babies/${babyId}/meals`, { items });
    const tooMany = await call("POST", `/api/babies/${babyId}/meals`, {
      items: [...items, ...Array.from({ length: 10 }, () => ({ kind: "food", foodId: foodIds[0] }))],
    });
    expect([ok.statusCode, tooMany.statusCode]).toEqual([201, 400]);
  });

  it("P19: Replace that lands the replacement in two rated rows keeps the mirror exact, so a boot heal changes no stars", async () => {
    const mash = (await call("POST", "/api/foods", { name: "Mash", category: "veg" })).json().id as string;
    const mashBox = await box({ foodIds: [mash], servingsTotal: 3 });
    const meal = (
      await call("POST", `/api/babies/${babyId}/meals`, {
        items: [
          { kind: "storage", storageItemId: mashBox, servings: 1, ratings: { [mash]: 5 } },
          { kind: "food", foodId: ids.egg, rating: 3 },
        ],
      })
    ).json();
    const res = await call("POST", `/api/foods/${mash}/replace`, { replacementId: ids.egg });
    expect(res.statusCode, res.body).toBe(200);
    const stars = async () =>
      (await db.select({ p: schema.mealItems.position, r: schema.mealItems.rating }).from(schema.mealItems).where(eq(schema.mealItems.mealId, meal.id)))
        .sort((a, b) => a.p - b.p)
        .map((x) => x.r);
    expect((await checkPlateInvariants(db)).violations).toEqual([]);
    await db.transaction((tx) => healMealItems(tx));
    expect(await stars()).toEqual([5, 3]);
    const [legacy] = await db.select({ r: schema.mealFoods.rating }).from(schema.mealFoods).where(eq(schema.mealFoods.mealId, meal.id));
    expect(legacy!.r).toBe(5);
  });
});

describe("plate pin P6 (901b)", () => {
  it("P6: an orphan whose container is edited back to hold the meal's food is drift ONLY through the container clause, and the heal gives it a group", async () => {
    const { db, app, close } = await createTestApp();
    try {
      const parent = await signUpUser(app);
      const [user] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, parent.email));
      await (db as unknown as { $client: PGlite }).$client.exec(plateCorpusSql(user!.id, { withUser: false }));
      await db.transaction((tx) => healMealItems(tx));
      expect(await findDriftedMeals(db)).toEqual([]);
      // m17: a14 is an orphan (held Banana when served, holds Carrot now). Edit it back to Banana.
      await db.insert(schema.storageItemFoods).values({ storageItemId: X(14), foodId: F(1), position: 1 });
      expect(await findDriftedMeals(db)).toEqual([M(17)]);
      await db.transaction((tx) => healMealItems(tx));
      expect(await findDriftedMeals(db)).toEqual([]);
      expect((await checkPlateInvariants(db)).violations).toEqual([]);
      expect((await db.select().from(schema.mealItems).where(eq(schema.mealItems.storageItemId, X(14)))).length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});
