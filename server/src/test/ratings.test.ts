// Star ratings (ledger 571-578): stored per meal, read per baby.
//
// A loose-food meal (no recipe) is rated per food; a recipe meal is rated
// once, as the recipe, and that rating never counts toward its ingredient
// foods (chair call, item 573). "Not rated" is null, never 0.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  accountExportSchema,
  type Baby,
  type CreateStorageItemResponse,
  type MealItem,
  type RatingHistoryResponse,
  type RatingsResponse,
  type ServeStorageItemResponse,
} from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
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
  const [egg, banana] = await db.insert(schema.foods).values([food("egg", "Egg"), food("banana", "Banana")]).returning();
  const [recipe] = await db
    .insert(schema.recipes)
    .values({ slug: "egg-banana-pancakes", title: "Egg Banana Pancakes", minAgeMonths: 6, prepMinutes: 5 })
    .returning();
  await db.insert(schema.recipeIngredients).values([
    { recipeId: recipe!.id, foodId: egg!.id, quantityNote: "1 egg" },
    { recipeId: recipe!.id, foodId: banana!.id, quantityNote: "1 banana" },
  ]);
  return { egg: egg!, banana: banana!, recipe: recipe! };
}

describe("ratings", () => {
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
    babyId = await createBaby(parent, "Robin");
  });

  afterEach(async () => {
    await close();
  });

  async function createBaby(user: TestUser, name: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/babies",
      headers: { cookie: user.cookie },
      payload: { name, birthDate: "2025-01-15" },
    });
    return response.json<Baby>().id;
  }

  const postMeal = (payload: Record<string, unknown>, baby = babyId, user = parent) =>
    app.inject({ method: "POST", url: `/api/babies/${baby}/meals`, headers: { cookie: user.cookie }, payload });
  const patchMeal = (id: string, payload: Record<string, unknown>) =>
    app.inject({ method: "PATCH", url: `/api/meals/${id}`, headers: { cookie: parent.cookie }, payload });
  async function created(payload: Record<string, unknown>, baby = babyId): Promise<MealItem> {
    const response = await postMeal(payload, baby);
    if (response.statusCode !== 201) throw new Error(`meal create failed: ${response.body}`);
    return response.json<MealItem>();
  }
  const ratingOf = (meal: MealItem, foodId: string) => meal.foods.find((food) => food.id === foodId)?.rating;
  async function summaries(baby = babyId, user = parent) {
    const response = await app.inject({ method: "GET", url: `/api/babies/${baby}/ratings`, headers: { cookie: user.cookie } });
    return { status: response.statusCode, body: response.json<RatingsResponse>() };
  }
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  describe("writing", () => {
    it("stores one rating per food on a loose-food meal, and none for the recipe", async () => {
      const meal = await created({ foodIds: [fx.egg.id, fx.banana.id], foodRatings: { [fx.egg.id]: 5 } });
      expect(ratingOf(meal, fx.egg.id)).toBe(5);
      // Not rated is null, never 0.
      expect(ratingOf(meal, fx.banana.id)).toBeNull();
      expect(meal.recipeRating).toBeNull();
    });

    it("stores one rating for the recipe on a recipe meal, and none per food", async () => {
      const meal = await created({ foodIds: [fx.egg.id, fx.banana.id], recipeId: fx.recipe.id, recipeRating: 3 });
      expect(meal.recipeRating).toBe(3);
      expect(meal.foods.map((food) => food.rating)).toEqual([null, null]);
    });

    it.each([0, 6, 2.5, "4", -1])("refuses %j stars", async (rating) => {
      expect((await postMeal({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: rating } })).statusCode).toBe(400);
      expect(
        (await postMeal({ foodIds: [fx.egg.id], recipeId: fx.recipe.id, recipeRating: rating })).statusCode,
      ).toBe(400);
    });

    it("refuses a rating that does not fit the meal instead of dropping it", async () => {
      // Per-food on a recipe meal, recipe rating on a loose-food meal, a food not on the meal.
      expect(
        (await postMeal({ foodIds: [fx.egg.id], recipeId: fx.recipe.id, foodRatings: { [fx.egg.id]: 4 } })).statusCode,
      ).toBe(400);
      expect((await postMeal({ foodIds: [fx.egg.id], recipeRating: 4 })).statusCode).toBe(400);
      expect((await postMeal({ foodIds: [fx.egg.id], foodRatings: { [fx.banana.id]: 4 } })).statusCode).toBe(400);
      // Nothing was written by any of them.
      expect(await db.select().from(schema.meals)).toEqual([]);
    });

    it("rates, re-rates and clears through a ratings-only PATCH, leaving other foods alone", async () => {
      const meal = await created({ foodIds: [fx.egg.id, fx.banana.id], foodRatings: { [fx.banana.id]: 2 } });

      const rated = await patchMeal(meal.id, { foodRatings: { [fx.egg.id]: 4 } });
      expect(rated.statusCode).toBe(200);
      expect(ratingOf(rated.json<MealItem>(), fx.egg.id)).toBe(4);
      expect(ratingOf(rated.json<MealItem>(), fx.banana.id)).toBe(2);

      const cleared = (await patchMeal(meal.id, { foodRatings: { [fx.egg.id]: null } })).json<MealItem>();
      expect(ratingOf(cleared, fx.egg.id)).toBeNull();
      expect(ratingOf(cleared, fx.banana.id)).toBe(2);
      expect((await patchMeal(meal.id, { foodRatings: { [fx.egg.id]: 0 } })).statusCode).toBe(400);
    });

    it("writes a rating to this meal's row only: another meal, or another account, rating the same food leaves it alone", async () => {
      const mine = await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 5 } });
      const other = await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 3 } });
      const stranger = await signUpUser(app, "Stranger");
      const strangersBaby = await createBaby(stranger, "Wren");
      const theirs = (await postMeal({ foodIds: [fx.egg.id] }, strangersBaby, stranger)).json<MealItem>();
      const strangerPatch = await app.inject({
        method: "PATCH",
        url: `/api/meals/${theirs.id}`,
        headers: { cookie: stranger.cookie },
        payload: { foodRatings: { [fx.egg.id]: 1 } },
      });
      expect(strangerPatch.statusCode).toBe(200);
      expect((await patchMeal(other.id, { foodRatings: { [fx.egg.id]: 2 } })).statusCode).toBe(200);

      const rows = await db
        .select({ mealId: schema.mealFoods.mealId, rating: schema.mealFoods.rating })
        .from(schema.mealFoods)
        .where(eq(schema.mealFoods.foodId, fx.egg.id));
      const byMeal = new Map(rows.map((row) => [row.mealId, row.rating]));
      expect(byMeal.get(mine.id)).toBe(5);
      expect(byMeal.get(other.id)).toBe(2);
      expect(byMeal.get(theirs.id)).toBe(1);
    });

    it("keeps a surviving food's rating when the meal's foods are edited", async () => {
      const meal = await created({ foodIds: [fx.egg.id, fx.banana.id], foodRatings: { [fx.egg.id]: 5, [fx.banana.id]: 1 } });
      const edited = (await patchMeal(meal.id, { foodIds: [fx.egg.id], notes: "less" })).json<MealItem>();
      expect(edited.foods.map((food) => [food.id, food.rating])).toEqual([[fx.egg.id, 5]]);
    });

    it("drops ratings that stop applying when the recipe is added, changed or removed", async () => {
      const loose = await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 5 } });
      const nowRecipe = (await patchMeal(loose.id, { recipeId: fx.recipe.id, recipeRating: 2 })).json<MealItem>();
      expect(nowRecipe.recipeRating).toBe(2);
      expect(ratingOf(nowRecipe, fx.egg.id)).toBeNull();

      const [other] = await db
        .insert(schema.recipes)
        .values({ slug: "egg-toast", title: "Egg Toast", minAgeMonths: 6, prepMinutes: 5 })
        .returning();
      expect((await patchMeal(loose.id, { recipeId: other!.id })).json<MealItem>().recipeRating).toBeNull();

      await patchMeal(loose.id, { recipeRating: 4 });
      const noRecipe = (await patchMeal(loose.id, { recipeId: null })).json<MealItem>();
      expect(noRecipe.recipeRating).toBeNull();
    });

    it("leaves a meal served from storage unrated", async () => {
      const stocked = await app.inject({
        method: "POST",
        url: "/api/storage",
        headers: { cookie: parent.cookie },
        payload: { foodIds: [fx.egg.id], location: "fridge" },
      });
      const itemId = stocked.json<CreateStorageItemResponse>().items[0]!.id;
      const served = await app.inject({
        method: "POST",
        url: `/api/storage/${itemId}/serve`,
        headers: { cookie: parent.cookie },
        payload: { babyId },
      });
      const meal = served.json<ServeStorageItemResponse>().meal;
      expect(meal.recipeRating).toBeNull();
      expect(meal.foods.map((food) => food.rating)).toEqual([null]);
    });
  });

  // Item 718: the Serve sheet's one optional star row. The serve route takes
  // the same rating shape as POST /meals, checks it the same way, and writes
  // it in the serve's own transaction.
  describe("POST /api/storage/:id/serve with a rating (item 718)", () => {
    async function stock(payload: Record<string, unknown>): Promise<string> {
      const response = await app.inject({
        method: "POST",
        url: "/api/storage",
        headers: { cookie: parent.cookie },
        payload: { location: "fridge", servingsTotal: 3, ...payload },
      });
      if (response.statusCode !== 201) throw new Error(`storage create failed: ${response.body}`);
      return response.json<CreateStorageItemResponse>().items[0]!.id;
    }
    const serve = (itemId: string, payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: `/api/storage/${itemId}/serve`,
        headers: { cookie: parent.cookie },
        payload: { babyId, ...payload },
      });
    async function served(itemId: string, payload: Record<string, unknown>): Promise<ServeStorageItemResponse> {
      const response = await serve(itemId, payload);
      if (response.statusCode !== 201) throw new Error(`serve failed: ${response.body}`);
      return response.json<ServeStorageItemResponse>();
    }
    async function historyOf(query: string): Promise<number[]> {
      const response = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/ratings/history${query}`,
        headers: { cookie: parent.cookie },
      });
      return response.json<RatingHistoryResponse>().points.map((point) => point.rating);
    }
    /** Nothing was written: no meal for the baby, and the container still full. */
    async function expectUntouched(itemId: string) {
      expect(await db.select().from(schema.meals).where(eq(schema.meals.babyId, babyId))).toEqual([]);
      const [item] = await db.select().from(schema.storageItems).where(eq(schema.storageItems.id, itemId));
      expect(item).toMatchObject({ servingsLeft: 3, status: "active" });
    }

    it("rates a food item's meal as that food, and the food's rating line and history pick it up", async () => {
      const itemId = await stock({ foodIds: [fx.egg.id] });
      const { meal, item } = await served(itemId, { foodRatings: { [fx.egg.id]: 4 } });
      expect(ratingOf(meal, fx.egg.id)).toBe(4);
      expect(meal.recipeRating).toBeNull();
      // Same transaction as the serve itself: the servings came out too.
      expect(item.servingsLeft).toBe(2);
      expect((await summaries()).body.foods[fx.egg.id]).toMatchObject({ average: 4, count: 1, latest: 4 });
      expect(await historyOf(`?foodId=${fx.egg.id}`)).toEqual([4]);
    });

    it("rates each food of a several-food item on its own, like Log meal", async () => {
      const itemId = await stock({ foodIds: [fx.egg.id, fx.banana.id] });
      const { meal } = await served(itemId, { foodRatings: { [fx.banana.id]: 2 } });
      expect(ratingOf(meal, fx.banana.id)).toBe(2);
      expect(ratingOf(meal, fx.egg.id)).toBeNull();
    });

    it("rates a recipe item's meal once, as the recipe, never per ingredient", async () => {
      const itemId = await stock({ recipeId: fx.recipe.id });
      const { meal } = await served(itemId, { recipeRating: 3 });
      expect(meal.recipeId).toBe(fx.recipe.id);
      expect(meal.recipeRating).toBe(3);
      expect(meal.foods.map((food) => food.rating)).toEqual([null, null]);
      expect((await summaries()).body.recipes[fx.recipe.id]).toMatchObject({ average: 3, count: 1 });
      expect((await summaries()).body.foods).toEqual({});
      expect(await historyOf(`?recipeId=${fx.recipe.id}`)).toEqual([3]);
    });

    it("leaves the meal unrated when the rating is omitted, or sent as null", async () => {
      const foodItem = await stock({ foodIds: [fx.egg.id] });
      expect((await served(foodItem, {})).meal.foods.map((food) => food.rating)).toEqual([null]);
      expect((await served(foodItem, { foodRatings: { [fx.egg.id]: null } })).meal.foods[0]!.rating).toBeNull();
      const recipeItem = await stock({ recipeId: fx.recipe.id });
      expect((await served(recipeItem, { recipeRating: null })).meal.recipeRating).toBeNull();
      expect(await summaries()).toMatchObject({ body: { foods: {}, recipes: {} } });
    });

    it("refuses a rating of the wrong kind, and writes nothing", async () => {
      const foodItem = await stock({ foodIds: [fx.egg.id] });
      const recipeItem = await stock({ recipeId: fx.recipe.id });

      const recipeOnFood = await serve(foodItem, { recipeRating: 4 });
      expect(recipeOnFood.statusCode).toBe(400);
      expect(recipeOnFood.json()).toMatchObject({ details: { recipeRating: "only a recipe meal has a recipe rating" } });
      const foodOnRecipe = await serve(recipeItem, { foodRatings: { [fx.egg.id]: 4 } });
      expect(foodOnRecipe.statusCode).toBe(400);
      expect(foodOnRecipe.json()).toMatchObject({
        details: { foodRatings: "a recipe meal is rated as a recipe, not per food" },
      });

      await expectUntouched(foodItem);
      await expectUntouched(recipeItem);
    });

    it("refuses a rating for a food that is not in the container, and writes nothing", async () => {
      const itemId = await stock({ foodIds: [fx.egg.id] });
      const response = await serve(itemId, { foodRatings: { [fx.egg.id]: 5, [fx.banana.id]: 3 } });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ details: { foodRatings: "food is not on this meal", strays: [fx.banana.id] } });
      await expectUntouched(itemId);
    });

    it.each([0, 6, 2.5, "4", -1])("refuses %j stars on either kind, and writes nothing", async (rating) => {
      const foodItem = await stock({ foodIds: [fx.egg.id] });
      const recipeItem = await stock({ recipeId: fx.recipe.id });
      expect((await serve(foodItem, { foodRatings: { [fx.egg.id]: rating } })).statusCode).toBe(400);
      expect((await serve(recipeItem, { recipeRating: rating })).statusCode).toBe(400);
      await expectUntouched(foodItem);
      await expectUntouched(recipeItem);
    });

    it("refuses a food rating keyed by something that is not a food id", async () => {
      const itemId = await stock({ foodIds: [fx.egg.id] });
      expect((await serve(itemId, { foodRatings: { egg: 4 } })).statusCode).toBe(400);
      await expectUntouched(itemId);
    });

    it("loses the rating with the meal when the serve is undone (the meal deleted)", async () => {
      const foodItem = await stock({ foodIds: [fx.egg.id] });
      const recipeItem = await stock({ recipeId: fx.recipe.id });
      const foodMeal = (await served(foodItem, { foodRatings: { [fx.egg.id]: 5 } })).meal;
      const recipeMeal = (await served(recipeItem, { recipeRating: 2 })).meal;
      for (const meal of [foodMeal, recipeMeal]) {
        const deleted = await app.inject({ method: "DELETE", url: `/api/meals/${meal.id}`, headers: { cookie: parent.cookie } });
        expect(deleted.statusCode).toBe(204);
      }
      expect(await summaries()).toMatchObject({ body: { foods: {}, recipes: {} } });
      expect(await historyOf(`?foodId=${fx.egg.id}`)).toEqual([]);
      expect(await historyOf(`?recipeId=${fx.recipe.id}`)).toEqual([]);
      expect(await db.select().from(schema.mealFoods)).toEqual([]);
    });
  });

  describe("GET /api/babies/:babyId/ratings", () => {
    it("averages a food over loose-food meals only — a recipe's rating never counts toward its ingredients", async () => {
      await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 4 }, servedAt: daysAgo(3) });
      await created({ foodIds: [fx.egg.id, fx.banana.id], foodRatings: { [fx.egg.id]: 5 }, servedAt: daysAgo(1) });
      const recipeMeal = await created({
        foodIds: [fx.egg.id, fx.banana.id],
        recipeId: fx.recipe.id,
        recipeRating: 1,
        servedAt: daysAgo(2),
      });
      await created({ foodIds: [fx.egg.id, fx.banana.id], recipeId: fx.recipe.id, recipeRating: 2, servedAt: daysAgo(4) });
      // Even a stray per-food rating on a recipe meal (the API never writes
      // one) is not read as a rating of the ingredient.
      await db
        .update(schema.mealFoods)
        .set({ rating: 1 })
        .where(and(eq(schema.mealFoods.mealId, recipeMeal.id), eq(schema.mealFoods.foodId, fx.egg.id)));

      const { body } = await summaries();
      expect(body.foods).toEqual({
        [fx.egg.id]: { average: 4.5, count: 2, latest: 5, lastRatedAt: expect.any(String) },
      });
      expect(body.recipes).toEqual({
        [fx.recipe.id]: { average: 1.5, count: 2, latest: 1, lastRatedAt: expect.any(String) },
      });
      // Most recent = the latest served rated meal, not the latest logged.
      expect(Date.parse(body.recipes[fx.recipe.id]!.lastRatedAt)).toBeGreaterThan(Date.parse(daysAgo(2.5)));
    });

    it("is per baby, and another account's baby is a 404", async () => {
      const sibling = await createBaby(parent, "Sky");
      await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 1 } }, sibling);
      await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 5 } });

      expect((await summaries()).body.foods[fx.egg.id]).toMatchObject({ average: 5, count: 1 });
      expect((await summaries(sibling)).body.foods[fx.egg.id]).toMatchObject({ average: 1, count: 1 });
      expect((await summaries(babyId, await signUpUser(app, "Stranger"))).status).toBe(404);
    });

    // Item 580: the recipe side and the history endpoint, per baby and per account.
    it("keeps recipe ratings and every history per baby, and hides another account's baby from both endpoints", async () => {
      const sibling = await createBaby(parent, "Sky");
      const stranger = await signUpUser(app, "Stranger");
      const strangersBaby = await createBaby(stranger, "Wren");
      const rateRecipe = async (rating: number, baby: string, user: TestUser) => {
        const response = await postMeal({ foodIds: [fx.egg.id], recipeId: fx.recipe.id, recipeRating: rating }, baby, user);
        expect(response.statusCode).toBe(201);
      };
      await rateRecipe(5, babyId, parent);
      await rateRecipe(2, sibling, parent);
      await rateRecipe(1, strangersBaby, stranger);
      await postMeal({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 1 } }, strangersBaby, stranger);
      const history = (baby: string, query: string, user = parent) =>
        app.inject({ method: "GET", url: `/api/babies/${baby}/ratings/history${query}`, headers: { cookie: user.cookie } });
      const ratingsIn = async (baby: string, query: string, user = parent) =>
        (await history(baby, query, user)).json<RatingHistoryResponse>().points.map((point) => point.rating);

      expect((await summaries()).body.recipes[fx.recipe.id]).toMatchObject({ average: 5, count: 1, latest: 5 });
      expect((await summaries(sibling)).body.recipes[fx.recipe.id]).toMatchObject({ average: 2, count: 1, latest: 2 });
      expect((await summaries(strangersBaby, stranger)).body.recipes[fx.recipe.id]).toMatchObject({ average: 1, count: 1 });
      expect(await ratingsIn(babyId, `?recipeId=${fx.recipe.id}`)).toEqual([5]);
      expect(await ratingsIn(sibling, `?recipeId=${fx.recipe.id}`)).toEqual([2]);
      expect(await ratingsIn(babyId, `?foodId=${fx.egg.id}`)).toEqual([]);

      expect((await summaries(babyId, stranger)).status).toBe(404);
      expect((await history(babyId, `?recipeId=${fx.recipe.id}`, stranger)).statusCode).toBe(404);
      expect((await history(babyId, `?foodId=${fx.egg.id}`, stranger)).statusCode).toBe(404);
    });

    it("serves the history of one food or recipe, oldest first", async () => {
      await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 2 }, servedAt: daysAgo(1) });
      await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 4 }, servedAt: daysAgo(5) });
      await created({ foodIds: [fx.egg.id], recipeId: fx.recipe.id, recipeRating: 5, servedAt: daysAgo(3) });
      const history = (query: string) =>
        app.inject({ method: "GET", url: `/api/babies/${babyId}/ratings/history${query}`, headers: { cookie: parent.cookie } });

      const food = (await history(`?foodId=${fx.egg.id}`)).json<RatingHistoryResponse>().points;
      expect(food.map((point) => point.rating)).toEqual([4, 2]);
      const recipe = (await history(`?recipeId=${fx.recipe.id}`)).json<RatingHistoryResponse>().points;
      expect(recipe.map((point) => point.rating)).toEqual([5]);
      expect((await history("")).statusCode).toBe(400);
      expect((await history(`?foodId=${fx.egg.id}&recipeId=${fx.recipe.id}`)).statusCode).toBe(400);
    });
  });

  describe("write isolation (mutation gaps S03/S04/S20/S40/S41/S42)", () => {
    it("turning a meal into a recipe meal clears only THAT meal's food ratings (S03)", async () => {
      const mealA = await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 5 } });
      const mealB = await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 3 } });

      const patched = (await patchMeal(mealA.id, { recipeId: fx.recipe.id, recipeRating: 4 })).json<MealItem>();
      expect(ratingOf(patched, fx.egg.id)).toBeNull();

      const [bRow] = await db
        .select({ rating: schema.mealFoods.rating })
        .from(schema.mealFoods)
        .where(and(eq(schema.mealFoods.mealId, mealB.id), eq(schema.mealFoods.foodId, fx.egg.id)));
      expect(bRow?.rating).toBe(3);
    });

    it("a PATCH's column update (notes) touches only that meal's row (S04)", async () => {
      const mealA = await created({ foodIds: [fx.egg.id], notes: "meal A" });
      const mealB = await created({ foodIds: [fx.egg.id], notes: "meal B" });

      await patchMeal(mealA.id, { notes: "meal A, edited" });

      const [row] = await db.select({ notes: schema.meals.notes }).from(schema.meals).where(eq(schema.meals.id, mealB.id));
      expect(row?.notes).toBe("meal B");
    });

    it("a null recipeRating on PATCH clears the previously set recipe rating (S20)", async () => {
      const meal = await created({ foodIds: [fx.egg.id], recipeId: fx.recipe.id, recipeRating: 4 });
      const cleared = (await patchMeal(meal.id, { recipeRating: null })).json<MealItem>();
      expect(cleared.recipeRating).toBeNull();
    });

    it("editing a meal's foodIds deletes only that meal's mealFoods rows (S40)", async () => {
      const mealA = await created({ foodIds: [fx.egg.id, fx.banana.id] });
      const mealB = await created({ foodIds: [fx.egg.id] });

      await patchMeal(mealA.id, { foodIds: [fx.egg.id] });

      const bRows = await db.select().from(schema.mealFoods).where(eq(schema.mealFoods.mealId, mealB.id));
      expect(bRows).toHaveLength(1);
    });

    it("editing a meal's foodIds carries forward THAT meal's own previous rating, not another meal's (S41)", async () => {
      const mealA = await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 5 } });
      await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 2 } });

      const edited = (await patchMeal(mealA.id, { foodIds: [fx.egg.id, fx.banana.id] })).json<MealItem>();
      expect(ratingOf(edited, fx.egg.id)).toBe(5);
    });

    it("refuses a rating for a food that is on ANOTHER meal but not this one (S42)", async () => {
      const mealA = await created({ foodIds: [fx.egg.id] });
      await created({ foodIds: [fx.banana.id] });

      const response = await patchMeal(mealA.id, { foodRatings: { [fx.banana.id]: 4 } });
      expect(response.statusCode).toBe(400);
    });
  });

  describe("history filters (mutation gaps S31/S32)", () => {
    it("foodId filter on history returns only that food's points (S31)", async () => {
      await created({ foodIds: [fx.egg.id], foodRatings: { [fx.egg.id]: 4 } });
      await created({ foodIds: [fx.banana.id], foodRatings: { [fx.banana.id]: 1 } });

      const response = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/ratings/history?foodId=${fx.egg.id}`,
        headers: { cookie: parent.cookie },
      });
      const points = response.json<RatingHistoryResponse>().points;
      expect(points.map((point) => point.rating)).toEqual([4]);
    });

    it("recipeId filter on history returns only that recipe's points (S32)", async () => {
      const [other] = await db
        .insert(schema.recipes)
        .values({ slug: "egg-toast", title: "Egg Toast", minAgeMonths: 6, prepMinutes: 5 })
        .returning();
      await created({ foodIds: [fx.egg.id], recipeId: fx.recipe.id, recipeRating: 5 });
      await created({ foodIds: [fx.egg.id], recipeId: other!.id, recipeRating: 2 });

      const response = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/ratings/history?recipeId=${fx.recipe.id}`,
        headers: { cookie: parent.cookie },
      });
      const points = response.json<RatingHistoryResponse>().points;
      expect(points.map((point) => point.rating)).toEqual([5]);
    });
  });

  it("exports every rating (v17)", async () => {
    await created({ foodIds: [fx.egg.id, fx.banana.id], foodRatings: { [fx.banana.id]: 3 } });
    await created({ foodIds: [fx.egg.id], recipeId: fx.recipe.id, recipeRating: 5 });
    const response = await app.inject({ method: "GET", url: "/api/account/export", headers: { cookie: parent.cookie } });
    const bundle = accountExportSchema.parse(response.json());
    const shapes = bundle.meals.map((meal) => [meal.recipeRating, meal.foods.map((food) => [food.slug, food.rating])]);
    expect(shapes).toEqual(
      expect.arrayContaining([
        [null, [["banana", 3], ["egg", null]]],
        [5, [["egg", null]]],
      ]),
    );
  });
});
