// Ledger 836 + 838: ingredient and info foods, and what counts toward the
// allergen ladder.
//
// - Exposures count once per meal: yogurt + cheese in one sitting is 1 serving.
// - A tag with counts_toward_progress = false (butter and whole milk -> Milk,
//   sesame oil -> Sesame) never starts an allergen, adds a serving or moves
//   the dates — but a reaction after such a meal still shows.
// - "Foods tried" leaves out 'info' foods (whole milk).
// - An 'info' food logs and stores like any food (ledger 855); it stays out
//   of "foods tried" and its tag still never counts.
//
// Fixture content only (not the real seeds), like tracking.test.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type {
  AllergenDetail,
  AllergenProgressItem,
  AllergenProgressResponse,
  Baby,
  FoodsResponse,
  MealItem,
} from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

async function seedFixtures(db: Database) {
  await db.insert(schema.storageGuidelines).values([
    { category: "dairy_soft", fridgeHours: 48, freezerDays: null, roomTempHours: 2, notes: "Dairy." },
    { category: "produce_cooked", fridgeHours: 48, freezerDays: 60, roomTempHours: 2, notes: "Cooked produce." },
  ]);
  const [milkAllergen, eggAllergen, sesameAllergen] = await db
    .insert(schema.allergens)
    .values([
      { slug: "milk", name: "Milk", introGuidance: "Yogurt first." },
      { slug: "egg", name: "Egg", introGuidance: "Well-cooked egg." },
      { slug: "sesame", name: "Sesame", introGuidance: "Thinned tahini." },
    ])
    .returning();
  const base = {
    ironLevel: "low",
    vitaminCLevel: "low",
    chokingRisk: "low",
    minAgeMonths: 6,
    prep6m: "p",
    prep9m: "p",
    prep12m: "p",
    storageCategory: "dairy_soft",
  } as const;
  const rows = await db
    .insert(schema.foods)
    .values([
      { ...base, slug: "yogurt", name: "Yogurt", category: "dairy" },
      { ...base, slug: "cheese", name: "Cheese", category: "dairy" },
      { ...base, slug: "milk", name: "Whole Milk", category: "dairy", kind: "info" },
      { ...base, slug: "unsalted_butter", name: "Unsalted Butter", category: "dairy", kind: "ingredient" },
      { ...base, slug: "egg", name: "Egg", category: "protein" },
      { ...base, slug: "tahini", name: "Tahini", category: "protein" },
      { ...base, slug: "sesame_oil", name: "Sesame Oil", category: "protein", kind: "ingredient" },
      { ...base, slug: "banana", name: "Banana", category: "fruit", storageCategory: "produce_cooked" },
    ])
    .returning();
  const food = Object.fromEntries(rows.map((row) => [row.slug, row])) as Record<string, (typeof rows)[number]>;
  await db.insert(schema.foodAllergens).values([
    { foodId: food.yogurt!.id, allergenId: milkAllergen!.id },
    { foodId: food.cheese!.id, allergenId: milkAllergen!.id },
    { foodId: food.milk!.id, allergenId: milkAllergen!.id, countsTowardProgress: false },
    { foodId: food.unsalted_butter!.id, allergenId: milkAllergen!.id, countsTowardProgress: false },
    { foodId: food.egg!.id, allergenId: eggAllergen!.id },
    { foodId: food.tahini!.id, allergenId: sesameAllergen!.id },
    { foodId: food.sesame_oil!.id, allergenId: sesameAllergen!.id, countsTowardProgress: false },
  ]);
  await db.insert(schema.allergenLadderSteps).values([
    { step: 1, allergenId: milkAllergen!.id, starterFoodId: food.yogurt!.id, howTo: "Yogurt.", waitDays: 3 },
    { step: 2, allergenId: sesameAllergen!.id, starterFoodId: food.tahini!.id, howTo: "Tahini.", waitDays: 3 },
  ]);
  const [eggBake] = await db
    .insert(schema.recipes)
    .values({ slug: "egg-bake", title: "Egg Bake", minAgeMonths: 6, prepMinutes: 60, ironFocus: true })
    .returning();
  await db.insert(schema.recipeIngredients).values([
    { recipeId: eggBake!.id, foodId: food.egg!.id, quantityNote: "6 eggs" },
    { recipeId: eggBake!.id, foodId: food.milk!.id, quantityNote: "1/4 cup" },
    { recipeId: eggBake!.id, foodId: food.unsalted_butter!.id, quantityNote: "1 tsp" },
  ]);
  return { food, eggBake: eggBake! };
}

