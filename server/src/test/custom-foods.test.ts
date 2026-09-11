import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  AllergenProgressResponse,
  Baby,
  FoodDetail,
  FoodsResponse,
  MealItem,
  StorageItem,
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
      expect(storage.json<StorageItem[]>()[0]?.foodEmoji).toBe("🍲");

      const list = await app.inject({ method: "GET", url: "/api/storage?view=active", headers: { cookie: owner.cookie } });
      expect(list.json<StorageResponse>().items[0]?.foodEmoji).toBe("🍲");
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
  describe("DELETE /api/foods/:id", () => {
    it("deletes an unreferenced food and its allergen links", async () => {
      const mine = await createFood(owner, {
        name: "Banana bread",
        category: "grain",
        allergenSlugs: ["peanut"],
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/foods/${mine.id}`,
        headers: { cookie: owner.cookie },
      });
      expect(response.statusCode).toBe(204);

      const detail = await app.inject({
        method: "GET",
        url: `/api/foods/${mine.slug}`,
        headers: { cookie: owner.cookie },
      });
      expect(detail.statusCode).toBe(404);

      const links = await db.select().from(schema.foodAllergens).where(eq(schema.foodAllergens.foodId, mine.id));
      expect(links).toHaveLength(0);
    });

    it("409s with the reference counts while a meal or storage item still uses it", async () => {
      const mine = await createFood(owner, { name: "Banana bread", category: "grain" });
      const babyId = await createBaby(owner);
      await postMeal(owner, babyId, [mine.id]);
      await app.inject({
        method: "POST",
        url: "/api/storage",
        headers: { cookie: owner.cookie },
        payload: { foodIds: [mine.id], location: "fridge" },
      });

      const blocked = await app.inject({
        method: "DELETE",
        url: `/api/foods/${mine.id}`,
        headers: { cookie: owner.cookie },
      });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json()).toEqual({ error: "conflict", mealCount: 1, storageCount: 1, recipeCount: 0 });

      // Still there — a refused delete changes nothing.
      const stillThere = await app.inject({
        method: "GET",
        url: `/api/foods/${mine.slug}`,
        headers: { cookie: owner.cookie },
      });
      expect(stillThere.statusCode).toBe(200);
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

      // Neither food went anywhere.
      const rows = await db.select().from(schema.foods);
      expect(rows.map((row) => row.slug).sort()).toEqual(["banana", mine.slug].sort());
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
