import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  AllergenProgressResponse,
  Baby,
  FavoritesResponse,
  FoodDetail,
  MealItem,
  PantryItem,
  RecipeDetail,
  RecipesResponse,
} from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { buildChatTools } from "../ai/tools.js";

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

/**
 * A minimal catalog: two foods, the allergens a custom food gets tagged
 * against, and ONE seeded recipe with all three age variants — the "catalog
 * content nobody owns" half of every visibility assertion below.
 */
async function seedFixtures(db: Database) {
  await db.insert(schema.storageGuidelines).values({
    category: "produce_cooked",
    fridgeHours: 48,
    freezerDays: 60,
    roomTempHours: 2,
    notes: "Cooked produce.",
  });

  const [banana, oats] = await db
    .insert(schema.foods)
    .values([
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
      {
        slug: "oats",
        name: "Oats",
        category: "grain",
        ironLevel: "moderate",
        vitaminCLevel: "low",
        chokingRisk: "low",
        minAgeMonths: 6,
        prep6m: "porridge",
        prep9m: "porridge",
        prep12m: "porridge",
        storageCategory: "produce_cooked",
      },
    ])
    .returning();

  const [peanut, egg] = await db
    .insert(schema.allergens)
    .values([
      { slug: "peanut", name: "Peanut", introGuidance: "Thinned smooth peanut butter only." },
      { slug: "egg", name: "Egg", introGuidance: "Well-cooked egg, tiny first portion." },
    ])
    .returning();

  const [catalogRecipe] = await db
    .insert(schema.recipes)
    .values({
      slug: "banana-porridge",
      title: "Banana Porridge",
      minAgeMonths: 6,
      prepMinutes: 10,
      ironFocus: true,
    })
    .returning();

  await db.insert(schema.recipeIngredients).values([
    { recipeId: catalogRecipe!.id, foodId: banana!.id, quantityNote: "1 small" },
    { recipeId: catalogRecipe!.id, foodId: oats!.id, quantityNote: "3 tbsp" },
  ]);
  await db.insert(schema.recipeVariants).values([
    { recipeId: catalogRecipe!.id, ageStage: "6", textureNote: "Very soft", instructions: ["Mash it."] },
    { recipeId: catalogRecipe!.id, ageStage: "9", textureNote: "Lumpier", instructions: ["Mash less."] },
    { recipeId: catalogRecipe!.id, ageStage: "12", textureNote: "Chunky", instructions: ["Chop it."] },
  ]);

  return { banana: banana!, oats: oats!, peanut: peanut!, egg: egg!, catalogRecipe: catalogRecipe! };
}

