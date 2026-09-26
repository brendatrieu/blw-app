import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  AllergenDetail,
  AllergenProgressResponse,
  Baby,
  FoodDetail,
  FoodsResponse,
  CreateStorageItemResponse,
  MealItem,
  MealsResponse,
  RecipeDetail,
  RecipesResponse,
  ReplaceCustomFoodResponse,
  StorageResponse,
} from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { buildChatTools } from "../ai/tools.js";
import { buildExposureSnapshot } from "../ai/snapshot.js";

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

/**
 * Deliberately minimal: one catalog food and the allergen rows a custom food
 * is tagged against. Note what is NOT here — the `produce_cooked_soft`
 * storage guideline a custom food hangs off. This database is migrated but
 * never seeded, which is exactly the state POST /api/foods has to cope with.
 */
async function seedFixtures(db: Database) {
  await db.insert(schema.storageGuidelines).values({
    category: "produce_cooked",
    fridgeHours: 48,
    freezerDays: 60,
    roomTempHours: 2,
    notes: "Cooked produce.",
  });

  const [banana] = await db
    .insert(schema.foods)
    .values({
      slug: "banana",
      name: "Banana",
      category: "fruit",
      ironLevel: "low",
      vitaminCLevel: "moderate",
      chokingRisk: "low",
      minAgeMonths: 6,
      prep6m: "strip",
      prep9m: "chop",
      prep12m: "slice",
      storageCategory: "produce_cooked",
    })
    .returning();

  const [peanut, egg] = await db
    .insert(schema.allergens)
    .values([
      { slug: "peanut", name: "Peanut", introGuidance: "Thinned smooth peanut butter only." },
      { slug: "egg", name: "Egg", introGuidance: "Well-cooked egg, tiny first portion." },
    ])
    .returning();

  return { banana: banana!, peanut: peanut!, egg: egg! };
}

