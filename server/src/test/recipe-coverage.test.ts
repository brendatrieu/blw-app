import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same dynamic-import dance as basic-recipes.test.ts and pairings.test.ts:
// db/seeds sits outside server/src (the tsconfig rootDir), so the specifier is
// computed — tsc stays out of it, and the REAL seed pipeline runs over the REAL
// seed data.
async function loadRunSeeds(): Promise<(db: Database) => Promise<void>> {
  const seedsIndexPath = path.resolve(__dirname, "../../db/seeds/index.js");
  const mod = (await import(pathToFileURL(seedsIndexPath).href)) as {
    runSeeds: (db: Database) => Promise<void>;
  };
  return mod.runSeeds;
}

/**
 * Ledger item 337 — the owner's coverage rule, made permanent.
 *
 * Every catalog food that is not a spice has to be an ingredient of at least
 * THREE seeded recipes, and every spice of at least TWO. The food's own
 * "Simple <food>" basic counts as one of the three; spices have no basic
 * (item 331), which is why their floor is lower. Lemon has no basic either
 * (item 484) but keeps the fruit floor, so all three of its uses are composite.
 *
 * Counted over `recipe_ingredients` links, never over `extra_ingredients`
 * free text: a recipe that merely mentions cumin in a step or lists it as a
 * cupboard staple does not make cumin findable by the ingredient filter, and
 * findability is the whole point of the rule.
 *
 * The count logic lives HERE rather than in the scratch script the recipe
 * authors used, so the guard cannot rot when that folder is cleaned up.
 *
 * NOTE for whoever trips this test: the design leaves most foods sitting
 * exactly ON their minimum (see .workflow/scratch/recipe-coverage/design.md
 * §6), so removing one ingredient link from one recipe is enough to fail it.
 * The fix is to give the named food another honest recipe — not to relax the
 * numbers below.
 */
const NON_SPICE_MINIMUM = 3;
const SPICE_MINIMUM = 2;

