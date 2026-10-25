import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface SeedData {
  recipes: { slug: string; ingredients: { foodSlug: string }[]; variants: Record<string, unknown> }[];
}

// Same dynamic-import dance as seed-catalog.test.ts: db/seeds sits outside
// server/src (the tsconfig rootDir), so the specifiers are computed.
async function loadSeeds(): Promise<{ runSeeds: (db: Database) => Promise<{ ingredients: number; stages: number; pairings: number }>; recipeSeeds: SeedData["recipes"] }> {
  const seeds = path.resolve(__dirname, "../../db/seeds");
  const index = (await import(pathToFileURL(path.join(seeds, "index.js")).href)) as {
    runSeeds: (db: Database) => Promise<{ ingredients: number; stages: number; pairings: number }>;
  };
  const data = (await import(pathToFileURL(path.join(seeds, "data/recipes.js")).href)) as SeedData;
  return { runSeeds: index.runSeeds, recipeSeeds: data.recipes };
}

/** Ledger 897: recipe slug -> its catalog ingredient food slugs, sorted. */
async function catalogIngredients(db: Database): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ recipe: schema.recipes.slug, food: schema.foods.slug })
    .from(schema.recipeIngredients)
    .innerJoin(schema.recipes, eq(schema.recipes.id, schema.recipeIngredients.recipeId))
    .innerJoin(schema.foods, eq(schema.foods.id, schema.recipeIngredients.foodId))
    .where(isNull(schema.recipes.ownerId));
  const out: Record<string, string[]> = {};
  for (const row of rows) (out[row.recipe] ??= []).push(row.food);
  for (const list of Object.values(out)) list.sort();
  return out;
}

describe("seeder prunes what a recipe seed dropped (ledger 897)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let runSeeds: (db: Database) => Promise<{ ingredients: number; stages: number; pairings: number }>;
  let recipeSeeds: SeedData["recipes"];

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    ({ runSeeds, recipeSeeds } = await loadSeeds());
    await runSeeds(db);
  });

  afterAll(async () => {
    await close();
  });

  it("leaves every seeded recipe with exactly its seed's ingredient foods", async () => {
    const expected = Object.fromEntries(
      recipeSeeds.map((r) => [r.slug, r.ingredients.map((i) => i.foodSlug).sort()]),
    );
    expect(await catalogIngredients(db)).toEqual(expected);
    // The oatmeal the owner flagged: rolled oats only, no baby oat cereal.
    expect(expected["apple-cinnamon-tahini-porridge"]).toContain("oats");
    expect(expected["apple-cinnamon-tahini-porridge"]).not.toContain("iron_fortified_oats");
  });

  it("re-seeding deletes a stale catalog ingredient, stage and pairing but never a parent's own recipe rows", async () => {
    const foodId = async (slug: string) =>
      (await db.select({ id: schema.foods.id }).from(schema.foods).where(eq(schema.foods.slug, slug)))[0]!.id;
    const [oatmeal] = await db
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(eq(schema.recipes.slug, "apple-cinnamon-tahini-porridge"));
    const fortified = await foodId("iron_fortified_oats");
    // Two spices: a pair no seed would ever list.
    const cumin = await foodId("cumin");
    const dill = await foodId("dill");
    // A catalog recipe that has no 6-month stage in its seed.
    const nineUp = recipeSeeds.find((r) => !("6" in r.variants))!;
    const [nineUpRow] = await db
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(eq(schema.recipes.slug, nineUp.slug));

    // What the oats split left behind on real databases.
    await db.insert(schema.recipeIngredients).values({
      recipeId: oatmeal!.id,
      foodId: fortified,
      quantityNote: "1/3 cup rolled oats",
    });
    await db
      .insert(schema.recipeVariants)
      .values({ recipeId: nineUpRow!.id, ageStage: "6", textureNote: "stale", instructions: ["stale"] });
    await db.insert(schema.foodPairings).values({ ironFoodId: cumin, vitCFoodId: dill, reason: "stale" });

    // A parent's own recipe holding the same food, with a stage of its own.
    const userId = `user-${randomUUID()}`;
    await db.insert(schema.user).values({ id: userId, name: "Parent", email: `${userId}@example.com`, emailVerified: true });
    const [custom] = await db
      .insert(schema.recipes)
      .values({ slug: `my-oats-${userId}`, title: "My oats", minAgeMonths: 6, prepMinutes: 5, ownerId: userId })
      .returning();
    await db.insert(schema.recipeIngredients).values({ recipeId: custom!.id, foodId: fortified, quantityNote: "2 tbsp" });
    await db
      .insert(schema.recipeVariants)
      .values({ recipeId: custom!.id, ageStage: "6", textureNote: "smooth", instructions: ["Stir."] });

    // The counts are what the container log reports on a deploy.
    expect(await runSeeds(db)).toEqual({ ingredients: 1, stages: 1, pairings: 1 });

    const after = await catalogIngredients(db);
    expect(after["apple-cinnamon-tahini-porridge"]).not.toContain("iron_fortified_oats");
    const nineUpStages = await db
      .select({ stage: schema.recipeVariants.ageStage })
      .from(schema.recipeVariants)
      .where(eq(schema.recipeVariants.recipeId, nineUpRow!.id));
    expect(nineUpStages.map((s) => s.stage).sort()).toEqual(Object.keys(nineUp.variants).sort());
    const pairingAfter = await db
      .select({ id: schema.foodPairings.id })
      .from(schema.foodPairings)
      .where(and(eq(schema.foodPairings.ironFoodId, cumin), eq(schema.foodPairings.vitCFoodId, dill)));
    expect(pairingAfter).toEqual([]);

    const customIngredients = await db
      .select({ foodId: schema.recipeIngredients.foodId, note: schema.recipeIngredients.quantityNote })
      .from(schema.recipeIngredients)
      .where(eq(schema.recipeIngredients.recipeId, custom!.id));
    expect(customIngredients).toEqual([{ foodId: fortified, note: "2 tbsp" }]);
    const customStages = await db
      .select({ stage: schema.recipeVariants.ageStage })
      .from(schema.recipeVariants)
      .where(eq(schema.recipeVariants.recipeId, custom!.id));
    expect(customStages).toEqual([{ stage: "6" }]);
  });
});
