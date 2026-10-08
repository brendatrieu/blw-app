// Ledger 753 + 751 (DESIGN-B §5, §5a): serving several containers at once
// (plus fresh foods and fresh recipes), the per-meal record of what each
// serve took, and servings coming back when the meal is deleted (= Undo) or
// an edit takes a served part off it. The shipped app's single-item serve
// must keep its request and response byte for byte, and now records too.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import {
  ACCOUNT_DELETE_CONFIRMATION,
  accountExportSchema,
  mealItemSchema,
  serveStorageResponseSchema,
  type Baby,
  type CreateStorageItemResponse,
  type MealItem,
  type ServeStorageItemResponse,
  type ServeStorageResponse,
  type StorageItem,
} from "@blw/shared";
import { createTestApp, insertMeals, signUpUser, type TestUser } from "./helpers.js";
import { buildChatTools } from "../ai/tools.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

async function seedFixtures(db: Database) {
  await db
    .insert(schema.storageGuidelines)
    .values({ category: "produce_cooked", fridgeHours: 48, freezerDays: 60, roomTempHours: 2, notes: "Cooked." });
  const food = (slug: string, name: string) => ({
    slug,
    name,
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
  const [egg, banana, oats, pear, carrot] = await db
    .insert(schema.foods)
    .values([food("egg", "Egg"), food("banana", "Banana"), food("oats", "Oats"), food("pear", "Pear"), food("carrot", "Carrot")])
    .returning();
  const recipe = async (slug: string, title: string, foodIds: string[]) => {
    const [row] = await db.insert(schema.recipes).values({ slug, title, minAgeMonths: 6, prepMinutes: 5 }).returning();
    if (foodIds.length > 0) {
      await db
        .insert(schema.recipeIngredients)
        .values(foodIds.map((foodId) => ({ recipeId: row!.id, foodId, quantityNote: "1" })));
    }
    return row!;
  };
  // pancakes = egg + banana, porridge = oats + banana (they share banana).
  const pancakes = await recipe("pancakes", "Pancakes", [egg!.id, banana!.id]);
  const porridge = await recipe("porridge", "Porridge", [oats!.id, banana!.id]);
  const drizzle = await recipe("oil-drizzle", "Oil Drizzle", []);
  return { egg: egg!, banana: banana!, oats: oats!, pear: pear!, carrot: carrot!, pancakes, porridge, drizzle };
}

describe("multi-part serve and servings back (ledger 753 + 751)", () => {
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

  async function container(payload: Record<string, unknown>, user = parent): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/storage",
      headers: { cookie: user.cookie },
      payload: { location: "fridge", ...payload },
    });
    if (response.statusCode !== 201) throw new Error(`storage create failed: ${response.body}`);
    return response.json<CreateStorageItemResponse>().items[0]!.id;
  }
  const serveMany = (payload: Record<string, unknown>, user = parent) =>
    app.inject({ method: "POST", url: "/api/storage/serve", headers: { cookie: user.cookie }, payload });
  async function served(payload: Record<string, unknown>): Promise<ServeStorageResponse> {
    const response = await serveMany(payload);
    if (response.statusCode !== 201) throw new Error(`serve failed: ${response.statusCode} ${response.body}`);
    return serveStorageResponseSchema.parse(response.json());
  }
  const serveOne = (id: string, payload: Record<string, unknown> = {}) =>
    app.inject({ method: "POST", url: `/api/storage/${id}/serve`, headers: { cookie: parent.cookie }, payload });
  const deleteMeal = (id: string) =>
    app.inject({ method: "DELETE", url: `/api/meals/${id}`, headers: { cookie: parent.cookie } });
  async function patched(id: string, payload: Record<string, unknown>): Promise<MealItem> {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/meals/${id}`,
      headers: { cookie: parent.cookie },
      payload,
    });
    if (response.statusCode !== 200) throw new Error(`meal patch failed: ${response.statusCode} ${response.body}`);
    return mealItemSchema.parse(response.json());
  }
  async function box(id: string) {
    const [row] = await db
      .select({ left: schema.storageItems.servingsLeft, total: schema.storageItems.servingsTotal, status: schema.storageItems.status })
      .from(schema.storageItems)
      .where(eq(schema.storageItems.id, id));
    return row;
  }
  async function setBox(id: string, values: Partial<typeof schema.storageItems.$inferInsert>) {
    await db.update(schema.storageItems).set(values).where(eq(schema.storageItems.id, id));
  }
  async function record(mealId: string) {
    return db
      .select({ storageItemId: schema.mealStorageItems.storageItemId, servings: schema.mealStorageItems.servings })
      .from(schema.mealStorageItems)
      .where(eq(schema.mealStorageItems.mealId, mealId))
      .orderBy(asc(schema.mealStorageItems.storageItemId));
  }
  const count = async (table: typeof schema.meals | typeof schema.mealStorageItems | typeof schema.mealRecipes) =>
    (await db.select().from(table)).length;
  const linkOf = (meal: MealItem, foodId: string) => meal.foods.find((food) => food.id === foodId)?.storageItemId;

  describe("POST /api/storage/serve", () => {
    it("serves recipe containers, a food container, a fresh food and a fresh recipe as ONE meal", async () => {
      const pancakesBox = await container({ recipeId: fx.pancakes.id, servingsTotal: 4 });
      const porridgeBox = await container({ recipeId: fx.porridge.id, servingsTotal: 3 });
      const fruitBox = await container({ foodIds: [fx.pear.id, fx.banana.id] });
      const freshRecipe = await db
        .insert(schema.recipes)
        .values({ slug: "carrot-sticks", title: "Carrot Sticks", minAgeMonths: 6, prepMinutes: 5 })
        .returning();
      await db
        .insert(schema.recipeIngredients)
        .values({ recipeId: freshRecipe[0]!.id, foodId: fx.carrot.id, quantityNote: "1" });

      const result = await served({
        babyId,
        parts: [
          { storageItemId: porridgeBox, servings: 2 },
          { storageItemId: pancakesBox },
          { storageItemId: fruitBox },
        ],
        foodIds: [fx.egg.id],
        recipeIds: [freshRecipe[0]!.id],
        recipeRatings: { [fx.porridge.id]: 5 },
        foodRatings: { [fx.pear.id]: 3 },
      });

      // Recipes in parts order, then the fresh one; the mirror is the first.
      expect(result.meal.recipes?.map((recipe) => [recipe.title, recipe.rating])).toEqual([
        ["Porridge", 5],
        ["Pancakes", null],
        ["Carrot Sticks", null],
      ]);
      expect(result.meal).toMatchObject({ recipeId: fx.porridge.id, recipeTitle: "Porridge", recipeRating: 5 });
      // A food in two parts keeps the FIRST part's link (banana: porridge);
      // fresh foods have none, even one that is also an ingredient (egg is a
      // pancakes ingredient, so it links to the pancakes box).
      expect(linkOf(result.meal, fx.oats.id)).toBe(porridgeBox);
      expect(linkOf(result.meal, fx.banana.id)).toBe(porridgeBox);
      expect(linkOf(result.meal, fx.egg.id)).toBe(pancakesBox);
      expect(linkOf(result.meal, fx.pear.id)).toBe(fruitBox);
      expect(linkOf(result.meal, fx.carrot.id)).toBeNull();
      expect(result.meal.foods.find((food) => food.id === fx.pear.id)?.rating).toBe(3);

      // Items in parts order, each as it now stands.
      expect(result.items.map((item) => [item.id, item.servingsLeft])).toEqual([
        [porridgeBox, 1],
        [pancakesBox, 3],
        [fruitBox, null],
      ]);
      expect(await record(result.meal.id)).toEqual(
        [
          { storageItemId: porridgeBox, servings: 2 },
          { storageItemId: pancakesBox, servings: 1 },
          { storageItemId: fruitBox, servings: 0 },
        ].sort((a, b) => (a.storageItemId < b.storageItemId ? -1 : 1)),
      );
      expect(await count(schema.meals)).toBe(1);
    });

    it("gives one recipe row for two containers of a recipe, and for a fresh recipe that is also in storage", async () => {
      const fridge = await container({ recipeId: fx.pancakes.id, servingsTotal: 2 });
      const freezer = await container({ recipeId: fx.pancakes.id, location: "freezer", servingsTotal: 2 });
      const result = await served({
        babyId,
        parts: [{ storageItemId: fridge }, { storageItemId: freezer }],
        recipeIds: [fx.pancakes.id],
      });
      expect(result.meal.recipes?.map((recipe) => recipe.id)).toEqual([fx.pancakes.id]);
      expect(result.items.map((item) => item.servingsLeft)).toEqual([1, 1]);
    });

    it("records what was really taken: asking 3 with 2 left records 2 and finishes the container", async () => {
      const id = await container({ foodIds: [fx.pear.id], servingsTotal: 5 });
      await setBox(id, { servingsLeft: 2 });
      const result = await served({ babyId, parts: [{ storageItemId: id, servings: 3 }] });
      expect(result.items[0]).toMatchObject({ servingsLeft: 0, status: "finished" });
      expect(await record(result.meal.id)).toEqual([{ storageItemId: id, servings: 2 }]);
    });

    it("allows a recipe without ingredient foods beside other foods, and 400s it alone", async () => {
      const drizzleBox = await container({ recipeId: fx.drizzle.id });
      const pearBox = await container({ foodIds: [fx.pear.id] });
      const ok = await served({ babyId, parts: [{ storageItemId: drizzleBox }, { storageItemId: pearBox }] });
      expect(ok.meal.recipes?.map((recipe) => recipe.title)).toEqual(["Oil Drizzle"]);
      expect(ok.meal.foods.map((food) => food.name)).toEqual(["Pear"]);

      const alone = await serveMany({ babyId, parts: [{ storageItemId: drizzleBox }] });
      expect(alone.statusCode).toBe(400);
      expect(alone.json()).toMatchObject({ details: { recipeId: "this recipe has no ingredient foods to log" } });
      expect(await count(schema.meals)).toBe(1);
    });

    it("409s naming the container that cannot be served, and writes nothing at all", async () => {
      const good = await container({ foodIds: [fx.pear.id], servingsTotal: 3 });
      const finished = await container({ recipeId: fx.pancakes.id, servingsTotal: 1 });
      await setBox(finished, { servingsLeft: 0, status: "finished" });

      const response = await serveMany({ babyId, parts: [{ storageItemId: good }, { storageItemId: finished }] });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: "conflict",
        message: "This storage item is finished and cannot be served. Restore it first.",
        storageItemId: finished,
      });
      expect(await box(good)).toMatchObject({ left: 3, status: "active" });
      expect(await count(schema.meals)).toBe(0);
      expect(await count(schema.mealStorageItems)).toBe(0);
      expect(await count(schema.mealRecipes)).toBe(0);
    });

    it("409s an active container with no servings left", async () => {
      const empty = await container({ foodIds: [fx.pear.id], servingsTotal: 2 });
      await setBox(empty, { servingsLeft: 0 });
      const response = await serveMany({ babyId, parts: [{ storageItemId: empty }] });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ storageItemId: empty });
      expect(await count(schema.meals)).toBe(0);
    });

    it("404s another account's container and 400s a repeated part or an unknown fresh food or recipe", async () => {
      const mine = await container({ foodIds: [fx.pear.id], servingsTotal: 3 });
      const stranger = await signUpUser(app);
      const theirs = await container({ foodIds: [fx.pear.id] }, stranger);

      expect((await serveMany({ babyId, parts: [{ storageItemId: mine }, { storageItemId: theirs }] })).statusCode).toBe(404);
      expect((await serveMany({ babyId, parts: [{ storageItemId: mine }, { storageItemId: mine }] })).statusCode).toBe(400);
      const unknown = "00000000-0000-4000-8000-000000000000";
      expect((await serveMany({ babyId, parts: [{ storageItemId: mine }], foodIds: [unknown] })).statusCode).toBe(400);
      expect((await serveMany({ babyId, parts: [{ storageItemId: mine }], recipeIds: [unknown] })).statusCode).toBe(400);
      expect((await serveMany({ babyId, parts: [] })).statusCode).toBe(400);
      expect(await box(mine)).toMatchObject({ left: 3 });
      expect(await count(schema.meals)).toBe(0);
    });

    it("caps foods across parts like Log meal: 51 is a 400 that writes nothing, 50 is fine", async () => {
      const ids = (
        await db
          .insert(schema.foods)
          .values(
            Array.from({ length: 51 }, (_, i) => ({
              slug: `extra-${i}`,
              name: `Extra ${i}`,
              category: "fruit" as const,
              ironLevel: "low" as const,
              vitaminCLevel: "moderate" as const,
              chokingRisk: "low" as const,
              minAgeMonths: 6,
              prep6m: "strip",
              prep9m: "chop",
              prep12m: "slice",
              storageCategory: "produce_cooked",
            })),
          )
          .returning()
      ).map((row) => row.id);
      const a = await container({ foodIds: ids.slice(0, 25), servingsTotal: 2 });
      const b = await container({ foodIds: ids.slice(25, 50), servingsTotal: 2 });
      const tooMany = await serveMany({ babyId, parts: [{ storageItemId: a }, { storageItemId: b }], foodIds: [ids[50]] });
      expect(tooMany.statusCode).toBe(400);
      expect(tooMany.json()).toMatchObject({ details: { foodIds: "at most 50 foods per meal" } });
      expect([await box(a), await box(b)]).toEqual([
        { left: 2, total: 2, status: "active" },
        { left: 2, total: 2, status: "active" },
      ]);
      expect(await count(schema.meals)).toBe(0);
      expect((await serveMany({ babyId, parts: [{ storageItemId: a }, { storageItemId: b }] })).statusCode).toBe(201);
    });

    it("rates as Log meal does: an ingredient of a served recipe is rated through it, an extra on its own", async () => {
      const pancakesBox = await container({ recipeId: fx.pancakes.id });
      const asIngredient = await serveMany({
        babyId,
        parts: [{ storageItemId: pancakesBox }],
        foodRatings: { [fx.egg.id]: 4 },
      });
      expect(asIngredient.statusCode).toBe(400);
      expect(asIngredient.json()).toMatchObject({ details: { foodRatings: "rated as part of its recipe" } });
      const stray = await serveMany({
        babyId,
        parts: [{ storageItemId: pancakesBox }],
        recipeRatings: { [fx.porridge.id]: 4 },
      });
      expect(stray.statusCode).toBe(400);
      expect(await count(schema.meals)).toBe(0);

      const ok = await served({
        babyId,
        parts: [{ storageItemId: pancakesBox }],
        foodIds: [fx.pear.id],
        foodRatings: { [fx.pear.id]: 4 },
      });
      expect(ok.meal.foods.find((food) => food.id === fx.pear.id)).toMatchObject({ rating: 4, inRecipe: false });
    });
  });

  describe("the shipped app's single-item serve", () => {
    it("keeps its { meal, item } response and now records what it took", async () => {
      const id = await container({ recipeId: fx.pancakes.id, servingsTotal: 3 });
      const response = await serveOne(id, { babyId, servings: 2, recipeRating: 4 });
      expect(response.statusCode).toBe(201);
      const body = response.json<ServeStorageItemResponse>();
      expect(Object.keys(body).sort()).toEqual(["item", "meal"]);
      expect(body.item).toMatchObject({ id, servingsLeft: 1 });
      expect(body.meal).toMatchObject({ recipeId: fx.pancakes.id, recipeRating: 4 });
      expect(await record(body.meal.id)).toEqual([{ storageItemId: id, servings: 2 }]);
    });

    it("keeps its 409 body exactly: no storageItemId", async () => {
      const id = await container({ foodIds: [fx.pear.id], servingsTotal: 1 });
      await setBox(id, { servingsLeft: 0 });
      const response = await serveOne(id, { babyId });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: "conflict",
        message: "This storage item has no servings left — mark it finished or edit its servings first.",
      });
    });
  });

  describe("DELETE /api/meals/:id gives the servings back (= Undo)", () => {
    it("restores every part of a multi-part serve exactly, re-activating the one it finished", async () => {
      const a = await container({ recipeId: fx.pancakes.id, servingsTotal: 4 });
      const b = await container({ foodIds: [fx.pear.id], servingsTotal: 1 });
      const c = await container({ foodIds: [fx.oats.id] });
      const result = await served({
        babyId,
        parts: [{ storageItemId: a, servings: 2 }, { storageItemId: b }, { storageItemId: c }],
        recipeRatings: { [fx.pancakes.id]: 5 },
      });
      expect(result.items[1]?.status).toBe("finished");

      expect((await deleteMeal(result.meal.id)).statusCode).toBe(204);
      expect(await box(a)).toEqual({ left: 4, total: 4, status: "active" });
      expect(await box(b)).toEqual({ left: 1, total: 1, status: "active" });
      expect(await box(c)).toEqual({ left: null, total: null, status: "active" });
      expect(await count(schema.meals)).toBe(0);
      expect(await count(schema.mealRecipes)).toBe(0);
      expect(await count(schema.mealStorageItems)).toBe(0);
    });

    it("404s a second delete and gives nothing back twice", async () => {
      const id = await container({ foodIds: [fx.pear.id], servingsTotal: 5 });
      const result = await served({ babyId, parts: [{ storageItemId: id, servings: 2 }] });
      await serveOne(id, { babyId });
      expect((await deleteMeal(result.meal.id)).statusCode).toBe(204);
      expect(await box(id)).toMatchObject({ left: 4 });
      expect((await deleteMeal(result.meal.id)).statusCode).toBe(404);
      expect(await box(id)).toMatchObject({ left: 4 });
    });

    it("caps the return at the total when the parent refilled the container since", async () => {
      const id = await container({ foodIds: [fx.pear.id], servingsTotal: 4 });
      const result = await served({ babyId, parts: [{ storageItemId: id, servings: 2 }] });
      await app.inject({
        method: "PATCH",
        url: `/api/storage/${id}`,
        headers: { cookie: parent.cookie },
        payload: { servingsTotal: 3, servingsLeft: 3 },
      });
      expect((await deleteMeal(result.meal.id)).statusCode).toBe(204);
      expect(await box(id)).toEqual({ left: 3, total: 3, status: "active" });
    });

    it("re-activates a container that a LATER serve finished", async () => {
      const id = await container({ foodIds: [fx.pear.id], servingsTotal: 3 });
      const first = await served({ babyId, parts: [{ storageItemId: id }] });
      await served({ babyId, parts: [{ storageItemId: id, servings: 2 }] });
      expect(await box(id)).toMatchObject({ left: 0, status: "finished" });
      expect((await deleteMeal(first.meal.id)).statusCode).toBe(204);
      expect(await box(id)).toEqual({ left: 1, total: 3, status: "active" });
      // ...and it can be served again.
      expect((await serveMany({ babyId, parts: [{ storageItemId: id }] })).statusCode).toBe(201);
    });

    it("skips a removed (discarded) container and one whose tracking was turned off", async () => {
      const removed = await container({ foodIds: [fx.pear.id], servingsTotal: 3 });
      const untracked = await container({ foodIds: [fx.oats.id], servingsTotal: 3 });
      const result = await served({ babyId, parts: [{ storageItemId: removed }, { storageItemId: untracked }] });
      await setBox(removed, { status: "discarded" });
      await app.inject({
        method: "PATCH",
        url: `/api/storage/${untracked}`,
        headers: { cookie: parent.cookie },
        payload: { servingsTotal: null },
      });

      expect((await deleteMeal(result.meal.id)).statusCode).toBe(204);
      expect(await box(removed)).toEqual({ left: 2, total: 3, status: "discarded" });
      expect(await box(untracked)).toEqual({ left: null, total: null, status: "active" });
    });

    it("leaves a FINISHED container whose tracking was turned off finished, and changes nothing on it", async () => {
      const off = await container({ foodIds: [fx.pear.id], servingsTotal: 1 });
      const result = await served({ babyId, parts: [{ storageItemId: off }] });
      await app.inject({
        method: "PATCH",
        url: `/api/storage/${off}`,
        headers: { cookie: parent.cookie },
        payload: { servingsTotal: null },
      });
      const [before] = await db.select().from(schema.storageItems).where(eq(schema.storageItems.id, off));
      expect(before?.status).toBe("finished");
      expect((await deleteMeal(result.meal.id)).statusCode).toBe(204);
      const [after] = await db.select().from(schema.storageItems).where(eq(schema.storageItems.id, off));
      expect(after).toEqual(before);
    });

    it("204s a meal with no record (served before this shipped) and changes no container", async () => {
      const id = await container({ foodIds: [fx.pear.id], servingsTotal: 3 });
      await setBox(id, { servingsLeft: 1 });
      const [mealId] = await insertMeals(db, [{ babyId, foodId: fx.pear.id, servedAt: new Date(), storageItemId: id }]);
      expect((await deleteMeal(mealId!)).statusCode).toBe(204);
      expect(await box(id)).toMatchObject({ left: 1 });
    });

    it("404s another account's meal and gives nothing back", async () => {
      const id = await container({ foodIds: [fx.pear.id], servingsTotal: 3 });
      const result = await served({ babyId, parts: [{ storageItemId: id }] });
      const stranger = await signUpUser(app);
      const response = await app.inject({
        method: "DELETE",
        url: `/api/meals/${result.meal.id}`,
        headers: { cookie: stranger.cookie },
      });
      expect(response.statusCode).toBe(404);
      expect(await box(id)).toMatchObject({ left: 2 });
    });
  });

  describe("an edit that removes a served part gives it back", () => {
    it("returns both containers of a recipe the edit takes off, and nothing for a note-only edit", async () => {
      const fridge = await container({ recipeId: fx.pancakes.id, servingsTotal: 3 });
      const freezer = await container({ recipeId: fx.pancakes.id, location: "freezer", servingsTotal: 3 });
      const porridgeBox = await container({ recipeId: fx.porridge.id, servingsTotal: 3 });
      const result = await served({
        babyId,
        parts: [{ storageItemId: fridge }, { storageItemId: freezer }, { storageItemId: porridgeBox }],
      });

      await patched(result.meal.id, { notes: "ate well" });
      expect(await box(fridge)).toMatchObject({ left: 2 });

      await patched(result.meal.id, { recipeIds: [fx.porridge.id] });
      expect(await box(fridge)).toMatchObject({ left: 3 });
      expect(await box(freezer)).toMatchObject({ left: 3 });
      expect(await box(porridgeBox)).toMatchObject({ left: 2 });
      expect(await record(result.meal.id)).toEqual([{ storageItemId: porridgeBox, servings: 1 }]);

      // Already given back: a delete now returns only what is left on record.
      expect((await deleteMeal(result.meal.id)).statusCode).toBe(204);
      expect(await box(fridge)).toMatchObject({ left: 3 });
      expect(await box(porridgeBox)).toMatchObject({ left: 3 });
    });

    it("returns nothing when only ingredient chips go and the recipe stays", async () => {
      const pancakesBox = await container({ recipeId: fx.pancakes.id, servingsTotal: 3 });
      const result = await served({ babyId, parts: [{ storageItemId: pancakesBox }] });
      await patched(result.meal.id, { foodIds: [fx.egg.id] });
      expect(await box(pancakesBox)).toMatchObject({ left: 2 });
    });

    it("returns a food container once its LAST linked food is removed, not before", async () => {
      const fruit = await container({ foodIds: [fx.pear.id, fx.oats.id], servingsTotal: 3 });
      const result = await served({ babyId, parts: [{ storageItemId: fruit }], foodIds: [fx.carrot.id] });

      await patched(result.meal.id, { foodIds: [fx.pear.id, fx.carrot.id] });
      expect(await box(fruit)).toMatchObject({ left: 2 });

      await patched(result.meal.id, { foodIds: [fx.carrot.id] });
      expect(await box(fruit)).toMatchObject({ left: 3 });

      // Adding it back takes nothing, and a later delete returns nothing more.
      await patched(result.meal.id, { foodIds: [fx.carrot.id, fx.pear.id] });
      expect(await box(fruit)).toMatchObject({ left: 3 });
      expect((await deleteMeal(result.meal.id)).statusCode).toBe(204);
      expect(await box(fruit)).toMatchObject({ left: 3 });
    });

    it("returns for an older app's recipeId: null and recipeId: Y on a served one-recipe meal", async () => {
      const a = await container({ recipeId: fx.pancakes.id, servingsTotal: 2 });
      const first = (await serveOne(a, { babyId })).json<ServeStorageItemResponse>();
      await patched(first.meal.id, { recipeId: null });
      expect(await box(a)).toMatchObject({ left: 2 });

      const second = (await serveOne(a, { babyId })).json<ServeStorageItemResponse>();
      await patched(second.meal.id, { recipeId: fx.porridge.id });
      expect(await box(a)).toMatchObject({ left: 2 });
    });

    it("ponytail ceiling: a food container whose foods all overlapped an earlier part comes back only on delete", async () => {
      const pancakesBox = await container({ recipeId: fx.pancakes.id, servingsTotal: 3 });
      const eggBox = await container({ foodIds: [fx.egg.id], servingsTotal: 3 });
      const result = await served({ babyId, parts: [{ storageItemId: pancakesBox }, { storageItemId: eggBox }] });
      await patched(result.meal.id, { foodIds: [fx.banana.id] });
      expect(await box(eggBox)).toMatchObject({ left: 2 });
      expect((await deleteMeal(result.meal.id)).statusCode).toBe(204);
      expect(await box(eggBox)).toMatchObject({ left: 3 });
    });
  });

  // DESIGN-B §5a "Concurrency": one lock order everywhere, the meal row first,
  // then containers in id order FOR NO KEY UPDATE. PGlite serializes
  // transactions, so these pin the statements (and the plan); the Postgres
  // races themselves ran in the 757 dry run.
  describe("lock order", () => {
    function spy() {
      const seen: string[] = [];
      const original = PgDialect.prototype.sqlToQuery;
      const handle = vi.spyOn(PgDialect.prototype, "sqlToQuery").mockImplementation(function (this: PgDialect, ...args) {
        const query = original.apply(this, args);
        seen.push(query.sql.toLowerCase());
        return query;
      });
      return { seen, restore: () => handle.mockRestore() };
    }
    const anyLock = (s: string) => / for (update|no key update|share|key share)$/.test(s);
    const containerLock = (s: string) =>
      /^select .* from "storage_items" .*order by "storage_items"\."id" asc for no key update$/.test(s);
    const mealLock = (s: string) => /^select .* from "meals" .* for update$/.test(s);

    it("serve: ONE id-ordered NO KEY UPDATE on every container before any write; never FOR UPDATE; no meal locked", async () => {
      const a = await container({ recipeId: fx.pancakes.id, servingsTotal: 3 });
      const b = await container({ foodIds: [fx.pear.id], servingsTotal: 3 });
      const c = await container({ foodIds: [fx.oats.id] });
      const s = spy();
      try {
        await served({ babyId, parts: [{ storageItemId: c }, { storageItemId: a }, { storageItemId: b }], foodIds: [fx.carrot.id] });
      } finally {
        s.restore();
      }
      const locks = s.seen.filter(anyLock);
      expect(locks.filter(containerLock)).toHaveLength(1);
      expect(locks.filter((q) => !containerLock(q))).toEqual([]);
      const lockAt = s.seen.findIndex(containerLock);
      const firstWrite = s.seen.findIndex((q) => /^(insert|update|delete)/.test(q));
      expect(lockAt).toBeGreaterThanOrEqual(0);
      expect(firstWrite).toBeGreaterThan(lockAt);
    });

    it("Postgres locks those rows in id order: LockRows sits above the Sort in the plan", async () => {
      const a = await container({ foodIds: [fx.pear.id], servingsTotal: 3 });
      const b = await container({ foodIds: [fx.oats.id], servingsTotal: 3 });
      const s = spy();
      try {
        await served({ babyId, parts: [{ storageItemId: b }, { storageItemId: a }] });
      } finally {
        s.restore();
      }
      const lockSql = s.seen.find(containerLock);
      expect(lockSql).toBeTruthy();
      const [user] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, parent.email));
      const client = (
        db as unknown as { $client: { query: (q: string, p: unknown[]) => Promise<{ rows: Record<string, string>[] }> } }
      ).$client;
      const plan = (await client.query(`explain ${lockSql!}`, [b, a, user!.id])).rows.map((r) => Object.values(r)[0]);
      const lockRows = plan.findIndex((line) => /LockRows/.test(line!));
      const sort = plan.findIndex((line) => /Sort|Index Scan using storage_items_pkey/.test(line!));
      expect(lockRows, plan.join("\n")).toBe(0);
      expect(sort, plan.join("\n")).toBeGreaterThan(lockRows);
    });

    it("DELETE and a part-removing PATCH: the meal row FOR UPDATE first, then the containers, then the writes", async () => {
      const a = await container({ recipeId: fx.pancakes.id, servingsTotal: 3 });
      const b = await container({ recipeId: fx.porridge.id, servingsTotal: 3 });
      const one = await served({ babyId, parts: [{ storageItemId: b }, { storageItemId: a }] });
      for (const action of ["patch", "delete"] as const) {
        const s = spy();
        try {
          if (action === "patch") await patched(one.meal.id, { recipeIds: [fx.porridge.id] });
          else expect((await deleteMeal(one.meal.id)).statusCode).toBe(204);
        } finally {
          s.restore();
        }
        const firstLock = s.seen.findIndex(anyLock);
        expect(mealLock(s.seen[firstLock]!), s.seen.join("\n")).toBe(true);
        const containers = s.seen.findIndex(containerLock);
        expect(containers).toBeGreaterThan(firstLock);
        const containerWrite = s.seen.findIndex((q) => /^update "storage_items"/.test(q));
        expect(containerWrite).toBeGreaterThan(containers);
        expect(s.seen.some((q) => q.includes('from "storage_items"') && q.endsWith(" for update"))).toBe(false);
      }
    });

    it("interleaved: 8 overlapping serves in opposite orders, then every meal deleted twice in parallel", async () => {
      const a = await container({ foodIds: [fx.pear.id], servingsTotal: 4 });
      const b = await container({ foodIds: [fx.oats.id], servingsTotal: 4 });
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          serveMany({
            babyId,
            parts: i % 2 ? [{ storageItemId: a }, { storageItemId: b }] : [{ storageItemId: b }, { storageItemId: a }],
          }),
        ),
      );
      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 201, 201, 201, 409, 409, 409, 409]);
      expect([await box(a), await box(b)]).toEqual([
        { left: 0, total: 4, status: "finished" },
        { left: 0, total: 4, status: "finished" },
      ]);
      const mealIds = results.filter((r) => r.statusCode === 201).map((r) => r.json<ServeStorageResponse>().meal.id);
      const deletes = await Promise.all([...mealIds, ...mealIds].map((id) => deleteMeal(id)));
      expect(deletes.map((r) => r.statusCode).sort()).toEqual([204, 204, 204, 204, 404, 404, 404, 404]);
      expect([await box(a), await box(b)]).toEqual([
        { left: 4, total: 4, status: "active" },
        { left: 4, total: 4, status: "active" },
      ]);
    });
  });

  it("exports what each meal took, and deletes an account that has records", async () => {
    const a = await container({ foodIds: [fx.pear.id], servingsTotal: 3 });
    const result = await served({ babyId, parts: [{ storageItemId: a, servings: 2 }] });
    const exported = accountExportSchema.parse(
      (await app.inject({ method: "GET", url: "/api/account/export", headers: { cookie: parent.cookie } })).json(),
    );
    expect(exported.meals.find((meal) => meal.id === result.meal.id)?.servedFromStorage).toEqual([
      { storageItemId: a, servings: 2 },
    ]);

    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/account",
      headers: { cookie: parent.cookie },
      payload: { confirm: ACCOUNT_DELETE_CONFIRMATION, password: parent.password },
    });
    expect(deleted.statusCode).toBe(204);
    expect(await count(schema.mealStorageItems)).toBe(0);
  });

  describe("leftovers of a several-recipe meal (ledger 753, Q2)", () => {
    const postStorage = (payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/api/storage",
        headers: { cookie: parent.cookie },
        payload: { location: "fridge", ...payload },
      });
    async function stored(payload: Record<string, unknown>): Promise<StorageItem[]> {
      const response = await postStorage(payload);
      if (response.statusCode !== 201) throw new Error(`storage create failed: ${response.body}`);
      return response.json<CreateStorageItemResponse>().items;
    }
    async function parentId(): Promise<string> {
      const [row] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, parent.email));
      return row!.id;
    }

    it("saves ONE container holding every recipe in order, or one container per recipe", async () => {
      const [one, ...rest] = await stored({ recipeIds: [fx.porridge.id, fx.pancakes.id, fx.porridge.id], servingsTotal: 4 });
      expect(rest).toEqual([]);
      // The first recipe is the container's recipe, so the shipped app still
      // sees a recipe container.
      expect(one).toMatchObject({ recipeId: fx.porridge.id, recipeTitle: "Porridge", foods: [], servingsLeft: 4 });
      expect(one!.recipes).toEqual([
        { id: fx.porridge.id, title: "Porridge" },
        { id: fx.pancakes.id, title: "Pancakes" },
      ]);

      const separate = await stored({ recipeIds: [fx.porridge.id, fx.pancakes.id], separateItems: true, servingsTotal: 2 });
      expect(separate.map((item) => [item.recipeTitle, item.recipes, item.servingsTotal])).toEqual([
        ["Porridge", [{ id: fx.porridge.id, title: "Porridge" }], 2],
        ["Pancakes", [{ id: fx.pancakes.id, title: "Pancakes" }], 2],
      ]);
      // A one-recipe container needs no extra rows.
      expect((await db.select().from(schema.storageItemRecipes)).length).toBe(2);
    });

    it("400s recipeIds with foods or with recipeId, an unknown recipe, and another account's recipe", async () => {
      expect((await postStorage({ recipeIds: [fx.pancakes.id], foodIds: [fx.pear.id] })).statusCode).toBe(400);
      expect((await postStorage({ recipeIds: [fx.pancakes.id], recipeId: fx.porridge.id })).statusCode).toBe(400);
      const unknown = "00000000-0000-4000-8000-000000000000";
      const response = await postStorage({ recipeIds: [fx.pancakes.id, unknown] });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ details: { recipeIds: "unknown recipe", unknownRecipeIds: [unknown] } });
      // The single-recipe shape keeps its old 400.
      expect((await postStorage({ recipeId: unknown })).json()).toMatchObject({ details: { recipeId: "unknown recipe" } });

      const stranger = await signUpUser(app);
      const [strangerRow] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, stranger.email));
      const [theirs] = await db
        .insert(schema.recipes)
        .values({ slug: "theirs", title: "Theirs", minAgeMonths: 6, prepMinutes: 5, ownerId: strangerRow!.id })
        .returning();
      expect((await postStorage({ recipeIds: [fx.pancakes.id, theirs!.id] })).statusCode).toBe(400);
      expect((await db.select().from(schema.storageItems)).length).toBe(0);
    });

    it("serves every recipe in it, and gives it back only when an edit takes ALL of them off", async () => {
      const [both] = await stored({ recipeIds: [fx.porridge.id, fx.pancakes.id], servingsTotal: 3 });
      const result = await served({ babyId, parts: [{ storageItemId: both!.id }], foodIds: [fx.pear.id] });
      expect(result.meal.recipes?.map((recipe) => recipe.title)).toEqual(["Porridge", "Pancakes"]);
      expect(result.meal.foods.map((food) => [food.name, food.storageItemId])).toEqual([
        ["Banana", both!.id],
        ["Egg", both!.id],
        ["Oats", both!.id],
        ["Pear", null],
      ]);

      await patched(result.meal.id, { recipeIds: [fx.pancakes.id] });
      expect(await box(both!.id)).toMatchObject({ left: 2 });
      await patched(result.meal.id, { recipeIds: [] });
      expect(await box(both!.id)).toMatchObject({ left: 3 });
    });

    it("gives it the shortest window of its recipes, on the card and in the AI tool", async () => {
      const [quick] = await db
        .insert(schema.recipes)
        .values({ slug: "quick", title: "Quick Eggs", minAgeMonths: 6, prepMinutes: 5, fridgeHoursOverride: 6 })
        .returning();
      await db.insert(schema.recipeIngredients).values({ recipeId: quick!.id, foodId: fx.egg.id, quantityNote: "1" });
      const preparedAt = new Date(Date.now() - 7 * 3600 * 1000);
      const [both] = await stored({ recipeIds: [fx.porridge.id, quick!.id], preparedAt: preparedAt.toISOString() });
      // Porridge alone would last the category's 48 h; Quick Eggs cuts it to 6.
      expect(both).toMatchObject({ expired: true, expiresAt: new Date(preparedAt.getTime() + 6 * 3600 * 1000).toISOString() });

      const tools = buildChatTools(db, await parentId(), null);
      const items = JSON.parse(String(await tools.get_storage.run({}))).items as { name: string; expired: boolean }[];
      expect(items).toEqual([expect.objectContaining({ name: "Porridge + Quick Eggs", expired: true })]);
    });

    it("blocks deleting a recipe a container names past its first, and exports every recipe", async () => {
      const [mine] = await db
        .insert(schema.recipes)
        .values({ slug: "mine", title: "My Mash", minAgeMonths: 6, prepMinutes: 5, ownerId: await parentId() })
        .returning();
      const [both] = await stored({ recipeIds: [fx.porridge.id, mine!.id] });

      const blocked = await app.inject({ method: "DELETE", url: `/api/recipes/${mine!.id}`, headers: { cookie: parent.cookie } });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json()).toMatchObject({ storageCount: 1 });

      const exported = accountExportSchema.parse(
        (await app.inject({ method: "GET", url: "/api/account/export", headers: { cookie: parent.cookie } })).json(),
      );
      expect(exported.storageItems.find((item) => item.id === both!.id)?.recipes).toEqual([
        { recipeId: fx.porridge.id, recipeTitle: "Porridge" },
        { recipeId: mine!.id, recipeTitle: "My Mash" },
      ]);
    });
  });
});