describe("recipe coverage per catalog food", () => {
  let close: () => Promise<void>;
  let db: Database;
  /** Row counts after the first seed pass, for the idempotency check. */
  let firstPassCounts: { recipes: number; ingredients: number; variants: number };

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    close = testDb.close;
    const runSeeds = await loadRunSeeds();
    await runSeeds(db);
    firstPassCounts = await rowCounts();
    // Twice, on the same fresh database: the second pass must upsert the
    // coverage recipes rather than duplicate them or fail on a unique index.
    await runSeeds(db);
  });

  afterAll(async () => {
    await close();
  });

  async function rowCounts() {
    const [recipes, ingredients, variants] = await Promise.all([
      db.select({ id: schema.recipes.id }).from(schema.recipes).where(isNull(schema.recipes.ownerId)),
      db.select({ id: schema.recipeIngredients.id }).from(schema.recipeIngredients),
      db.select({ id: schema.recipeVariants.id }).from(schema.recipeVariants),
    ]);
    return { recipes: recipes.length, ingredients: ingredients.length, variants: variants.length };
  }

  /**
   * How many distinct catalog recipes name each catalog food as an ingredient.
   * Distinct on purpose: a recipe that listed a food twice must not count
   * twice.
   */
  async function recipesPerFood() {
    const foodRows = await db
      .select({ id: schema.foods.id, slug: schema.foods.slug, category: schema.foods.category })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));

    const linkRows = await db
      .select({ recipeId: schema.recipeIngredients.recipeId, foodId: schema.recipeIngredients.foodId })
      .from(schema.recipeIngredients)
      .innerJoin(schema.recipes, eq(schema.recipeIngredients.recipeId, schema.recipes.id))
      .where(isNull(schema.recipes.ownerId));

    const recipeIdsByFoodId = new Map<string, Set<string>>();
    for (const row of linkRows) {
      const set = recipeIdsByFoodId.get(row.foodId) ?? new Set<string>();
      set.add(row.recipeId);
      recipeIdsByFoodId.set(row.foodId, set);
    }

    return foodRows.map((food) => ({
      slug: food.slug,
      category: food.category,
      minimum: food.category === "spice" ? SPICE_MINIMUM : NON_SPICE_MINIMUM,
      recipeCount: recipeIdsByFoodId.get(food.id)?.size ?? 0,
    }));
  }

  it("puts every non-spice food in at least 3 recipes and every spice in at least 2", async () => {
    const rows = await recipesPerFood();

    // Guard the guard: a seeder that wrote no foods, or a join that matched
    // nothing, would otherwise make the assertion below pass vacuously.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.category === "spice").length).toBeGreaterThan(0);
    expect(rows.reduce((sum, r) => sum + r.recipeCount, 0)).toBeGreaterThan(rows.length * 2);

    // Offenders print as "slug (category) 2/3" so the failure names exactly
    // which food needs another recipe and how many it is short.
    const short = rows
      .filter((r) => r.recipeCount < r.minimum)
      .sort((a, b) => a.recipeCount - b.recipeCount || a.slug.localeCompare(b.slug))
      .map((r) => `${r.slug} (${r.category}) ${String(r.recipeCount)}/${String(r.minimum)}`);

    expect(short).toEqual([]);
  });

  it("links every ingredient to a real catalog slug — the seeder would drop a typo silently", async () => {
    // Same dynamic-import dance as loadRunSeeds: the raw seed data, not the
    // DB, because the seeder is exactly what would swallow the typo.
    const dataDir = path.resolve(__dirname, "../../db/seeds/data");
    const { foods: foodSeeds } = (await import(pathToFileURL(path.join(dataDir, "foods.js")).href)) as {
      foods: { slug: string }[];
    };
    const { recipes: recipeSeeds } = (await import(pathToFileURL(path.join(dataDir, "recipes.js")).href)) as {
      recipes: { slug: string; ingredients: { foodSlug: string }[] }[];
    };
    const known = new Set(foodSeeds.map((food) => food.slug));
    const unknown = recipeSeeds.flatMap((recipe) =>
      recipe.ingredients.filter((ing) => !known.has(ing.foodSlug)).map((ing) => `${recipe.slug}: ${ing.foodSlug}`),
    );
    expect(unknown).toEqual([]);
  });

  it("counts ingredient links, not free-text extras", async () => {
    // The rule's teeth: `extraIngredients` is unstructured cupboard text that
    // no ingredient filter can search, so naming a food there must not help it
    // reach its minimum. Olive oil and ground coriander have no catalog row at
    // all, which is exactly why they are still extras.
    const extras = await db
      .select({ slug: schema.recipes.slug, extraIngredients: schema.recipes.extraIngredients })
      .from(schema.recipes)
      .where(isNull(schema.recipes.ownerId));
    const extraNames = new Set(
      extras.flatMap((row) => (row.extraIngredients ?? []).map((extra) => extra.name.toLowerCase())),
    );
    expect(extraNames.size).toBeGreaterThan(0);

    const foodRows = await db
      .select({ slug: schema.foods.slug, name: schema.foods.name })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));

    // No catalog food may be hiding in the extras: item 338 converted the six
    // curated recipes that named a catalog spice there into real links.
    // The extra IS the food — "cumin", "Cumin (optional)" — rather than a
    // phrase that merely mentions one ("warm water to thin the peanut butter",
    // where the butter is already a linked ingredient).
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stillExtras = foodRows
      .filter((food) => {
        const pattern = new RegExp(`^${escape(food.name.toLowerCase())}(?:\\s*\\(.*\\))?$`);
        return [...extraNames].some((extra) => pattern.test(extra.trim()));
      })
      .map((f) => f.slug);
    expect(stillExtras).toEqual([]);
  });

  it("seeds the same rows on a second pass over the same database", async () => {
    // beforeAll ran runSeeds twice; the counts must not have moved. An
    // insert-only link table, or a recipe whose slug stopped being unique,
    // both show up here as a doubled count.
    const secondPassCounts = await rowCounts();
    expect(secondPassCounts).toEqual(firstPassCounts);

    const slugs = (
      await db.select({ slug: schema.recipes.slug }).from(schema.recipes).where(isNull(schema.recipes.ownerId))
    ).map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
