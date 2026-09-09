import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same dynamic-import dance as pairings.test.ts: db/seeds lives outside
// server/src (the tsconfig rootDir), so a static import would break
// `tsc --noEmit`. The specifier is computed, which keeps tsc out of it while
// still running the REAL seed pipeline over the REAL seed data.
async function loadRunSeeds(): Promise<(db: Database) => Promise<void>> {
  const seedsIndexPath = path.resolve(__dirname, "../../db/seeds/index.js");
  const mod = (await import(pathToFileURL(seedsIndexPath).href)) as {
    runSeeds: (db: Database) => Promise<void>;
  };
  return mod.runSeeds;
}

/** The 15 curated recipes that shipped before the single-food basics. */
const CURATED_SLUGS = [
  "beef-sweet-potato-strips",
  "salmon-oat-patties",
  "lentil-veggie-fritters",
  "banana-pb-oat-pancakes",
  "veggie-omelet-fingers",
  "broccoli-cheese-egg-muffins",
  "overnight-oats-chia-pear",
  "chicken-apple-meatballs",
  "hummus-avocado-toast-fingers",
  "tofu-nuggets",
  "sardine-mash-on-toast",
  "chickpea-sweet-potato-mild-curry",
  "zucchini-quinoa-bites",
  "apple-cinnamon-tahini-porridge",
  "greek-yogurt-with-smashed-berries",
];

/**
 * Ledger item 254. `pnpm db:seed` is never run against the dev database from
 * a test — this proves the same `runSeeds()` the script calls, against a
 * throwaway in-memory Postgres, and proves it TWICE so the "idempotent upsert
 * by slug" claim is a tested property rather than a comment.
 */
