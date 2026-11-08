import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { PGlite } from "@electric-sql/pglite";
import type { FastifyInstance } from "fastify";
import {
  DEFAULT_DAILY_MEALS,
  planResponseSchema,
  plateInputFromItems,
  type AllergenProgressResponse,
  type Baby,
  type CreateStorageItemResponse,
  type FavoritesResponse,
  type FoodDetail,
  type MealItem,
  type RecipeDetail,
  type RecipesResponse,
  type StorageItem,
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

  const [banana, oats, broccoli, beef, bellPepper, pear] = await db
    .insert(schema.foods)
    .values([
      {
        slug: "banana",
        name: "Banana",
        category: "fruit",
        ironLevel: "low",
        vitaminCLevel: "moderate",
        fiberLevel: "moderate",
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
        fiberLevel: "moderate",
        chokingRisk: "low",
        minAgeMonths: 6,
        prep6m: "porridge",
        prep9m: "porridge",
        prep12m: "porridge",
        storageCategory: "produce_cooked",
      },
      {
        // Catalog food with a high vitamin C level — the ingredient a custom
        // recipe needs to qualify for `vitaminCHigh`, since a custom food
        // always stores "low" (see `routes/catalog.ts` defaults).
        slug: "broccoli",
        name: "Broccoli",
        category: "veg",
        ironLevel: "low",
        vitaminCLevel: "high",
        fiberLevel: "high",
        chokingRisk: "low",
        minAgeMonths: 6,
        prep6m: "steam-mash",
        prep9m: "steam-chop",
        prep12m: "florets",
        storageCategory: "produce_cooked",
      },
      {
        // Catalog food with a HIGH iron level — the ingredient that makes a
        // custom recipe iron-rich without anybody curating it (items 241-242).
        slug: "beef",
        name: "Beef",
        category: "protein",
        ironLevel: "high",
        vitaminCLevel: "low",
        fiberLevel: "low",
        chokingRisk: "moderate",
        minAgeMonths: 6,
        prep6m: "strip",
        prep9m: "mince",
        prep12m: "cubes",
        storageCategory: "produce_cooked",
      },
      {
        // High vitamin C, low iron — the other half of the beef + pepper
        // pairing item 242 names.
        slug: "bell-pepper",
        name: "Bell pepper",
        category: "veg",
        ironLevel: "low",
        vitaminCLevel: "high",
        fiberLevel: "low",
        chokingRisk: "low",
        minAgeMonths: 6,
        prep6m: "roast-strip",
        prep9m: "roast-chop",
        prep12m: "dice",
        storageCategory: "produce_cooked",
      },
      {
        // HIGH fiber and nothing else — the ingredient that isolates
        // `fiberHigh` from the other two flags (items 276-278). Broccoli is
        // high fiber too, but it is also high vitamin C, so it cannot tell a
        // fiber filter apart from a vitamin C one.
        slug: "pear",
        name: "Pear",
        category: "fruit",
        ironLevel: "low",
        vitaminCLevel: "low",
        fiberLevel: "high",
        chokingRisk: "low",
        minAgeMonths: 6,
        prep6m: "ripe-wedge",
        prep9m: "dice",
        prep12m: "dice",
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

  return {
    banana: banana!,
    oats: oats!,
    broccoli: broccoli!,
    beef: beef!,
    bellPepper: bellPepper!,
    pear: pear!,
    peanut: peanut!,
    egg: egg!,
    catalogRecipe: catalogRecipe!,
  };
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
          extraIngredients: [{ name: "chia seeds", quantityNote: "1 tsp" }, { name: "olive oil" }],
          steps: ["Mash the banana.", "Stir in the oats."],
          notes: "Robin likes it cold.",
        }),
      );

      expect(recipe).toMatchObject({
        title: "Banana oat fingers",
        minAgeMonths: 9,
        isCustom: true,
        notes: "Robin likes it cold.",
        // Objects since item 298; an omitted quantity is stored as "".
        extraIngredients: [
          { name: "chia seeds", quantityNote: "1 tsp" },
          { name: "olive oil", quantityNote: "" },
        ],
        // Nothing curated: no image, no storage overrides, no stored iron
        // claim (banana + oats derive none either), and
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
          // Item 334: the per-ingredient breakdown, empty for a food that
          // carries no allergen.
          allergens: [],
          deleted: false,
        },
        {
          foodId: fixtures.oats.id,
          foodSlug: "oats",
          foodName: "Oats",
          isCustom: false,
          foodEmoji: null,
          // An omitted quantity is "" — a real answer, not a missing field.
          quantityNote: "",
          allergens: [],
          deleted: false,
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

    // Item 240 (user decision 2026-09-08): steps are OPTIONAL. A title plus
    // one ingredient is a whole recipe — an empty list, a list of blanks, and
    // an omitted key all save, and all read back identically.
    it("creates a recipe with no steps at all, however the empty list is expressed", async () => {
      const empty = await createRecipe(owner, recipePayload({ steps: [] }));
      const blanks = await createRecipe(owner, recipePayload({ steps: ["  ", ""] }));
      const { steps: _omitted, ...withoutSteps } = recipePayload();
      const absent = await createRecipe(owner, withoutSteps);

      for (const recipe of [empty, blanks, absent]) {
        // The variant row is still written, so a custom recipe is ALWAYS
        // exactly one variant — gaining or losing steps never changes that.
        expect(recipe.variants).toEqual([{ ageStage: "6", textureNote: "", steps: [] }]);
        expect(recipe.ingredients).toHaveLength(1);

        const rows = await db
          .select()
          .from(schema.recipeVariants)
          .where(eq(schema.recipeVariants.recipeId, recipe.id));
        expect(rows).toHaveLength(1);

        // And the detail route returns the same shape it just answered with.
        const detail = await app.inject({
          method: "GET",
          url: `/api/recipes/${recipe.id}`,
          headers: { cookie: owner.cookie },
        });
        expect(detail.statusCode).toBe(200);
        expect(detail.json<RecipeDetail>()).toEqual(recipe);
      }
    });

    // Item 298: extra ingredients carry their own quantity.
    it("keeps each extra ingredient's quantity, dropping blanks and case-insensitive repeats", async () => {
      const recipe = await createRecipe(
        owner,
        recipePayload({
          extraIngredients: [
            { name: "  Olive oil  ", quantityNote: "  a drizzle of  " },
            { name: "", quantityNote: "1 tsp" },
            { name: "   " },
            // Same name in another casing: the FIRST row stands, quantity included.
            { name: "OLIVE OIL", quantityNote: "2 tbsp" },
            { name: "chia seeds", quantityNote: "1 tsp" },
          ],
        }),
      );

      expect(recipe.extraIngredients).toEqual([
        { name: "Olive oil", quantityNote: "a drizzle of" },
        { name: "chia seeds", quantityNote: "1 tsp" },
      ]);

      // And it survives the round trip through the database unchanged.
      const detail = await app.inject({
        method: "GET",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
      });
      expect(detail.json<RecipeDetail>().extraIngredients).toEqual(recipe.extraIngredients);
    });

    it("still accepts plain strings for extra ingredients, reading them as a name with no quantity", async () => {
      const recipe = await createRecipe(owner, recipePayload({ extraIngredients: ["olive oil", "  chia seeds  "] }));
      expect(recipe.extraIngredients).toEqual([
        { name: "olive oil", quantityNote: "" },
        { name: "chia seeds", quantityNote: "" },
      ]);
    });

    it("400s an over-long extra ingredient name or quantity, and too many of them", async () => {
      for (const extraIngredients of [
        [{ name: "x".repeat(61) }],
        [{ name: "olive oil", quantityNote: "q".repeat(81) }],
        Array.from({ length: 21 }, (_unused, i) => ({ name: `extra ${i}` })),
      ]) {
        const response = await app.inject({
          method: "POST",
          url: "/api/recipes",
          headers: { cookie: owner.cookie },
          payload: recipePayload({ extraIngredients }),
        });
        expect(response.statusCode, JSON.stringify(extraIngredients).slice(0, 40)).toBe(400);
      }
    });

    it("drops blank steps rather than rejecting them, keeping the rest in order", async () => {
      const recipe = await createRecipe(owner, recipePayload({ steps: ["  ", "Mash it.", "", "  Serve.  "] }));
      expect(recipe.variants).toEqual([{ ageStage: "6", textureNote: "", steps: ["Mash it.", "Serve."] }]);
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

    it("400s an unusable title, age or ingredient list", async () => {
      const bodies = [
        recipePayload({ title: "   " }),
        recipePayload({ minAgeMonths: 3 }),
        recipePayload({ minAgeMonths: 48 }),
        recipePayload({ ingredients: [] }),
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
          // The custom food was created with no allergen tags.
          allergens: [],
          deleted: false,
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

    // Item 593/594: Allergen is pick-several — a recipe containing ANY
    // picked allergen matches, and the group still ANDs with the rest.
    it("matches ANY of several repeated allergen params, still ANDed with other filters", async () => {
      const peanutFood = await createFood(owner, { name: "Satay sauce", category: "protein", allergenSlugs: ["peanut"] });
      const eggFood = await createFood(owner, { name: "Omelette strips", category: "protein", allergenSlugs: ["egg"] });
      const satay = await createRecipe(
        owner,
        recipePayload({ title: "Satay noodles", minAgeMonths: 12, ingredients: [{ foodId: peanutFood.id, quantityNote: "" }] }),
      );
      const omelette = await createRecipe(
        owner,
        recipePayload({ title: "Omelette fingers", minAgeMonths: 6, ingredients: [{ foodId: eggFood.id, quantityNote: "" }] }),
      );
      const ids = async (query: string) => (await listRecipes(owner, query)).recipes.map((r) => r.id).sort();

      expect(await ids("?allergen=peanut")).toEqual([satay.id]);
      expect(await ids("?allergen=peanut&allergen=egg")).toEqual([satay.id, omelette.id].sort());
      expect(await ids("?allergen=egg&allergen=peanut&maxAgeMonths=6")).toEqual([omelette.id]);

      for (const bad of ["?allergen=peanut&allergen=", "?allergen="]) {
        const response = await app.inject({ method: "GET", url: `/api/recipes${bad}`, headers: { cookie: owner.cookie } });
        expect(response.statusCode, bad).toBe(400);
      }
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

    // -----------------------------------------------------------------------
    // vitaminCHigh filter (ledger 224-225): derived from ingredients' foods,
    // exactly like ironFocus but ANDed with it rather than replacing it.
    // -----------------------------------------------------------------------
    describe("vitaminCHigh filter", () => {
      it("derives vitaminCHigh from a high-vitamin-C catalog ingredient, even on a custom recipe", async () => {
        const veggieMash = await createRecipe(
          owner,
          recipePayload({
            title: "Broccoli mash",
            ingredients: [{ foodId: fixtures.broccoli.id, quantityNote: "2 florets" }],
          }),
        );
        expect(veggieMash.vitaminCHigh).toBe(true);

        const list = await listRecipes(owner);
        expect(list.recipes.find((r) => r.id === veggieMash.id)?.vitaminCHigh).toBe(true);
        // The seeded catalog recipe (banana + oats, neither "high") does not.
        expect(list.recipes.find((r) => r.id === fixtures.catalogRecipe.id)?.vitaminCHigh).toBe(false);

        const detail = await app.inject({
          method: "GET",
          url: `/api/recipes/${veggieMash.id}`,
          headers: { cookie: owner.cookie },
        });
        expect(detail.json<RecipeDetail>().vitaminCHigh).toBe(true);
      });

      it("filters on vitaminCHigh alone, ironFocus alone, and both together (ANDed)", async () => {
        // Iron-focus, no high vitamin C (banana + oats).
        const catalogId = fixtures.catalogRecipe.id;
        // High vitamin C, not iron-focus: broccoli is ironLevel "low", and a
        // custom recipe stores no curated iron claim (it CAN still derive one
        // from a high-iron ingredient — see the "derived ironFocus" tests).
        const veggieMash = await createRecipe(
          owner,
          recipePayload({
            title: "Broccoli mash",
            ingredients: [{ foodId: fixtures.broccoli.id, quantityNote: "2 florets" }],
          }),
        );
        // Neither: plain banana.
        const plainBanana = await createRecipe(owner, recipePayload({ title: "Plain banana" }));

        expect((await listRecipes(owner, "?vitaminCHigh=true")).recipes.map((r) => r.id)).toEqual([veggieMash.id]);
        expect((await listRecipes(owner, "?ironFocus=true")).recipes.map((r) => r.id)).toEqual([catalogId]);
        // Both together: nothing here is both iron-focus AND high vitamin C.
        expect((await listRecipes(owner, "?ironFocus=true&vitaminCHigh=true")).recipes).toEqual([]);
        // "false" returns only non-qualifying recipes.
        const nonQualifying = (await listRecipes(owner, "?vitaminCHigh=false")).recipes.map((r) => r.id).sort();
        expect(nonQualifying).toEqual([catalogId, plainBanana.id].sort());
        expect(nonQualifying).not.toContain(veggieMash.id);
      });
    });

    // -----------------------------------------------------------------------
    // fiberHigh filter (ledger items 276-278). Purely derived from the
    // ingredients' foods, exactly like vitaminCHigh, and ANDed with the other
    // two rather than replacing either.
    // -----------------------------------------------------------------------
    describe("fiberHigh filter", () => {
      /** Pear is high fiber and nothing else — a custom recipe built on it
       * qualifies for `fiberHigh` alone, since a custom FOOD always stores
       * "low" (see `routes/catalog.ts` placeholders). */
      async function createPearMash(): Promise<RecipeDetail> {
        return await createRecipe(
          owner,
          recipePayload({
            title: "Pear mash",
            ingredients: [{ foodId: fixtures.pear.id, quantityNote: "1 ripe" }],
          }),
        );
      }

      /** Beef (high iron) + bell pepper (high vitamin C) + pear (high fiber):
       * all three flags, from ingredients alone, on a recipe nobody curated. */
      async function createAllThree(): Promise<RecipeDetail> {
        return await createRecipe(
          owner,
          recipePayload({
            title: "Beef, pepper and pear",
            ingredients: [
              { foodId: fixtures.beef.id, quantityNote: "2 strips" },
              { foodId: fixtures.bellPepper.id, quantityNote: "1/2" },
              { foodId: fixtures.pear.id, quantityNote: "1 wedge" },
            ],
          }),
        );
      }

      it("derives fiberHigh from a high-fiber catalog ingredient, even on a custom recipe", async () => {
        const pearMash = await createPearMash();
        // The create response IS the detail payload.
        expect(pearMash.fiberHigh).toBe(true);
        // Fiber only: pear is low iron and low vitamin C.
        expect(pearMash.ironFocus).toBe(false);
        expect(pearMash.vitaminCHigh).toBe(false);

        const list = await listRecipes(owner);
        expect(list.recipes.find((r) => r.id === pearMash.id)?.fiberHigh).toBe(true);
        // The seeded catalog recipe (banana + oats, both "moderate") does not.
        expect(list.recipes.find((r) => r.id === fixtures.catalogRecipe.id)?.fiberHigh).toBe(false);

        const detail = await app.inject({
          method: "GET",
          url: `/api/recipes/${pearMash.id}`,
          headers: { cookie: owner.cookie },
        });
        expect(detail.json<RecipeDetail>().fiberHigh).toBe(true);

        // Derived, never stored: nothing on the recipe row records it.
        const [row] = await db
          .select({ ironFocus: schema.recipes.ironFocus })
          .from(schema.recipes)
          .where(eq(schema.recipes.id, pearMash.id));
        expect(row?.ironFocus).toBe(false);
      });

      it("filters on fiberHigh alone, with ironFocus, with vitaminCHigh, and all three together", async () => {
        const pearMash = await createPearMash();
        const allThree = await createAllThree();
        const plainBanana = await createRecipe(owner, recipePayload({ title: "Plain banana" }));
        const catalogId = fixtures.catalogRecipe.id;

        // Alone: both fiber recipes, still title-ascending.
        expect((await listRecipes(owner, "?fiberHigh=true")).recipes.map((r) => r.title)).toEqual([
          "Beef, pepper and pear",
          "Pear mash",
        ]);

        // With iron: only the beef one derives ironFocus.
        expect((await listRecipes(owner, "?fiberHigh=true&ironFocus=true")).recipes.map((r) => r.id)).toEqual([
          allThree.id,
        ]);
        // With vitamin C: only the bell-pepper one.
        expect((await listRecipes(owner, "?fiberHigh=true&vitaminCHigh=true")).recipes.map((r) => r.id)).toEqual([
          allThree.id,
        ]);
        // All three at once.
        expect(
          (await listRecipes(owner, "?ironFocus=true&vitaminCHigh=true&fiberHigh=true")).recipes.map((r) => r.id),
        ).toEqual([allThree.id]);
        // High fiber but explicitly NOT iron-focused: the pear mash.
        expect((await listRecipes(owner, "?fiberHigh=true&ironFocus=false")).recipes.map((r) => r.id)).toEqual([
          pearMash.id,
        ]);

        // "false" returns only non-qualifying recipes.
        const nonQualifying = (await listRecipes(owner, "?fiberHigh=false")).recipes.map((r) => r.id).sort();
        expect(nonQualifying).toEqual([catalogId, plainBanana.id].sort());
        expect(nonQualifying).not.toContain(pearMash.id);
        expect(nonQualifying).not.toContain(allThree.id);
      });

      it("carries fiberHigh on GET /api/favorites", async () => {
        const pearMash = await createPearMash();
        const plainBanana = await createRecipe(owner, recipePayload({ title: "Plain banana" }));
        for (const id of [pearMash.id, plainBanana.id, fixtures.catalogRecipe.id]) {
          const response = await app.inject({
            method: "PUT",
            url: `/api/recipes/${id}/favorite`,
            headers: { cookie: owner.cookie },
          });
          expect(response.statusCode).toBe(204);
        }

        const favorites = await app.inject({
          method: "GET",
          url: "/api/favorites",
          headers: { cookie: owner.cookie },
        });
        const items = favorites.json<FavoritesResponse>().items;
        expect(items.find((i) => i.recipeId === pearMash.id)).toMatchObject({
          fiberHigh: true,
          ironFocus: false,
          vitaminCHigh: false,
        });
        expect(items.find((i) => i.recipeId === plainBanana.id)?.fiberHigh).toBe(false);
        expect(items.find((i) => i.recipeId === fixtures.catalogRecipe.id)?.fiberHigh).toBe(false);
      });
    });

    // -----------------------------------------------------------------------
    // ironFocus derived from ingredients (ledger items 241-242).
    //
    // `ironFocus` is the ONE nutrition flag that is half curated: the answer
    // everywhere is `recipes.iron_focus` OR "some ingredient food is
    // high-iron". These pin both halves, on the list, the detail, the
    // favorites list and the filter — and that the stored column is never
    // written from the derivation.
    // -----------------------------------------------------------------------
    describe("derived ironFocus", () => {
      /** Beef (high iron) + bell pepper (high vitamin C): both badges, from
       * ingredients alone, on a recipe nobody curated. */
      async function createBeefAndPepper(): Promise<RecipeDetail> {
        return await createRecipe(
          owner,
          recipePayload({
            title: "Beef and pepper strips",
            ingredients: [
              { foodId: fixtures.beef.id, quantityNote: "2 strips" },
              { foodId: fixtures.bellPepper.id, quantityNote: "1/2" },
            ],
          }),
        );
      }

      it("gives a custom beef + bell pepper recipe BOTH flags, on the list and the detail", async () => {
        const created = await createBeefAndPepper();
        // The create response is the detail payload, so this is the detail
        // route's answer too.
        expect(created.ironFocus).toBe(true);
        expect(created.vitaminCHigh).toBe(true);

        const detail = await app.inject({
          method: "GET",
          url: `/api/recipes/${created.id}`,
          headers: { cookie: owner.cookie },
        });
        expect(detail.json<RecipeDetail>()).toMatchObject({ ironFocus: true, vitaminCHigh: true });

        const listed = (await listRecipes(owner)).recipes.find((r) => r.id === created.id);
        expect(listed).toMatchObject({ ironFocus: true, vitaminCHigh: true, isCustom: true });

        // Derived, never stored: the column a curator would write stays false.
        const [row] = await db
          .select({ ironFocus: schema.recipes.ironFocus })
          .from(schema.recipes)
          .where(eq(schema.recipes.id, created.id));
        expect(row?.ironFocus).toBe(false);
      });

      it("leaves a custom recipe with only low-iron ingredients at ironFocus false", async () => {
        // Banana is ironLevel "low"; a custom food is always "low" too.
        const plain = await createRecipe(owner, recipePayload({ title: "Plain banana" }));
        expect(plain.ironFocus).toBe(false);
        expect((await listRecipes(owner)).recipes.find((r) => r.id === plain.id)?.ironFocus).toBe(false);
      });

      it("keeps a curated ironFocus true even with no high-iron ingredient", async () => {
        // The seeded recipe is banana (low) + oats (moderate) — nothing high —
        // but the catalog says it is here for the iron, so it stays true.
        const catalogId = fixtures.catalogRecipe.id;
        expect((await listRecipes(owner)).recipes.find((r) => r.id === catalogId)?.ironFocus).toBe(true);

        const detail = await app.inject({ method: "GET", url: `/api/recipes/${catalogId}` });
        expect(detail.json<RecipeDetail>().ironFocus).toBe(true);
      });

      it("filters on the DERIVED value: true includes the derived case, false excludes it", async () => {
        const beefPepper = await createBeefAndPepper();
        const plain = await createRecipe(owner, recipePayload({ title: "Plain banana" }));
        const catalogId = fixtures.catalogRecipe.id;

        // true = curated OR derived, still ordered by title ascending.
        const wanted = (await listRecipes(owner, "?ironFocus=true")).recipes;
        expect(wanted.map((r) => r.id)).toEqual([fixtures.catalogRecipe.id, beefPepper.id]);
        expect(wanted.map((r) => r.title)).toEqual(["Banana Porridge", "Beef and pepper strips"]);

        // false = NEITHER curated nor derived.
        const unwanted = (await listRecipes(owner, "?ironFocus=false")).recipes.map((r) => r.id);
        expect(unwanted).toEqual([plain.id]);
        expect(unwanted).not.toContain(beefPepper.id);
        expect(unwanted).not.toContain(catalogId);
      });

      it("ANDs the two toggles against the derived values", async () => {
        const beefPepper = await createBeefAndPepper();
        // Iron only (curated, no high vitamin C) and vitamin C only.
        const veggieMash = await createRecipe(
          owner,
          recipePayload({
            title: "Broccoli mash",
            ingredients: [{ foodId: fixtures.broccoli.id, quantityNote: "2 florets" }],
          }),
        );

        expect((await listRecipes(owner, "?ironFocus=true&vitaminCHigh=true")).recipes.map((r) => r.id)).toEqual([
          beefPepper.id,
        ]);
        expect((await listRecipes(owner, "?ironFocus=true&vitaminCHigh=false")).recipes.map((r) => r.id)).toEqual([
          fixtures.catalogRecipe.id,
        ]);
        expect((await listRecipes(owner, "?ironFocus=false&vitaminCHigh=true")).recipes.map((r) => r.id)).toEqual([
          veggieMash.id,
        ]);
      });

      it("carries the derived ironFocus on GET /api/favorites", async () => {
        const beefPepper = await createBeefAndPepper();
        const plain = await createRecipe(owner, recipePayload({ title: "Plain banana" }));
        for (const id of [beefPepper.id, plain.id, fixtures.catalogRecipe.id]) {
          const response = await app.inject({
            method: "PUT",
            url: `/api/recipes/${id}/favorite`,
            headers: { cookie: owner.cookie },
          });
          expect(response.statusCode).toBe(204);
        }

        const favorites = await app.inject({
          method: "GET",
          url: "/api/favorites",
          headers: { cookie: owner.cookie },
        });
        const items = favorites.json<FavoritesResponse>().items;
        expect(items.find((i) => i.recipeId === beefPepper.id)).toMatchObject({
          ironFocus: true,
          vitaminCHigh: true,
        });
        // Curated, no high-iron ingredient — still true.
        expect(items.find((i) => i.recipeId === fixtures.catalogRecipe.id)?.ironFocus).toBe(true);
        expect(items.find((i) => i.recipeId === plain.id)?.ironFocus).toBe(false);
      });
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

    // Item 334: the recipe-level `allergens` says the DISH contains them;
    // the per-ingredient list says which food brought each one, which is
    // what the ingredient rows now show.
    it("breaks the derived allergens down per ingredient, from the same join", async () => {
      const peanutFood = await createFood(owner, {
        name: "Satay sauce",
        category: "protein",
        allergenSlugs: ["peanut"],
      });
      const recipe = await createRecipe(
        owner,
        recipePayload({
          title: "Satay noodles",
          ingredients: [
            { foodId: peanutFood.id, quantityNote: "1 tbsp" },
            { foodId: fixtures.pear.id, quantityNote: "1 ripe" },
          ],
        }),
      );

      expect(recipe.allergens).toEqual(["peanut"]);
      const byName = new Map(recipe.ingredients.map((i) => [i.foodName, i.allergens]));
      expect(byName.get("Satay sauce")).toEqual(["peanut"]);
      expect(byName.get("Pear")).toEqual([]);
    });

    it("gives every catalog ingredient an allergens array, empty when it carries none", async () => {
      const response = await app.inject({ method: "GET", url: `/api/recipes/${fixtures.catalogRecipe.id}` });
      const detail = response.json<RecipeDetail>();
      expect(detail.ingredients.length).toBeGreaterThan(0);
      for (const ingredient of detail.ingredients) {
        expect(Array.isArray(ingredient.allergens), ingredient.foodName).toBe(true);
      }
      expect(detail.allergens).toEqual([]);
      expect(detail.ingredients.flatMap((i) => i.allergens)).toEqual([]);
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
          extraIngredients: [{ name: "olive oil", quantityNote: "a drizzle of" }],
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

    it("replaces the extra ingredients with quantities and reads them back (item 298)", async () => {
      const recipe = await createRecipe(owner, recipePayload({ extraIngredients: [{ name: "olive oil" }] }));
      expect(recipe.extraIngredients).toEqual([{ name: "olive oil", quantityNote: "" }]);

      const response = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
        payload: {
          extraIngredients: [
            { name: "olive oil", quantityNote: "1 tbsp" },
            { name: "cinnamon", quantityNote: "a pinch of" },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<RecipeDetail>().extraIngredients).toEqual([
        { name: "olive oil", quantityNote: "1 tbsp" },
        { name: "cinnamon", quantityNote: "a pinch of" },
      ]);

      // Persisted as jsonb objects, not re-flattened to strings on the way in.
      const [row] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id));
      expect(row?.extraIngredients).toEqual([
        { name: "olive oil", quantityNote: "1 tbsp" },
        { name: "cinnamon", quantityNote: "a pinch of" },
      ]);
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

    // Item 240, the edit half: a parent can take every step back off a
    // recipe they already saved, and put them back later.
    it("clears the steps on request and accepts them again afterwards", async () => {
      const recipe = await createRecipe(owner, recipePayload({ steps: ["Mash it.", "Serve."] }));

      const cleared = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
        payload: { steps: [] },
      });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json<RecipeDetail>().variants).toEqual([{ ageStage: "6", textureNote: "", steps: [] }]);

      // Blanks are dropped on a PATCH exactly as on a create — still no error.
      const blanked = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
        payload: { steps: ["   "] },
      });
      expect(blanked.statusCode).toBe(200);
      expect(blanked.json<RecipeDetail>().variants).toEqual([{ ageStage: "6", textureNote: "", steps: [] }]);

      const refilled = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
        payload: { steps: ["Mash it."] },
      });
      expect(refilled.statusCode).toBe(200);
      expect(refilled.json<RecipeDetail>().variants).toEqual([
        { ageStage: "6", textureNote: "", steps: ["Mash it."] },
      ]);

      // One variant row throughout, never zero and never two.
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

    // Ledger 957 (owner 2026-11-07): the delete used to 409 here ("Used in 1
    // meal — remove those first."). Now it always works: a recipe a meal or
    // container names is soft-deleted and history keeps it, marked.
    it("soft-deletes a recipe a meal or storage item still uses: 204, the row and its ingredients kept, marked deleted (ledger 957)", async () => {
      const recipe = await createRecipe(owner, recipePayload());
      const babyId = await createBaby(owner);

      const meal = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: owner.cookie },
        payload: { foodIds: [fixtures.banana.id], recipeId: recipe.id },
      });
      expect(meal.statusCode).toBe(201);

      const storage = await app.inject({
        method: "POST",
        url: "/api/storage",
        headers: { cookie: owner.cookie },
        payload: { recipeId: recipe.id, location: "fridge" },
      });
      expect(storage.statusCode).toBe(201);

      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
      });
      expect(deleted.statusCode).toBe(204);
      expect(deleted.body).toBe("");

      const [row] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id));
      expect(row?.deletedAt).toBeInstanceOf(Date);
      // A single-recipe container names it, marked.
      const box = (await app.inject({ method: "GET", url: "/api/storage", headers: { cookie: owner.cookie } }))
        .json<{ items: StorageItem[] }>()
        .items.find((item) => item.recipeId === recipe.id)!;
      expect(box.recipes).toEqual([{ id: recipe.id, title: "Banana oat fingers", deleted: true }]);
      expect(box.recipeTitle).toBe("Banana oat fingers");
      expect(
        await db.select().from(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, recipe.id)),
      ).toHaveLength(1);
      expect(
        await db.select().from(schema.recipeVariants).where(eq(schema.recipeVariants.recipeId, recipe.id)),
      ).toHaveLength(1);
    });

    it("soft-deletes a recipe that is a meal's SECOND recipe, keeping both on the meal (ledgers 754, 957)", async () => {
      const recipe = await createRecipe(owner, recipePayload());
      const babyId = await createBaby(owner);

      // Position 1: the legacy `meals.recipe_id` mirror names only the first.
      const meal = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: owner.cookie },
        payload: { foodIds: [fixtures.banana.id], recipeIds: [fixtures.catalogRecipe.id, recipe.id] },
      });
      expect(meal.statusCode).toBe(201);
      const mealId = meal.json<{ id: string }>().id;
      const favorite = await app.inject({ method: "PUT", url: `/api/recipes/${recipe.id}/favorite`, headers: { cookie: owner.cookie } });
      expect(favorite.statusCode).toBe(204);

      const del = () => app.inject({ method: "DELETE", url: `/api/recipes/${recipe.id}`, headers: { cookie: owner.cookie } });
      expect((await del()).statusCode).toBe(204);
      // Nothing cascaded: the meal still has both recipes; the favorite went.
      expect(await db.select().from(schema.mealRecipes).where(eq(schema.mealRecipes.mealId, mealId))).toHaveLength(2);
      expect(await db.select().from(schema.favorites).where(eq(schema.favorites.recipeId, recipe.id))).toEqual([]);
      const read = await app.inject({ method: "GET", url: `/api/meals/${mealId}`, headers: { cookie: owner.cookie } });
      expect(read.json<MealItem>().recipes).toEqual([
        { id: fixtures.catalogRecipe.id, title: "Banana Porridge", rating: null },
        { id: recipe.id, title: "Banana oat fingers", rating: null, deleted: true },
      ]);

      // An edit can still take it off (it is not re-added after that).
      const edit = await app.inject({
        method: "PATCH",
        url: `/api/meals/${mealId}`,
        headers: { cookie: owner.cookie },
        payload: { recipeIds: [fixtures.catalogRecipe.id] },
      });
      expect(edit.statusCode).toBe(200);
      const readd = await app.inject({
        method: "PATCH",
        url: `/api/meals/${mealId}`,
        headers: { cookie: owner.cookie },
        payload: { recipeIds: [fixtures.catalogRecipe.id, recipe.id] },
      });
      expect(readd.statusCode).toBe(400);
      expect(readd.json()).toMatchObject({ details: { recipeIds: "unknown recipe", unknownRecipeIds: [recipe.id] } });
    });

    // Ledger 754: on Postgres a meal saved between the count and the DELETE
    // would have its new `meal_recipes` row cascade away. The guard closes
    // that by locking the recipe row FOR UPDATE (which conflicts with the
    // FOR KEY SHARE a foreign-key check takes; FOR SHARE would not) and
    // counting inside the same transaction. PGlite cannot run the race, so
    // the statement order is pinned; the race itself is in the dry run.
    it("locks the recipe row FOR UPDATE, then counts, then soft-deletes, inside one transaction (ledgers 754, 957)", async () => {
      const recipe = await createRecipe(owner, recipePayload());
      const babyId = await createBaby(owner);
      const meal = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: owner.cookie },
        payload: { foodIds: [fixtures.banana.id], recipeIds: [fixtures.catalogRecipe.id, recipe.id] },
      });
      expect(meal.statusCode).toBe(201);

      const events: string[] = [];
      const original = PgDialect.prototype.sqlToQuery;
      const sqlSpy = vi.spyOn(PgDialect.prototype, "sqlToQuery").mockImplementation(function (this: PgDialect, ...args) {
        const query = original.apply(this, args);
        events.push(query.sql.toLowerCase());
        return query;
      });
      const client = (db as unknown as { $client: PGlite }).$client;
      const originalTransaction = client.transaction.bind(client);
      const txSpy = vi.spyOn(client, "transaction").mockImplementation(async (callback) => {
        events.push("<begin>");
        try {
          return await originalTransaction(callback);
        } finally {
          events.push("<end>");
        }
      });
      let status: number;
      try {
        status = (await app.inject({ method: "DELETE", url: `/api/recipes/${recipe.id}`, headers: { cookie: owner.cookie } })).statusCode;
      } finally {
        sqlSpy.mockRestore();
        txSpy.mockRestore();
      }
      expect(status).toBe(204);
      const trace = events.join("\n");
      const lock = events.findIndex((text) => /^select .* from "recipes" where .* for update$/.test(text));
      const begin = events.lastIndexOf("<begin>", lock);
      const mealCount = events.findIndex((text) => text.includes('from "meal_recipes"') && text.includes("count("));
      const storageCount = events.findIndex((text) => text.includes('from "storage_items"') && text.includes("count("));
      const end = events.indexOf("<end>", lock);
      expect(lock, trace).toBeGreaterThanOrEqual(0);
      expect(begin, trace).toBeGreaterThanOrEqual(0);
      expect(events.slice(begin, lock), trace).not.toContain("<end>");
      expect(mealCount, trace).toBeGreaterThan(lock);
      expect(storageCount, trace).toBeGreaterThan(lock);
      expect(end, trace).toBeGreaterThan(Math.max(mealCount, storageCount));
      // Used, so the soft delete (ledger 957) runs after the counts, inside.
      const soft = events.findIndex((text) => /^update "recipes" set "deleted_at"/.test(text));
      expect(soft, trace).toBeGreaterThan(Math.max(mealCount, storageCount));
      expect(end, trace).toBeGreaterThan(soft);
      expect(events.some((text) => text.startsWith('delete from "recipes"')), trace).toBe(false);
    });

    // Ledger 758 (DRYRUN-PG R4): when the delete commits first, the losing
    // save's foreign key fails. That answers 409, not 500, and writes nothing.
    // PGlite cannot interleave two requests, so a trigger deletes the recipe
    // inside the save, between its recipe check and its meal_recipes insert.
    it("answers 409 to a meal save that loses a race with the recipe's delete, and writes nothing (ledger 758)", async () => {
      const babyId = await createBaby(owner);
      const kept = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: owner.cookie },
        payload: { foodIds: [fixtures.banana.id], recipeIds: [fixtures.catalogRecipe.id] },
      });
      expect(kept.statusCode).toBe(201);
      const keptId = kept.json<{ id: string }>().id;
      const recipe = await createRecipe(owner, recipePayload());
      await db.execute(
        sql.raw(`create function race_delete_recipe() returns trigger language plpgsql as $$
          begin delete from recipes where id = new.recipe_id; return new; end $$`),
      );
      await db.execute(
        sql.raw(`create trigger race_delete_recipe before insert on meal_recipes for each row
          when (new.recipe_id = '${recipe.id}') execute function race_delete_recipe()`),
      );
      const mealsBefore = await db.select().from(schema.meals);
      const rowsBefore = await db.select().from(schema.mealRecipes);

      const created = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: owner.cookie },
        payload: { foodIds: [fixtures.banana.id], recipeIds: [recipe.id] },
      });
      const edited = await app.inject({
        method: "PATCH",
        url: `/api/meals/${keptId}`,
        headers: { cookie: owner.cookie },
        payload: { recipeIds: [fixtures.catalogRecipe.id, recipe.id] },
      });
      for (const response of [created, edited]) {
        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({ error: "conflict", message: "That recipe was just deleted." });
      }
      // Each save rolled back whole, the trigger's delete with it.
      expect(await db.select().from(schema.meals)).toEqual(mealsBefore);
      expect(await db.select().from(schema.mealRecipes)).toEqual(rowsBefore);
      expect(await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id))).toHaveLength(1);
    });

    // Item 240, the edit half: a parent can take every step back off a
    // recipe they already saved, and put them back later.

    // Ledger 957: everything that already happened reads exactly as before
    // the delete, plus `deleted: true` on the recipe wherever it is named.
    describe("a soft-deleted recipe (ledger 957)", () => {
      const LUNCH = DEFAULT_DAILY_MEALS[1]!.id;
      const DINNER = DEFAULT_DAILY_MEALS[2]!.id;
      const PLAN_DAY = "2026-11-02";
      const send = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, user = owner) =>
        app.inject({ method, url, headers: { cookie: user.cookie }, ...(payload === undefined ? {} : { payload: payload as object }) });
      const ok = async (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown) => {
        const response = await send(method, url, payload);
        if (response.statusCode >= 300) throw new Error(`${method} ${url} -> ${response.statusCode}: ${response.body}`);
        return response.statusCode === 204 ? null : response.json<unknown>();
      };
      /** The body with every `deleted: true` taken out, to compare with before. */
      const withoutDeleted = (value: unknown): unknown =>
        JSON.parse(JSON.stringify(value, (key, entry: unknown) => (key === "deleted" && entry === true ? undefined : entry)));

      /** A recipe with a peanut ingredient, logged (fresh and rated, and from a
       * several-recipe container), stored, planned on two meals and favorited. */
      async function useEverywhere() {
        const satay = await createFood(owner, { name: "Satay sauce", category: "protein", allergenSlugs: ["peanut"] });
        const recipe = await createRecipe(
          owner,
          recipePayload({
            title: "Satay noodles",
            ingredients: [
              { foodId: satay.id, quantityNote: "1 tbsp" },
              { foodId: fixtures.oats.id, quantityNote: "" },
            ],
          }),
        );
        const babyId = await createBaby(owner);
        const fresh = (await ok("POST", `/api/babies/${babyId}/meals`, {
          servedAt: "2026-11-01T12:00:00.000Z",
          items: [
            { kind: "recipe", recipeId: recipe.id, rating: 4, leftOutFoodIds: [fixtures.oats.id] },
            { kind: "food", foodId: fixtures.pear.id },
          ],
        })) as MealItem;
        const box = (await ok("POST", "/api/storage", {
          recipeIds: [fixtures.catalogRecipe.id, recipe.id],
          location: "fridge",
          servingsTotal: 3,
        })) as CreateStorageItemResponse;
        const boxId = box.items[0]!.id;
        const served = (await ok("POST", `/api/babies/${babyId}/meals`, {
          servedAt: "2026-11-01T18:00:00.000Z",
          items: [{ kind: "storage", storageItemId: boxId, servings: 1, ratings: { [recipe.id]: 5 } }],
        })) as MealItem;
        await ok("PUT", `/api/babies/${babyId}/plan/${PLAN_DAY}/meals/${LUNCH}`, {
          items: [
            { kind: "recipe", recipeId: recipe.id },
            { kind: "food", foodId: fixtures.banana.id },
          ],
        });
        await ok("PUT", `/api/babies/${babyId}/plan/${PLAN_DAY}/meals/${DINNER}`, { items: [{ kind: "recipe", recipeId: recipe.id }] });
        await ok("PUT", `/api/recipes/${recipe.id}/favorite`);
        return { recipe, satay, babyId, freshId: fresh.id, servedId: served.id, boxId };
      }

      /** Every history read that names the recipe or counts its foods. */
      async function history({ recipe, babyId, freshId, servedId }: Awaited<ReturnType<typeof useEverywhere>>) {
        return {
          foodLog: await ok("GET", `/api/babies/${babyId}/meals`),
          fresh: await ok("GET", `/api/meals/${freshId}`),
          served: await ok("GET", `/api/meals/${servedId}`),
          storage: await ok("GET", "/api/storage"),
          ratings: await ok("GET", `/api/babies/${babyId}/ratings`),
          ratingHistory: await ok("GET", `/api/babies/${babyId}/ratings/history?recipeId=${recipe.id}`),
          allergens: await ok("GET", `/api/babies/${babyId}/allergen-progress`),
          peanut: await ok("GET", `/api/babies/${babyId}/allergen-progress/peanut`),
          legacy: await db.select().from(schema.meals).orderBy(schema.meals.servedAt),
          mealRecipes: await db.select().from(schema.mealRecipes).orderBy(schema.mealRecipes.mealId, schema.mealRecipes.position),
          mealItems: await db.select().from(schema.mealItems).orderBy(schema.mealItems.id),
          mealFoods: await db.select().from(schema.mealFoods).orderBy(schema.mealFoods.id),
          containerRecipes: await db.select().from(schema.storageItemRecipes).orderBy(schema.storageItemRecipes.position),
        };
      }

      it("keeps every history read as it was, marked deleted; plans and favorites lose it", async () => {
        const used = await useEverywhere();
        const planCount = await ok("GET", `/api/recipes/${used.recipe.id}/plan-count`);
        expect(planCount).toEqual({ plannedMealCount: 2, mealCount: 2, storageCount: 1 });
        const before = await history(used);

        expect((await send("DELETE", `/api/recipes/${used.recipe.id}`)).statusCode).toBe(204);
        const after = await history(used);

        // Parity: nothing changed but the mark.
        expect(withoutDeleted(after)).toEqual(withoutDeleted(before));
        expect(JSON.stringify(before)).not.toContain('"deleted":true');
        // The mark, wherever history names the recipe.
        const fresh = after.fresh as MealItem;
        expect(fresh.recipes).toEqual([{ id: used.recipe.id, title: "Satay noodles", rating: 4, deleted: true }]);
        expect(fresh.recipeId).toBe(used.recipe.id);
        expect(fresh.recipeTitle).toBe("Satay noodles");
        expect(fresh.items![0]).toMatchObject({ kind: "recipe", recipe: { id: used.recipe.id, title: "Satay noodles", deleted: true } });
        const served = after.served as MealItem;
        const container = served.items![0]!;
        expect(container).toMatchObject({
          kind: "storage",
          parts: [
            { kind: "recipe", recipe: { id: fixtures.catalogRecipe.id, title: "Banana Porridge" } },
            { kind: "recipe", recipe: { id: used.recipe.id, title: "Satay noodles", deleted: true } },
          ],
        });
        expect(container.kind === "storage" && container.parts[0]!.kind === "recipe" && "deleted" in container.parts[0]!.recipe).toBe(false);
        const box = (after.storage as { items: StorageItem[] }).items.find((item) => item.id === used.boxId)!;
        expect(box.recipes).toEqual([
          { id: fixtures.catalogRecipe.id, title: "Banana Porridge" },
          { id: used.recipe.id, title: "Satay noodles", deleted: true },
        ]);

        // Plans lose it (the rest of the meal stays); so do favorites.
        const plan = planResponseSchema.parse(
          await ok("GET", `/api/babies/${used.babyId}/plan?from=${PLAN_DAY}&to=${PLAN_DAY}&tz=Europe%2FLondon`),
        );
        const meals = plan.days[0]!.meals;
        expect(meals.find((meal) => meal.name === "Lunch")!.items.map((item) => item.kind)).toEqual(["food"]);
        expect(meals.find((meal) => meal.name === "Dinner")!.items).toEqual([]);
        expect(await db.select().from(schema.plannedItems).where(eq(schema.plannedItems.recipeId, used.recipe.id))).toEqual([]);
        expect(await db.select().from(schema.favorites).where(eq(schema.favorites.recipeId, used.recipe.id))).toEqual([]);
        expect(await ok("GET", `/api/recipes/${used.recipe.id}/plan-count`)).toEqual({ plannedMealCount: 0, mealCount: 2, storageCount: 1 });
      });

      it("leaves every choosing read, and cannot be added anywhere new; its own page still loads, read-only", async () => {
        const used = await useEverywhere();
        expect((await send("DELETE", `/api/recipes/${used.recipe.id}`)).statusCode).toBe(204);
        const id = used.recipe.id;

        // Browse, search, scopes, ingredient-of, favorites, a food's recipes, the AI.
        for (const query of ["", "?scope=custom", "?scope=favorites", "?q=satay", `?ingredientFoodId=${used.satay.id}`, "?allergen=peanut"]) {
          expect((await listRecipes(owner, query)).recipes.map((r) => r.id), query).not.toContain(id);
        }
        expect(((await ok("GET", "/api/favorites")) as FavoritesResponse).items).toEqual([]);
        // Even a favorite that raced the delete (written after it) stays hidden.
        await db.insert(schema.favorites).values({ userId: await userId(owner), recipeId: id });
        expect(((await ok("GET", "/api/favorites")) as FavoritesResponse).items).toEqual([]);
        expect(((await ok("GET", `/api/foods/${used.satay.slug}`)) as FoodDetail).recipes).toEqual([]);
        const tools = buildChatTools(db, await userId(owner), null);
        expect(String(await tools.search_recipes.run({ ageMonths: 12, query: "satay" }))).not.toContain(id);

        // Its page: still there, saying when; edits refused like a deleted food's.
        const detail = (await ok("GET", `/api/recipes/${id}`)) as RecipeDetail;
        expect(detail.deletedAt).toEqual(expect.any(String));
        expect(detail.title).toBe("Satay noodles");
        expect((await send("PATCH", `/api/recipes/${id}`, { title: "Renamed" })).json()).toEqual({ error: "deleted" });
        expect((await db.select().from(schema.recipes).where(eq(schema.recipes.id, id)))[0]!.title).toBe("Satay noodles");

        // Nothing new may hold it: a favorite, a meal, a container, a plan.
        expect((await send("PUT", `/api/recipes/${id}/favorite`)).statusCode).toBe(404);
        const meal = await send("POST", `/api/babies/${used.babyId}/meals`, { items: [{ kind: "recipe", recipeId: id }] });
        expect(meal.statusCode).toBe(400);
        expect(meal.json()).toMatchObject({ details: { recipeIds: "unknown recipe" } });
        const legacyMeal = await send("POST", `/api/babies/${used.babyId}/meals`, { foodIds: [fixtures.banana.id], recipeId: id });
        expect(legacyMeal.statusCode).toBe(400);
        expect((await send("POST", "/api/storage", { recipeId: id, location: "fridge" })).statusCode).toBe(400);
        const plan = await send("PUT", `/api/babies/${used.babyId}/plan/${PLAN_DAY}/meals/${LUNCH}`, {
          items: [{ kind: "recipe", recipeId: id }],
        });
        expect(plan.statusCode).toBe(400);
        expect(await db.select().from(schema.plannedItems).where(eq(schema.plannedItems.recipeId, id))).toEqual([]);

        // A past meal that holds it: an edit keeps it (shown deleted) and can
        // remove it, but cannot put it back.
        const fresh = (await ok("GET", `/api/meals/${used.freshId}`)) as MealItem;
        const kept = await send("PATCH", `/api/meals/${used.freshId}`, { items: plateInputFromItems(fresh.items!), notes: "Loved it" });
        expect(kept.statusCode, kept.body).toBe(200);
        expect(kept.json<MealItem>().items![0]).toMatchObject({ kind: "recipe", recipe: { id, deleted: true }, rating: 4 });
        const pear = fresh.items!.find((item) => item.kind === "food")!;
        const removed = await send("PATCH", `/api/meals/${used.freshId}`, { items: plateInputFromItems([pear]) });
        expect(removed.statusCode, removed.body).toBe(200);
        expect(removed.json<MealItem>().recipes).toEqual([]);
        const readded = await send("PATCH", `/api/meals/${used.freshId}`, {
          items: [...plateInputFromItems(removed.json<MealItem>().items!), { kind: "recipe", recipeId: id }],
        });
        expect(readded.statusCode).toBe(400);

        // Its container still serves, as a deleted food's does: the meal names
        // the recipe, marked.
        const again = await send("POST", `/api/babies/${used.babyId}/meals`, {
          items: [{ kind: "storage", storageItemId: used.boxId, servings: 1 }],
        });
        expect(again.statusCode, again.body).toBe(201);
        expect(again.json<MealItem>().recipes).toEqual([
          { id: fixtures.catalogRecipe.id, title: "Banana Porridge", rating: null },
          { id, title: "Satay noodles", rating: null, deleted: true },
        ]);
      });

      // A write racing the delete must wait on its FOR UPDATE and then see
      // the recipe deleted: the add check locks FOR KEY SHARE. PGlite cannot
      // interleave two requests, so the statement is pinned.
      it("checks a recipe a write adds FOR KEY SHARE", async () => {
        const recipe = await createRecipe(owner, recipePayload());
        const babyId = await createBaby(owner);
        const seen: string[] = [];
        const original = PgDialect.prototype.sqlToQuery;
        const spy = vi.spyOn(PgDialect.prototype, "sqlToQuery").mockImplementation(function (this: PgDialect, ...args) {
          const query = original.apply(this, args);
          seen.push(query.sql.toLowerCase());
          return query;
        });
        try {
          expect((await send("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "recipe", recipeId: recipe.id }] })).statusCode).toBe(201);
        } finally {
          spy.mockRestore();
        }
        expect(seen.filter((text) => /^select "id" from "recipes" where .*"deleted_at" is null.* for key share$/.test(text))).toHaveLength(1);
      });

      it("repeats as a no-op that keeps the first time; another parent's recipe is 404 and untouched", async () => {
        const used = await useEverywhere();
        expect((await send("DELETE", `/api/recipes/${used.recipe.id}`)).statusCode).toBe(204);
        const first = (await db.select().from(schema.recipes).where(eq(schema.recipes.id, used.recipe.id)))[0]!.deletedAt;
        expect(first).toBeInstanceOf(Date);
        expect((await send("DELETE", `/api/recipes/${used.recipe.id}`)).statusCode).toBe(204);
        expect((await db.select().from(schema.recipes).where(eq(schema.recipes.id, used.recipe.id)))[0]!.deletedAt).toEqual(first);

        const theirs = await createRecipe(intruder, recipePayload({ title: "Zucchini sticks" }));
        expect((await send("DELETE", `/api/recipes/${theirs.id}`)).statusCode).toBe(404);
        expect((await send("DELETE", `/api/recipes/${used.recipe.id}`, undefined, intruder)).statusCode).toBe(404);
        expect((await send("GET", `/api/recipes/${used.recipe.id}/plan-count`, undefined, intruder)).statusCode).toBe(404);
        expect((await send("GET", `/api/recipes/${used.recipe.id}`, undefined, intruder)).statusCode).toBe(404);
        expect((await db.select().from(schema.recipes).where(eq(schema.recipes.id, theirs.id)))[0]!.deletedAt).toBeNull();
      });

      it("deletes for good one nothing logged or stored, plans and favorites with it; a repeat is 404", async () => {
        const recipe = await createRecipe(owner, recipePayload({ title: "Spare" }));
        const babyId = await createBaby(owner);
        await ok("PUT", `/api/babies/${babyId}/plan/${PLAN_DAY}/meals/${LUNCH}`, { items: [{ kind: "recipe", recipeId: recipe.id }] });
        await ok("PUT", `/api/recipes/${recipe.id}/favorite`);
        expect(await ok("GET", `/api/recipes/${recipe.id}/plan-count`)).toEqual({ plannedMealCount: 1, mealCount: 0, storageCount: 0 });

        expect((await send("DELETE", `/api/recipes/${recipe.id}`)).statusCode).toBe(204);
        expect(await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id))).toEqual([]);
        expect(await db.select().from(schema.plannedItems)).toEqual([]);
        expect(await db.select().from(schema.favorites)).toEqual([]);
        expect((await send("DELETE", `/api/recipes/${recipe.id}`)).statusCode).toBe(404);
        expect((await send("GET", `/api/recipes/${recipe.id}`)).statusCode).toBe(404);
      });
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

    it("stocks and serves a custom recipe from storage, fanning out to its ingredient foods", async () => {
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
        url: "/api/storage",
        headers: { cookie: owner.cookie },
        payload: { recipeId: mine.id, location: "freezer" },
      });
      expect(stocked.statusCode).toBe(201);
      const item = stocked.json<CreateStorageItemResponse>().items[0]!;
      expect(item.recipeTitle).toBe("Banana oat fingers");

      const served = await app.inject({
        method: "POST",
        url: `/api/storage/${item.id}/serve`,
        headers: { cookie: owner.cookie },
        payload: { babyId },
      });
      expect(served.statusCode).toBe(201);
      const meal = served.json<{ meal: MealItem }>().meal;
      expect(meal.foods.map((f) => f.slug).sort()).toEqual(["banana", "oats"]);

      // Another account cannot stock it in the first place.
      const refused = await app.inject({
        method: "POST",
        url: "/api/storage",
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

    it("ranks and flags a custom beef recipe as iron-focused from its ingredients (derived, like the routes)", async () => {
      const ironRich = await createRecipe(
        owner,
        recipePayload({
          title: "Beef and pepper mash",
          ingredients: [
            { foodId: fixtures.beef.id, quantityNote: "2 strips" },
            { foodId: fixtures.bellPepper.id, quantityNote: "1/2" },
          ],
        }),
      );
      const lowIron = await createRecipe(owner, recipePayload({ title: "Zesty banana bites" }));

      const tools = buildChatTools(db, await userId(owner), null);
      const result = JSON.parse(String(await tools.search_recipes.run({ ageMonths: 12 }))) as {
        recipes: Array<{ id: string; title: string; ironFocus: boolean }>;
      };
      const byId = new Map(result.recipes.map((r) => [r.id, r]));
      expect(byId.get(ironRich.id)?.ironFocus).toBe(true);
      // Iron-focused recipes rank first; the low-iron custom one may fall
      // outside the top 5, but if present it must read false.
      const firstNonIron = result.recipes.findIndex((r) => !r.ironFocus);
      const lastIron = result.recipes.map((r) => r.ironFocus).lastIndexOf(true);
      expect(firstNonIron === -1 || lastIron < firstNonIron).toBe(true);
      const low = byId.get(lowIron.id);
      if (low) expect(low.ironFocus).toBe(false);
    });

    it("reports the derived fiberHigh on each search_recipes row", async () => {
      const pearMash = await createRecipe(
        owner,
        recipePayload({
          title: "Pear mash",
          ingredients: [{ foodId: fixtures.pear.id, quantityNote: "1 ripe" }],
        }),
      );

      const tools = buildChatTools(db, await userId(owner), null);
      const result = JSON.parse(String(await tools.search_recipes.run({ ageMonths: 12 }))) as {
        recipes: Array<{ id: string; title: string; ironFocus: boolean; fiberHigh: boolean }>;
      };
      const byId = new Map(result.recipes.map((r) => [r.id, r]));
      expect(byId.get(pearMash.id)?.fiberHigh).toBe(true);
      // Banana + oats are both "moderate" fiber — the catalog recipe is false,
      // the same answer the list and detail routes give.
      expect(byId.get(fixtures.catalogRecipe.id)?.fiberHigh).toBe(false);
    });

    it("prints each extra ingredient as \"quantity name\" on the search_recipes rows (item 298)", async () => {
      const withExtras = await createRecipe(
        owner,
        recipePayload({
          title: "Chia banana pudding",
          extraIngredients: [
            { name: "chia seeds", quantityNote: "1 teaspoon" },
            { name: "olive oil" },
          ],
        }),
      );

      const tools = buildChatTools(db, await userId(owner), null);
      const result = JSON.parse(String(await tools.search_recipes.run({ ageMonths: 12 }))) as {
        recipes: Array<{ id: string; extraIngredients: string[] }>;
      };
      const row = result.recipes.find((r) => r.id === withExtras.id);
      // A quantity is printed in front of the name; an empty one prints nothing.
      expect(row?.extraIngredients).toEqual(["1 teaspoon chia seeds", "olive oil"]);
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
      // Plain banana carries no high-vitamin-C ingredient.
      expect(favorites.json<FavoritesResponse>().items[0]?.vitaminCHigh).toBe(false);

      const refused = await app.inject({
        method: "PUT",
        url: `/api/recipes/${mine.id}/favorite`,
        headers: { cookie: intruder.cookie },
      });
      expect(refused.statusCode).toBe(404);
      expect(await db.select().from(schema.favorites).where(eq(schema.favorites.recipeId, mine.id))).toHaveLength(1);
    });

    it("derives vitaminCHigh on GET /api/favorites the same way the recipes list does", async () => {
      const veggieMash = await createRecipe(
        owner,
        recipePayload({
          title: "Broccoli mash",
          ingredients: [{ foodId: fixtures.broccoli.id, quantityNote: "2 florets" }],
        }),
      );
      await app.inject({
        method: "PUT",
        url: `/api/recipes/${veggieMash.id}/favorite`,
        headers: { cookie: owner.cookie },
      });
      await app.inject({
        method: "PUT",
        url: `/api/recipes/${fixtures.catalogRecipe.id}/favorite`,
        headers: { cookie: owner.cookie },
      });

      const favorites = await app.inject({
        method: "GET",
        url: "/api/favorites",
        headers: { cookie: owner.cookie },
      });
      const items = favorites.json<FavoritesResponse>().items;
      expect(items.find((i) => i.recipeId === veggieMash.id)?.vitaminCHigh).toBe(true);
      // The seeded catalog recipe (banana + oats, neither "high") does not.
      expect(items.find((i) => i.recipeId === fixtures.catalogRecipe.id)?.vitaminCHigh).toBe(false);
    });

    // Ledger 537: deleting the food is soft now, so the recipe built on it
    // keeps the ingredient — marked, and still editable as it stands.
    it("keeps a deleted custom food in the custom recipe built on it, marked deleted", async () => {
      const food = await createFood(owner, { name: "My satay", category: "protein" });
      const recipe = await createRecipe(
        owner,
        recipePayload({ ingredients: [{ foodId: food.id, quantityNote: "1 tbsp" }] }),
      );

      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/foods/${food.id}`,
        headers: { cookie: owner.cookie },
      });
      expect(deleted.statusCode).toBe(204);

      const detail = await app.inject({
        method: "GET",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
      });
      expect(detail.json<RecipeDetail>().ingredients).toEqual([
        expect.objectContaining({ foodId: food.id, foodName: "My satay", quantityNote: "1 tbsp", deleted: true }),
      ]);

      // An edit resends the ingredients it already has; the deleted one must
      // not turn that into a 400.
      const edit = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}`,
        headers: { cookie: owner.cookie },
        payload: { title: "Satay noodles", ingredients: [{ foodId: food.id, quantityNote: "2 tbsp" }] },
      });
      expect(edit.statusCode).toBe(200);
    });
  });
});
