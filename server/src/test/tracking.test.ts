import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  AllergenProgressItem,
  AllergenProgressResponse,
  Baby,
  FavoritesResponse,
  MealItem,
  MealsResponse,
} from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { fetchBabyProfileSummary } from "../ai/tools.js";

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

// Minimal fixture content (not the real seed data, which lives in
// server/db/seeds and is out of this route file's ownership) — just enough
// to exercise ownership, the allergen-progress derivation, and the
// recipe-favorites allergen join.
async function seedFixtures(db: Database) {
  await db.insert(schema.storageGuidelines).values([
    { category: "egg_dish_cooked", fridgeHours: 96, freezerDays: 30, roomTempHours: 2, notes: "Cooked egg dishes." },
    { category: "produce_cooked", fridgeHours: 48, freezerDays: 60, roomTempHours: 2, notes: "Cooked produce." },
  ]);

  const [egg, banana] = await db
    .insert(schema.foods)
    .values([
      {
        slug: "egg",
        name: "Egg",
        category: "protein",
        ironLevel: "moderate",
        vitaminCLevel: "low",
        chokingRisk: "low",
        minAgeMonths: 6,
        prep6m: "mash",
        prep9m: "chop",
        prep12m: "dice",
        storageCategory: "egg_dish_cooked",
      },
      {
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
      },
    ])
    .returning();

  const [eggAllergen, peanutAllergen] = await db
    .insert(schema.allergens)
    .values([
      { slug: "egg", name: "Egg", introGuidance: "Well-cooked egg, tiny first portion." },
      { slug: "peanut", name: "Peanut", introGuidance: "Thinned smooth peanut butter only." },
    ])
    .returning();

  await db.insert(schema.foodAllergens).values({ foodId: egg!.id, allergenId: eggAllergen!.id });

  const [recipe] = await db
    .insert(schema.recipes)
    .values({ slug: "egg-toast", title: "Egg Toast Fingers", minAgeMonths: 6, prepMinutes: 5, ironFocus: false })
    .returning();
  await db.insert(schema.recipeIngredients).values({ recipeId: recipe!.id, foodId: egg!.id, quantityNote: "1 egg" });

  return { egg: egg!, banana: banana!, eggAllergen: eggAllergen!, peanutAllergen: peanutAllergen!, recipe: recipe! };
}

async function createBaby(app: FastifyInstance, user: TestUser, name = "Robin"): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/babies",
    headers: { cookie: user.cookie },
    payload: { name, birthDate: "2025-01-15" },
  });
  return response.json<Baby>().id;
}