describe("single-food basic recipes", () => {
  let close: () => Promise<void>;
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    close = testDb.close;
    const runSeeds = await loadRunSeeds();
    // Twice: the second pass must upsert, not duplicate or fail.
    await runSeeds(db);
    await runSeeds(db);
  });

  afterAll(async () => {
    await close();
  });

  /** Every catalog recipe with its ingredient food slugs, keyed by slug. */
  async function catalogRecipes() {
    const recipeRows = await db
      .select({
        id: schema.recipes.id,
        slug: schema.recipes.slug,
        title: schema.recipes.title,
        minAgeMonths: schema.recipes.minAgeMonths,
      })
      .from(schema.recipes)
      .where(isNull(schema.recipes.ownerId));

    const ingredientRows = await db
      .select({ recipeId: schema.recipeIngredients.recipeId, foodSlug: schema.foods.slug })
      .from(schema.recipeIngredients)
      .innerJoin(schema.foods, eq(schema.recipeIngredients.foodId, schema.foods.id));

    const foodSlugsByRecipeId = new Map<string, string[]>();
    for (const row of ingredientRows) {
      const list = foodSlugsByRecipeId.get(row.recipeId) ?? [];
      list.push(row.foodSlug);
      foodSlugsByRecipeId.set(row.recipeId, list);
    }

    return recipeRows.map((r) => ({ ...r, foodSlugs: foodSlugsByRecipeId.get(r.id) ?? [] }));
  }

  it("gives every catalog food exactly one single-ingredient recipe of its own", async () => {
    const foodRows = await db
      .select({ slug: schema.foods.slug, minAgeMonths: schema.foods.minAgeMonths })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));
    expect(foodRows.length).toBeGreaterThan(0);

    const recipes = await catalogRecipes();
    const singleIngredient = recipes.filter((r) => r.foodSlugs.length === 1);

    // "Exactly one" in both directions: no food is missed, and no food has two.
    const countByFoodSlug = new Map<string, number>();
    for (const recipe of singleIngredient) {
      const foodSlug = recipe.foodSlugs[0];
      if (foodSlug === undefined) continue;
      countByFoodSlug.set(foodSlug, (countByFoodSlug.get(foodSlug) ?? 0) + 1);
    }

    const wrong = foodRows
      .map((food) => ({ slug: food.slug, count: countByFoodSlug.get(food.slug) ?? 0 }))
      .filter((entry) => entry.count !== 1);
    expect(wrong).toEqual([]);
    expect(singleIngredient).toHaveLength(foodRows.length);
  });

  it("matches each basic recipe's minimum age, slug, and title to its food", async () => {
    const foodRows = await db
      .select({ slug: schema.foods.slug, name: schema.foods.name, minAgeMonths: schema.foods.minAgeMonths })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));

    const bySlug = new Map((await catalogRecipes()).map((r) => [r.slug, r]));

    const mismatches = foodRows.flatMap((food) => {
      const expectedSlug = `simple-${food.slug.replace(/_/g, "-")}`;
      const recipe = bySlug.get(expectedSlug);
      if (!recipe) return [{ food: food.slug, problem: "missing" }];
      const problems: { food: string; problem: string }[] = [];
      if (recipe.foodSlugs.length !== 1 || recipe.foodSlugs[0] !== food.slug) {
        problems.push({ food: food.slug, problem: `ingredients ${recipe.foodSlugs.join(",")}` });
      }
      if (recipe.minAgeMonths !== food.minAgeMonths) {
        problems.push({ food: food.slug, problem: `minAgeMonths ${String(recipe.minAgeMonths)}` });
      }
      if (recipe.title !== `Simple ${food.name.toLowerCase()}`) {
        problems.push({ food: food.slug, problem: `title ${recipe.title}` });
      }
      return problems;
    });

    expect(mismatches).toEqual([]);
    // Shrimp is the one food held past 6 months, so it is the one basic that
    // must not claim to be a 6-month recipe.
    expect(bySlug.get("simple-shrimp")?.minAgeMonths).toBe(9);
  });

  it("carries a variant for every stage the food allows, and none below it", async () => {
    const recipes = await catalogRecipes();
    const bySlug = new Map(recipes.map((r) => [r.slug, r]));

    const variantRows = await db
      .select({ recipeId: schema.recipeVariants.recipeId, ageStage: schema.recipeVariants.ageStage })
      .from(schema.recipeVariants);
    const stagesByRecipeId = new Map<string, string[]>();
    for (const row of variantRows) {
      const list = stagesByRecipeId.get(row.recipeId) ?? [];
      list.push(row.ageStage);
      stagesByRecipeId.set(row.recipeId, list);
    }

    const sixMonthBasic = bySlug.get("simple-sweet-potato");
    expect(sixMonthBasic).toBeDefined();
    expect([...(stagesByRecipeId.get(sixMonthBasic?.id ?? "") ?? [])].sort()).toEqual(["12", "6", "9"]);

    const shrimp = bySlug.get("simple-shrimp");
    expect(shrimp).toBeDefined();
    expect([...(stagesByRecipeId.get(shrimp?.id ?? "") ?? [])].sort()).toEqual(["12", "9"]);

    // No basic recipe may carry a variant for a stage below its own minimum.
    const tooEarly = recipes
      .filter((r) => r.slug.startsWith("simple-") && r.minAgeMonths > 6)
      .filter((r) => (stagesByRecipeId.get(r.id) ?? []).includes("6"))
      .map((r) => r.slug);
    expect(tooEarly).toEqual([]);
  });

  it("gives every basic variant 3-6 steps and a texture note", async () => {
    const basicIds = new Set(
      (await catalogRecipes()).filter((r) => r.slug.startsWith("simple-")).map((r) => r.id),
    );

    const variantRows = await db
      .select({
        recipeId: schema.recipeVariants.recipeId,
        ageStage: schema.recipeVariants.ageStage,
        textureNote: schema.recipeVariants.textureNote,
        instructions: schema.recipeVariants.instructions,
      })
      .from(schema.recipeVariants);

    const bad = variantRows
      .filter((v) => basicIds.has(v.recipeId))
      .filter((v) => v.textureNote.trim() === "" || v.instructions.length < 3 || v.instructions.length > 6);
    expect(bad).toEqual([]);
  });

  it("leaves the 15 curated recipes in place, un-duplicated, after re-seeding", async () => {
    const recipes = await catalogRecipes();
    const slugs = recipes.map((r) => r.slug);

    for (const slug of CURATED_SLUGS) {
      expect(slugs.filter((s) => s === slug)).toHaveLength(1);
    }
    // The curated 15 all have more than one ingredient, so the "one basic per
    // food" count above can never have been satisfied by one of them.
    const curated = recipes.filter((r) => CURATED_SLUGS.includes(r.slug));
    expect(curated).toHaveLength(CURATED_SLUGS.length);
    expect(curated.filter((r) => r.foodSlugs.length === 1)).toEqual([]);

    // Seeding twice must not have doubled anything.
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
