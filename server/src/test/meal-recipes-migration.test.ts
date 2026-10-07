// Migration 0020 (ledger 752): `meal_recipes` + `meal_storage_items`, and the
// boot-time heal that folds the legacy `meals.recipe_id` / `recipe_rating`
// mirror back into `meal_recipes` (db/migrate.ts).
//
// The rest of the suite only sees a database migrated to head, where the
// backfill runs over an empty table and proves nothing. Here a database is
// stopped at 0019 by drizzle's REAL migrator (so the journal and its `when`
// ordering are exercised, as in production), filled with every kind of meal a
// real account has, then migrated to head and healed — twice. Every meal must
// come out the other side identical, row for row and as the API shows it.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { healMealRecipes } from "../db/migrate.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { loadMeals } from "../services/meals.js";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

async function readJournal(): Promise<Journal & Record<string, unknown>> {
  return JSON.parse(await fs.readFile(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as Journal &
    Record<string, unknown>;
}

/** A copy of the migrations folder holding only migrations up to `lastIdx`,
 * so the real migrator can stop a database there. */
async function foldersUpTo(lastIdx: number): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blw-0020-"));
  await fs.mkdir(path.join(dir, "meta"));
  const journal = await readJournal();
  const entries = journal.entries.filter((entry) => entry.idx <= lastIdx);
  await fs.writeFile(path.join(dir, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) {
    await fs.copyFile(path.join(migrationsFolder, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
  }
  return dir;
}

// One stopped-at-0019 migrations folder for the whole file, removed after.
let stoppedAt0019: string;
beforeAll(async () => {
  stoppedAt0019 = await foldersUpTo(19);
});
afterAll(async () => {
  await fs.rm(stoppedAt0019, { recursive: true, force: true });
});

const U = "u1";
const BABY = "bbbbbbbb-0000-4000-8000-000000000001";
const BANANA = "11111111-1111-4111-8111-111111111111";
const EGG = "22222222-2222-4222-8222-222222222222";
const CUSTOM_FOOD = "44444444-4444-4444-8444-444444444444";
const CATALOG_RECIPE = "33333333-3333-4333-8333-333333333331";
const CUSTOM_RECIPE = "33333333-3333-4333-8333-333333333332";
const OTHER_RECIPE = "33333333-3333-4333-8333-333333333333";
const CONTAINER = "aaaaaaaa-0000-4000-8000-000000000001";
const meal = (n: number) => `cccccccc-0000-4000-8000-00000000000${n}`;

/** One of every kind of meal row that exists in the wild at 0019. */
const SEED_0019 = `
  INSERT INTO "user" ("id", "name", "email") VALUES ('${U}', 'Parent', 'parent@example.com');
  INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
  VALUES ('produce_cooked_soft', 72, 90, 2, 'Steamed veg.');
  INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                       "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category", "owner_id", "deleted_at")
  VALUES
    ('${BANANA}', 'banana', 'Banana', 'fruit', 'low', 'moderate', 'low', 6, 'strip', 'chop', 'slice', 'produce_cooked_soft', NULL, NULL),
    ('${EGG}', 'egg', 'Egg', 'protein', 'moderate', 'low', 'low', 6, 'strip', 'chop', 'slice', 'produce_cooked_soft', NULL, NULL),
    ('${CUSTOM_FOOD}', 'my-mash-u1', 'My mash', 'fruit', 'low', 'low', 'low', 6, 'mash', 'mash', 'mash', 'produce_cooked_soft', '${U}', now());
  INSERT INTO "babies" ("id", "user_id", "name", "birth_date") VALUES ('${BABY}', '${U}', 'Robin', '2025-01-15');
  INSERT INTO "recipes" ("id", "slug", "title", "min_age_months", "prep_minutes", "owner_id") VALUES
    ('${CATALOG_RECIPE}', 'banana-pancakes', 'Banana Pancakes', 6, 10, NULL),
    ('${CUSTOM_RECIPE}', 'my-eggs-a1b2c3', 'My Eggs', 6, 5, '${U}'),
    ('${OTHER_RECIPE}', 'egg-toast', 'Egg Toast', 6, 5, NULL);
  INSERT INTO "recipe_ingredients" ("recipe_id", "food_id", "quantity_note") VALUES
    ('${CATALOG_RECIPE}', '${BANANA}', '1'), ('${CATALOG_RECIPE}', '${EGG}', '1'),
    ('${CUSTOM_RECIPE}', '${EGG}', '2'), ('${OTHER_RECIPE}', '${EGG}', '1');
  INSERT INTO "storage_items" ("id", "user_id", "recipe_id", "prepared_at", "location", "status",
                               "servings_total", "servings_left")
  VALUES ('${CONTAINER}', '${U}', '${CATALOG_RECIPE}', now(), 'fridge', 'active', 4, 3);

  INSERT INTO "meals" ("id", "baby_id", "recipe_id", "recipe_rating", "served_at", "reaction_note", "notes") VALUES
    -- loose-food meal with one food rated
    ('${meal(1)}', '${BABY}', NULL, NULL, '2026-09-01T08:00:00Z', 'rash', 'ate it all'),
    -- recipe meal, rated
    ('${meal(2)}', '${BABY}', '${CATALOG_RECIPE}', 4, '2026-09-02T08:00:00Z', NULL, NULL),
    -- recipe meal, not rated
    ('${meal(3)}', '${BABY}', '${CATALOG_RECIPE}', NULL, '2026-09-03T08:00:00Z', NULL, 'half'),
    -- the parent's own recipe, rated
    ('${meal(4)}', '${BABY}', '${CUSTOM_RECIPE}', 2, '2026-09-04T08:00:00Z', NULL, NULL),
    -- served from storage (foods stamped with the container)
    ('${meal(5)}', '${BABY}', '${CATALOG_RECIPE}', 5, '2026-09-05T08:00:00Z', NULL, NULL),
    -- holds a custom food the parent has since deleted
    ('${meal(6)}', '${BABY}', NULL, NULL, '2026-09-06T08:00:00Z', NULL, NULL),
    -- recipe_id NULL but recipe_rating set (query V4: no app path makes one)
    ('${meal(7)}', '${BABY}', NULL, 3, '2026-09-07T08:00:00Z', NULL, NULL);
  INSERT INTO "meal_foods" ("meal_id", "food_id", "storage_item_id", "rating") VALUES
    ('${meal(1)}', '${BANANA}', NULL, 5), ('${meal(1)}', '${EGG}', NULL, NULL),
    ('${meal(2)}', '${BANANA}', NULL, NULL), ('${meal(2)}', '${EGG}', NULL, NULL),
    ('${meal(3)}', '${BANANA}', NULL, NULL),
    ('${meal(4)}', '${EGG}', NULL, NULL),
    ('${meal(5)}', '${BANANA}', '${CONTAINER}', NULL), ('${meal(5)}', '${EGG}', '${CONTAINER}', NULL),
    ('${meal(6)}', '${CUSTOM_FOOD}', NULL, 3),
    ('${meal(7)}', '${EGG}', NULL, NULL);
`;

async function rows(client: PGlite, sql: string) {
  return (await client.query<Record<string, unknown>>(sql)).rows;
}

/** Every row 0020 must not touch. */
async function untouched(client: PGlite) {
  return {
    meals: await rows(client, `SELECT * FROM "meals" ORDER BY "id"`),
    mealFoods: await rows(client, `SELECT * FROM "meal_foods" ORDER BY "meal_id", "food_id"`),
    storageItems: await rows(client, `SELECT * FROM "storage_items" ORDER BY "id"`),
  };
}

/** The meal as the API showed it before 0020: the single-recipe view. */
async function legacyView(client: PGlite) {
  const mealRows = await rows(
    client,
    `SELECT m."id", m."recipe_id", r."title", m."recipe_rating" FROM "meals" m
       LEFT JOIN "recipes" r ON r."id" = m."recipe_id" ORDER BY m."id"`,
  );
  return mealRows.map((row) => ({ id: row.id, recipeId: row.recipe_id, recipeTitle: row.title ?? null, recipeRating: row.recipe_rating }));
}

const mealRecipeRows = (client: PGlite) =>
  rows(client, `SELECT * FROM "meal_recipes" ORDER BY "meal_id", "position", "recipe_id"`);

describe("migration 0020 — meal_recipes + meal_storage_items", () => {
  let client: PGlite;
  let db: Database;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: stoppedAt0019 });
    await client.exec(SEED_0019);
  });

  afterEach(async () => {
    await client.close();
  });

  /** What production's boot does: migrate to head, then heal. */
  const boot = async () => {
    await migrate(db, { migrationsFolder });
    await healMealRecipes(db);
  };

  it("backfills one row per recipe meal and leaves every meal identical, across two boots", async () => {
    const before = await untouched(client);
    const view = await legacyView(client);

    // The migration's own backfill, before the heal ever runs.
    await migrate(db, { migrationsFolder });
    const backfilled = await mealRecipeRows(client);
    await healMealRecipes(db);
    const afterFirst = await mealRecipeRows(client);
    expect(afterFirst).toEqual(backfilled);
    await boot();

    // Nothing 0020 or the heal ran rewrote a meal, a meal food or a container.
    expect(await untouched(client)).toEqual(before);
    // Exactly one row per recipe meal, at position 0, with its rating.
    expect(afterFirst).toEqual([
      { meal_id: meal(2), recipe_id: CATALOG_RECIPE, position: 0, rating: 4 },
      { meal_id: meal(3), recipe_id: CATALOG_RECIPE, position: 0, rating: null },
      { meal_id: meal(4), recipe_id: CUSTOM_RECIPE, position: 0, rating: 2 },
      { meal_id: meal(5), recipe_id: CATALOG_RECIPE, position: 0, rating: 5 },
    ]);
    // The second boot changed nothing.
    expect(await mealRecipeRows(client)).toEqual(afterFirst);
    // No backfill for servings: what a past serve took was never stored.
    expect(await rows(client, `SELECT * FROM "meal_storage_items"`)).toEqual([]);
    // drizzle recorded 0020 once.
    expect(await rows(client, `SELECT count(*)::int AS "n" FROM "drizzle"."__drizzle_migrations"`)).toEqual([{ n: 21 }]);

    // Every meal reads back through the API exactly as it did before 0020.
    const items = await loadMeals(db, view.map((row) => row.id as string));
    for (const legacy of view) {
      const item = items.get(legacy.id as string);
      // ...except the V4 meal: a rating with no recipe never had a recipe row
      // to show it on, and the API now reads the rows (DESIGN-B §7: V4 = 0 is
      // a dry-run gate).
      const expected = legacy.recipeId === null ? { ...legacy, recipeRating: null } : legacy;
      expect({ id: item?.id, recipeId: item?.recipeId, recipeTitle: item?.recipeTitle, recipeRating: item?.recipeRating }).toEqual(
        expected,
      );
      expect(item?.recipes).toEqual(
        legacy.recipeId === null ? [] : [{ id: legacy.recipeId, title: legacy.recipeTitle, rating: legacy.recipeRating }],
      );
    }
    // Foods, ratings, provenance and the deleted food all come through.
    expect(items.get(meal(1))?.foods.map((food) => [food.slug, food.rating, food.inRecipe])).toEqual([
      ["banana", 5, false],
      ["egg", null, false],
    ]);
    expect(items.get(meal(5))?.foods.map((food) => [food.slug, food.storageItemId, food.inRecipe])).toEqual([
      ["banana", CONTAINER, true],
      ["egg", CONTAINER, true],
    ]);
    expect(items.get(meal(6))?.foods.map((food) => [food.name, food.deleted, food.rating])).toEqual([["My mash", true, 3]]);
  });

  it("re-running the backfill INSERT adds nothing", async () => {
    await boot();
    const before = await mealRecipeRows(client);
    const sql = await fs.readFile(path.join(migrationsFolder, "0020_meal_recipes.sql"), "utf8");
    const backfill = sql.split("--> statement-breakpoint").at(-1)!;
    expect(backfill).toContain('INSERT INTO "meal_recipes"');
    await client.exec(backfill);
    expect(await mealRecipeRows(client)).toEqual(before);
  });

  it("creates both tables with their keys, checks and cascades", async () => {
    await boot();
    await expect(client.exec(`UPDATE "meal_recipes" SET "rating" = 0`)).rejects.toThrow(/meal_recipes_rating_range/);
    await expect(client.exec(`UPDATE "meal_recipes" SET "rating" = 6`)).rejects.toThrow(/meal_recipes_rating_range/);
    await expect(
      client.exec(`INSERT INTO "meal_recipes" ("meal_id", "recipe_id") VALUES ('${meal(2)}', '${CATALOG_RECIPE}')`),
    ).rejects.toThrow(/meal_recipes_meal_id_recipe_id_pk/);
    await expect(
      client.exec(`INSERT INTO "meal_storage_items" VALUES ('${meal(5)}', '${CONTAINER}', -1)`),
    ).rejects.toThrow(/meal_storage_items_servings_range/);
    await client.exec(`INSERT INTO "meal_storage_items" VALUES ('${meal(5)}', '${CONTAINER}', 1)`);

    // A meal delete takes its rows with it.
    await client.exec(`DELETE FROM "meals" WHERE "id" = '${meal(5)}'`);
    expect(await rows(client, `SELECT * FROM "meal_recipes" WHERE "meal_id" = '${meal(5)}'`)).toEqual([]);
    expect(await rows(client, `SELECT * FROM "meal_storage_items"`)).toEqual([]);
  });
});

