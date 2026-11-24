// Ledger 1146: GET /api/babies/:babyId/allergen-progress/:slug names, per
// exposure, the plate items that carried the allergen (`itemIds`, the ids
// `GET /api/meals/:id` gives its items and a container's parts), read from
// the meal_items snapshot, so the allergen page can list them first.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("allergen detail: the items that carried it (ledger 1146)", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let parent: TestUser;
  let babyId: string;
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    await db.insert(schema.storageGuidelines).values({ category: "produce_cooked", fridgeHours: 48, freezerDays: 60, roomTempHours: 2, notes: "x" });
    const [milk] = await db.insert(schema.allergens).values([{ slug: "milk", name: "Milk", introGuidance: "x" }]).returning();
    const food = (slug: string, name: string) => ({
      slug,
      name,
      category: "fruit" as const,
      ironLevel: "low" as const,
      vitaminCLevel: "low" as const,
      chokingRisk: "low" as const,
      minAgeMonths: 6,
      prep6m: "a",
      prep9m: "b",
      prep12m: "c",
      storageCategory: "produce_cooked",
    });
    const rows = await db
      .insert(schema.foods)
      .values([food("yogurt", "Yogurt"), food("cheese", "Cheese"), food("banana", "Banana"), food("pear", "Pear")])
      .returning();
    for (const f of rows) ids[f.slug] = f.id;
    await db.insert(schema.foodAllergens).values([
      { foodId: ids.yogurt!, allergenId: milk!.id, countsTowardProgress: true, countsWhenAlone: false },
      { foodId: ids.cheese!, allergenId: milk!.id, countsTowardProgress: true, countsWhenAlone: false },
    ]);
    parent = await signUpUser(app);
    babyId = (await call("POST", "/api/babies", { name: "Robin", birthDate: "2025-01-15" })).json().id;
  });
  afterEach(async () => {
    await close();
  });

  const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
    app.inject({ method, url, headers: { cookie: parent.cookie }, ...(payload === undefined ? {} : { payload: payload as object }) });
  const recipe = async (title: string, foodIds: string[]) =>
    (await call("POST", "/api/recipes", { title, minAgeMonths: 6, ingredients: foodIds.map((foodId) => ({ foodId, quantityNote: "1" })) })).json()
      .id as string;
  const logMeal = async (items: unknown[]) => {
    const res = await call("POST", `/api/babies/${babyId}/meals`, { items });
    expect(res.statusCode, res.body).toBe(201);
    return (await call("GET", `/api/meals/${res.json().id}`)).json();
  };
  const exposure = async (mealId: string) => {
    const res = await call("GET", `/api/babies/${babyId}/allergen-progress/milk`);
    expect(res.statusCode, res.body).toBe(200);
    return (res.json().exposures as any[]).find((x) => x.mealId === mealId);
  };

  it("a food item: its own id, the rest of the plate not", async () => {
    const meal = await logMeal([{ kind: "food", foodId: ids.banana }, { kind: "food", foodId: ids.yogurt }, { kind: "food", foodId: ids.pear }]);
    expect((await exposure(meal.id)).itemIds).toEqual([meal.items[1].id]);
  });

  it("a recipe item, by what it counted (counted_food_ids)", async () => {
    const mash = await recipe("Cheese mash", [ids.banana!, ids.cheese!]);
    const meal = await logMeal([{ kind: "food", foodId: ids.pear }, { kind: "recipe", recipeId: mash }]);
    expect((await exposure(meal.id)).itemIds).toEqual([meal.items[1].id]);
  });

  it("a recipe edited after the meal to drop the allergen, then deleted, still marks its item", async () => {
    const mash = await recipe("Cheese mash", [ids.banana!, ids.cheese!]);
    const meal = await logMeal([{ kind: "food", foodId: ids.pear }, { kind: "recipe", recipeId: mash }]);
    const edited = await call("PATCH", `/api/recipes/${mash}`, { ingredients: [{ foodId: ids.banana, quantityNote: "1" }] });
    expect(edited.statusCode, edited.body).toBe(200);
    expect((await exposure(meal.id)).itemIds).toEqual([meal.items[1].id]);
    expect((await call("DELETE", `/api/recipes/${mash}`)).statusCode).toBe(204);
    expect((await exposure(meal.id)).itemIds).toEqual([meal.items[1].id]);
  });

  it("a container: the part that carried it (a recipe part), not the other part", async () => {
    const mash = await recipe("Cheese mash", [ids.banana!, ids.cheese!]);
    const pearMash = await recipe("Pear mash", [ids.pear!]);
    const box = (await call("POST", "/api/storage", { location: "freezer", recipeIds: [pearMash, mash], servingsTotal: 3 })).json().items[0]
      .id as string;
    const meal = await logMeal([{ kind: "food", foodId: ids.banana }, { kind: "storage", storageItemId: box, servings: 1 }]);
    const container = meal.items.find((item: any) => item.kind === "storage");
    const cheesePart = container.parts.find((part: any) => part.kind === "recipe" && part.recipe.id === mash);
    expect(container.parts).toHaveLength(2);
    expect((await exposure(meal.id)).itemIds).toEqual([cheesePart.id]);
  });

  it("two carrying items, in plate order", async () => {
    const mash = await recipe("Cheese mash", [ids.banana!, ids.cheese!]);
    const meal = await logMeal([
      { kind: "food", foodId: ids.pear },
      { kind: "recipe", recipeId: mash },
      { kind: "food", foodId: ids.banana },
      { kind: "food", foodId: ids.yogurt },
    ]);
    expect((await exposure(meal.id)).itemIds).toEqual([meal.items[1].id, meal.items[3].id]);
  });

  it("a meal with none of its items known (no meal_items, as before the plate) is still listed, with an empty list", async () => {
    const meal = await logMeal([{ kind: "food", foodId: ids.banana }, { kind: "food", foodId: ids.yogurt }]);
    await db.delete(schema.mealItems).where(eq(schema.mealItems.mealId, meal.id));
    const found = await exposure(meal.id);
    expect(found.foods.map((food: any) => food.id)).toEqual([ids.yogurt]);
    expect(found.itemIds).toEqual([]);
  });
});