describe("tracking routes", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let fixtures: Awaited<ReturnType<typeof seedFixtures>>;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    fixtures = await seedFixtures(db);
  });

  afterEach(async () => {
    await close();
  });

  /** POST a meal and return the created item, failing loudly on a non-201. */
  async function postMeal(user: TestUser, babyId: string, payload: Record<string, unknown>): Promise<MealItem> {
    const response = await app.inject({
      method: "POST",
      url: `/api/babies/${babyId}/meals`,
      headers: { cookie: user.cookie },
      payload,
    });
    if (response.statusCode !== 201) {
      throw new Error(`meal create failed (${response.statusCode}): ${response.body}`);
    }
    return response.json<MealItem>();
  }

  async function listMeals(user: TestUser, babyId: string, query = ""): Promise<MealsResponse> {
    const response = await app.inject({
      method: "GET",
      url: `/api/babies/${babyId}/meals${query}`,
      headers: { cookie: user.cookie },
    });
    return response.json<MealsResponse>();
  }

  async function progressItems(user: TestUser, babyId: string): Promise<AllergenProgressItem[]> {
    const response = await app.inject({
      method: "GET",
      url: `/api/babies/${babyId}/allergen-progress`,
      headers: { cookie: user.cookie },
    });
    if (response.statusCode !== 200) {
      throw new Error(`allergen-progress failed (${response.statusCode}): ${response.body}`);
    }
    return response.json<AllergenProgressResponse>().items;
  }

  /** The fixture allergen every override test drives. */
  async function eggProgress(user: TestUser, babyId: string): Promise<AllergenProgressItem | undefined> {
    return (await progressItems(user, babyId)).find((item) => item.allergenSlug === "egg");
  }

  function putOverride(user: TestUser, babyId: string, key: string) {
    return app.inject({
      method: "PUT",
      url: `/api/babies/${babyId}/allergens/${key}/established`,
      headers: { cookie: user.cookie },
    });
  }

  function deleteOverride(user: TestUser, babyId: string, key: string) {
    return app.inject({
      method: "DELETE",
      url: `/api/babies/${babyId}/allergens/${key}/established`,
      headers: { cookie: user.cookie },
    });
  }

  /** The `user.id` behind a session cookie, for the direct-call AI helpers. */
  async function userIdFor(user: TestUser): Promise<string> {
    const [account] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, user.email))
      .limit(1);
    if (!account) throw new Error(`no user row for ${user.email}`);
    return account.id;
  }

  describe("meals", () => {
    it("creates, lists, and deletes a meal for an owned baby", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      const created = await postMeal(user, babyId, {
        foodIds: [fixtures.egg.id],
        recipeId: fixtures.recipe.id,
        reactionNote: "  mild rash  ",
      });
      expect(created).toMatchObject({
        babyId,
        recipeId: fixtures.recipe.id,
        recipeTitle: "Egg Toast Fingers",
        reactionNote: "mild rash",
      });
      // A hand-logged meal is never linked to a pantry item: only
      // POST /api/pantry/:id/serve sets pantryItemId.
      expect(created.foods).toEqual([
        // `emoji` is null for every catalog food — only a parent-added food
        // ever carries one.
        { id: fixtures.egg.id, slug: "egg", name: "Egg", category: "protein", emoji: null, pantryItemId: null },
      ]);

      const listBody = await listMeals(user, babyId);
      expect(listBody.items).toHaveLength(1);
      expect(listBody.items[0]?.id).toBe(created.id);
      expect(listBody.items[0]?.foods).toHaveLength(1);

      const del = await app.inject({
        method: "DELETE",
        url: `/api/meals/${created.id}`,
        headers: { cookie: user.cookie },
      });
      expect(del.statusCode).toBe(204);

      expect((await listMeals(user, babyId)).items).toHaveLength(0);
    });

    it("puts a batch of foods in ONE meal, deduping repeated ids", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      const created = await postMeal(user, babyId, {
        foodIds: [fixtures.egg.id, fixtures.banana.id, fixtures.egg.id],
      });
      // Foods come back ordered by name ("Banana" before "Egg").
      expect(created.foods.map((food) => food.slug)).toEqual(["banana", "egg"]);
      expect(created.recipeId).toBeNull();
      expect(created.recipeTitle).toBeNull();

      // One sitting is one meal, however many foods it carried.
      const listBody = await listMeals(user, babyId);
      expect(listBody.items).toHaveLength(1);
      expect(listBody.items[0]?.foods).toHaveLength(2);
    });

    it("lists meals newest first and honours limit + the `before` cursor", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const base = Date.now() - 10 * 60 * 60 * 1000;
      const at = (hours: number) => new Date(base + hours * 60 * 60 * 1000).toISOString();

      const oldest = await postMeal(user, babyId, { foodIds: [fixtures.egg.id], servedAt: at(0) });
      const middle = await postMeal(user, babyId, { foodIds: [fixtures.banana.id], servedAt: at(1) });
      const newest = await postMeal(user, babyId, { foodIds: [fixtures.egg.id], servedAt: at(2) });

      const all = await listMeals(user, babyId);
      expect(all.items.map((item) => item.id)).toEqual([newest.id, middle.id, oldest.id]);

      const limited = await listMeals(user, babyId, "?limit=2");
      expect(limited.items.map((item) => item.id)).toEqual([newest.id, middle.id]);

      const before = await listMeals(user, babyId, `?before=${encodeURIComponent(at(1))}`);
      expect(before.items.map((item) => item.id)).toEqual([oldest.id]);
    });

    it("rejects an empty foodIds array with 400", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      const response = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: user.cookie },
        payload: { foodIds: [] },
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects more than 25 foodIds with 400", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const tooMany = Array.from({ length: 26 }, () => fixtures.egg.id);

      const response = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: user.cookie },
        payload: { foodIds: tooMany },
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects an unknown foodId with 400", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      const response = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: user.cookie },
        payload: { foodIds: [UNKNOWN_ID] },
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects the whole meal and persists nothing when one foodId among several is unknown", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      const response = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: user.cookie },
        payload: { foodIds: [fixtures.egg.id, UNKNOWN_ID] },
      });
      expect(response.statusCode).toBe(400);

      expect((await listMeals(user, babyId)).items).toHaveLength(0);
      expect(await db.select().from(schema.meals)).toHaveLength(0);
    });

    it("rejects an unknown recipeId with 400 and persists nothing", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      const response = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: user.cookie },
        payload: { foodIds: [fixtures.egg.id], recipeId: UNKNOWN_ID },
      });
      expect(response.statusCode).toBe(400);
      expect(await db.select().from(schema.meals)).toHaveLength(0);
    });

    it("rejects a servedAt more than 24h in the future", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const farFuture = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      const response = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: user.cookie },
        payload: { foodIds: [fixtures.egg.id], servedAt: farFuture },
      });
      expect(response.statusCode).toBe(400);
    });

    it("404s meal and allergen-progress routes for a baby owned by somebody else", async () => {
      const owner = await signUpUser(app, "Owner");
      const intruder = await signUpUser(app, "Intruder");
      const babyId = await createBaby(app, owner);

      const list = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: intruder.cookie },
      });
      expect(list.statusCode).toBe(404);

      const create = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: intruder.cookie },
        payload: { foodIds: [fixtures.egg.id] },
      });
      expect(create.statusCode).toBe(404);

      const progress = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: intruder.cookie },
      });
      expect(progress.statusCode).toBe(404);
    });

    it("404s deleting another account's meal and leaves it intact", async () => {
      const owner = await signUpUser(app, "Owner");
      const intruder = await signUpUser(app, "Intruder");
      const babyId = await createBaby(app, owner);
      const created = await postMeal(owner, babyId, { foodIds: [fixtures.egg.id] });

      const del = await app.inject({
        method: "DELETE",
        url: `/api/meals/${created.id}`,
        headers: { cookie: intruder.cookie },
      });
      expect(del.statusCode).toBe(404);

      expect((await listMeals(owner, babyId)).items).toHaveLength(1);
    });

    it("404s deleting an unknown meal id", async () => {
      const user = await signUpUser(app);
      const response = await app.inject({
        method: "DELETE",
        url: `/api/meals/${UNKNOWN_ID}`,
        headers: { cookie: user.cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it("takes the meal's foods with it when the meal is deleted", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const created = await postMeal(user, babyId, { foodIds: [fixtures.egg.id, fixtures.banana.id] });

      expect(await db.select().from(schema.mealFoods).where(eq(schema.mealFoods.mealId, created.id))).toHaveLength(2);

      const del = await app.inject({
        method: "DELETE",
        url: `/api/meals/${created.id}`,
        headers: { cookie: user.cookie },
      });
      expect(del.statusCode).toBe(204);

      expect(await db.select().from(schema.mealFoods).where(eq(schema.mealFoods.mealId, created.id))).toHaveLength(0);
    });
  });

  describe("PATCH /api/meals/:id", () => {
    it("replaces the meal's foods atomically and round-trips through the list", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const created = await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });

      const patch = await app.inject({
        method: "PATCH",
        url: `/api/meals/${created.id}`,
        headers: { cookie: user.cookie },
        payload: { foodIds: [fixtures.banana.id, fixtures.banana.id] },
      });
      expect(patch.statusCode).toBe(200);
      const updated = patch.json<MealItem>();
      expect(updated.id).toBe(created.id);
      expect(updated.foods.map((food) => food.slug)).toEqual(["banana"]);

      // The replaced child is gone, not merely hidden from the response.
      const children = await db.select().from(schema.mealFoods).where(eq(schema.mealFoods.mealId, created.id));
      expect(children).toHaveLength(1);
      expect(children[0]?.foodId).toBe(fixtures.banana.id);

      const listed = (await listMeals(user, babyId)).items[0];
      expect(listed?.foods.map((food) => food.slug)).toEqual(["banana"]);
    });

    it("updates servedAt, reactionNote and recipeId, leaving absent fields alone", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const created = await postMeal(user, babyId, {
        foodIds: [fixtures.egg.id],
        reactionNote: "sleepy",
        recipeId: fixtures.recipe.id,
      });

      const movedTo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const first = await app.inject({
        method: "PATCH",
        url: `/api/meals/${created.id}`,
        headers: { cookie: user.cookie },
        payload: { servedAt: movedTo },
      });
      expect(first.statusCode).toBe(200);
      const afterTimeChange = first.json<MealItem>();
      expect(new Date(afterTimeChange.servedAt).toISOString()).toBe(movedTo);
      // Untouched by a servedAt-only patch.
      expect(afterTimeChange.reactionNote).toBe("sleepy");
      expect(afterTimeChange.recipeId).toBe(fixtures.recipe.id);
      expect(afterTimeChange.foods.map((food) => food.slug)).toEqual(["egg"]);

      const second = await app.inject({
        method: "PATCH",
        url: `/api/meals/${created.id}`,
        headers: { cookie: user.cookie },
        payload: { reactionNote: "  happy  ", recipeId: null },
      });
      const afterNoteChange = second.json<MealItem>();
      expect(afterNoteChange.reactionNote).toBe("happy");
      expect(afterNoteChange.recipeId).toBeNull();
      expect(afterNoteChange.recipeTitle).toBeNull();

      // An empty note clears it rather than storing "".
      const third = await app.inject({
        method: "PATCH",
        url: `/api/meals/${created.id}`,
        headers: { cookie: user.cookie },
        payload: { reactionNote: "" },
      });
      expect(third.json<MealItem>().reactionNote).toBeNull();
    });

    it("rejects an empty body, an empty/oversized food list, and unknown ids", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const created = await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });

      const patch = (payload: Record<string, unknown>) =>
        app.inject({
          method: "PATCH",
          url: `/api/meals/${created.id}`,
          headers: { cookie: user.cookie },
          payload,
        });

      expect((await patch({})).statusCode).toBe(400);
      expect((await patch({ foodIds: [] })).statusCode).toBe(400);
      expect((await patch({ foodIds: Array.from({ length: 26 }, () => fixtures.egg.id) })).statusCode).toBe(400);
      expect((await patch({ foodIds: [UNKNOWN_ID] })).statusCode).toBe(400);
      expect((await patch({ recipeId: UNKNOWN_ID })).statusCode).toBe(400);
      expect((await patch({ servedAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() })).statusCode).toBe(
        400,
      );

      // Nothing above changed the meal.
      const listed = (await listMeals(user, babyId)).items[0];
      expect(listed?.foods.map((food) => food.slug)).toEqual(["egg"]);
      expect(listed?.recipeId).toBeNull();
    });

    it("404s patching another account's meal and leaves it intact", async () => {
      const owner = await signUpUser(app, "Owner");
      const intruder = await signUpUser(app, "Intruder");
      const babyId = await createBaby(app, owner);
      const created = await postMeal(owner, babyId, { foodIds: [fixtures.egg.id] });

      const patch = await app.inject({
        method: "PATCH",
        url: `/api/meals/${created.id}`,
        headers: { cookie: intruder.cookie },
        payload: { foodIds: [fixtures.banana.id] },
      });
      expect(patch.statusCode).toBe(404);

      const listed = (await listMeals(owner, babyId)).items[0];
      expect(listed?.foods.map((food) => food.slug)).toEqual(["egg"]);
    });

    it("404s patching an unknown meal id", async () => {
      const user = await signUpUser(app);
      const response = await app.inject({
        method: "PATCH",
        url: `/api/meals/${UNKNOWN_ID}`,
        headers: { cookie: user.cookie },
        payload: { reactionNote: "hello" },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // General notes. A meal now carries two independent free-text fields:
  // `reactionNote` (a possible reaction — the ONLY field the AI pipeline
  // reads as a reaction signal) and `notes` (anything else).
  // -------------------------------------------------------------------------

  describe("meal notes", () => {
    it("round-trips notes alongside reactionNote and keeps the two independent", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      const created = await postMeal(user, babyId, {
        foodIds: [fixtures.egg.id],
        reactionNote: "  red cheeks  ",
        notes: "  ate the whole thing  ",
      });
      expect(created.reactionNote).toBe("red cheeks");
      expect(created.notes).toBe("ate the whole thing");
      expect((await listMeals(user, babyId)).items[0]?.notes).toBe("ate the whole thing");

      const patch = async (payload: Record<string, unknown>): Promise<MealItem> => {
        const response = await app.inject({
          method: "PATCH",
          url: `/api/meals/${created.id}`,
          headers: { cookie: user.cookie },
          payload,
        });
        expect(response.statusCode).toBe(200);
        return response.json<MealItem>();
      };

      // Clearing one leaves the other alone, in both directions.
      const noteCleared = await patch({ notes: "" });
      expect(noteCleared.notes).toBeNull();
      expect(noteCleared.reactionNote).toBe("red cheeks");

      const reactionCleared = await patch({ notes: "seconds please", reactionNote: null });
      expect(reactionCleared.notes).toBe("seconds please");
      expect(reactionCleared.reactionNote).toBeNull();

      // An absent key leaves the column alone.
      expect((await patch({ servedAt: new Date().toISOString() })).notes).toBe("seconds please");
    });

    it("defaults notes to null and rejects one over 500 characters", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      expect((await postMeal(user, babyId, { foodIds: [fixtures.egg.id] })).notes).toBeNull();

      const tooLong = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: user.cookie },
        payload: { foodIds: [fixtures.egg.id], notes: "x".repeat(501) },
      });
      expect(tooLong.statusCode).toBe(400);
    });

    // -----------------------------------------------------------------------
    // The pin the C2 design hangs on: general notes are NOT a reaction
    // signal. `fetchBabyProfileSummary` is what turns meals into
    // `knownReactiveFoods`, which the chat system prompt and the recipe
    // allergy cross-check both consume. If someone ever widens its filter to
    // "any note", this fails.
    // -----------------------------------------------------------------------
    it("never flags a food as reactive because the meal carries general notes", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const [account] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.email, user.email))
        .limit(1);
      const userId = account!.id;

      const meal = await postMeal(user, babyId, {
        foodIds: [fixtures.egg.id],
        notes: "loved it, asked for more, no rash at all",
      });

      const withNotesOnly = await fetchBabyProfileSummary(db, userId, babyId);
      expect(withNotesOnly?.foodsIntroducedCount).toBe(1);
      expect(withNotesOnly?.knownReactiveFoods).toEqual([]);

      // The control: the same meal with an actual reaction note DOES flag it,
      // so the assertion above is about the field, not about an empty query.
      const patched = await app.inject({
        method: "PATCH",
        url: `/api/meals/${meal.id}`,
        headers: { cookie: user.cookie },
        payload: { reactionNote: "hives around the mouth" },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json<MealItem>().notes).toBe("loved it, asked for more, no rash at all");

      const withReaction = await fetchBabyProfileSummary(db, userId, babyId);
      expect(withReaction?.knownReactiveFoods).toEqual(["Egg"]);
    });
  });

  describe("allergen progress", () => {
    it("derives not_started / started / established from exposure counts", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      const progressEmpty = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: user.cookie },
      });
      expect(progressEmpty.statusCode).toBe(200);
      const emptyItems = progressEmpty.json<AllergenProgressResponse>().items;
      expect(emptyItems.length).toBeGreaterThanOrEqual(2);
      expect(emptyItems.every((item) => item.status === "not_started" && item.exposures === 0)).toBe(true);

      await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });

      const progressOnce = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: user.cookie },
      });
      const onceItems = progressOnce.json<AllergenProgressResponse>().items;
      const eggOnce = onceItems.find((item) => item.allergenSlug === "egg");
      expect(eggOnce).toMatchObject({ status: "started", exposures: 1 });
      const peanutOnce = onceItems.find((item) => item.allergenSlug === "peanut");
      expect(peanutOnce).toMatchObject({ status: "not_started", exposures: 0 });

      // A meal carrying the allergen alongside another food is still exactly
      // one exposure of that allergen.
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id, fixtures.banana.id] });
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });

      const progressThrice = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: user.cookie },
      });
      const eggThrice = progressThrice.json<AllergenProgressResponse>().items.find((i) => i.allergenSlug === "egg");
      expect(eggThrice).toMatchObject({ status: "established", exposures: 3 });
      expect(eggThrice?.firstAt).toBeTruthy();
      expect(eggThrice?.lastServedAt).toBeTruthy();
    });

    it("drops the exposures a deleted meal contributed", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const first = await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });

      await app.inject({ method: "DELETE", url: `/api/meals/${first.id}`, headers: { cookie: user.cookie } });

      const progress = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: user.cookie },
      });
      const egg = progress.json<AllergenProgressResponse>().items.find((item) => item.allergenSlug === "egg");
      expect(egg).toMatchObject({ status: "started", exposures: 1 });
    });

    it("follows a PATCH that swaps the allergen food out of the meal", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const created = await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });

      await app.inject({
        method: "PATCH",
        url: `/api/meals/${created.id}`,
        headers: { cookie: user.cookie },
        payload: { foodIds: [fixtures.banana.id] },
      });

      const progress = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: user.cookie },
      });
      const egg = progress.json<AllergenProgressResponse>().items.find((item) => item.allergenSlug === "egg");
      expect(egg).toMatchObject({ status: "not_started", exposures: 0 });
    });

    it("reports lastServedAt as the newest servedAt across the allergen's foods", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      // Nothing logged yet: every row, egg included, has no recency at all.
      const before = await progressItems(user, babyId);
      expect(before.every((item) => item.lastServedAt === null)).toBe(true);

      // Deliberately posted oldest-last so the answer cannot come from
      // insertion order — only from max(servedAt).
      const newest = "2026-03-05T12:00:00.000Z";
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id], servedAt: "2026-03-01T08:00:00.000Z" });
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id, fixtures.banana.id], servedAt: newest });
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id], servedAt: "2026-03-03T09:00:00.000Z" });

      const egg = await eggProgress(user, babyId);
      expect(egg?.lastServedAt).toBe(newest);
      expect(new Date(egg!.lastServedAt!).toISOString()).toBe(newest);

      // A meal that carried no peanut food leaves peanut's recency untouched.
      const peanut = (await progressItems(user, babyId)).find((item) => item.allergenSlug === "peanut");
      expect(peanut?.lastServedAt).toBeNull();
      expect(peanut).toMatchObject({ exposures: 0, status: "not_started" });
    });

    it("moves lastServedAt forward when a newer meal is logged", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      await postMeal(user, babyId, { foodIds: [fixtures.egg.id], servedAt: "2026-03-01T08:00:00.000Z" });
      expect((await eggProgress(user, babyId))?.lastServedAt).toBe("2026-03-01T08:00:00.000Z");

      await postMeal(user, babyId, { foodIds: [fixtures.egg.id], servedAt: "2026-03-04T18:30:00.000Z" });
      expect((await eggProgress(user, babyId))?.lastServedAt).toBe("2026-03-04T18:30:00.000Z");
    });

    it("reports overridden: false on every derived row", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });

      const items = await progressItems(user, babyId);
      expect(items.every((item) => item.overridden === false)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PUT/DELETE /api/babies/:babyId/allergens/:key/established
  // -------------------------------------------------------------------------
  describe("allergen overrides", () => {
    it("marks an untouched allergen established, idempotently, without inventing exposures", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      const first = await putOverride(user, babyId, "egg");
      expect(first.statusCode).toBe(204);
      const second = await putOverride(user, babyId, "egg");
      expect(second.statusCode).toBe(204);

      // Idempotent at the row level too, not just in the status code.
      expect(await db.select().from(schema.allergenOverrides)).toHaveLength(1);

      const egg = await eggProgress(user, babyId);
      expect(egg).toMatchObject({
        status: "established",
        overridden: true,
        // Derived fields stay derived: an override is not an exposure.
        exposures: 0,
        firstAt: null,
        // An override asserts a status, never a date: there is no serve
        // behind it, so the recency fact stays honestly empty.
        lastServedAt: null,
      });

      // Only the allergen named is touched.
      const peanut = (await progressItems(user, babyId)).find((item) => item.allergenSlug === "peanut");
      expect(peanut).toMatchObject({ status: "not_started", overridden: false, exposures: 0 });
    });

    it("promotes a started allergen without downgrading it, and DELETE restores the derived state", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });

      expect(await eggProgress(user, babyId)).toMatchObject({ status: "started", exposures: 1, overridden: false });

      const derivedLastServedAt = (await eggProgress(user, babyId))?.lastServedAt;
      expect(derivedLastServedAt).toBeTruthy();

      expect((await putOverride(user, babyId, "egg")).statusCode).toBe(204);
      expect(await eggProgress(user, babyId)).toMatchObject({ status: "established", exposures: 1, overridden: true });
      // Promotion does not disturb the derived recency it sits on top of.
      expect((await eggProgress(user, babyId))?.lastServedAt).toBe(derivedLastServedAt);

      const del = await deleteOverride(user, babyId, "egg");
      expect(del.statusCode).toBe(204);
      // Back to exactly what the meal log alone says — no residue.
      expect(await eggProgress(user, babyId)).toMatchObject({ status: "started", exposures: 1, overridden: false });
      expect(await db.select().from(schema.allergenOverrides)).toHaveLength(0);
    });

    it("defers to derived data: a stray override on a derived-established row is not flagged", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id, fixtures.banana.id] });
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });

      await putOverride(user, babyId, "egg");

      expect(await eggProgress(user, babyId)).toMatchObject({
        status: "established",
        exposures: 3,
        overridden: false,
      });

      // Removing the override cannot take away what the meals prove.
      expect((await deleteOverride(user, babyId, "egg")).statusCode).toBe(204);
      expect(await eggProgress(user, babyId)).toMatchObject({
        status: "established",
        exposures: 3,
        overridden: false,
      });
    });

    it("DELETE is idempotent when no override was ever written", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      expect((await deleteOverride(user, babyId, "egg")).statusCode).toBe(204);
      expect((await deleteOverride(user, babyId, "egg")).statusCode).toBe(204);
      expect(await eggProgress(user, babyId)).toMatchObject({ status: "not_started", overridden: false });
    });

    it("400s an allergen key that is malformed or not in the catalog, on PUT and DELETE, writing nothing", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      // Well-formed slug, but no such allergen in the seeded catalog.
      for (const key of ["sesame", "Egg", "not%20a%20slug", "-egg-"]) {
        expect((await putOverride(user, babyId, key)).statusCode).toBe(400);
        expect((await deleteOverride(user, babyId, key)).statusCode).toBe(400);
      }

      expect(await db.select().from(schema.allergenOverrides)).toHaveLength(0);
    });

    it("404s another account's baby (and an unknown one) without writing or deleting anything", async () => {
      const owner = await signUpUser(app, "Owner");
      const intruder = await signUpUser(app, "Intruder");
      const babyId = await createBaby(app, owner);
      await putOverride(owner, babyId, "egg");

      expect((await putOverride(intruder, babyId, "peanut")).statusCode).toBe(404);
      expect((await deleteOverride(intruder, babyId, "egg")).statusCode).toBe(404);
      expect((await putOverride(owner, UNKNOWN_ID, "egg")).statusCode).toBe(404);
      expect((await deleteOverride(owner, UNKNOWN_ID, "egg")).statusCode).toBe(404);
      expect((await putOverride(owner, "not-a-uuid", "egg")).statusCode).toBe(404);

      // The owner's override is untouched, and the intruder's own progress
      // never saw it.
      const rows = await db.select().from(schema.allergenOverrides);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ babyId, allergenKey: "egg" });
      expect(await eggProgress(owner, babyId)).toMatchObject({ status: "established", overridden: true });
    });

    it("is scoped per baby: an override on one baby leaves the sibling derived", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user, "Robin");
      const siblingId = await createBaby(app, user, "Sam");

      await putOverride(user, babyId, "egg");

      expect(await eggProgress(user, babyId)).toMatchObject({ status: "established", overridden: true });
      expect(await eggProgress(user, siblingId)).toMatchObject({ status: "not_started", overridden: false });
    });

    it("goes away with the baby (ON DELETE CASCADE)", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      await putOverride(user, babyId, "egg");

      const del = await app.inject({
        method: "DELETE",
        url: `/api/babies/${babyId}`,
        headers: { cookie: user.cookie },
      });
      expect(del.statusCode).toBe(204);
      expect(await db.select().from(schema.allergenOverrides)).toHaveLength(0);
    });

    it("feeds the same union into the AI baby-profile summary", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const userId = await userIdFor(user);

      expect((await fetchBabyProfileSummary(db, userId, babyId))?.establishedTop9Allergens).toEqual([]);

      await putOverride(user, babyId, "peanut");
      expect((await fetchBabyProfileSummary(db, userId, babyId))?.establishedTop9Allergens).toEqual(["peanut"]);

      // Derived and overridden allergens land in one list, deduped, and an
      // override on a derived-established allergen does not double it up.
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });
      await postMeal(user, babyId, { foodIds: [fixtures.egg.id] });
      await putOverride(user, babyId, "egg");
      expect((await fetchBabyProfileSummary(db, userId, babyId))?.establishedTop9Allergens).toEqual(["egg", "peanut"]);

      await deleteOverride(user, babyId, "peanut");
      expect((await fetchBabyProfileSummary(db, userId, babyId))?.establishedTop9Allergens).toEqual(["egg"]);
    });
  });

  describe("favorites", () => {
    it("PUT/DELETE are idempotent and GET lists favorited recipes with derived allergens", async () => {
      const user = await signUpUser(app);

      const put1 = await app.inject({
        method: "PUT",
        url: `/api/recipes/${fixtures.recipe.id}/favorite`,
        headers: { cookie: user.cookie },
      });
      expect(put1.statusCode).toBe(204);
      const put2 = await app.inject({
        method: "PUT",
        url: `/api/recipes/${fixtures.recipe.id}/favorite`,
        headers: { cookie: user.cookie },
      });
      expect(put2.statusCode).toBe(204);

      const list = await app.inject({
        method: "GET",
        url: "/api/favorites",
        headers: { cookie: user.cookie },
      });
      expect(list.statusCode).toBe(200);
      const body = list.json<FavoritesResponse>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        recipeId: fixtures.recipe.id,
        title: "Egg Toast Fingers",
        allergens: ["egg"],
      });

      const del1 = await app.inject({
        method: "DELETE",
        url: `/api/recipes/${fixtures.recipe.id}/favorite`,
        headers: { cookie: user.cookie },
      });
      expect(del1.statusCode).toBe(204);
      const del2 = await app.inject({
        method: "DELETE",
        url: `/api/recipes/${fixtures.recipe.id}/favorite`,
        headers: { cookie: user.cookie },
      });
      expect(del2.statusCode).toBe(204);

      const listAfter = await app.inject({
        method: "GET",
        url: "/api/favorites",
        headers: { cookie: user.cookie },
      });
      expect(listAfter.json<FavoritesResponse>().items).toHaveLength(0);
    });

    it("404s favoriting an unknown recipe", async () => {
      const user = await signUpUser(app);
      const response = await app.inject({
        method: "PUT",
        url: `/api/recipes/${UNKNOWN_ID}/favorite`,
        headers: { cookie: user.cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it("only lists the caller's own favorites", async () => {
      const owner = await signUpUser(app, "Owner");
      const other = await signUpUser(app, "Other");

      await app.inject({
        method: "PUT",
        url: `/api/recipes/${fixtures.recipe.id}/favorite`,
        headers: { cookie: owner.cookie },
      });

      const otherList = await app.inject({
        method: "GET",
        url: "/api/favorites",
        headers: { cookie: other.cookie },
      });
      expect(otherList.json<FavoritesResponse>().items).toHaveLength(0);
    });
  });
});
