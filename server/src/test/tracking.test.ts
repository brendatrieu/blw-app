import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type {
  AllergenProgressResponse,
  Baby,
  FavoritesResponse,
  ServeLogItem,
  ServeLogsResponse,
} from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

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

  describe("serve logs", () => {
    it("creates, lists, and deletes a serve log for an owned baby", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      const create = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: user.cookie },
        payload: { foodId: fixtures.egg.id, recipeId: fixtures.recipe.id, reactionNote: "  mild rash  " },
      });
      expect(create.statusCode).toBe(201);
      const created = create.json<ServeLogItem>();
      expect(created).toMatchObject({
        foodId: fixtures.egg.id,
        foodSlug: "egg",
        foodName: "Egg",
        recipeId: fixtures.recipe.id,
        recipeTitle: "Egg Toast Fingers",
        reactionNote: "mild rash",
      });

      const list = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: user.cookie },
      });
      expect(list.statusCode).toBe(200);
      const listBody = list.json<ServeLogsResponse>();
      expect(listBody.items).toHaveLength(1);
      expect(listBody.items[0]?.id).toBe(created.id);

      const del = await app.inject({
        method: "DELETE",
        url: `/api/serve-logs/${created.id}`,
        headers: { cookie: user.cookie },
      });
      expect(del.statusCode).toBe(204);

      const listAfter = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: user.cookie },
      });
      expect(listAfter.json<ServeLogsResponse>().items).toHaveLength(0);
    });

    it("rejects an unknown foodId with 400", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);

      const response = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: user.cookie },
        payload: { foodId: "00000000-0000-4000-8000-000000000000" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects a servedAt more than 24h in the future", async () => {
      const user = await signUpUser(app);
      const babyId = await createBaby(app, user);
      const farFuture = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      const response = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: user.cookie },
        payload: { foodId: fixtures.egg.id, servedAt: farFuture },
      });
      expect(response.statusCode).toBe(400);
    });

    it("404s serve-log and allergen-progress routes for a baby owned by somebody else", async () => {
      const owner = await signUpUser(app, "Owner");
      const intruder = await signUpUser(app, "Intruder");
      const babyId = await createBaby(app, owner);

      const list = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: intruder.cookie },
      });
      expect(list.statusCode).toBe(404);

      const create = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: intruder.cookie },
        payload: { foodId: fixtures.egg.id },
      });
      expect(create.statusCode).toBe(404);

      const progress = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: intruder.cookie },
      });
      expect(progress.statusCode).toBe(404);
    });

    it("404s deleting another account's serve log and leaves it intact", async () => {
      const owner = await signUpUser(app, "Owner");
      const intruder = await signUpUser(app, "Intruder");
      const babyId = await createBaby(app, owner);
      const created = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: owner.cookie },
        payload: { foodId: fixtures.egg.id },
      });
      const id = created.json<ServeLogItem>().id;

      const del = await app.inject({
        method: "DELETE",
        url: `/api/serve-logs/${id}`,
        headers: { cookie: intruder.cookie },
      });
      expect(del.statusCode).toBe(404);

      const stillThere = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: owner.cookie },
      });
      expect(stillThere.json<ServeLogsResponse>().items).toHaveLength(1);
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

      await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: user.cookie },
        payload: { foodId: fixtures.egg.id },
      });

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

      await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: user.cookie },
        payload: { foodId: fixtures.egg.id },
      });
      await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/serve-logs`,
        headers: { cookie: user.cookie },
        payload: { foodId: fixtures.egg.id },
      });

      const progressThrice = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: user.cookie },
      });
      const eggThrice = progressThrice.json<AllergenProgressResponse>().items.find((item) => item.allergenSlug === "egg");
      expect(eggThrice).toMatchObject({ status: "established", exposures: 3 });
      expect(eggThrice?.firstAt).toBeTruthy();
      expect(eggThrice?.lastAt).toBeTruthy();
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
        url: "/api/recipes/00000000-0000-4000-8000-000000000000/favorite",
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
