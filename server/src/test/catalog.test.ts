import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import * as schema from "../db/schema.js";
import type { Database } from "../db/index.js";
import type { FoodDetail, FoodsResponse, RecipeDetail } from "@blw/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

// Minimal fixture content (not the real seed data, which lives in
// server/db/seeds and is out of this route file's ownership) — just enough
// to exercise every filter, the pairing join, and the recipe join.
async function seedFixtures(db: Database) {
  // foods.storage_category FKs into storage_guidelines.category, so the
  // categories used below must exist first.
  await db.insert(schema.storageGuidelines).values([
    { category: "egg_dish_cooked", fridgeHours: 96, freezerDays: 30, roomTempHours: 2, notes: "Cooked egg dishes." },
    { category: "fruit_veg_puree", fridgeHours: 48, freezerDays: 60, roomTempHours: 2, notes: "Fruit/veg purees." },
    {
      category: "meat_poultry_cooked",
      fridgeHours: 24,
      freezerDays: 60,
      roomTempHours: 2,
      notes: "Cooked meat/poultry.",
    },
  ]);

  const [egg, spinach, orange, beef] = await db
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
        slug: "spinach",
        name: "Spinach",
        category: "veg",
        ironLevel: "high",
        vitaminCLevel: "moderate",
        chokingRisk: "low",
        minAgeMonths: 6,
        prep6m: "puree",
        prep9m: "chop",
        prep12m: "chop",
        storageCategory: "fruit_veg_puree",
      },
      {
        slug: "orange",
        name: "Orange",
        category: "fruit",
        ironLevel: "low",
        vitaminCLevel: "high",
        chokingRisk: "moderate",
        minAgeMonths: 9,
        prep6m: "segment",
        prep9m: "segment",
        prep12m: "wedge",
        storageCategory: "fruit_veg_puree",
      },
      {
        slug: "beef",
        name: "Beef",
        category: "protein",
        ironLevel: "high",
        vitaminCLevel: "low",
        chokingRisk: "moderate",
        minAgeMonths: 6,
        prep6m: "strip",
        prep9m: "chop",
        prep12m: "dice",
        storageCategory: "meat_poultry_cooked",
      },
    ])
    .returning();

  const [eggAllergen] = await db
    .insert(schema.allergens)
    .values({ slug: "egg", name: "Egg", introGuidance: "Well-cooked egg." })
    .returning();

  await db.insert(schema.foodAllergens).values({ foodId: egg!.id, allergenId: eggAllergen!.id });

  await db.insert(schema.foodPairings).values({
    ironFoodId: spinach!.id,
    vitCFoodId: orange!.id,
    reason: "Vitamin C boosts non-heme iron absorption.",
  });

  const [recipe] = await db
    .insert(schema.recipes)
    .values({
      slug: "spinach-orange-mash",
      title: "Spinach & Orange Mash",
      minAgeMonths: 6,
      prepMinutes: 10,
      ironFocus: true,
      extraIngredients: ["olive oil"],
    })
    .returning();

  await db.insert(schema.recipeIngredients).values([
    { recipeId: recipe!.id, foodId: spinach!.id, quantityNote: "1 cup" },
    { recipeId: recipe!.id, foodId: egg!.id, quantityNote: "1 egg" },
  ]);

  await db.insert(schema.recipeVariants).values([
    { recipeId: recipe!.id, ageStage: "6", textureNote: "smooth", instructions: ["Blend well."] },
    { recipeId: recipe!.id, ageStage: "9", textureNote: "chunky", instructions: ["Chop finely."] },
    { recipeId: recipe!.id, ageStage: "12", textureNote: "diced", instructions: ["Dice small."] },
  ]);

  return { egg: egg!, spinach: spinach!, orange: orange!, beef: beef!, recipe: recipe! };
}

describe("catalog routes", () => {
  let fixtures: Awaited<ReturnType<typeof seedFixtures>>;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    fixtures = await seedFixtures(db);
    app = buildApp({ env: loadConfig({ NODE_ENV: "test" }), db });
  });

  it("GET /api/foods filters by allergen slug", async () => {
    const response = await app.inject({ method: "GET", url: "/api/foods?allergen=egg" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as FoodsResponse;
    expect(body.foods).toHaveLength(1);
    expect(body.foods[0]?.slug).toBe("egg");
    expect(body.foods[0]?.allergens).toEqual(["egg"]);
  });

  it("GET /api/foods sorts iron_level high before moderate before low", async () => {
    const response = await app.inject({ method: "GET", url: "/api/foods" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as FoodsResponse;
    const ironLevels = body.foods.map((f) => f.ironLevel);
    const firstLowIndex = ironLevels.indexOf("low");
    const lastHighIndex = ironLevels.lastIndexOf("high");
    expect(firstLowIndex === -1 || lastHighIndex < firstLowIndex).toBe(true);
    expect(ironLevels[0]).toBe("high");
  });

  it("GET /api/foods/:slug includes pairings", async () => {
    const response = await app.inject({ method: "GET", url: "/api/foods/spinach" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as FoodDetail;
    expect(body.pairings).toHaveLength(1);
    expect(body.pairings[0]?.food.slug).toBe("orange");
    expect(body.recipes.map((r) => r.id)).toContain(fixtures.recipe.id);
  });

  it("GET /api/foods/:slug 404s for an unknown slug", async () => {
    const response = await app.inject({ method: "GET", url: "/api/foods/does-not-exist" });
    expect(response.statusCode).toBe(404);
  });

  it("GET /api/recipes/:id returns exactly 3 variants and derived allergens", async () => {
    const response = await app.inject({ method: "GET", url: `/api/recipes/${fixtures.recipe.id}` });
    expect(response.statusCode).toBe(200);
    const body = response.json() as RecipeDetail;
    expect(body.variants).toHaveLength(3);
    expect(body.variants.map((v) => v.ageStage).sort()).toEqual(["12", "6", "9"]);
    expect(body.allergens).toEqual(["egg"]);
    expect(body.extraIngredients).toEqual(["olive oil"]);
  });

  it("GET /api/recipes/:id 404s for an unknown id", async () => {
    const response = await app.inject({ method: "GET", url: "/api/recipes/00000000-0000-0000-0000-000000000000" });
    expect(response.statusCode).toBe(404);
  });
});
