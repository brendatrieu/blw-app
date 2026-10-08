// Several recipes per meal (ledger 752, DESIGN-B §2 and §4): the meals API
// with `recipeIds` / `recipeRatings`, the one rating rule, the PATCH that runs
// in one locked transaction, the legacy mirror, and the older app's
// single-recipe shape — which must keep working byte for byte, because the
// shipped app and its 24 h offline queue talk to this server unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import {
  accountExportSchema,
  mealItemSchema,
  type Baby,
  type CreateStorageItemResponse,
  type FoodDetail,
  type AllergenProgressResponse,
  type MealItem,
  type RatingHistoryResponse,
  type RatingsResponse,
  type ServeStorageItemResponse,
} from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { buildExposureSnapshot } from "../ai/snapshot.js";

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
  const [egg, banana, oats, pear] = await db
    .insert(schema.foods)
    .values([food("egg", "Egg"), food("banana", "Banana"), food("oats", "Oats"), food("pear", "Pear")])
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
  const toast = await recipe("egg-toast", "Egg Toast", [egg!.id]);
  return { egg: egg!, banana: banana!, oats: oats!, pear: pear!, pancakes, porridge, toast };
}

describe("several recipes per meal (ledger 752)", () => {
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

  const postMeal = (payload: Record<string, unknown>, user = parent) =>
    app.inject({ method: "POST", url: `/api/babies/${babyId}/meals`, headers: { cookie: user.cookie }, payload });
  const patchMeal = (id: string, payload: Record<string, unknown>) =>
    app.inject({ method: "PATCH", url: `/api/meals/${id}`, headers: { cookie: parent.cookie }, payload });
  async function created(payload: Record<string, unknown>): Promise<MealItem> {
    const response = await postMeal(payload);
    if (response.statusCode !== 201) throw new Error(`meal create failed: ${response.body}`);
    return mealItemSchema.parse(response.json());
  }
  async function patched(id: string, payload: Record<string, unknown>): Promise<MealItem> {
    const response = await patchMeal(id, payload);
    if (response.statusCode !== 200) throw new Error(`meal patch failed: ${response.statusCode} ${response.body}`);
    return mealItemSchema.parse(response.json());
  }
  const recipesOf = (meal: MealItem) => meal.recipes?.map((recipe) => [recipe.title, recipe.rating]);
  const foodsOf = (meal: MealItem) => meal.foods.map((food) => [food.name, food.rating ?? null, food.inRecipe]);
  /** The legacy mirror as stored, which every write must keep = recipes[0]. */
  async function mirror(mealId: string) {
    const [row] = await db
      .select({ recipeId: schema.meals.recipeId, recipeRating: schema.meals.recipeRating })
      .from(schema.meals)
      .where(eq(schema.meals.id, mealId));
    return row;
  }
  async function storedRows(mealId: string) {
    return db
      .select({ recipeId: schema.mealRecipes.recipeId, position: schema.mealRecipes.position, rating: schema.mealRecipes.rating })
      .from(schema.mealRecipes)
      .where(eq(schema.mealRecipes.mealId, mealId))
      .orderBy(asc(schema.mealRecipes.position));
  }
  async function twoRecipeMeal(): Promise<MealItem> {
    return created({
      foodIds: [fx.egg.id, fx.banana.id, fx.oats.id, fx.pear.id],
      recipeIds: [fx.pancakes.id, fx.porridge.id],
      recipeRatings: { [fx.pancakes.id]: 4, [fx.porridge.id]: 2 },
      foodRatings: { [fx.pear.id]: 5 },
    });
  }

  describe("create", () => {
    it("stores the recipes in picked order with their ratings, an extra's own stars, and the mirror", async () => {
      const meal = await twoRecipeMeal();
      expect(recipesOf(meal)).toEqual([
        ["Pancakes", 4],
        ["Porridge", 2],
      ]);
      // The single-recipe fields describe the first recipe (what older apps read).
      expect(meal).toMatchObject({ recipeId: fx.pancakes.id, recipeTitle: "Pancakes", recipeRating: 4 });
      // Foods by name; only the pear is not an ingredient of either recipe.
      expect(foodsOf(meal)).toEqual([
        ["Banana", null, true],
        ["Egg", null, true],
        ["Oats", null, true],
        ["Pear", 5, false],
      ]);
      expect(await mirror(meal.id)).toEqual({ recipeId: fx.pancakes.id, recipeRating: 4 });
      expect(await storedRows(meal.id)).toEqual([
        { recipeId: fx.pancakes.id, position: 0, rating: 4 },
        { recipeId: fx.porridge.id, position: 1, rating: 2 },
      ]);
      // GET returns the same shape.
      const list = await app.inject({ method: "GET", url: `/api/babies/${babyId}/meals`, headers: { cookie: parent.cookie } });
      expect(list.json<{ items: MealItem[] }>().items[0]).toEqual(meal);
    });

    it("dedupes repeated recipe ids, keeping the first position", async () => {
      const meal = await created({ foodIds: [fx.egg.id], recipeIds: [fx.toast.id, fx.pancakes.id, fx.toast.id] });
      expect(meal.recipes?.map((recipe) => recipe.id)).toEqual([fx.toast.id, fx.pancakes.id]);
    });

    it("an empty recipeIds is a loose-food meal", async () => {
      const meal = await created({ foodIds: [fx.egg.id], recipeIds: [], foodRatings: { [fx.egg.id]: 3 } });
      expect(meal).toMatchObject({ recipes: [], recipeId: null, recipeTitle: null, recipeRating: null });
      expect(foodsOf(meal)).toEqual([["Egg", 3, false]]);
    });

    it("refuses more than 10 recipes, an unknown or another account's recipe, and both shapes at once", async () => {
      const many = await db
        .insert(schema.recipes)
        .values(Array.from({ length: 11 }, (_, i) => ({ slug: `r${i}`, title: `R${i}`, minAgeMonths: 6, prepMinutes: 1 })))
        .returning();
      expect((await postMeal({ foodIds: [fx.egg.id], recipeIds: many.map((r) => r.id) })).statusCode).toBe(400);
      expect((await postMeal({ foodIds: [fx.egg.id], recipeIds: many.slice(0, 10).map((r) => r.id) })).statusCode).toBe(201);

      const other = await signUpUser(app);
      const [otherUser] = await db.select().from(schema.user).where(eq(schema.user.email, other.email));
      const [theirs] = await db
        .insert(schema.recipes)
        .values({ slug: "theirs", title: "Theirs", minAgeMonths: 6, prepMinutes: 1, ownerId: otherUser!.id })
        .returning();
      const unknown = await postMeal({ foodIds: [fx.egg.id], recipeIds: [fx.toast.id, theirs!.id] });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json()).toMatchObject({ details: { recipeIds: "unknown recipe", unknownRecipeIds: [theirs!.id] } });
      // The legacy key keeps its old 400 body.
      const legacyUnknown = await postMeal({ foodIds: [fx.egg.id], recipeId: theirs!.id });
      expect(legacyUnknown.json()).toMatchObject({ details: { recipeId: "unknown recipe" } });

      for (const mixed of [
        { recipeIds: [fx.toast.id], recipeId: fx.toast.id },
        { recipeIds: [fx.toast.id], recipeRating: 3 },
        { recipeRatings: { [fx.toast.id]: 3 }, recipeId: fx.toast.id },
      ]) {
        expect((await postMeal({ foodIds: [fx.egg.id], ...mixed })).statusCode, JSON.stringify(mixed)).toBe(400);
      }
      // Only the one 10-recipe meal was written.
      expect(await db.select().from(schema.meals)).toHaveLength(1);
    });

    it("refuses a food rated as part of its recipe, a recipe rating for a recipe not on the meal, and writes nothing", async () => {
      const inRecipe = await postMeal({
        foodIds: [fx.egg.id, fx.pear.id],
        recipeIds: [fx.toast.id],
        foodRatings: { [fx.egg.id]: 4, [fx.pear.id]: 4 },
      });
      expect(inRecipe.statusCode).toBe(400);
      expect(inRecipe.json()).toMatchObject({ details: { foodRatings: "rated as part of its recipe", foods: [fx.egg.id] } });

      const stray = await postMeal({ foodIds: [fx.egg.id], recipeIds: [fx.toast.id], recipeRatings: { [fx.pancakes.id]: 4 } });
      expect(stray.statusCode).toBe(400);
      expect(stray.json()).toMatchObject({ details: { recipeRatings: "recipe is not on this meal", strays: [fx.pancakes.id] } });

      // Clearing is always accepted.
      expect(
        (await postMeal({ foodIds: [fx.egg.id], recipeIds: [fx.toast.id], foodRatings: { [fx.egg.id]: null }, recipeRatings: { [fx.pancakes.id]: null } }))
          .statusCode,
      ).toBe(201);
      expect(await db.select().from(schema.meals)).toHaveLength(1);
    });

    it("takes up to 50 foods", async () => {
      const many = await db
        .insert(schema.foods)
        .values(
          Array.from({ length: 50 }, (_, i) => ({
            slug: `f${i}`,
            name: `F${i}`,
            category: "fruit" as const,
            ironLevel: "low" as const,
            vitaminCLevel: "low" as const,
            chokingRisk: "low" as const,
            minAgeMonths: 6,
            prep6m: "a",
            prep9m: "b",
            prep12m: "c",
            storageCategory: "produce_cooked",
          })),
        )
        .returning();
      const meal = await created({ foodIds: many.map((f) => f.id) });
      expect(meal.foods).toHaveLength(50);
    });
  });

  describe("PATCH (new shape)", () => {
    it("replaces the set in order: a kept recipe keeps its stars, a removed one's go, an added one starts unrated", async () => {
      const meal = await twoRecipeMeal();
      const edited = await patched(meal.id, { recipeIds: [fx.toast.id, fx.porridge.id] });
      expect(recipesOf(edited)).toEqual([
        ["Egg Toast", null],
        ["Porridge", 2],
      ]);
      expect(await storedRows(meal.id)).toEqual([
        { recipeId: fx.toast.id, position: 0, rating: null },
        { recipeId: fx.porridge.id, position: 1, rating: 2 },
      ]);
      expect(await mirror(meal.id)).toEqual({ recipeId: fx.toast.id, recipeRating: null });

      // Reordering renumbers and moves the mirror.
      const reordered = await patched(meal.id, { recipeIds: [fx.porridge.id, fx.toast.id], recipeRatings: { [fx.toast.id]: 5 } });
      expect(recipesOf(reordered)).toEqual([
        ["Porridge", 2],
        ["Egg Toast", 5],
      ]);
      expect(await mirror(meal.id)).toEqual({ recipeId: fx.porridge.id, recipeRating: 2 });

      // Removing every recipe makes it a loose-food meal.
      const loose = await patched(meal.id, { recipeIds: [] });
      expect(loose).toMatchObject({ recipes: [], recipeId: null, recipeRating: null });
      expect(await mirror(meal.id)).toEqual({ recipeId: null, recipeRating: null });
      // Every food is rateable again; the pear kept its stars throughout.
      expect(foodsOf(loose).map(([name, rating, inRecipe]) => [name, rating, inRecipe])).toEqual([
        ["Banana", null, false],
        ["Egg", null, false],
        ["Oats", null, false],
        ["Pear", 5, false],
      ]);
    });

    it("merges recipe ratings per key: two one-key star PATCHes on two recipes keep both, even in parallel", async () => {
      const meal = await twoRecipeMeal();
      await patched(meal.id, { recipeRatings: { [fx.pancakes.id]: 1 } });
      const second = await patched(meal.id, { recipeRatings: { [fx.porridge.id]: 5 } });
      expect(recipesOf(second)).toEqual([
        ["Pancakes", 1],
        ["Porridge", 5],
      ]);

      const [a, b] = await Promise.all([
        patchMeal(meal.id, { recipeRatings: { [fx.pancakes.id]: 3 } }),
        patchMeal(meal.id, { recipeRatings: { [fx.porridge.id]: 3 } }),
      ]);
      expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
      expect(await storedRows(meal.id)).toEqual([
        { recipeId: fx.pancakes.id, position: 0, rating: 3 },
        { recipeId: fx.porridge.id, position: 1, rating: 3 },
      ]);
      expect(await mirror(meal.id)).toEqual({ recipeId: fx.pancakes.id, recipeRating: 3 });
    });

    it("a recipe this edit ADDS clears its ingredients' own stars; a note-only edit clears nothing", async () => {
      const meal = await created({
        foodIds: [fx.egg.id, fx.oats.id, fx.pear.id],
        foodRatings: { [fx.egg.id]: 4, [fx.oats.id]: 3, [fx.pear.id]: 2 },
      });
      const noted = await patched(meal.id, { notes: "ate half" });
      expect(foodsOf(noted).map(([name, rating]) => [name, rating])).toEqual([
        ["Egg", 4],
        ["Oats", 3],
        ["Pear", 2],
      ]);
      // Adding toast (egg) clears only egg; oats and pear keep theirs.
      const withToast = await patched(meal.id, { recipeIds: [fx.toast.id] });
      expect(foodsOf(withToast)).toEqual([
        ["Egg", null, true],
        ["Oats", 3, false],
        ["Pear", 2, false],
      ]);
      // A food the edit adds that is an ingredient arrives unrated and can't be rated.
      const refused = await patchMeal(meal.id, { foodRatings: { [fx.egg.id]: 5 } });
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toMatchObject({ details: { foodRatings: "rated as part of its recipe" } });
    });

    it("an added recipe clears only ITS ingredients' stars, keeps its place, and its ingredients can't be rated in that edit", async () => {
      const meal = await created({
        foodIds: [fx.egg.id, fx.banana.id, fx.pear.id],
        recipeIds: [fx.toast.id],
        foodRatings: { [fx.pear.id]: 4, [fx.banana.id]: 3 },
      });
      // + porridge (oats, banana) after toast: banana's own stars go, pear keeps its.
      let edited = await patched(meal.id, { recipeIds: [fx.toast.id, fx.porridge.id] });
      expect(foodsOf(edited)).toEqual([
        ["Banana", null, true],
        ["Egg", null, true],
        ["Pear", 4, false],
      ]);
      expect(await storedRows(meal.id)).toEqual([
        { recipeId: fx.toast.id, position: 0, rating: null },
        { recipeId: fx.porridge.id, position: 1, rating: null },
      ]);

      // A deploy makes pear an ingredient of toast, a KEPT recipe. Adding
      // pancakes (egg, banana) must not touch pear: it is not one of pancakes'.
      await db.insert(schema.recipeIngredients).values({ recipeId: fx.toast.id, foodId: fx.pear.id, quantityNote: "1" });
      edited = await patched(meal.id, { recipeIds: [fx.toast.id, fx.porridge.id, fx.pancakes.id] });
      expect(recipesOf(edited)).toEqual([
        ["Egg Toast", null],
        ["Porridge", null],
        ["Pancakes", null],
      ]);
      expect(foodsOf(edited)).toContainEqual(["Pear", 4, true]);

      // Toast and pancakes off: pear is a free extra again, still 4.
      edited = await patched(meal.id, { recipeIds: [fx.porridge.id] });
      expect(foodsOf(edited)).toContainEqual(["Pear", 4, false]);
      // Re-adding toast while rating pear (now toast's ingredient) is refused and writes nothing.
      const refused = await patchMeal(meal.id, { recipeIds: [fx.porridge.id, fx.toast.id], foodRatings: { [fx.pear.id]: 5 } });
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toMatchObject({ details: { foodRatings: "rated as part of its recipe" } });
      expect(await storedRows(meal.id)).toEqual([{ recipeId: fx.porridge.id, position: 0, rating: null }]);
      expect(foodsOf(await patched(meal.id, { notes: "check" }))).toContainEqual(["Pear", 4, false]);
      // Re-added on its own, toast rates pear from then on.
      edited = await patched(meal.id, { recipeIds: [fx.porridge.id, fx.toast.id] });
      expect(foodsOf(edited)).toContainEqual(["Pear", null, true]);
    });

    // DESIGN-B §4: every rule reads the meal's state first, so the row lock
    // must come before any of those reads (PGlite serializes, so only the
    // statement order can show it; the Postgres race is in the dry run).
    it("locks the meal row FOR UPDATE before it reads any of the meal's state", async () => {
      const meal = await twoRecipeMeal();
      const seen: string[] = [];
      const original = PgDialect.prototype.sqlToQuery;
      const spy = vi.spyOn(PgDialect.prototype, "sqlToQuery").mockImplementation(function (this: PgDialect, ...args) {
        const query = original.apply(this, args);
        seen.push(query.sql.toLowerCase());
        return query;
      });
      try {
        await patched(meal.id, { recipeRatings: { [fx.porridge.id]: 3 } });
      } finally {
        spy.mockRestore();
      }
      const lock = seen.findIndex((text) => text.includes('from "meals"') && text.includes("for update"));
      const firstRead = seen.findIndex((text) => /from "(meal_recipes|meal_foods|recipe_ingredients)"/.test(text));
      expect(lock, seen.join("\n")).toBeGreaterThanOrEqual(0);
      expect(firstRead, seen.join("\n")).toBeGreaterThan(lock);
    });

    it("keeps a rated extra that later became an ingredient visible and editable", async () => {
      const meal = await created({ foodIds: [fx.egg.id, fx.pear.id], recipeIds: [fx.toast.id], foodRatings: { [fx.pear.id]: 4 } });
      // A recipe edit (or a deploy adding an ingredient) makes pear part of toast.
      await db.insert(schema.recipeIngredients).values({ recipeId: fx.toast.id, foodId: fx.pear.id, quantityNote: "1" });

      const noted = await patched(meal.id, { notes: "later" });
      expect(foodsOf(noted)).toEqual([
        ["Egg", null, true],
        ["Pear", 4, true],
      ]);
      expect(foodsOf(await patched(meal.id, { foodRatings: { [fx.pear.id]: 2 } }))).toContainEqual(["Pear", 2, true]);
      // Cleared, it is rated through the recipe from then on.
      await patched(meal.id, { foodRatings: { [fx.pear.id]: null } });
      expect((await patchMeal(meal.id, { foodRatings: { [fx.pear.id]: 3 } })).statusCode).toBe(400);
    });

    it("keeps a rated extra editable after custom-food Replace merges it onto an ingredient", async () => {
      const custom = await app.inject({
        method: "POST",
        url: "/api/foods",
        headers: { cookie: parent.cookie },
        payload: { name: "Our eggs", category: "protein" },
      });
      const ours = custom.json<FoodDetail>();
      const meal = await created({ foodIds: [fx.banana.id, ours.id], recipeIds: [fx.toast.id], foodRatings: { [ours.id]: 4 } });

      // Egg is an ingredient of toast; the rating moves onto the egg row.
      const replaced = await app.inject({
        method: "POST",
        url: `/api/foods/${ours.id}/replace`,
        headers: { cookie: parent.cookie },
        payload: { replacementId: fx.egg.id },
      });
      expect(replaced.statusCode).toBeLessThan(300);

      const noted = await patched(meal.id, { notes: "after replace" });
      expect(foodsOf(noted)).toEqual([
        ["Banana", null, false],
        ["Egg", 4, true],
      ]);
    });

    it("refuses 404 for another account's meal and 400 for a bad body, writing nothing", async () => {
      const meal = await twoRecipeMeal();
      const other = await signUpUser(app);
      const theirs = await app.inject({
        method: "PATCH",
        url: `/api/meals/${meal.id}`,
        headers: { cookie: other.cookie },
        payload: { recipeIds: [] },
      });
      expect(theirs.statusCode).toBe(404);
      expect((await patchMeal(meal.id, {})).statusCode).toBe(400);
      expect((await patchMeal(meal.id, { recipeIds: [fx.toast.id], recipeId: fx.toast.id })).statusCode).toBe(400);
      expect((await patchMeal(meal.id, { recipeRatings: { [fx.toast.id]: 4 } })).statusCode).toBe(400);
      // An added recipe must be one this account can see.
      const [otherUser] = await db.select().from(schema.user).where(eq(schema.user.email, other.email));
      const [theirRecipe] = await db
        .insert(schema.recipes)
        .values({ slug: "theirs", title: "Theirs", minAgeMonths: 6, prepMinutes: 1, ownerId: otherUser!.id })
        .returning();
      const unknown = await patchMeal(meal.id, { recipeIds: [fx.pancakes.id, theirRecipe!.id] });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json()).toMatchObject({ details: { recipeIds: "unknown recipe", unknownRecipeIds: [theirRecipe!.id] } });
      // A failed rule rolls back the whole edit, including the column writes.
      expect((await patchMeal(meal.id, { notes: "lost", recipeRatings: { [fx.toast.id]: 4 } })).statusCode).toBe(400);
      expect(await storedRows(meal.id)).toEqual([
        { recipeId: fx.pancakes.id, position: 0, rating: 4 },
        { recipeId: fx.porridge.id, position: 1, rating: 2 },
      ]);
      const [row] = await db.select().from(schema.meals).where(eq(schema.meals.id, meal.id));
      expect(row?.notes).toBeNull();
    });
  });

  // DESIGN-B §4 "Legacy request mapping": exactly what the shipped app sends
  // (LogFoodForm submits foodIds, recipeId, servedAt, reactionNote, notes and
  // either recipeRating or foodRatings; the meal page sends one key per tap).
  describe("older app (single-recipe shape)", () => {
    it("create recipeId + recipeRating is a one-recipe meal; the answer parses as the old shape", async () => {
      const meal = await created({
        foodIds: [fx.egg.id, fx.banana.id],
        recipeId: fx.pancakes.id,
        servedAt: new Date().toISOString(),
        reactionNote: "",
        notes: "",
        recipeRating: 3,
      });
      expect(meal).toMatchObject({ recipeId: fx.pancakes.id, recipeTitle: "Pancakes", recipeRating: 3 });
      expect(recipesOf(meal)).toEqual([["Pancakes", 3]]);
      expect(await mirror(meal.id)).toEqual({ recipeId: fx.pancakes.id, recipeRating: 3 });

      const loose = await created({ foodIds: [fx.egg.id], recipeId: null, foodRatings: { [fx.egg.id]: 2 } });
      expect(loose).toMatchObject({ recipes: [], recipeId: null, recipeRating: null });
      // A recipe rating with no recipe is still today's 400.
      const bad = await postMeal({ foodIds: [fx.egg.id], recipeId: null, recipeRating: 4 });
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toMatchObject({ details: { recipeRating: "only a recipe meal has a recipe rating" } });
    });

    it("on a 0/1-recipe meal maps exactly as before: change, rate, remove", async () => {
      const meal = await created({ foodIds: [fx.egg.id], recipeId: fx.toast.id, recipeRating: 4 });
      // Same recipe resent with the whole form: nothing changes but what changed.
      expect(await patched(meal.id, { foodIds: [fx.egg.id], recipeId: fx.toast.id, recipeRating: 4, notes: "x" })).toMatchObject({
        recipeId: fx.toast.id,
        recipeRating: 4,
        notes: "x",
      });
      // A changed recipe without a rating starts unrated...
      expect(await patched(meal.id, { recipeId: fx.pancakes.id })).toMatchObject({ recipeId: fx.pancakes.id, recipeRating: null });
      // ...or takes the rating sent with it.
      expect(await patched(meal.id, { recipeId: fx.porridge.id, recipeRating: 5 })).toMatchObject({
        recipeId: fx.porridge.id,
        recipeRating: 5,
      });
      expect(await storedRows(meal.id)).toEqual([{ recipeId: fx.porridge.id, position: 0, rating: 5 }]);
      // The meal page's one-tap PATCH.
      expect(await patched(meal.id, { recipeRating: 1 })).toMatchObject({ recipeRating: 1 });
      // Removing the recipe.
      const loose = await patched(meal.id, { recipeId: null, foodRatings: { [fx.egg.id]: 3 } });
      expect(loose).toMatchObject({ recipes: [], recipeId: null, recipeRating: null });
      expect(foodsOf(loose)).toEqual([["Egg", 3, false]]);
      expect(await mirror(meal.id)).toEqual({ recipeId: null, recipeRating: null });
      // recipeRating with no recipe: 400 for a value, fine for null.
      expect((await patchMeal(meal.id, { recipeRating: 2 })).statusCode).toBe(400);
      expect((await patchMeal(meal.id, { recipeRating: null })).statusCode).toBe(200);
      // A loose meal turned into a recipe meal clears its ingredients' stars.
      expect(foodsOf(await patched(meal.id, { recipeId: fx.toast.id }))).toEqual([["Egg", null, true]]);
    });

    it("on a 2+ recipe meal: edits everything but the recipes, rating the first", async () => {
      const meal = await twoRecipeMeal();
      // The old edit form resends every food, the first recipe and its stars.
      const edited = await patched(meal.id, {
        foodIds: [fx.egg.id, fx.banana.id, fx.oats.id, fx.pear.id],
        recipeId: fx.pancakes.id,
        servedAt: new Date().toISOString(),
        reactionNote: null,
        notes: "from the old app",
        recipeRating: 1,
      });
      expect(edited.notes).toBe("from the old app");
      expect(recipesOf(edited)).toEqual([
        ["Pancakes", 1],
        ["Porridge", 2],
      ]);
      // The extra's stars rode through the food re-insert.
      expect(foodsOf(edited)).toContainEqual(["Pear", 5, false]);
      expect(await mirror(meal.id)).toEqual({ recipeId: fx.pancakes.id, recipeRating: 1 });
      // The meal page's one-tap PATCH rates the first recipe.
      expect(recipesOf(await patched(meal.id, { recipeRating: 3 }))).toEqual([
        ["Pancakes", 3],
        ["Porridge", 2],
      ]);
    });

    it.each([
      ["another recipe", () => ({ recipeId: "toast" })],
      ["no recipe", () => ({ recipeId: null })],
      ["the second recipe", () => ({ recipeId: "porridge" })],
    ])("on a 2+ recipe meal a change to %s is a 409 and writes nothing", async (_label, body) => {
      const meal = await twoRecipeMeal();
      const ids: Record<string, string> = { toast: fx.toast.id, porridge: fx.porridge.id };
      const raw = body();
      const recipeId = raw.recipeId === null ? null : ids[raw.recipeId];
      // The old form also drops the old recipe's chips on a recipe change.
      const response = await patchMeal(meal.id, { foodIds: [fx.egg.id], recipeId, notes: "nope", recipeRating: 5 });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: "conflict", message: "this meal has more than one recipe" });

      const [row] = await db.select().from(schema.meals).where(eq(schema.meals.id, meal.id));
      expect(row).toMatchObject({ notes: null, recipeId: fx.pancakes.id, recipeRating: 4 });
      expect(await storedRows(meal.id)).toHaveLength(2);
      expect(await db.select().from(schema.mealFoods).where(eq(schema.mealFoods.mealId, meal.id))).toHaveLength(4);
    });
  });

  describe("serve from storage (the kept single-item endpoint)", () => {
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

    it("writes the container's recipe as the meal's one recipe row and its mirror", async () => {
      const itemId = await stock({ recipeId: fx.pancakes.id });
      const response = await serve(itemId, { recipeRating: 4 });
      expect(response.statusCode).toBe(201);
      const { meal } = response.json<ServeStorageItemResponse>();
      expect(recipesOf(meal)).toEqual([["Pancakes", 4]]);
      expect(meal).toMatchObject({ recipeId: fx.pancakes.id, recipeRating: 4 });
      expect(await storedRows(meal.id)).toEqual([{ recipeId: fx.pancakes.id, position: 0, rating: 4 }]);
      expect(await mirror(meal.id)).toEqual({ recipeId: fx.pancakes.id, recipeRating: 4 });
    });
  });

  // Ledger 754: every reader of a meal's recipe goes through `meal_recipes`,
  // so the second recipe of a meal (which the legacy mirror never names)
  // counts everywhere the first one does.
  describe("readers (ledger 754)", () => {
    const ratings = async () => {
      const response = await app.inject({ method: "GET", url: `/api/babies/${babyId}/ratings`, headers: { cookie: parent.cookie } });
      expect(response.statusCode).toBe(200);
      return response.json<RatingsResponse>();
    };
    const history = async (query: string) => {
      const response = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/ratings/history?${query}`,
        headers: { cookie: parent.cookie },
      });
      expect(response.statusCode).toBe(200);
      return response.json<RatingHistoryResponse>();
    };

    it("summaries count every recipe of a meal at any position, and an extra's own stars on a recipe meal", async () => {
      await twoRecipeMeal(); // pancakes 4, porridge 2 (position 1), pear 5 (extra)
      await created({ foodIds: [fx.pear.id], foodRatings: { [fx.pear.id]: 3 }, servedAt: "2026-01-01T08:00:00.000Z" });
      await created({ foodIds: [fx.oats.id, fx.banana.id], recipeIds: [fx.porridge.id], recipeRatings: { [fx.porridge.id]: 4 }, servedAt: "2026-01-02T08:00:00.000Z" });

      const summary = await ratings();
      expect(summary.recipes[fx.pancakes.id]).toMatchObject({ count: 1, average: 4, latest: 4 });
      expect(summary.recipes[fx.porridge.id]).toMatchObject({ count: 2, average: 3, latest: 2 });
      expect(summary.foods[fx.pear.id]).toMatchObject({ count: 2, average: 4, latest: 5 });
      // A recipe's stars never count toward its ingredients.
      expect(Object.keys(summary.foods)).toEqual([fx.pear.id]);
    });

    it("history and served count follow the recipe at any position, and drop it when an edit takes it off", async () => {
      const meal = await twoRecipeMeal();
      await created({ foodIds: [fx.oats.id], recipeIds: [fx.porridge.id], servedAt: "2026-01-02T08:00:00.000Z" });

      expect(await history(`recipeId=${fx.porridge.id}`)).toEqual({
        points: [{ servedAt: meal.servedAt, rating: 2 }],
        servedCount: 2,
      });
      expect((await history(`recipeId=${fx.pancakes.id}`)).servedCount).toBe(1);
      // Banana is in both recipes but on the meal once: one meal, counted once.
      expect((await history(`foodId=${fx.banana.id}`)).servedCount).toBe(1);
      expect(await history(`foodId=${fx.pear.id}`)).toEqual({ points: [{ servedAt: meal.servedAt, rating: 5 }], servedCount: 1 });

      await patched(meal.id, { recipeIds: [fx.pancakes.id] });
      expect(await history(`recipeId=${fx.porridge.id}`)).toEqual({ points: [], servedCount: 1 });
    });

    it("two recipes sharing an allergen food give ONE exposure for the meal, in the ladder and the AI snapshot", async () => {
      const [eggAllergen] = await db
        .insert(schema.allergens)
        .values({ slug: "egg", name: "Egg", introGuidance: "Well-cooked egg." })
        .returning();
      await db.insert(schema.foodAllergens).values({ foodId: fx.egg.id, allergenId: eggAllergen!.id });
      // Pancakes and Egg Toast both contain egg.
      const meal = await created({ foodIds: [fx.egg.id, fx.banana.id], recipeIds: [fx.pancakes.id, fx.toast.id] });
      expect(meal.foods.filter((food) => food.id === fx.egg.id)).toHaveLength(1);

      const progress = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: parent.cookie },
      });
      const body = progress.json<AllergenProgressResponse>();
      expect(body.items.find((item) => item.allergenSlug === "egg")?.exposures).toBe(1);
      expect(body.foodsTried).toBe(2);

      // The symptom-check snapshot reads meal_foods too: egg once, first exposure.
      const snapshot = await buildExposureSnapshot(db, babyId, new Date(Date.parse(meal.servedAt) + 60_000));
      expect(snapshot.filter((item) => item.foodSlug === "egg")).toEqual([
        expect.objectContaining({ timesServedEver: 1, firstExposure: true, allergenClass: "egg" }),
      ]);
    });
  });

  it("exports every recipe of a meal in order with its stars (v18)", async () => {
    await twoRecipeMeal();
    const response = await app.inject({ method: "GET", url: "/api/account/export", headers: { cookie: parent.cookie } });
    const bundle = accountExportSchema.parse(response.json());
    expect(bundle.exportVersion).toBe(18);
    expect(bundle.meals[0]?.recipes).toEqual([
      { recipeId: fx.pancakes.id, recipeTitle: "Pancakes", rating: 4 },
      { recipeId: fx.porridge.id, recipeTitle: "Porridge", rating: 2 },
    ]);
    expect(bundle.meals[0]?.foods.find((food) => food.slug === "pear")?.rating).toBe(5);
    // The mirror columns are not the parent's data and are not exported.
    expect(bundle.meals[0]).not.toHaveProperty("recipeId");
    expect(bundle.meals[0]).not.toHaveProperty("recipeRating");
  });
});

// DESIGN-B §4: the whole PATCH is one transaction. A write that fails after
// the columns, the recipe set and the recipe stars were written (here the
// meal_foods re-insert, which runs after its DELETE) must leave the meal as
// it was, foods included.
describe("PATCH atomicity (ledger 752)", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let armed = false;
  const failing = { values: () => Promise.reject(new Error("test fault: meal_foods insert")) };
  // The routes get a view of the database whose meal_foods insert throws
  // while armed (inside transactions too); `db` stays clean for assertions.
  const wrap = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(inner, prop, receiver) {
        const value = Reflect.get(inner, prop, receiver) as unknown;
        if (prop === "insert") {
          return (table: unknown) =>
            armed && table === schema.mealFoods ? failing : (value as (t: unknown) => unknown).call(receiver, table);
        }
        if (prop === "transaction") {
          return (callback: (tx: object) => unknown, ...rest: unknown[]) =>
            (value as (...args: unknown[]) => unknown).call(receiver, (tx: object) => callback(wrap(tx)), ...rest);
        }
        return value;
      },
    });

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp({}, {}, (inner) => wrap(inner)));
  });
  afterEach(async () => {
    armed = false;
    await close();
  });

  it("a write failing part-way rolls back the columns, the recipe set, both kinds of stars and the foods", async () => {
    const fx = await seedFixtures(db);
    const parent = await signUpUser(app);
    const baby = await app.inject({
      method: "POST",
      url: "/api/babies",
      headers: { cookie: parent.cookie },
      payload: { name: "Robin", birthDate: "2025-01-15" },
    });
    const created = await app.inject({
      method: "POST",
      url: `/api/babies/${baby.json<Baby>().id}/meals`,
      headers: { cookie: parent.cookie },
      payload: {
        foodIds: [fx.egg.id, fx.oats.id, fx.pear.id],
        recipeIds: [fx.toast.id],
        recipeRatings: { [fx.toast.id]: 4 },
        foodRatings: { [fx.oats.id]: 3, [fx.pear.id]: 2 },
      },
    });
    expect(created.statusCode).toBe(201);
    const mealId = mealItemSchema.parse(created.json()).id;
    const snapshot = async () => ({
      meal: await db.select().from(schema.meals).where(eq(schema.meals.id, mealId)),
      foods: await db.select().from(schema.mealFoods).where(eq(schema.mealFoods.mealId, mealId)).orderBy(asc(schema.mealFoods.foodId)),
      recipes: await db.select().from(schema.mealRecipes).where(eq(schema.mealRecipes.mealId, mealId)).orderBy(asc(schema.mealRecipes.recipeId)),
    });
    const before = await snapshot();

    armed = true;
    const response = await app.inject({
      method: "PATCH",
      url: `/api/meals/${mealId}`,
      headers: { cookie: parent.cookie },
      payload: {
        notes: "should not stick",
        recipeIds: [fx.porridge.id, fx.toast.id],
        recipeRatings: { [fx.porridge.id]: 5, [fx.toast.id]: 1 },
        foodIds: [fx.egg.id, fx.oats.id],
      },
    });
    armed = false;
    expect(response.statusCode).toBe(500);
    expect(await snapshot()).toEqual(before);
  });
});