describe("custom foods", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let fixtures: Awaited<ReturnType<typeof seedFixtures>>;
  let owner: TestUser;
  let intruder: TestUser;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    fixtures = await seedFixtures(db);
    owner = await signUpUser(app, "Owner Parent");
    intruder = await signUpUser(app, "Intruder Parent");
  });

  afterEach(async () => {
    await close();
  });

  async function userId(user: TestUser): Promise<string> {
    const [row] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, user.email))
      .limit(1);
    return row!.id;
  }

  /** POST a custom food, failing loudly on a non-201. */
  async function createFood(user: TestUser, payload: Record<string, unknown>): Promise<FoodDetail> {
    const response = await app.inject({
      method: "POST",
      url: "/api/foods",
      headers: { cookie: user.cookie },
      payload,
    });
    if (response.statusCode !== 201) {
      throw new Error(`custom food create failed (${response.statusCode}): ${response.body}`);
    }
    return response.json<FoodDetail>();
  }

  /** GET /api/foods, signed in as `user` or anonymously when it is null. */
  async function listFoods(user: TestUser | null, query = ""): Promise<FoodsResponse> {
    const response = await app.inject({
      method: "GET",
      url: `/api/foods${query}`,
      headers: user ? { cookie: user.cookie } : {},
    });
    if (response.statusCode !== 200) {
      throw new Error(`foods list failed (${response.statusCode}): ${response.body}`);
    }
    return response.json<FoodsResponse>();
  }

  async function createBaby(user: TestUser): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/babies",
      headers: { cookie: user.cookie },
      payload: { name: "Robin", birthDate: "2025-01-15" },
    });
    return response.json<Baby>().id;
  }

  async function postMeal(user: TestUser, babyId: string, foodIds: string[]) {
    return app.inject({
      method: "POST",
      url: `/api/babies/${babyId}/meals`,
      headers: { cookie: user.cookie },
      payload: { foodIds },
    });
  }

  // -----------------------------------------------------------------------
  // POST /api/foods
  // -----------------------------------------------------------------------
  describe("POST /api/foods", () => {
    it("401s an unauthenticated create", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/foods",
        payload: { name: "Banana bread", category: "grain" },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    });

    it("creates a food owned by the caller, with inert stored guidance", async () => {
      const created = await createFood(owner, {
        name: "Banana bread",
        category: "grain",
        emoji: "🍞",
        allergenSlugs: ["peanut"],
        notes: "Nana's recipe.",
      });

      expect(created.slug).toMatch(/^banana-bread-[0-9a-z]{6}$/);
      expect(created).toMatchObject({
        name: "Banana bread",
        category: "grain",
        emoji: "🍞",
        notes: "Nana's recipe.",
        isCustom: true,
        allergens: ["peanut"],
        // Placeholders, never shown: the client reads isCustom and hides them.
        ironLevel: "low",
        vitaminCLevel: "low",
        fiberLevel: "low",
        chokingRisk: "low",
        minAgeMonths: 6,
        prep6m: "",
        prep9m: "",
        prep12m: "",
        pairings: [],
        recipes: [],
      });

      // Readable straight back by slug, and present in the owner's list.
      const detail = await app.inject({
        method: "GET",
        url: `/api/foods/${created.slug}`,
        headers: { cookie: owner.cookie },
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json<FoodDetail>().id).toBe(created.id);

      const list = await listFoods(owner);
      expect(list.foods.map((food) => food.slug)).toContain(created.slug);
      const listed = list.foods.find((food) => food.slug === created.slug);
      expect(listed).toMatchObject({ isCustom: true, emoji: "🍞", allergens: ["peanut"] });
    });

    it("marks seeded catalog foods as not custom, with no emoji of their own", async () => {
      const list = await listFoods(owner);
      const banana = list.foods.find((food) => food.slug === "banana");
      expect(banana).toMatchObject({ isCustom: false, emoji: null });
    });

    it("defaults an omitted allergen checklist, emoji and notes to empty", async () => {
      const created = await createFood(owner, { name: "Leftover risotto", category: "grain" });
      expect(created).toMatchObject({ allergens: [], emoji: null, notes: null, isCustom: true });
    });

    it("gives two foods with the same name different slugs", async () => {
      const first = await createFood(owner, { name: "Banana bread", category: "grain" });
      const second = await createFood(intruder, { name: "Banana bread", category: "grain" });

      expect(first.slug).not.toBe(second.slug);
      expect(first.slug.startsWith("banana-bread-")).toBe(true);
      expect(second.slug.startsWith("banana-bread-")).toBe(true);
    });

    it("400s an unusable name, category or emoji", async () => {
      for (const payload of [
        { name: "   ", category: "grain" },
        { name: "x".repeat(61), category: "grain" },
        { name: "Fine", category: "not-a-category" },
        { name: "Fine", category: "grain", emoji: "ab" },
        { name: "Fine", category: "grain", emoji: "🍞🥑" },
      ]) {
        const response = await app.inject({
          method: "POST",
          url: "/api/foods",
          headers: { cookie: owner.cookie },
          payload,
        });
        expect(response.statusCode, JSON.stringify(payload)).toBe(400);
        expect(response.json<{ error: string }>().error).toBe("invalid_request");
      }
    });

    it("400s an allergen slug that names no allergen", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/foods",
        headers: { cookie: owner.cookie },
        payload: { name: "Mystery mash", category: "veg", allergenSlugs: ["peanut", "unicorn"] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<{ details: { unknownAllergenSlugs: string[] } }>().details.unknownAllergenSlugs).toEqual([
        "unicorn",
      ]);

      // Nothing was written on the way to the rejection.
      const list = await listFoods(owner);
      expect(list.foods.some((food) => food.name === "Mystery mash")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Visibility (item 174)
  // -----------------------------------------------------------------------
  describe("visibility", () => {
    it("hides another user's custom food from the list, search, filters and detail", async () => {
      const mine = await createFood(owner, {
        name: "Papa's lentil stew",
        category: "legume",
        allergenSlugs: ["peanut"],
      });

      const ownerList = await listFoods(owner);
      expect(ownerList.foods.map((f) => f.slug)).toContain(mine.slug);

      const intruderList = await listFoods(intruder);
      expect(intruderList.foods.map((f) => f.slug)).not.toContain(mine.slug);
      expect(intruderList.foods.map((f) => f.slug)).toContain("banana");

      // Every filter narrows the visible set; none of them widens it.
      for (const query of ["?q=lentil", "?category=legume", "?allergen=peanut", "?maxAgeMonths=6&ironLevel=low"]) {
        const forOwner = await listFoods(owner, query);
        expect(forOwner.foods.map((f) => f.slug), query).toContain(mine.slug);

        const forIntruder = await listFoods(intruder, query);
        expect(forIntruder.foods.map((f) => f.slug), query).not.toContain(mine.slug);
      }

      const theirRead = await app.inject({
        method: "GET",
        url: `/api/foods/${mine.slug}`,
        headers: { cookie: intruder.cookie },
      });
      expect(theirRead.statusCode).toBe(404);
      expect(theirRead.json()).toEqual({ error: "not_found" });
    });

    it("hides every custom food from an anonymous caller", async () => {
      const mine = await createFood(owner, { name: "Papa's lentil stew", category: "legume" });

      const anonymous = await listFoods(null);
      expect(anonymous.foods.map((f) => f.slug)).toEqual(["banana"]);

      const detail = await app.inject({ method: "GET", url: `/api/foods/${mine.slug}` });
      expect(detail.statusCode).toBe(404);
    });

    it("keeps another user's custom food out of the AI prep-guidance tool", async () => {
      const mine = await createFood(owner, { name: "Papa's lentil stew", category: "legume" });

      const theirTools = buildChatTools(db, await userId(intruder), null);
      const refused = await theirTools.get_food_prep_guidance.run({ foodSlug: mine.slug, ageStage: "9" });
      expect(String(refused)).toContain("No catalog food found");

      // The owner's own tool finds it, and says there is no curated guidance
      // rather than reading back the empty placeholder columns.
      const myTools = buildChatTools(db, await userId(owner), null);
      const answer = await myTools.get_food_prep_guidance.run({ foodSlug: mine.slug, ageStage: "9" });
      expect(String(answer)).toContain("added themselves");

      const catalog = await myTools.get_food_prep_guidance.run({ foodSlug: "banana", ageStage: "9" });
      expect(String(catalog)).toContain("chop");
    });

    it("refuses to log or stock another user's custom food", async () => {
      const mine = await createFood(owner, { name: "Papa's lentil stew", category: "legume" });
      const theirBabyId = await createBaby(intruder);

      const meal = await postMeal(intruder, theirBabyId, [mine.id]);
      expect(meal.statusCode).toBe(400);
      expect(meal.json<{ details: { unknownFoodIds: string[] } }>().details.unknownFoodIds).toEqual([mine.id]);

      const storage = await app.inject({
        method: "POST",
        url: "/api/storage",
        headers: { cookie: intruder.cookie },
        payload: { foodIds: [mine.id], location: "fridge" },
      });
      expect(storage.statusCode).toBe(400);

      // The owner can do both with the same food.
      const myBabyId = await createBaby(owner);
      expect((await postMeal(owner, myBabyId, [mine.id])).statusCode).toBe(201);
      const myStorage = await app.inject({
        method: "POST",
        url: "/api/storage",
        headers: { cookie: owner.cookie },
        payload: { foodIds: [mine.id], location: "fridge" },
      });
      expect(myStorage.statusCode).toBe(201);
    });

    it("carries a custom food's emoji into meal and storage rows", async () => {
      const mine = await createFood(owner, { name: "Papa's lentil stew", category: "legume", emoji: "🍲" });
      const babyId = await createBaby(owner);

      const meal = await postMeal(owner, babyId, [mine.id]);
      expect(meal.json<MealItem>().foods[0]?.emoji).toBe("🍲");

      const storage = await app.inject({
        method: "POST",
        url: "/api/storage",
        headers: { cookie: owner.cookie },
        payload: { foodIds: [mine.id], location: "fridge" },
      });
      // The emoji travels on the food inside the container, not on the
      // container itself — one item can hold several foods (item 345).
      expect(storage.json<CreateStorageItemResponse>().items[0]?.foods[0]?.emoji).toBe("🍲");

      const list = await app.inject({ method: "GET", url: "/api/storage?view=active", headers: { cookie: owner.cookie } });
      expect(list.json<StorageResponse>().items[0]?.foods[0]?.emoji).toBe("🍲");
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/foods/:id
  // -----------------------------------------------------------------------
  describe("PATCH /api/foods/:id", () => {
    it("updates the editable fields and replaces the allergen set, keeping the slug", async () => {
      const created = await createFood(owner, {
        name: "Banana bread",
        category: "grain",
        emoji: "🍞",
        allergenSlugs: ["peanut"],
        notes: "Nana's recipe.",
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/foods/${created.id}`,
        headers: { cookie: owner.cookie },
        payload: {
          name: "Banana loaf",
          category: "fruit",
          emoji: "🍌",
          allergenSlugs: ["egg"],
          notes: null,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<FoodDetail>()).toMatchObject({
        id: created.id,
        // The slug outlives the rename: links already point at it.
        slug: created.slug,
        name: "Banana loaf",
        category: "fruit",
        emoji: "🍌",
        notes: null,
        allergens: ["egg"],
        isCustom: true,
      });
    });

    it("leaves untouched fields alone and can clear the emoji", async () => {
      const created = await createFood(owner, {
        name: "Banana bread",
        category: "grain",
        emoji: "🍞",
        allergenSlugs: ["peanut"],
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/foods/${created.id}`,
        headers: { cookie: owner.cookie },
        payload: { emoji: null },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<FoodDetail>()).toMatchObject({
        name: "Banana bread",
        category: "grain",
        emoji: null,
        // An absent allergenSlugs key leaves the set alone.
        allergens: ["peanut"],
      });
    });

    it("404s another user's food, a catalog food and an unknown id", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain" });

      for (const [cookie, id] of [
        [intruder.cookie, mine.id],
        [owner.cookie, fixtures.banana.id],
        [owner.cookie, UNKNOWN_ID],
        [owner.cookie, "not-a-uuid"],
      ] as const) {
        const response = await app.inject({
          method: "PATCH",
          url: `/api/foods/${id}`,
          headers: { cookie },
          payload: { name: "Renamed" },
        });
        expect(response.statusCode, `${id}`).toBe(404);
        expect(response.json()).toEqual({ error: "not_found" });
      }

      // The owner's food is untouched by the intruder's attempt.
      const detail = await app.inject({
        method: "GET",
        url: `/api/foods/${mine.slug}`,
        headers: { cookie: owner.cookie },
      });
      expect(detail.json<FoodDetail>().name).toBe("Banana bread");
    });

    it("400s an empty body, an unknown allergen and a bad emoji", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain" });

      for (const payload of [{}, { allergenSlugs: ["unicorn"] }, { emoji: "nope" }]) {
        const response = await app.inject({
          method: "PATCH",
          url: `/api/foods/${mine.id}`,
          headers: { cookie: owner.cookie },
          payload,
        });
        expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      }
    });

    it("401s an unauthenticated edit", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain" });
      const response = await app.inject({
        method: "PATCH",
        url: `/api/foods/${mine.id}`,
        payload: { name: "Renamed" },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/foods/:id
  // -----------------------------------------------------------------------
  // Ledger 537-545: every delete of an own custom food is SOFT.
  describe("DELETE /api/foods/:id (soft)", () => {
    async function del(user: TestUser, id: string) {
      return app.inject({ method: "DELETE", url: `/api/foods/${id}`, headers: { cookie: user.cookie } });
    }
    async function detailOf(user: TestUser | null, slug: string) {
      return app.inject({ method: "GET", url: `/api/foods/${slug}`, headers: user ? { cookie: user.cookie } : {} });
    }

    it("hides an unused food from the list, search and filters, but still loads it by slug, marked", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain", allergenSlugs: ["peanut"] });
      expect((await del(owner, mine.id)).statusCode).toBe(204);

      for (const query of ["", "?q=bread", "?category=grain", "?allergen=peanut"]) {
        expect((await listFoods(owner, query)).foods.map((f) => f.slug), query).not.toContain(mine.slug);
      }

      const detail = await detailOf(owner, mine.slug);
      expect(detail.statusCode).toBe(200);
      const body = detail.json<FoodDetail>();
      expect(body.deletedAt).toEqual(expect.any(String));
      expect(body.usage).toEqual({ mealCount: 0, storageCount: 0, recipeCount: 0 });
      // The row and its allergen links stay — a restore brings it all back.
      const links = await db.select().from(schema.foodAllergens).where(eq(schema.foodAllergens.foodId, mine.id));
      expect(links).toHaveLength(1);
    });

    it("is idempotent: a repeat delete is a 204 that keeps the first time", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain" });
      await del(owner, mine.id);
      const first = (await detailOf(owner, mine.slug)).json<FoodDetail>().deletedAt;
      expect((await del(owner, mine.id)).statusCode).toBe(204);
      expect((await detailOf(owner, mine.slug)).json<FoodDetail>().deletedAt).toBe(first);
    });

    it("keeps every meal, storage and recipe row that names it, marked deleted, and leaves allergen progress alone", async () => {
      const mine = await createFood(owner, { name: "Satay sauce", category: "protein", allergenSlugs: ["peanut"] });
      const babyId = await createBaby(owner);
      const meal = (await postMeal(owner, babyId, [mine.id, fixtures.banana.id])).json<MealItem>();
      await app.inject({
        method: "POST",
        url: "/api/storage",
        headers: { cookie: owner.cookie },
        payload: { foodIds: [mine.id], location: "fridge" },
      });
      const recipe = await app.inject({
        method: "POST",
        url: "/api/recipes",
        headers: { cookie: owner.cookie },
        payload: { title: "Satay noodles", minAgeMonths: 6, ingredients: [{ foodId: mine.id }] },
      });
      const progressUrl = `/api/babies/${babyId}/allergen-progress`;
      const before = (await app.inject({ method: "GET", url: progressUrl, headers: { cookie: owner.cookie } })).json();

      expect((await del(owner, mine.id)).statusCode).toBe(204);

      const meals = await app.inject({ method: "GET", url: `/api/babies/${babyId}/meals`, headers: { cookie: owner.cookie } });
      const foods = meals.json<MealsResponse>().items[0]!.foods;
      // Its allergen chip rides on the meal itself, so it outlives the food.
      expect(foods.find((f) => f.id === mine.id)).toMatchObject({ name: "Satay sauce", deleted: true, allergens: ["peanut"] });
      expect(foods.find((f) => f.id === fixtures.banana.id)).toMatchObject({ deleted: false });

      const storage = await app.inject({ method: "GET", url: "/api/storage?view=active", headers: { cookie: owner.cookie } });
      expect(storage.json<StorageResponse>().items[0]!.foods).toEqual([
        expect.objectContaining({ id: mine.id, deleted: true }),
      ]);

      const recipeDetail = await app.inject({
        method: "GET",
        url: `/api/recipes/${recipe.json<RecipeDetail>().id}`,
        headers: { cookie: owner.cookie },
      });
      expect(recipeDetail.json<RecipeDetail>().ingredients[0]).toMatchObject({ foodId: mine.id, deleted: true });
      const recipeList = await app.inject({ method: "GET", url: "/api/recipes?scope=custom", headers: { cookie: owner.cookie } });
      expect(recipeList.json<RecipesResponse>().recipes[0]).toMatchObject({
        ingredientNames: ["Satay sauce"],
        ingredientDeleted: [true],
      });

      // History still counts it: the ladder is unchanged, and the allergen
      // page still lists the food (marked) and the meal that exposed.
      const after = (await app.inject({ method: "GET", url: progressUrl, headers: { cookie: owner.cookie } })).json();
      expect(after).toEqual(before);
      const allergen = await app.inject({
        method: "GET",
        url: `${progressUrl}/peanut`,
        headers: { cookie: owner.cookie },
      });
      const peanut = allergen.json<AllergenDetail>();
      expect(peanut.foods).toEqual([expect.objectContaining({ id: mine.id, deleted: true })]);
      expect(peanut.exposures.map((e) => e.mealId)).toEqual([meal.id]);
      expect(peanut.exposures[0]!.foods).toEqual([expect.objectContaining({ id: mine.id, deleted: true })]);

      // The owner's usage counts ride on the detail for the delete prompt.
      expect((await detailOf(owner, mine.slug)).json<FoodDetail>().usage).toEqual({
        mealCount: 1,
        storageCount: 1,
        recipeCount: 1,
      });

      // Editing the old meal resends the deleted food and still saves; a NEW
      // container can't be made from it (only a stale picker would try).
      const edit = await app.inject({
        method: "PATCH",
        url: `/api/meals/${meal.id}`,
        headers: { cookie: owner.cookie },
        payload: { foodIds: [mine.id, fixtures.banana.id], notes: "loved it" },
      });
      expect(edit.statusCode).toBe(200);
      const stock = await app.inject({
        method: "POST",
        url: "/api/storage",
        headers: { cookie: owner.cookie },
        payload: { foodIds: [mine.id], location: "fridge" },
      });
      expect(stock.statusCode).toBe(400);

      // Nothing was removed.
      expect(await db.select().from(schema.mealFoods).where(eq(schema.mealFoods.foodId, mine.id))).toHaveLength(1);
      expect(
        await db.select().from(schema.storageItemFoods).where(eq(schema.storageItemFoods.foodId, mine.id)),
      ).toHaveLength(1);
    });

    it("refuses a deleted food in a NEW meal or recipe, and as an addition to one, but keeps it where it already is", async () => {
      const kept = await createFood(owner, { name: "Satay sauce", category: "protein" });
      const later = await createFood(owner, { name: "Banana bread", category: "grain" });
      const babyId = await createBaby(owner);
      const meal = (await postMeal(owner, babyId, [kept.id, fixtures.banana.id])).json<MealItem>();
      const recipe = (
        await app.inject({
          method: "POST",
          url: "/api/recipes",
          headers: { cookie: owner.cookie },
          payload: { title: "Satay noodles", minAgeMonths: 6, ingredients: [{ foodId: kept.id }] },
        })
      ).json<RecipeDetail>();
      await del(owner, kept.id);
      await del(owner, later.id);

      const patchMeal = (foodIds: string[]) =>
        app.inject({ method: "PATCH", url: `/api/meals/${meal.id}`, headers: { cookie: owner.cookie }, payload: { foodIds } });
      const recipeWrite = (method: "POST" | "PATCH", url: string, foodIds: string[]) =>
        app.inject({
          method,
          url,
          headers: { cookie: owner.cookie },
          payload: { title: "Satay noodles", minAgeMonths: 6, ingredients: foodIds.map((foodId) => ({ foodId })) },
        });

      // New entries: a deleted food reads as unknown.
      expect((await postMeal(owner, babyId, [later.id])).statusCode).toBe(400);
      expect((await postMeal(owner, babyId, [kept.id])).statusCode).toBe(400);
      expect((await recipeWrite("POST", "/api/recipes", [later.id])).statusCode).toBe(400);
      // Adding one to an existing entry is refused too.
      expect((await patchMeal([kept.id, fixtures.banana.id, later.id])).statusCode).toBe(400);
      expect((await recipeWrite("PATCH", `/api/recipes/${recipe.id}`, [kept.id, later.id])).statusCode).toBe(400);
      // Editing an entry that already holds it resends it, and that stands.
      expect((await patchMeal([kept.id])).statusCode).toBe(200);
      expect((await recipeWrite("PATCH", `/api/recipes/${recipe.id}`, [kept.id, fixtures.banana.id])).statusCode).toBe(200);
      expect(await db.select().from(schema.mealFoods).where(eq(schema.mealFoods.foodId, later.id))).toEqual([]);
      expect(await db.select().from(schema.recipeIngredients).where(eq(schema.recipeIngredients.foodId, later.id))).toEqual([]);
    });

    it("keeps a deleted food out of the AI prep-guidance tool", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain" });
      await del(owner, mine.id);
      const tools = buildChatTools(db, await userId(owner), null);
      const answer = await tools.get_food_prep_guidance.run({ foodSlug: mine.slug, ageStage: "9" });
      expect(String(answer)).toContain("No catalog food found");
    });

    it("refuses to edit a deleted food — its page is read-only until restored", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain" });
      await del(owner, mine.id);
      const response = await app.inject({
        method: "PATCH",
        url: `/api/foods/${mine.id}`,
        headers: { cookie: owner.cookie },
        payload: { name: "Zucchini bread" },
      });
      expect(response.statusCode).toBe(409);
      expect((await detailOf(owner, mine.slug)).json<FoodDetail>().name).toBe("Banana bread");
    });

    it("never blocks creating a new food with the same name", async () => {
      const first = await createFood(owner, { name: "Banana bread", category: "grain" });
      await del(owner, first.id);
      const second = await createFood(owner, { name: "Banana bread", category: "grain" });
      expect(second.slug).not.toBe(first.slug);
      expect((await listFoods(owner, "?q=bread")).foods.map((f) => f.id)).toEqual([second.id]);
    });

    it("shows usage only to the owner, and never on a catalog food", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain" });
      expect((await detailOf(owner, mine.slug)).json<FoodDetail>().usage).toEqual({
        mealCount: 0,
        storageCount: 0,
        recipeCount: 0,
      });
      expect((await detailOf(owner, "banana")).json<FoodDetail>().usage).toBeUndefined();
      expect((await detailOf(null, "banana")).json<FoodDetail>().usage).toBeUndefined();
    });

    it("404s another user's food, a catalog food and an unknown id", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain" });

      for (const [cookie, id] of [
        [intruder.cookie, mine.id],
        [owner.cookie, fixtures.banana.id],
        [owner.cookie, UNKNOWN_ID],
      ] as const) {
        const response = await app.inject({ method: "DELETE", url: `/api/foods/${id}`, headers: { cookie } });
        expect(response.statusCode, `${id}`).toBe(404);
      }

      // Neither food went anywhere, and neither is marked.
      const rows = await db.select().from(schema.foods);
      expect(rows.map((row) => row.slug).sort()).toEqual(["banana", mine.slug].sort());
      expect(rows.every((row) => row.deletedAt === null)).toBe(true);
    });
  });

  describe("GET /api/foods?deleted=1 (Foods › Deleted)", () => {
    it("lists only the caller's own deleted foods", async () => {
      const gone = await createFood(owner, { name: "Banana bread", category: "grain" });
      const live = await createFood(owner, { name: "Oat bars", category: "grain" });
      const theirs = await createFood(intruder, { name: "Papa's lentil stew", category: "legume" });
      for (const [user, id] of [
        [owner, gone.id],
        [intruder, theirs.id],
      ] as const) {
        await app.inject({ method: "DELETE", url: `/api/foods/${id}`, headers: { cookie: user.cookie } });
      }

      for (const query of ["?deleted=1", "?deleted=true"]) {
        expect((await listFoods(owner, query)).foods.map((f) => f.id), query).toEqual([gone.id]);
      }
      expect((await listFoods(owner, "?deleted=1&q=bread")).foods.map((f) => f.id)).toEqual([gone.id]);
      expect((await listFoods(owner, "?deleted=1&q=oat")).foods).toEqual([]);
      expect((await listFoods(intruder, "?deleted=1")).foods.map((f) => f.id)).toEqual([theirs.id]);
      expect((await listFoods(null, "?deleted=1")).foods).toEqual([]);
      // Off is the plain list: live foods, no deleted ones.
      const plain = (await listFoods(owner, "?deleted=0")).foods.map((f) => f.id);
      expect(plain).toContain(live.id);
      expect(plain).not.toContain(gone.id);
    });
  });

  describe("POST /api/foods/:id/restore", () => {
    it("brings a deleted food back into the lists and clears the mark on its history", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain" });
      const babyId = await createBaby(owner);
      await postMeal(owner, babyId, [mine.id]);
      await app.inject({ method: "DELETE", url: `/api/foods/${mine.id}`, headers: { cookie: owner.cookie } });

      const restored = await app.inject({
        method: "POST",
        url: `/api/foods/${mine.id}/restore`,
        headers: { cookie: owner.cookie },
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json<FoodDetail>()).toMatchObject({ id: mine.id, deletedAt: null });
      expect((await listFoods(owner)).foods.map((f) => f.id)).toContain(mine.id);
      expect((await listFoods(owner, "?deleted=1")).foods).toEqual([]);
      const meals = await app.inject({ method: "GET", url: `/api/babies/${babyId}/meals`, headers: { cookie: owner.cookie } });
      expect(meals.json<MealsResponse>().items[0]!.foods[0]).toMatchObject({ id: mine.id, deleted: false });
    });

    it("404s another user's food, a catalog food and an unknown id; 401s anonymously", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain" });
      await app.inject({ method: "DELETE", url: `/api/foods/${mine.id}`, headers: { cookie: owner.cookie } });

      for (const [cookie, id] of [
        [intruder.cookie, mine.id],
        [owner.cookie, fixtures.banana.id],
        [owner.cookie, UNKNOWN_ID],
      ] as const) {
        const response = await app.inject({ method: "POST", url: `/api/foods/${id}/restore`, headers: { cookie } });
        expect(response.statusCode, `${id}`).toBe(404);
      }
      const anonymous = await app.inject({ method: "POST", url: `/api/foods/${mine.id}/restore` });
      expect(anonymous.statusCode).toBe(401);

      // Still deleted: nobody but the owner can undo it.
      const [row] = await db.select().from(schema.foods).where(eq(schema.foods.id, mine.id));
      expect(row!.deletedAt).not.toBeNull();
    });
  });

  describe("POST /api/foods/:id/replace", () => {
    async function insertCatalogFood(slug: string, name: string) {
      const [row] = await db
        .insert(schema.foods)
        .values({
          slug,
          name,
          category: "veg",
          ironLevel: "low",
          vitaminCLevel: "high",
          chokingRisk: "low",
          minAgeMonths: 6,
          prep6m: "steam",
          prep9m: "florets",
          prep12m: "bites",
          storageCategory: "produce_cooked",
        })
        .returning();
      return row!;
    }

    async function replace(user: TestUser | null, id: string, replacementId: unknown) {
      return app.inject({
        method: "POST",
        url: `/api/foods/${id}/replace`,
        headers: user ? { cookie: user.cookie } : {},
        payload: { replacementId },
      });
    }

    async function stock(user: TestUser, foodIds: string[]): Promise<string> {
      const response = await app.inject({
        method: "POST",
        url: "/api/storage",
        headers: { cookie: user.cookie },
        payload: { foodIds, location: "fridge" },
      });
      return response.json<CreateStorageItemResponse>().items[0]!.id;
    }

    async function recipeWith(user: TestUser, ingredients: { foodId: string; quantityNote?: string }[]): Promise<string> {
      const response = await app.inject({
        method: "POST",
        url: "/api/recipes",
        headers: { cookie: user.cookie },
        payload: { title: "Mash", minAgeMonths: 6, ingredients },
      });
      return response.json<RecipeDetail>().id;
    }

    const rowsOf = async (foodId: string) => ({
      meals: await db.select().from(schema.mealFoods).where(eq(schema.mealFoods.foodId, foodId)),
      storage: await db.select().from(schema.storageItemFoods).where(eq(schema.storageItemFoods.foodId, foodId)),
      recipes: await db.select().from(schema.recipeIngredients).where(eq(schema.recipeIngredients.foodId, foodId)),
    });

    it("re-points meals, containers and recipes in one go, merging where the entry already held the replacement", async () => {
      const cauliflower = await insertCatalogFood("cauliflower", "Cauliflower");
      const mine = await createFood(owner, { name: "cauliflower", category: "veg", allergenSlugs: ["egg"] });
      const babyId = await createBaby(owner);
      const onlyMine = (await postMeal(owner, babyId, [mine.id])).json<MealItem>().id;
      const both = (await postMeal(owner, babyId, [mine.id, cauliflower.id])).json<MealItem>().id;
      const boxMineFirst = await stock(owner, [mine.id, fixtures.banana.id]);
      const boxBoth = await stock(owner, [cauliflower.id, mine.id]);
      const recipeMine = await recipeWith(owner, [{ foodId: mine.id, quantityNote: "1 cup" }]);
      const recipeBoth = await recipeWith(owner, [
        { foodId: mine.id, quantityNote: "a handful" },
        { foodId: cauliflower.id, quantityNote: "2 florets" },
      ]);

      const response = await replace(owner, mine.id, cauliflower.id);
      expect(response.statusCode).toBe(200);
      expect(response.json<ReplaceCustomFoodResponse>()).toEqual({
        replacement: { id: cauliflower.id, slug: "cauliflower", name: "Cauliflower" },
        // Every entry that now carries the replacement, merged ones included.
        moved: { mealCount: 2, storageCount: 2, recipeCount: 2 },
      });

      // Nothing names the old food, and it is gone for good with its links.
      expect(await rowsOf(mine.id)).toEqual({ meals: [], storage: [], recipes: [] });
      expect(await db.select().from(schema.foods).where(eq(schema.foods.id, mine.id))).toEqual([]);
      expect(
        await db.select().from(schema.foodAllergens).where(eq(schema.foodAllergens.foodId, mine.id)),
      ).toEqual([]);

      const moved = await rowsOf(cauliflower.id);
      expect(moved.meals.map((row) => row.mealId).sort()).toEqual([onlyMine, both].sort());
      // A merged container keeps one row; a re-pointed one keeps its order.
      expect(moved.storage.filter((row) => row.storageItemId === boxBoth)).toHaveLength(1);
      const box = await app.inject({ method: "GET", url: "/api/storage?view=active", headers: { cookie: owner.cookie } });
      const boxFoods = box.json<StorageResponse>().items.find((item) => item.id === boxMineFirst)!.foods;
      expect(boxFoods.map((f) => f.id)).toEqual([cauliflower.id, fixtures.banana.id]);
      // A re-pointed ingredient keeps its quantity; a merged one keeps the
      // replacement's own row.
      expect(moved.recipes.map((row) => [row.recipeId, row.quantityNote]).sort()).toEqual(
        [
          [recipeMine, "1 cup"],
          [recipeBoth, "2 florets"],
        ].sort(),
      );
    });

    it("carries a merged meal row's storage provenance onto the kept replacement row", async () => {
      const cauliflower = await insertCatalogFood("cauliflower", "Cauliflower");
      const mine = await createFood(owner, { name: "cauliflower", category: "veg" });
      const babyId = await createBaby(owner);
      const both = (await postMeal(owner, babyId, [mine.id, cauliflower.id])).json<MealItem>().id;
      const box = await stock(owner, [mine.id]);
      await db
        .update(schema.mealFoods)
        .set({ storageItemId: box })
        .where(and(eq(schema.mealFoods.mealId, both), eq(schema.mealFoods.foodId, mine.id)));

      expect((await replace(owner, mine.id, cauliflower.id)).statusCode).toBe(200);

      expect((await rowsOf(cauliflower.id)).meals).toEqual([expect.objectContaining({ mealId: both, storageItemId: box })]);
    });

    it("works on a food that was already deleted, and leaves another user's rows untouched", async () => {
      const cauliflower = await insertCatalogFood("cauliflower", "Cauliflower");
      const mine = await createFood(owner, { name: "cauliflower", category: "veg" });
      const babyId = await createBaby(owner);
      await postMeal(owner, babyId, [mine.id]);
      await app.inject({ method: "DELETE", url: `/api/foods/${mine.id}`, headers: { cookie: owner.cookie } });

      const theirBaby = await createBaby(intruder);
      const theirFood = await createFood(intruder, { name: "cauliflower", category: "veg" });
      await postMeal(intruder, theirBaby, [theirFood.id, cauliflower.id]);
      await stock(intruder, [theirFood.id]);
      await recipeWith(intruder, [{ foodId: theirFood.id }]);
      const theirsBefore = await rowsOf(theirFood.id);
      const cauliBefore = await rowsOf(cauliflower.id);

      expect((await replace(owner, mine.id, cauliflower.id)).statusCode).toBe(200);

      expect(await rowsOf(theirFood.id)).toEqual(theirsBefore);
      const cauliAfter = await rowsOf(cauliflower.id);
      // Exactly the owner's one meal joined the intruder's existing row.
      expect(cauliAfter.meals).toHaveLength(cauliBefore.meals.length + 1);
      expect(cauliAfter.meals).toEqual(expect.arrayContaining(cauliBefore.meals));
    });

    it("refuses what it must: someone else's food, a catalog food, itself, a deleted or foreign replacement", async () => {
      const cauliflower = await insertCatalogFood("cauliflower", "Cauliflower");
      const mine = await createFood(owner, { name: "cauliflower", category: "veg" });
      const myDeleted = await createFood(owner, { name: "Old cauliflower", category: "veg" });
      await app.inject({ method: "DELETE", url: `/api/foods/${myDeleted.id}`, headers: { cookie: owner.cookie } });
      const theirs = await createFood(intruder, { name: "Their cauliflower", category: "veg" });
      const babyId = await createBaby(owner);
      await postMeal(owner, babyId, [mine.id]);

      const cases: Array<[TestUser | null, string, unknown, number]> = [
        [intruder, mine.id, cauliflower.id, 404], // not their food
        [owner, fixtures.banana.id, cauliflower.id, 404], // a catalog food is nobody's to replace
        [owner, UNKNOWN_ID, cauliflower.id, 404],
        [owner, mine.id, mine.id, 400], // itself
        [owner, mine.id, myDeleted.id, 404], // a deleted replacement
        [owner, mine.id, theirs.id, 404], // someone else's custom food
        [owner, mine.id, UNKNOWN_ID, 404],
        [owner, mine.id, "not-a-uuid", 400],
        [null, mine.id, cauliflower.id, 401],
      ];
      for (const [user, id, replacementId, status] of cases) {
        expect((await replace(user, id, replacementId)).statusCode, `${id} -> ${String(replacementId)}`).toBe(status);
      }

      // Every refusal changed nothing.
      expect((await rowsOf(mine.id)).meals).toHaveLength(1);
      expect(await db.select().from(schema.foods).where(eq(schema.foods.id, mine.id))).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Allergen exposure (item 175)
  // -----------------------------------------------------------------------
  describe("allergen exposure", () => {
    it("counts a custom food's allergen exactly like a catalog food's", async () => {
      const peanutFood = await createFood(owner, {
        name: "Satay sauce",
        category: "protein",
        allergenSlugs: ["peanut"],
      });
      const babyId = await createBaby(owner);
      const meal = await postMeal(owner, babyId, [peanutFood.id]);
      expect(meal.statusCode).toBe(201);

      const progress = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: owner.cookie },
      });
      const items = progress.json<AllergenProgressResponse>().items;

      const peanut = items.find((item) => item.allergenSlug === "peanut");
      expect(peanut).toMatchObject({ status: "started", exposures: 1, overridden: false });
      expect(peanut?.firstAt).toBeTruthy();
      expect(peanut?.lastServedAt).toBeTruthy();

      // Untouched neighbours: an allergen nothing was served for is still
      // not_started, and the manual override path still promotes on its own.
      expect(items.find((item) => item.allergenSlug === "egg")).toMatchObject({
        status: "not_started",
        exposures: 0,
      });

      const override = await app.inject({
        method: "PUT",
        url: `/api/babies/${babyId}/allergens/egg/established`,
        headers: { cookie: owner.cookie },
      });
      expect(override.statusCode).toBe(204);

      const afterOverride = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: owner.cookie },
      });
      const overrideItems = afterOverride.json<AllergenProgressResponse>().items;
      expect(overrideItems.find((item) => item.allergenSlug === "egg")).toMatchObject({
        status: "established",
        overridden: true,
      });
      // The custom food's own exposure is unaffected by the override.
      expect(overrideItems.find((item) => item.allergenSlug === "peanut")).toMatchObject({
        status: "started",
        exposures: 1,
      });
    });

    it("puts a custom food into the AI exposure snapshot with its allergen class", async () => {
      const peanutFood = await createFood(owner, {
        name: "Satay sauce",
        category: "protein",
        allergenSlugs: ["peanut"],
      });
      const babyId = await createBaby(owner);
      await postMeal(owner, babyId, [peanutFood.id, fixtures.banana.id]);

      const snapshot = await buildExposureSnapshot(db, babyId, new Date(Date.now() + 60_000));
      const satay = snapshot.find((item) => item.foodSlug === peanutFood.slug);

      expect(satay).toMatchObject({
        foodName: "Satay sauce",
        allergenClass: "peanut",
        isTop9: true,
        firstExposure: true,
        timesServedEver: 1,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Account deletion (item 176's other half)
  // -----------------------------------------------------------------------
  it("takes a user's custom foods with the account, leaving other accounts' alone", async () => {
    const mine = await createFood(owner, { name: "Banana bread", category: "grain", allergenSlugs: ["peanut"] });
    const theirs = await createFood(intruder, { name: "Papa's lentil stew", category: "legume" });

    // Referenced by a meal and a storage item, the two FKs that do NOT
    // cascade from foods — the account delete has to take those with it.
    const babyId = await createBaby(owner);
    await postMeal(owner, babyId, [mine.id]);
    await app.inject({
      method: "POST",
      url: "/api/storage",
      headers: { cookie: owner.cookie },
      payload: { foodIds: [mine.id], location: "fridge" },
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      headers: { cookie: owner.cookie },
      payload: { confirm: "DELETE MY ACCOUNT", password: owner.password },
    });
    expect(response.statusCode).toBe(204);

    const remaining = await db.select().from(schema.foods);
    expect(remaining.map((row) => row.slug).sort()).toEqual(["banana", theirs.slug].sort());

    const links = await db
      .select()
      .from(schema.foodAllergens)
      .where(and(eq(schema.foodAllergens.foodId, mine.id), eq(schema.foodAllergens.allergenId, fixtures.peanut.id)));
    expect(links).toHaveLength(0);
  });
});