describe("custom recipes", () => {
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

  /** POST a custom recipe, failing loudly on a non-201. */
  async function createRecipe(user: TestUser, payload: Record<string, unknown>): Promise<RecipeDetail> {
    const response = await app.inject({
      method: "POST",
      url: "/api/recipes",
      headers: { cookie: user.cookie },
      payload,
    });
    if (response.statusCode !== 201) {
      throw new Error(`custom recipe create failed (${response.statusCode}): ${response.body}`);
    }
    return response.json<RecipeDetail>();
  }

  /** The smallest valid body, with `overrides` layered on top. */
  function recipePayload(overrides: Record<string, unknown> = {}) {
    return {
      title: "Banana oat fingers",
      minAgeMonths: 6,
      ingredients: [{ foodId: fixtures.banana.id, quantityNote: "1 ripe" }],
      steps: ["Mash the banana."],
      ...overrides,
    };
  }

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

  async function listRecipes(user: TestUser, query = ""): Promise<RecipesResponse> {
    const response = await app.inject({
      method: "GET",
      url: `/api/recipes${query}`,
      headers: { cookie: user.cookie },
    });
    if (response.statusCode !== 200) {
      throw new Error(`recipe list failed (${response.statusCode}): ${response.body}`);
    }
    return response.json<RecipesResponse>();
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

  // -----------------------------------------------------------------------
  // POST /api/recipes (item 206)
  // -----------------------------------------------------------------------
  describe("POST /api/recipes", () => {
    it("401s an unauthenticated create", async () => {
      const response = await app.inject({ method: "POST", url: "/api/recipes", payload: recipePayload() });
      expect(response.statusCode).toBe(401);
    });

    it("creates a recipe owned by the caller, with one variant and no curated claims", async () => {
      const recipe = await createRecipe(
        owner,
        recipePayload({
          minAgeMonths: 9,
          ingredients: [
            { foodId: fixtures.banana.id, quantityNote: "1 ripe" },
            { foodId: fixtures.oats.id },
          ],
          extraIngredients: ["olive oil"],
          steps: ["Mash the banana.", "Stir in the oats."],
          notes: "Robin likes it cold.",
        }),
      );

      expect(recipe).toMatchObject({
        title: "Banana oat fingers",
        minAgeMonths: 9,
        isCustom: true,
        notes: "Robin likes it cold.",
        extraIngredients: ["olive oil"],
        // Nothing curated: no image, no storage overrides, no iron claim, and
        // prepMinutes 0 meaning "not stated" rather than "instant".
        prepMinutes: 0,
        ironFocus: false,
        imageUrl: null,
        fridgeHoursOverride: null,
        freezerDaysOverride: null,
      });
      expect(recipe.slug).toMatch(/^banana-oat-fingers-[0-9a-z]{6}$/);

      // One variant, filed at the stage the age falls in — never age tabs.
      expect(recipe.variants).toEqual([
        { ageStage: "9", textureNote: "", steps: ["Mash the banana.", "Stir in the oats."] },
      ]);

      expect(recipe.ingredients).toEqual([
        {
          foodId: fixtures.banana.id,
          foodSlug: "banana",
          foodName: "Banana",
          isCustom: false,
          foodEmoji: null,
          quantityNote: "1 ripe",
        },
        {
          foodId: fixtures.oats.id,
          foodSlug: "oats",
          foodName: "Oats",
          isCustom: false,
          foodEmoji: null,
          // An omitted quantity is "" — a real answer, not a missing field.
          quantityNote: "",
        },
      ]);

      // It reads back the same way through the detail route.
      const detail = await app.inject({
        method: "GET",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
      });
      expect(detail.json<RecipeDetail>()).toEqual(recipe);
    });

    it("derives the variant stage from the age, and honours a stated prep time", async () => {
      for (const [minAgeMonths, ageStage] of [
        [6, "6"],
        [8, "6"],
        [9, "9"],
        [11, "9"],
        [12, "12"],
        [24, "12"],
      ] as const) {
        const recipe = await createRecipe(owner, recipePayload({ minAgeMonths, prepMinutes: 15 }));
        expect(recipe.variants.map((v) => v.ageStage), `${minAgeMonths}m`).toEqual([ageStage]);
        expect(recipe.prepMinutes).toBe(15);
      }
    });

    it("gives two recipes with the same title different slugs, and dedupes a repeated ingredient", async () => {
      const first = await createRecipe(owner, recipePayload());
      const second = await createRecipe(intruder, recipePayload());
      expect(first.slug).not.toBe(second.slug);

      const deduped = await createRecipe(
        owner,
        recipePayload({
          ingredients: [
            { foodId: fixtures.banana.id, quantityNote: "1 ripe" },
            { foodId: fixtures.banana.id, quantityNote: "ignored" },
          ],
        }),
      );
      expect(deduped.ingredients).toHaveLength(1);
      expect(deduped.ingredients[0]?.quantityNote).toBe("1 ripe");
    });

    it("400s an unusable title, age, ingredient list or step list", async () => {
      const bodies = [
        recipePayload({ title: "   " }),
        recipePayload({ minAgeMonths: 3 }),
        recipePayload({ minAgeMonths: 48 }),
        recipePayload({ ingredients: [] }),
        recipePayload({ steps: [] }),
        recipePayload({ steps: ["  "] }),
        recipePayload({ ingredients: [{ foodId: "not-a-uuid" }] }),
      ];
      for (const payload of bodies) {
        const response = await app.inject({
          method: "POST",
          url: "/api/recipes",
          headers: { cookie: owner.cookie },
          payload,
        });
        expect(response.statusCode, JSON.stringify(payload)).toBe(400);
        expect(response.json()).toMatchObject({ error: "invalid_request" });
      }
    });

    it("400s an ingredient the caller cannot see, naming no more than the id they sent", async () => {
      const theirs = await createFood(intruder, { name: "Their satay", category: "protein" });

      const response = await app.inject({
        method: "POST",
        url: "/api/recipes",
        headers: { cookie: owner.cookie },
        payload: recipePayload({ ingredients: [{ foodId: theirs.id }] }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: "invalid_request",
        details: { ingredients: "unknown food", unknownFoodIds: [theirs.id] },
      });

      // An id that names nothing at all reads identically — the 400 says
      // nothing about whether the food exists on somebody else's account.
      const unknown = await app.inject({
        method: "POST",
        url: "/api/recipes",
        headers: { cookie: owner.cookie },
        payload: recipePayload({ ingredients: [{ foodId: UNKNOWN_ID }] }),
      });
      expect(unknown.json()).toEqual({
        error: "invalid_request",
        details: { ingredients: "unknown food", unknownFoodIds: [UNKNOWN_ID] },
      });

      expect(await db.select().from(schema.recipes).where(eq(schema.recipes.ownerId, await userId(owner)))).toEqual([]);
    });

    it("accepts the caller's own custom food as an ingredient", async () => {
      const mine = await createFood(owner, { name: "My satay", category: "protein", emoji: "🥜" });
      const recipe = await createRecipe(owner, recipePayload({ ingredients: [{ foodId: mine.id, quantityNote: "1 tbsp" }] }));

      expect(recipe.ingredients).toEqual([
        {
          foodId: mine.id,
          foodSlug: mine.slug,
          foodName: "My satay",
          isCustom: true,
          foodEmoji: "🥜",
          quantityNote: "1 tbsp",
        },
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/recipes (item 205)
  // -----------------------------------------------------------------------
  describe("GET /api/recipes", () => {
    it("401s an unauthenticated list", async () => {
      const response = await app.inject({ method: "GET", url: "/api/recipes" });
      expect(response.statusCode).toBe(401);
    });

    it("returns the catalog plus the caller's own, never another account's", async () => {
      const mine = await createRecipe(owner, recipePayload({ title: "Avocado toast fingers" }));
      const theirs = await createRecipe(intruder, recipePayload({ title: "Zucchini sticks" }));

      const forOwner = await listRecipes(owner);
      // Ordered by title, ascending.
      expect(forOwner.recipes.map((r) => r.title)).toEqual(["Avocado toast fingers", "Banana Porridge"]);
      expect(forOwner.recipes.map((r) => r.id)).not.toContain(theirs.id);

      const forIntruder = await listRecipes(intruder);
      expect(forIntruder.recipes.map((r) => r.title)).toEqual(["Banana Porridge", "Zucchini sticks"]);
      expect(forIntruder.recipes.map((r) => r.id)).not.toContain(mine.id);

      expect(forOwner.recipes.find((r) => r.id === mine.id)).toMatchObject({
        isCustom: true,
        isFavorite: false,
        ironFocus: false,
        ingredientNames: ["Banana"],
        allergens: [],
      });
      expect(forOwner.recipes.find((r) => r.id === fixtures.catalogRecipe.id)).toMatchObject({
        isCustom: false,
        ironFocus: true,
        ingredientNames: ["Banana", "Oats"],
      });
    });

    it("carries the caller's own favorites, and scopes to them", async () => {
      const mine = await createRecipe(owner, recipePayload({ title: "Avocado toast fingers" }));

      const favorited = await app.inject({
        method: "PUT",
        url: `/api/recipes/${mine.id}/favorite`,
        headers: { cookie: owner.cookie },
      });
      expect(favorited.statusCode).toBe(204);

      const forOwner = await listRecipes(owner);
      expect(forOwner.recipes.find((r) => r.id === mine.id)?.isFavorite).toBe(true);
      expect(forOwner.recipes.find((r) => r.id === fixtures.catalogRecipe.id)?.isFavorite).toBe(false);

      // The same catalog recipe is nobody else's favorite.
      const forIntruder = await listRecipes(intruder);
      expect(forIntruder.recipes.every((r) => !r.isFavorite)).toBe(true);

      expect((await listRecipes(owner, "?scope=favorites")).recipes.map((r) => r.id)).toEqual([mine.id]);
      expect((await listRecipes(owner, "?scope=custom")).recipes.map((r) => r.id)).toEqual([mine.id]);
      expect((await listRecipes(intruder, "?scope=favorites")).recipes).toEqual([]);
      expect((await listRecipes(intruder, "?scope=custom")).recipes).toEqual([]);
    });

    it("applies every filter, deriving allergens through the ingredients' foods", async () => {
      const peanutFood = await createFood(owner, {
        name: "Satay sauce",
        category: "protein",
        allergenSlugs: ["peanut"],
      });
      const satay = await createRecipe(
        owner,
        recipePayload({
          title: "Satay noodles",
          minAgeMonths: 12,
          ingredients: [{ foodId: peanutFood.id, quantityNote: "1 tbsp" }],
        }),
      );

      // Derived from a CUSTOM food's allergen tags, exactly as the detail
      // route and the favorites list derive theirs.
      expect((await listRecipes(owner)).recipes.find((r) => r.id === satay.id)?.allergens).toEqual(["peanut"]);

      expect((await listRecipes(owner, "?q=satay")).recipes.map((r) => r.id)).toEqual([satay.id]);
      expect((await listRecipes(owner, "?q=porridge")).recipes.map((r) => r.id)).toEqual([fixtures.catalogRecipe.id]);
      expect((await listRecipes(owner, "?allergen=peanut")).recipes.map((r) => r.id)).toEqual([satay.id]);
      expect((await listRecipes(owner, "?allergen=egg")).recipes).toEqual([]);
      // minAgeMonths <= 6 leaves the 12m recipe out.
      expect((await listRecipes(owner, "?maxAgeMonths=6")).recipes.map((r) => r.id)).toEqual([
        fixtures.catalogRecipe.id,
      ]);
      expect((await listRecipes(owner, "?maxAgeMonths=12")).recipes.map((r) => r.id).sort()).toEqual(
        [fixtures.catalogRecipe.id, satay.id].sort(),
      );
      expect((await listRecipes(owner, "?ironFocus=true")).recipes.map((r) => r.id)).toEqual([
        fixtures.catalogRecipe.id,
      ]);
      expect((await listRecipes(owner, `?ingredientFoodId=${peanutFood.id}`)).recipes.map((r) => r.id)).toEqual([
        satay.id,
      ]);
      expect((await listRecipes(owner, `?ingredientFoodId=${fixtures.oats.id}`)).recipes.map((r) => r.id)).toEqual([
        fixtures.catalogRecipe.id,
      ]);
      // Filters compose, and none of them widens visibility.
      expect((await listRecipes(owner, "?scope=custom&allergen=peanut&maxAgeMonths=12")).recipes.map((r) => r.id)).toEqual(
        [satay.id],
      );
      expect((await listRecipes(intruder, `?ingredientFoodId=${peanutFood.id}`)).recipes).toEqual([]);
    });

    it("400s an unusable query", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/recipes?scope=everybodys",
        headers: { cookie: owner.cookie },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "invalid_query" });
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/recipes/:id (item 205)
  // -----------------------------------------------------------------------
  describe("GET /api/recipes/:id", () => {
    it("404s another user's recipe, and an unknown id, for everyone", async () => {
      const theirs = await createRecipe(intruder, recipePayload({ title: "Zucchini sticks" }));

      for (const [label, cookie] of [
        ["owner", owner.cookie],
        ["anonymous", undefined],
      ] as const) {
        const response = await app.inject({
          method: "GET",
          url: `/api/recipes/${theirs.id}`,
          headers: cookie ? { cookie } : {},
        });
        expect(response.statusCode, label).toBe(404);
        expect(response.json(), label).toEqual({ error: "not_found" });
      }

      const unknown = await app.inject({
        method: "GET",
        url: `/api/recipes/${UNKNOWN_ID}`,
        headers: { cookie: owner.cookie },
      });
      expect(unknown.statusCode).toBe(404);
    });

    it("keeps catalog recipes readable by an anonymous caller, with all three variants", async () => {
      const response = await app.inject({ method: "GET", url: `/api/recipes/${fixtures.catalogRecipe.id}` });
      expect(response.statusCode).toBe(200);
      const detail = response.json<RecipeDetail>();
      expect(detail.variants.map((v) => v.ageStage)).toEqual(["6", "9", "12"]);
      expect(detail).toMatchObject({ isCustom: false, notes: null });
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/recipes/:id (item 206)
  // -----------------------------------------------------------------------
  describe("PATCH /api/recipes/:id", () => {
    it("replaces the sets it is given and leaves the rest alone, keeping the slug", async () => {
      const recipe = await createRecipe(
        owner,
        recipePayload({
          extraIngredients: ["olive oil"],
          notes: "First note.",
          ingredients: [{ foodId: fixtures.banana.id, quantityNote: "1 ripe" }],
        }),
      );

      const response = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
        payload: {
          title: "Banana oat squares",
          ingredients: [{ foodId: fixtures.oats.id, quantityNote: "4 tbsp" }],
          extraIngredients: [],
        },
      });

      expect(response.statusCode).toBe(200);
      const updated = response.json<RecipeDetail>();
      expect(updated.title).toBe("Banana oat squares");
      expect(updated.slug).toBe(recipe.slug);
      expect(updated.ingredients.map((i) => i.foodId)).toEqual([fixtures.oats.id]);
      expect(updated.extraIngredients).toEqual([]);
      // Untouched: the steps, the note and the age all stand.
      expect(updated.variants).toEqual(recipe.variants);
      expect(updated.notes).toBe("First note.");
      expect(updated.minAgeMonths).toBe(recipe.minAgeMonths);
    });

    it("moves the steps to the stage a new age derives, and rewrites them on request", async () => {
      const recipe = await createRecipe(owner, recipePayload({ minAgeMonths: 6, steps: ["Mash it."] }));
      expect(recipe.variants.map((v) => v.ageStage)).toEqual(["6"]);

      const aged = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
        payload: { minAgeMonths: 12 },
      });
      expect(aged.json<RecipeDetail>().variants).toEqual([
        { ageStage: "12", textureNote: "", steps: ["Mash it."] },
      ]);

      const restepped = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
        payload: { steps: ["Chop it.", "Serve."] },
      });
      expect(restepped.json<RecipeDetail>().variants).toEqual([
        { ageStage: "12", textureNote: "", steps: ["Chop it.", "Serve."] },
      ]);

      // Still exactly one variant row after all that moving around.
      const rows = await db.select().from(schema.recipeVariants).where(eq(schema.recipeVariants.recipeId, recipe.id));
      expect(rows).toHaveLength(1);
    });

    it("404s another user's recipe, a catalog recipe and an unknown id", async () => {
      const theirs = await createRecipe(intruder, recipePayload({ title: "Zucchini sticks" }));

      for (const id of [theirs.id, fixtures.catalogRecipe.id, UNKNOWN_ID]) {
        const response = await app.inject({
          method: "PATCH",
          url: `/api/recipes/${id}`,
          headers: { cookie: owner.cookie },
          payload: { title: "Mine now" },
        });
        expect(response.statusCode, `${id}`).toBe(404);
        expect(response.json(), `${id}`).toEqual({ error: "not_found" });
      }

      // Nothing moved.
      expect((await app.inject({ method: "GET", url: `/api/recipes/${theirs.id}`, headers: { cookie: intruder.cookie } })).json<RecipeDetail>().title).toBe(
        "Zucchini sticks",
      );
      const [catalog] = await db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, fixtures.catalogRecipe.id));
      expect(catalog?.title).toBe("Banana Porridge");
    });

    it("400s an empty body and an ingredient the caller cannot see", async () => {
      const recipe = await createRecipe(owner, recipePayload());
      const theirFood = await createFood(intruder, { name: "Their satay", category: "protein" });

      const empty = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
        payload: {},
      });
      expect(empty.statusCode).toBe(400);

      const invisible = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
        payload: { ingredients: [{ foodId: theirFood.id }] },
      });
      expect(invisible.statusCode).toBe(400);
      expect(invisible.json()).toEqual({
        error: "invalid_request",
        details: { ingredients: "unknown food", unknownFoodIds: [theirFood.id] },
      });

      // The refused edit changed nothing.
      const after = await app.inject({
        method: "GET",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
      });
      expect(after.json<RecipeDetail>().ingredients.map((i) => i.foodId)).toEqual([fixtures.banana.id]);
    });

    it("401s an unauthenticated edit", async () => {
      const recipe = await createRecipe(owner, recipePayload());
      const response = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}`,
        payload: { title: "Mine now" },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/recipes/:id (item 206)
  // -----------------------------------------------------------------------
  describe("DELETE /api/recipes/:id", () => {
    it("deletes an unreferenced recipe with its ingredients, steps and the caller's favorite", async () => {
      const recipe = await createRecipe(owner, recipePayload());
      await app.inject({
        method: "PUT",
        url: `/api/recipes/${recipe.id}/favorite`,
        headers: { cookie: owner.cookie },
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
      });
      expect(response.statusCode).toBe(204);

      expect(await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id))).toEqual([]);
      expect(
        await db.select().from(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, recipe.id)),
      ).toEqual([]);
      expect(
        await db.select().from(schema.recipeVariants).where(eq(schema.recipeVariants.recipeId, recipe.id)),
      ).toEqual([]);
      expect(await db.select().from(schema.favorites).where(eq(schema.favorites.recipeId, recipe.id))).toEqual([]);

      // Favoriting is not a block, so the favorites list simply loses it.
      const favorites = await app.inject({
        method: "GET",
        url: "/api/favorites",
        headers: { cookie: owner.cookie },
      });
      expect(favorites.json<FavoritesResponse>().items).toEqual([]);
    });

    it("409s with the reference counts while a meal or pantry item still uses it", async () => {
      const recipe = await createRecipe(owner, recipePayload());
      const babyId = await createBaby(owner);

      const meal = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: owner.cookie },
        payload: { foodIds: [fixtures.banana.id], recipeId: recipe.id },
      });
      expect(meal.statusCode).toBe(201);

      const pantry = await app.inject({
        method: "POST",
        url: "/api/pantry",
        headers: { cookie: owner.cookie },
        payload: { recipeId: recipe.id, location: "fridge" },
      });
      expect(pantry.statusCode).toBe(201);

      const blocked = await app.inject({
        method: "DELETE",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
      });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json()).toEqual({ error: "conflict", mealCount: 1, pantryCount: 1 });

      // Still there — a refused delete changes nothing.
      expect(await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id))).toHaveLength(1);
    });

    it("404s another user's recipe, a catalog recipe and an unknown id", async () => {
      const theirs = await createRecipe(intruder, recipePayload({ title: "Zucchini sticks" }));

      for (const id of [theirs.id, fixtures.catalogRecipe.id, UNKNOWN_ID]) {
        const response = await app.inject({
          method: "DELETE",
          url: `/api/recipes/${id}`,
          headers: { cookie: owner.cookie },
        });
        expect(response.statusCode, `${id}`).toBe(404);
      }

      const slugs = (await db.select().from(schema.recipes)).map((row) => row.slug).sort();
      expect(slugs).toEqual(["banana-porridge", theirs.slug].sort());
    });
  });

  // -----------------------------------------------------------------------
  // Logging a custom recipe (item 207)
  // -----------------------------------------------------------------------
  describe("logging", () => {
    it("logs a custom recipe like a catalog one, and rejects another account's", async () => {
      const mine = await createRecipe(owner, recipePayload());
      const theirs = await createRecipe(intruder, recipePayload({ title: "Zucchini sticks" }));
      const babyId = await createBaby(owner);

      const ok = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: owner.cookie },
        payload: { foodIds: [fixtures.banana.id], recipeId: mine.id },
      });
      expect(ok.statusCode).toBe(201);
      expect(ok.json<MealItem>()).toMatchObject({ recipeId: mine.id, recipeTitle: "Banana oat fingers" });

      // Another account's recipe reads as an unknown id, exactly as its foods
      // do — never as a 403 that would confirm it exists.
      for (const recipeId of [theirs.id, UNKNOWN_ID]) {
        const refused = await app.inject({
          method: "POST",
          url: `/api/babies/${babyId}/meals`,
          headers: { cookie: owner.cookie },
          payload: { foodIds: [fixtures.banana.id], recipeId },
        });
        expect(refused.statusCode, recipeId).toBe(400);
        expect(refused.json(), recipeId).toEqual({
          error: "invalid_request",
          details: { recipeId: "unknown recipe" },
        });
      }

      // PATCH validates the same way.
      const mealId = ok.json<MealItem>().id;
      const patched = await app.inject({
        method: "PATCH",
        url: `/api/meals/${mealId}`,
        headers: { cookie: owner.cookie },
        payload: { recipeId: theirs.id },
      });
      expect(patched.statusCode).toBe(400);
    });

    it("stocks and serves a custom recipe from the pantry, fanning out to its ingredient foods", async () => {
      const mine = await createRecipe(
        owner,
        recipePayload({
          ingredients: [
            { foodId: fixtures.banana.id, quantityNote: "1 ripe" },
            { foodId: fixtures.oats.id, quantityNote: "3 tbsp" },
          ],
        }),
      );
      const babyId = await createBaby(owner);

      const stocked = await app.inject({
        method: "POST",
        url: "/api/pantry",
        headers: { cookie: owner.cookie },
        payload: { recipeId: mine.id, location: "freezer" },
      });
      expect(stocked.statusCode).toBe(201);
      const item = stocked.json<PantryItem[]>()[0]!;
      expect(item.recipeTitle).toBe("Banana oat fingers");

      const served = await app.inject({
        method: "POST",
        url: `/api/pantry/${item.id}/serve`,
        headers: { cookie: owner.cookie },
        payload: { babyId },
      });
      expect(served.statusCode).toBe(201);
      const meal = served.json<{ meal: MealItem }>().meal;
      expect(meal.foods.map((f) => f.slug).sort()).toEqual(["banana", "oats"]);

      // Another account cannot stock it in the first place.
      const refused = await app.inject({
        method: "POST",
        url: "/api/pantry",
        headers: { cookie: intruder.cookie },
        payload: { recipeId: mine.id, location: "freezer" },
      });
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toEqual({ error: "invalid_request", details: { recipeId: "unknown recipe" } });
    });

    it("counts a custom recipe's custom-food allergen as an exposure", async () => {
      const peanutFood = await createFood(owner, {
        name: "Satay sauce",
        category: "protein",
        allergenSlugs: ["peanut"],
      });
      const recipe = await createRecipe(
        owner,
        recipePayload({ title: "Satay noodles", ingredients: [{ foodId: peanutFood.id, quantityNote: "1 tbsp" }] }),
      );
      expect(recipe.allergens).toEqual(["peanut"]);

      const babyId = await createBaby(owner);
      // The client fans a recipe out into its ingredient foods; the meal
      // carries both the attribution and the foods actually eaten.
      const meal = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: owner.cookie },
        payload: { foodIds: recipe.ingredients.map((i) => i.foodId), recipeId: recipe.id },
      });
      expect(meal.statusCode).toBe(201);

      const progress = await app.inject({
        method: "GET",
        url: `/api/babies/${babyId}/allergen-progress`,
        headers: { cookie: owner.cookie },
      });
      const items = progress.json<AllergenProgressResponse>().items;
      expect(items.find((item) => item.allergenSlug === "peanut")).toMatchObject({
        status: "started",
        exposures: 1,
        overridden: false,
      });
      expect(items.find((item) => item.allergenSlug === "egg")).toMatchObject({
        status: "not_started",
        exposures: 0,
      });
    });
  });

  // -----------------------------------------------------------------------
  // AI tools (item 208) + custom-food parity (item 214)
  // -----------------------------------------------------------------------
  describe("visibility elsewhere", () => {
    it("keeps another user's custom recipe out of the AI recipe search", async () => {
      const mine = await createRecipe(owner, recipePayload({ title: "Avocado toast fingers" }));

      const ownerTools = buildChatTools(db, await userId(owner), null);
      const mineResult = await ownerTools.search_recipes.run({ ageMonths: 12 });
      expect(String(mineResult)).toContain("Avocado toast fingers");
      expect(String(mineResult)).toContain("Banana Porridge");

      const intruderTools = buildChatTools(db, await userId(intruder), null);
      const theirResult = await intruderTools.search_recipes.run({ ageMonths: 12 });
      expect(String(theirResult)).not.toContain("Avocado toast fingers");
      expect(String(theirResult)).not.toContain(mine.id);
      expect(String(theirResult)).toContain("Banana Porridge");
    });

    it("lists a food's recipes per caller, custom ones included", async () => {
      const mine = await createRecipe(owner, recipePayload({ title: "Avocado toast fingers" }));
      const theirs = await createRecipe(intruder, recipePayload({ title: "Zucchini sticks" }));

      const forOwner = await app.inject({
        method: "GET",
        url: "/api/foods/banana",
        headers: { cookie: owner.cookie },
      });
      const ownerTitles = forOwner.json<FoodDetail>().recipes.map((r) => r.title);
      expect(ownerTitles).toEqual(["Avocado toast fingers", "Banana Porridge"]);
      expect(ownerTitles).not.toContain("Zucchini sticks");

      const forIntruder = await app.inject({
        method: "GET",
        url: "/api/foods/banana",
        headers: { cookie: intruder.cookie },
      });
      expect(forIntruder.json<FoodDetail>().recipes.map((r) => r.title)).toEqual([
        "Banana Porridge",
        "Zucchini sticks",
      ]);

      // Anonymous callers see the catalog and nothing else.
      const anonymous = await app.inject({ method: "GET", url: "/api/foods/banana" });
      expect(anonymous.json<FoodDetail>().recipes.map((r) => r.title)).toEqual(["Banana Porridge"]);

      expect([mine.id, theirs.id]).toHaveLength(2);
    });

    it("favorites a custom recipe, but never another account's", async () => {
      const mine = await createRecipe(owner, recipePayload({ title: "Avocado toast fingers" }));

      const ok = await app.inject({
        method: "PUT",
        url: `/api/recipes/${mine.id}/favorite`,
        headers: { cookie: owner.cookie },
      });
      expect(ok.statusCode).toBe(204);

      const favorites = await app.inject({
        method: "GET",
        url: "/api/favorites",
        headers: { cookie: owner.cookie },
      });
      expect(favorites.json<FavoritesResponse>().items.map((i) => i.title)).toEqual(["Avocado toast fingers"]);

      const refused = await app.inject({
        method: "PUT",
        url: `/api/recipes/${mine.id}/favorite`,
        headers: { cookie: intruder.cookie },
      });
      expect(refused.statusCode).toBe(404);
      expect(await db.select().from(schema.favorites).where(eq(schema.favorites.recipeId, mine.id))).toHaveLength(1);
    });

    it("blocks deleting a custom food that a custom recipe is built on", async () => {
      const food = await createFood(owner, { name: "My satay", category: "protein" });
      await createRecipe(owner, recipePayload({ ingredients: [{ foodId: food.id, quantityNote: "1 tbsp" }] }));

      const blocked = await app.inject({
        method: "DELETE",
        url: `/api/foods/${food.id}`,
        headers: { cookie: owner.cookie },
      });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json()).toEqual({ error: "conflict", mealCount: 0, pantryCount: 0, recipeCount: 1 });
    });
  });
});