describe("ingredient foods and ladder counting (ledger 836, 838)", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let fx: Awaited<ReturnType<typeof seedFixtures>>;
  let user: TestUser;
  let babyId: string;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    fx = await seedFixtures(db);
    user = await signUpUser(app);
    const baby = await app.inject({
      method: "POST",
      url: "/api/babies",
      headers: { cookie: user.cookie },
      payload: { name: "Robin", birthDate: "2025-01-15" },
    });
    babyId = baby.json<Baby>().id;
  });

  afterEach(async () => {
    await close();
  });

  const id = (slug: string) => fx.food[slug]!.id;

  async function post(url: string, payload: Record<string, unknown>) {
    return app.inject({ method: "POST", url, headers: { cookie: user.cookie }, payload });
  }

  async function meal(payload: Record<string, unknown>): Promise<MealItem> {
    const response = await post(`/api/babies/${babyId}/meals`, payload);
    if (response.statusCode !== 201) throw new Error(`meal ${response.statusCode}: ${response.body}`);
    return response.json<MealItem>();
  }

  async function progress(): Promise<AllergenProgressResponse> {
    const response = await app.inject({
      method: "GET",
      url: `/api/babies/${babyId}/allergen-progress`,
      headers: { cookie: user.cookie },
    });
    return response.json<AllergenProgressResponse>();
  }

  async function row(slug: string): Promise<AllergenProgressItem> {
    return (await progress()).items.find((item) => item.allergenSlug === slug)!;
  }

  async function detail(slug: string): Promise<AllergenDetail> {
    const response = await app.inject({
      method: "GET",
      url: `/api/babies/${babyId}/allergen-progress/${slug}`,
      headers: { cookie: user.cookie },
    });
    return response.json<AllergenDetail>();
  }

  describe("counting", () => {
    it("counts two milk foods in one meal as one serving", async () => {
      await meal({ foodIds: [id("yogurt"), id("cheese")], servedAt: "2026-03-01T08:00:00.000Z" });
      expect(await row("milk")).toMatchObject({ exposures: 1, status: "started" });
    });

    it("leaves Milk not started after butter-only meals, with no dates, but keeps the reaction badge", async () => {
      await meal({ foodIds: [id("unsalted_butter"), id("banana")], servedAt: "2026-03-01T08:00:00.000Z" });
      await meal({ foodIds: [id("unsalted_butter")], servedAt: "2026-03-02T08:00:00.000Z", reactionNote: "hives" });
      expect(await row("milk")).toMatchObject({
        exposures: 0,
        status: "not_started",
        firstAt: null,
        lastServedAt: null,
        lastExposureAt: null,
        dueAt: null,
        // A safety flag, not progress: a reaction after butter still shows.
        reactionNotedAt: "2026-03-02T08:00:00.000Z",
      });
    });

    it("counts the egg bake for Egg but not for Milk, however many milk foods it carries", async () => {
      await meal({
        recipeIds: [fx.eggBake.id],
        foodIds: [id("egg"), id("milk"), id("unsalted_butter")],
        servedAt: "2026-03-01T08:00:00.000Z",
      });
      expect(await row("egg")).toMatchObject({ exposures: 1, status: "started" });
      expect(await row("milk")).toMatchObject({ exposures: 0, status: "not_started" });
    });

    it("never resets the countdown or establishes from a non-counting meal", async () => {
      for (const day of ["01", "02", "03"]) {
        await meal({ foodIds: [id("yogurt")], servedAt: `2026-03-${day}T08:00:00.000Z` });
      }
      await meal({ foodIds: [id("unsalted_butter")], servedAt: "2026-03-20T08:00:00.000Z" });
      expect(await row("milk")).toMatchObject({
        exposures: 3,
        status: "established",
        lastServedAt: "2026-03-03T08:00:00.000Z",
      });
      // Sesame oil alone never starts Sesame; tahini in the same meal does.
      await meal({ foodIds: [id("sesame_oil")], servedAt: "2026-03-04T08:00:00.000Z" });
      expect(await row("sesame")).toMatchObject({ exposures: 0, status: "not_started" });
      await meal({ foodIds: [id("sesame_oil"), id("tahini")], servedAt: "2026-03-05T08:00:00.000Z" });
      expect(await row("sesame")).toMatchObject({ exposures: 1, status: "started" });
    });

    it("leaves whole milk out of foods tried, but not butter or the rest", async () => {
      await meal({
        recipeIds: [fx.eggBake.id],
        foodIds: [id("egg"), id("milk"), id("unsalted_butter")],
        servedAt: "2026-03-01T08:00:00.000Z",
      });
      expect((await progress()).foodsTried).toBe(2);
    });
  });

  describe("the allergen detail page's data", () => {
    it("flags each food's tag and each meal that did not count, and keeps both meals listed", async () => {
      const butterMeal = await meal({ foodIds: [id("unsalted_butter")], servedAt: "2026-03-02T08:00:00.000Z" });
      const mixed = await meal({ foodIds: [id("yogurt"), id("unsalted_butter")], servedAt: "2026-03-01T08:00:00.000Z" });

      const milk = await detail("milk");
      expect(milk.foods.map((f) => [f.slug, f.kind, f.countsTowardProgress])).toEqual([
        ["cheese", "food", true],
        ["unsalted_butter", "ingredient", false],
        ["milk", "info", false],
        ["yogurt", "food", true],
      ]);
      expect(milk.exposures.map((e) => [e.mealId, e.counted])).toEqual([
        [butterMeal.id, false],
        [mixed.id, true],
      ]);
      expect(milk.exposures[1]!.foods.map((f) => [f.name, f.kind])).toEqual([
        ["Unsalted Butter", "ingredient"],
        ["Yogurt", "food"],
      ]);
      expect(milk.progress).toMatchObject({ exposures: 1, firstAt: "2026-03-01T08:00:00.000Z" });
    });

    it("names the ladder's starter food, Up next's pick after a meal that didn't count (ledger 857)", async () => {
      expect((await detail("milk")).starterFoodId).toBe(id("yogurt"));
      expect((await detail("sesame")).starterFoodId).toBe(id("tahini"));
      // No ladder step for this allergen in the fixtures.
      expect((await detail("egg")).starterFoodId).toBeNull();
    });
  });

  describe("an info food logs and stores like any food (ledger 855, parents decide)", () => {
    it("takes whole milk on a hand-logged meal and in an edit, and it still never counts or is a food tried", async () => {
      const alone = await meal({ foodIds: [id("milk")], servedAt: "2026-03-01T08:00:00.000Z" });
      expect(alone.foods.map((f) => f.slug)).toEqual(["milk"]);
      const plain = await meal({ foodIds: [id("banana")], servedAt: "2026-03-02T08:00:00.000Z" });
      const added = await app.inject({
        method: "PATCH",
        url: `/api/meals/${plain.id}`,
        headers: { cookie: user.cookie },
        payload: { foodIds: [id("banana"), id("milk")] },
      });
      expect(added.statusCode).toBe(200);

      expect(await row("milk")).toMatchObject({ exposures: 0, status: "not_started", firstAt: null, lastServedAt: null });
      expect((await progress()).foodsTried).toBe(1); // banana; milk is not a food tried
      expect((await detail("milk")).exposures.map((e) => [e.mealId, e.counted])).toEqual([
        [plain.id, false],
        [alone.id, false],
      ]);
    });

    it("takes whole milk in a container, on create and on edit, and serves it on its own without counting", async () => {
      const created = await post("/api/storage", { foodIds: [id("milk")], location: "fridge" });
      expect(created.statusCode).toBe(201);
      const milkItemId = created.json<{ items: { id: string }[] }>().items[0]!.id;

      const butter = await post("/api/storage", { foodIds: [id("unsalted_butter")], location: "fridge" });
      expect(butter.statusCode).toBe(201);
      const butterItemId = butter.json<{ items: { id: string }[] }>().items[0]!.id;
      const edited = await app.inject({
        method: "PATCH",
        url: `/api/storage/${butterItemId}`,
        headers: { cookie: user.cookie },
        payload: { foodIds: [id("unsalted_butter"), id("milk")] },
      });
      expect(edited.statusCode).toBe(200);

      // Serving: the milk container alone, and fresh milk beside another container.
      const servedAlone = await post("/api/storage/serve", { babyId, parts: [{ storageItemId: milkItemId, servings: 1 }] });
      expect(servedAlone.statusCode).toBe(201);
      const freshMilk = await post("/api/storage/serve", {
        babyId,
        parts: [{ storageItemId: butterItemId, servings: 1 }],
        foodIds: [id("milk")],
      });
      expect(freshMilk.statusCode).toBe(201);
      expect(await row("milk")).toMatchObject({ exposures: 0, status: "not_started" });
      expect((await progress()).foodsTried).toBe(1); // butter only
    });

    it("moves a custom food's uses onto whole milk", async () => {
      const custom = await post("/api/foods", { name: "Oat drink", category: "dairy" });
      expect(custom.statusCode).toBe(201);
      const response = await post(`/api/foods/${custom.json<{ id: string }>().id}/replace`, { replacementId: id("milk") });
      expect(response.statusCode).toBe(200);
    });

    it("tells the client each food's kind", async () => {
      const response = await app.inject({ method: "GET", url: "/api/foods" });
      const kinds = Object.fromEntries(response.json<FoodsResponse>().foods.map((f) => [f.slug, f.kind]));
      expect(kinds).toMatchObject({ milk: "info", unsalted_butter: "ingredient", yogurt: "food" });
      const detailResponse = await app.inject({ method: "GET", url: "/api/foods/milk" });
      expect(detailResponse.json()).toMatchObject({ kind: "info" });
    });
  });
});