describe("healMealRecipes — what a rolled-back (pre-0020) image leaves behind", () => {
  let client: PGlite;
  let db: Database;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: stoppedAt0019 });
    await client.exec(SEED_0019);
    await migrate(db, { migrationsFolder });
    await healMealRecipes(db);
  });

  afterEach(async () => {
    await client.close();
  });

  const rowsOf = (mealId: string) =>
    rows(client, `SELECT "recipe_id", "position", "rating" FROM "meal_recipes" WHERE "meal_id" = '${mealId}' ORDER BY "position", "recipe_id"`);

  it("repairs every old-image write, leaves a 2+ recipe meal alone, and a second run changes nothing", async () => {
    // A two-recipe meal (only new code makes one) whose mirror then disagrees.
    await client.exec(`
      INSERT INTO "meals" ("id", "baby_id", "recipe_id", "recipe_rating", "served_at")
      VALUES ('${meal(8)}', '${BABY}', '${CATALOG_RECIPE}', 1, now());
      INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${meal(8)}', '${EGG}');
      INSERT INTO "meal_recipes" ("meal_id", "recipe_id", "position", "rating") VALUES
        ('${meal(8)}', '${CATALOG_RECIPE}', 0, 1), ('${meal(8)}', '${OTHER_RECIPE}', 1, 2);
    `);

    // What the old image does, writing only the mirror columns:
    await client.exec(`
      -- created a recipe meal (no row)
      INSERT INTO "meals" ("id", "baby_id", "recipe_id", "recipe_rating", "served_at")
      VALUES ('${meal(9)}', '${BABY}', '${OTHER_RECIPE}', 3, now());
      INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${meal(9)}', '${EGG}');
      -- changed a meal's recipe (its rating dropped, as old PATCH does)
      UPDATE "meals" SET "recipe_id" = '${OTHER_RECIPE}', "recipe_rating" = NULL WHERE "id" = '${meal(2)}';
      -- removed a meal's recipe
      UPDATE "meals" SET "recipe_id" = NULL, "recipe_rating" = NULL WHERE "id" = '${meal(3)}';
      -- re-rated a recipe
      UPDATE "meals" SET "recipe_rating" = 1 WHERE "id" = '${meal(4)}';
      -- and the 2+ recipe meal's mirror now disagrees
      UPDATE "meals" SET "recipe_id" = '${CUSTOM_RECIPE}', "recipe_rating" = 5 WHERE "id" = '${meal(8)}';
    `);

    await healMealRecipes(db);

    expect(await rowsOf(meal(9))).toEqual([{ recipe_id: OTHER_RECIPE, position: 0, rating: 3 }]);
    expect(await rowsOf(meal(2))).toEqual([{ recipe_id: OTHER_RECIPE, position: 0, rating: null }]);
    expect(await rowsOf(meal(3))).toEqual([]);
    expect(await rowsOf(meal(4))).toEqual([{ recipe_id: CUSTOM_RECIPE, position: 0, rating: 1 }]);
    expect(await rowsOf(meal(8))).toEqual([
      { recipe_id: CATALOG_RECIPE, position: 0, rating: 1 },
      { recipe_id: OTHER_RECIPE, position: 1, rating: 2 },
    ]);
    // Untouched meals are untouched.
    expect(await rowsOf(meal(5))).toEqual([{ recipe_id: CATALOG_RECIPE, position: 0, rating: 5 }]);

    const once = await mealRecipeRows(client);
    const mealsOnce = await rows(client, `SELECT * FROM "meals" ORDER BY "id"`);
    await healMealRecipes(db);
    expect(await mealRecipeRows(client)).toEqual(once);
    // The heal never writes `meals`.
    expect(await rows(client, `SELECT * FROM "meals" ORDER BY "id"`)).toEqual(mealsOnce);
  });

  it("changes nothing on a database new code wrote", async () => {
    const before = await mealRecipeRows(client);
    await healMealRecipes(db);
    expect(await mealRecipeRows(client)).toEqual(before);
  });
});

describe("migration journal", () => {
  // drizzle applies a migration only when its `when` is later than the last
  // applied one; an older, hand-edited `when` is skipped without a word.
  it("has strictly increasing `when` values in index order", async () => {
    const { entries } = await readJournal();
    const sorted = [...entries].sort((a, b) => a.idx - b.idx);
    sorted.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      if (i > 0) expect(entry.when).toBeGreaterThan(sorted[i - 1]!.when);
    });
  });
});
