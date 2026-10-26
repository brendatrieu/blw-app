// Migration 0024 (ledger 901, plan SPEC §2, §8 row 1): `meal_items`, its
// backfill (passes R, F, C) and the boot heal `healMealItems`.
//
// A database is stopped at 0023 by drizzle's REAL migrator, filled with every
// kind of meal a real account holds (the §8 row 1 corpus, B1 cases included),
// then migrated to head and booted twice. Everything a reader sees must come
// out identical (the shared recorder in db/plateParity.ts, which the prod
// dry run uses too), the §2.2 invariants must hold, and no meal may drift.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/index.js";
import { MEAL_ITEMS_BACKFILL, findDriftedMeals, healMealItems, healMealRecipes } from "../db/migrate.js";
import { checkPlateInvariants, comparePlateParity, recordPlateParity } from "../db/plateParity.js";
import * as schema from "../db/schema.js";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

async function readJournal(): Promise<Journal & Record<string, unknown>> {
  return JSON.parse(await fs.readFile(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as Journal &
    Record<string, unknown>;
}

/** A copy of the migrations folder holding only migrations up to `lastIdx`. */
async function foldersUpTo(lastIdx: number): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blw-0024-"));
  await fs.mkdir(path.join(dir, "meta"));
  const journal = await readJournal();
  const entries = journal.entries.filter((entry) => entry.idx <= lastIdx);
  await fs.writeFile(path.join(dir, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) {
    await fs.copyFile(path.join(migrationsFolder, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
  }
  return dir;
}

let stoppedAt0023: string;
beforeAll(async () => {
  stoppedAt0023 = await foldersUpTo(23);
});
afterAll(async () => {
  await fs.rm(stoppedAt0023, { recursive: true, force: true });
});

const id = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const F = (n: number) => id("f", n); // foods
const R = (n: number) => id("e", n); // recipes
const X = (n: number) => id("a", n); // storage containers
const M = (n: number) => id("c", n); // meals
const U = "u1";
const B1 = id("b", 1);
const B2 = id("b", 2);

// Foods: 1 Banana, 2 Egg (egg), 3 Carrot, 4 Oats, 5 Yogurt (milk), 6 Whole
// Milk (info; milk counts only on its own, ledger 864), 7 Unsalted Butter
// (ingredient; milk never counts), 8 Broccoli, 9 Peas, 10 My mash (custom,
// deleted), 11-60 fillers. Recipes: 1 Banana Pancakes (banana, egg), 2 Egg
// Bake (egg, milk, butter), 3 Carrot Mash (carrot), 4 Oatmeal (oats, banana),
// 5 My Eggs (custom: egg), 6 Broccoli Egg (broccoli, egg).
const SEED_0023 = `
  INSERT INTO "user" ("id", "name", "email") VALUES ('${U}', 'Parent', 'parent@example.com');
  INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
  VALUES ('produce_cooked_soft', 72, 90, 2, 'Steamed veg.');
  INSERT INTO "allergens" ("id", "slug", "name", "intro_guidance") VALUES
    ('${id("d", 1)}', 'egg', 'Egg', 'Well-cooked egg.'), ('${id("d", 2)}', 'milk', 'Milk', 'Yogurt or cheese.');
  INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                       "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category", "owner_id", "deleted_at", "kind")
  VALUES
    ('${F(1)}', 'banana', 'Banana', 'fruit', 'low', 'moderate', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(2)}', 'egg', 'Egg', 'protein', 'moderate', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(3)}', 'carrot', 'Carrot', 'veg', 'low', 'low', 'high', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(4)}', 'oats', 'Oats', 'grain', 'high', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(5)}', 'yogurt', 'Yogurt', 'dairy', 'low', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(6)}', 'milk', 'Whole Milk', 'dairy', 'low', 'low', 'low', 12, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'info'),
    ('${F(7)}', 'unsalted_butter', 'Unsalted Butter', 'dairy', 'low', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'ingredient'),
    ('${F(8)}', 'broccoli', 'Broccoli', 'veg', 'moderate', 'high', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(9)}', 'peas', 'Peas', 'legume', 'moderate', 'moderate', 'moderate', 6, 'a', 'b', 'c', 'produce_cooked_soft', NULL, NULL, 'food'),
    ('${F(10)}', 'my-mash-u1', 'My mash', 'fruit', 'low', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft', '${U}', now(), 'food');
  INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                       "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category")
  SELECT ('f0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'filler-' || n, 'Filler ' || lpad(n::text, 2, '0'),
         'veg', 'low', 'low', 'low', 6, 'a', 'b', 'c', 'produce_cooked_soft'
    FROM generate_series(11, 60) n;
  INSERT INTO "food_allergens" ("food_id", "allergen_id", "counts_toward_progress", "counts_when_alone") VALUES
    ('${F(2)}', '${id("d", 1)}', true, false), ('${F(5)}', '${id("d", 2)}', true, false),
    ('${F(6)}', '${id("d", 2)}', false, true), ('${F(7)}', '${id("d", 2)}', false, false);
  INSERT INTO "babies" ("id", "user_id", "name", "birth_date") VALUES
    ('${B1}', '${U}', 'Robin', '2025-01-15'), ('${B2}', '${U}', 'Wren', '2025-03-01');
  INSERT INTO "recipes" ("id", "slug", "title", "min_age_months", "prep_minutes", "owner_id") VALUES
    ('${R(1)}', 'banana-pancakes', 'Banana Pancakes', 6, 10, NULL),
    ('${R(2)}', 'egg-bake', 'Egg Bake', 9, 30, NULL),
    ('${R(3)}', 'carrot-mash', 'Carrot Mash', 6, 15, NULL),
    ('${R(4)}', 'oatmeal', 'Oatmeal', 6, 10, NULL),
    ('${R(5)}', 'my-eggs-a1b2c3', 'My Eggs', 6, 5, '${U}'),
    ('${R(6)}', 'broccoli-egg', 'Broccoli Egg', 6, 15, NULL);
  INSERT INTO "recipe_ingredients" ("recipe_id", "food_id", "quantity_note") VALUES
    ('${R(1)}', '${F(1)}', '1'), ('${R(1)}', '${F(2)}', '1'),
    ('${R(2)}', '${F(2)}', '4'), ('${R(2)}', '${F(6)}', '1 cup'), ('${R(2)}', '${F(7)}', '1 tbsp'),
    ('${R(3)}', '${F(3)}', '2'),
    ('${R(4)}', '${F(4)}', '1/2 cup'), ('${R(4)}', '${F(1)}', '1'),
    ('${R(5)}', '${F(2)}', '2'),
    ('${R(6)}', '${F(8)}', '1'), ('${R(6)}', '${F(2)}', '1');

  -- Containers. a12 was Banana Pancakes when served and is Broccoli Egg now;
  -- a14 held Banana when served and holds Carrot now (both: orphans).
  INSERT INTO "storage_items" ("id", "user_id", "recipe_id", "prepared_at", "location", "status", "servings_total", "servings_left") VALUES
    ('${X(1)}', '${U}', NULL, now(), 'fridge', 'active', 4, 3),
    ('${X(2)}', '${U}', '${R(2)}', now(), 'fridge', 'active', 3, 2),
    ('${X(3)}', '${U}', '${R(4)}', now(), 'freezer', 'active', 6, 4),
    ('${X(4)}', '${U}', NULL, now(), 'fridge', 'active', NULL, NULL),
    ('${X(5)}', '${U}', '${R(1)}', now(), 'fridge', 'active', 3, 1),
    ('${X(6)}', '${U}', '${R(1)}', now(), 'freezer', 'active', 4, 3),
    ('${X(7)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(8)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(9)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(10)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(11)}', '${U}', '${R(4)}', now(), 'fridge', 'active', 2, 1),
    ('${X(12)}', '${U}', '${R(6)}', now(), 'fridge', 'active', 2, 1),
    ('${X(13)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(14)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(15)}', '${U}', '${R(1)}', now(), 'freezer', 'active', 2, 1),
    ('${X(16)}', '${U}', '${R(3)}', now(), 'fridge', 'active', 2, 1),
    ('${X(17)}', '${U}', NULL, now(), 'fridge', 'active', 2, 1),
    ('${X(18)}', '${U}', NULL, now(), 'fridge', 'finished', 1, 0);
  INSERT INTO "storage_item_foods" ("storage_item_id", "food_id", "position") VALUES
    ('${X(1)}', '${F(1)}', 0), ('${X(1)}', '${F(2)}', 1), ('${X(4)}', '${F(5)}', 0),
    ('${X(7)}', '${F(1)}', 0), ('${X(7)}', '${F(2)}', 1), ('${X(8)}', '${F(1)}', 0),
    ('${X(9)}', '${F(1)}', 0), ('${X(9)}', '${F(2)}', 1), ('${X(10)}', '${F(1)}', 0),
    ('${X(13)}', '${F(1)}', 0), ('${X(14)}', '${F(3)}', 0), ('${X(16)}', '${F(9)}', 0),
    ('${X(17)}', '${F(2)}', 0), ('${X(18)}', '${F(8)}', 0);
  INSERT INTO "storage_item_recipes" ("storage_item_id", "recipe_id", "position") VALUES
    ('${X(3)}', '${R(4)}', 0), ('${X(3)}', '${R(3)}', 1), ('${X(15)}', '${R(1)}', 0), ('${X(15)}', '${R(2)}', 1);

  INSERT INTO "meals" ("id", "baby_id", "recipe_id", "recipe_rating", "served_at", "reaction_note", "notes")
  SELECT ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, CASE WHEN n IN (27, 28) THEN '${B2}'::uuid ELSE '${B1}'::uuid END,
         NULL, NULL, '2026-09-01T08:00:00Z'::timestamptz + (n || ' hours')::interval,
         CASE WHEN n IN (1, 9, 27) THEN 'rash' END, CASE WHEN n = 1 THEN 'ate it all' END
    FROM generate_series(1, 29) n;
  INSERT INTO "meal_recipes" ("meal_id", "recipe_id", "position", "rating") VALUES
    ('${M(2)}', '${R(1)}', 0, 4),                                 -- egg left out
    ('${M(3)}', '${R(1)}', 0, 3), ('${M(3)}', '${R(3)}', 1, 5),   -- several recipes
    ('${M(4)}', '${R(4)}', 0, NULL),                              -- rated extra, later an ingredient
    ('${M(6)}', '${R(2)}', 0, 2),                                 -- recipe container, pre-0020
    ('${M(7)}', '${R(4)}', 0, 4), ('${M(7)}', '${R(3)}', 1, NULL), ('${M(7)}', '${R(5)}', 2, NULL), -- multi-part
    ('${M(9)}', '${R(2)}', 0, NULL),                              -- milk through a recipe
    ('${M(10)}', '${R(3)}', 0, NULL),                             -- recipe lost an ingredient since
    ('${M(11)}', '${R(2)}', 0, NULL),                             -- recipe gained one since
    ('${M(12)}', '${R(1)}', 0, NULL),                             -- fridge + freezer of one recipe
    ('${M(15)}', '${R(4)}', 0, NULL),                             -- merged serve
    ('${M(16)}', '${R(1)}', 0, NULL),                             -- orphan recipe container
    ('${M(20)}', '${R(2)}', 0, NULL),                             -- cup of milk beside the egg bake
    ('${M(21)}', '${R(1)}', 0, NULL), ('${M(21)}', '${R(3)}', 1, NULL), ('${M(21)}', '${R(2)}', 2, NULL), -- split
    ('${M(22)}', '${R(3)}', 0, NULL),                             -- container of foods AND a recipe
    ('${M(24)}', '${R(1)}', 0, 5),                                -- recipe container + an overlapping food one
    ('${M(29)}', '${R(5)}', 0, NULL);                             -- food container + a fresh recipe sharing a food
  -- The legacy mirror, as every writer leaves it; plus the V4 meal (a rating
  -- with no recipe, no app path makes one).
  UPDATE "meals" m SET "recipe_id" = mr."recipe_id", "recipe_rating" = mr."rating"
    FROM "meal_recipes" mr WHERE mr."meal_id" = m."id" AND mr."position" = 0;
  UPDATE "meals" SET "recipe_rating" = 3 WHERE "id" = '${M(23)}';
  INSERT INTO "meal_foods" ("meal_id", "food_id", "storage_item_id", "rating") VALUES
    ('${M(1)}', '${F(1)}', NULL, 5), ('${M(1)}', '${F(3)}', NULL, NULL),
    ('${M(2)}', '${F(1)}', NULL, NULL),
    ('${M(3)}', '${F(1)}', NULL, NULL), ('${M(3)}', '${F(2)}', NULL, NULL), ('${M(3)}', '${F(3)}', NULL, NULL),
    ('${M(4)}', '${F(4)}', NULL, NULL), ('${M(4)}', '${F(1)}', NULL, 4),
    ('${M(5)}', '${F(1)}', '${X(1)}', 4), ('${M(5)}', '${F(2)}', '${X(1)}', NULL),
    ('${M(6)}', '${F(2)}', '${X(2)}', NULL), ('${M(6)}', '${F(6)}', '${X(2)}', NULL), ('${M(6)}', '${F(7)}', '${X(2)}', NULL),
    ('${M(7)}', '${F(4)}', '${X(3)}', NULL), ('${M(7)}', '${F(1)}', '${X(3)}', NULL), ('${M(7)}', '${F(3)}', '${X(3)}', NULL),
    ('${M(7)}', '${F(5)}', '${X(4)}', NULL), ('${M(7)}', '${F(2)}', NULL, NULL), ('${M(7)}', '${F(8)}', NULL, 3),
    ('${M(8)}', '${F(10)}', NULL, 3), ('${M(8)}', '${F(1)}', NULL, NULL),
    ('${M(9)}', '${F(2)}', NULL, NULL), ('${M(9)}', '${F(6)}', NULL, NULL), ('${M(9)}', '${F(7)}', NULL, NULL),
    ('${M(10)}', '${F(3)}', NULL, NULL), ('${M(10)}', '${F(9)}', NULL, NULL),
    ('${M(11)}', '${F(2)}', NULL, NULL), ('${M(11)}', '${F(6)}', NULL, NULL),
    -- the serve's first part was the FREEZER (a6), which links the foods
    ('${M(12)}', '${F(1)}', '${X(6)}', NULL), ('${M(12)}', '${F(2)}', '${X(6)}', NULL),
    -- a8's one food overlapped a7, so a8 has no link
    ('${M(13)}', '${F(1)}', '${X(7)}', NULL), ('${M(13)}', '${F(2)}', '${X(7)}', NULL),
    -- the same before 0020: a10 left no trace at all
    ('${M(14)}', '${F(1)}', '${X(9)}', NULL), ('${M(14)}', '${F(2)}', '${X(9)}', NULL),
    ('${M(15)}', '${F(4)}', '${X(11)}', NULL), ('${M(15)}', '${F(1)}', '${X(11)}', NULL),
    ('${M(16)}', '${F(1)}', '${X(12)}', NULL), ('${M(16)}', '${F(2)}', '${X(12)}', NULL),
    ('${M(17)}', '${F(1)}', '${X(13)}', NULL),
    ('${M(19)}', '${F(6)}', NULL, NULL), ('${M(19)}', '${F(1)}', NULL, NULL),
    ('${M(20)}', '${F(2)}', NULL, NULL), ('${M(20)}', '${F(6)}', NULL, NULL), ('${M(20)}', '${F(7)}', NULL, NULL),
    ('${M(20)}', '${F(5)}', NULL, 2),
    ('${M(21)}', '${F(1)}', '${X(15)}', NULL), ('${M(21)}', '${F(2)}', '${X(15)}', NULL),
    ('${M(21)}', '${F(6)}', '${X(15)}', NULL), ('${M(21)}', '${F(7)}', '${X(15)}', NULL), ('${M(21)}', '${F(3)}', NULL, NULL),
    ('${M(22)}', '${F(9)}', '${X(16)}', NULL),
    ('${M(23)}', '${F(2)}', NULL, NULL),
    ('${M(24)}', '${F(1)}', '${X(5)}', NULL), ('${M(24)}', '${F(2)}', '${X(5)}', NULL),
    ('${M(25)}', '${F(8)}', '${X(18)}', NULL),
    ('${M(26)}', '${F(5)}', NULL, NULL),
    ('${M(27)}', '${F(2)}', NULL, 2), ('${M(27)}', '${F(5)}', NULL, NULL),
    ('${M(28)}', '${F(6)}', NULL, NULL),
    ('${M(29)}', '${F(1)}', '${X(1)}', NULL), ('${M(29)}', '${F(2)}', '${X(1)}', NULL);
  -- The 50-food meal.
  INSERT INTO "meal_foods" ("meal_id", "food_id")
  SELECT '${M(18)}', ('f0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(11, 60) n;
  INSERT INTO "meal_storage_items" ("meal_id", "storage_item_id", "servings") VALUES
    ('${M(5)}', '${X(1)}', 1),
    ('${M(7)}', '${X(3)}', 2), ('${M(7)}', '${X(4)}', 0),
    ('${M(12)}', '${X(5)}', 1), ('${M(12)}', '${X(6)}', 1),
    ('${M(13)}', '${X(7)}', 1), ('${M(13)}', '${X(8)}', 1),
    ('${M(15)}', '${X(11)}', 1),
    ('${M(16)}', '${X(12)}', 1),
    ('${M(17)}', '${X(13)}', 1), ('${M(17)}', '${X(14)}', 1),
    ('${M(21)}', '${X(15)}', 1),
    ('${M(22)}', '${X(16)}', 1),
    ('${M(24)}', '${X(5)}', 1), ('${M(24)}', '${X(17)}', 1),
    ('${M(25)}', '${X(18)}', 1),
    ('${M(29)}', '${X(1)}', 1);
`;
// m26 is a plain one-food meal (Yogurt); m27-28 are the second baby's; m29
// is a1 (Banana, Egg) served with a fresh My Eggs, so Egg is counted by the
// recipe AND held by the container its link names.

async function rows(client: PGlite, sql: string) {
  return (await client.query<Record<string, unknown>>(sql)).rows;
}

const itemRows = (client: PGlite) =>
  rows(client, `SELECT * FROM "meal_items" ORDER BY "meal_id", "position", "id"`);

/** One meal's items as [position, food|recipe, storage, counted, rating]. */
async function itemsOf(client: PGlite, mealId: string) {
  return (
    await rows(
      client,
      `SELECT "position", coalesce("food_id", "recipe_id") AS "ref", "storage_item_id", "counted_food_ids", "rating", "inferred"
         FROM "meal_items" WHERE "meal_id" = '${mealId}' ORDER BY "position"`,
    )
  ).map((row) => {
    expect(row.inferred).toBe(true);
    return [row.position, row.ref, row.storage_item_id, row.counted_food_ids, row.rating];
  });
}

describe("migration 0024 — meal_items backfill", () => {
  let client: PGlite;
  let db: Database;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: stoppedAt0023 });
    await client.exec(SEED_0023);
  });

  afterEach(async () => {
    await client.close();
  });

  /** What production's boot does: migrate to head, then heal. */
  const boot = async () => {
    await migrate(db, { migrationsFolder });
    await healMealRecipes(db);
    await db.transaction((tx) => healMealItems(tx));
  };

  it("gives every corpus meal its items, changes nothing any reader sees, and two boots change nothing", async () => {
    const before = await recordPlateParity(db);

    await migrate(db, { migrationsFolder });
    const backfilled = await itemRows(client);
    expect(await checkPlateInvariants(db)).toEqual({ violations: [], orphans: 2 });
    expect(await findDriftedMeals(db)).toEqual([]);

    await boot();
    expect(await itemRows(client)).toEqual(backfilled);
    await boot();
    expect(await itemRows(client)).toEqual(backfilled);

    const after = await recordPlateParity(db);
    expect(after).toEqual(before);
    expect(Object.values(comparePlateParity(before, after)).every((n) => n === 0)).toBe(true);
    // The recorder really looked: every meal, both babies, every allergen.
    expect(Object.keys(after.loadMeals!)).toHaveLength(29);
    expect(Object.keys(after.allergenDetail!)).toHaveLength(4);
    // 9 named foods (whole milk is info, not a food tried) + 50 fillers.
    expect(after.foodsTried).toEqual({ [B1]: 59, [B2]: 2 });

    // Every meal has items, every row is inferred (chair §10.1).
    expect(await rows(client, `SELECT count(DISTINCT "meal_id")::int AS "n", bool_and("inferred") AS "all" FROM "meal_items"`)).toEqual([
      { n: 29, all: true },
    ]);
    expect(await rows(client, `SELECT count(*)::int AS "n" FROM "drizzle"."__drizzle_migrations"`)).toEqual([
      { n: (await readJournal()).entries.length },
    ]);
  });

  it("builds each meal kind exactly (passes R, F and C)", async () => {
    await boot();
    const counted = (...foods: number[]) => foods.map(F).sort();
    // Loose foods, by name; the rated one keeps its stars.
    expect(await itemsOf(client, M(1))).toEqual([
      [0, F(1), null, [], 5],
      [1, F(3), null, [], null],
    ]);
    // A left-out ingredient is simply not counted.
    expect(await itemsOf(client, M(2))).toEqual([[0, R(1), null, counted(1), 4]]);
    expect(await itemsOf(client, M(3))).toEqual([
      [0, R(1), null, counted(1, 2), 3],
      [1, R(3), null, counted(3), 5],
    ]);
    // F (a): a rated extra that is now an ingredient keeps its own row.
    expect(await itemsOf(client, M(4))).toEqual([
      [0, R(4), null, counted(1, 4), null],
      [1, F(1), null, [], 4],
    ]);
    // A food container: one row per held food, rated per food.
    expect(await itemsOf(client, M(5))).toEqual([
      [0, F(1), X(1), [], 4],
      [1, F(2), X(1), [], null],
    ]);
    // A recipe container from before 0020 is found through the food links.
    expect(await itemsOf(client, M(6))).toEqual([[0, R(2), X(2), counted(2, 6, 7), 2]]);
    // Multi-part serve: a several-recipe container, an untracked food
    // container, a fresh recipe and a fresh rated food.
    expect(await itemsOf(client, M(7))).toEqual([
      [0, R(4), X(3), counted(1, 4), 4],
      [1, R(3), X(3), counted(3), null],
      [2, R(5), null, counted(2), null],
      [3, F(8), null, [], 3],
      [4, F(5), X(4), [], null],
    ]);
    // F (b): a food the recipe no longer lists.
    expect(await itemsOf(client, M(10))).toEqual([
      [0, R(3), null, counted(3), null],
      [1, F(9), null, [], null],
    ]);
    // An ingredient added since is not counted (and, inferred, never shown as left out).
    expect(await itemsOf(client, M(11))).toEqual([[0, R(2), null, counted(2, 6), null]]);
    // B1: fridge + freezer of one recipe are two groups. R takes the
    // container the serve LINKED (a6), even though a5 has the lower id; C
    // adds a5 with R's counted set, unrated.
    expect(await itemsOf(client, M(12))).toEqual([
      [0, R(1), X(6), counted(1, 2), null],
      [1, R(1), X(5), counted(1, 2), null],
    ]);
    // B1: a food container whose food overlapped an earlier part (C)...
    expect(await itemsOf(client, M(13))).toEqual([
      [0, F(1), X(7), [], null],
      [1, F(2), X(7), [], null],
      [2, F(1), X(8), [], null],
    ]);
    // ...and its pre-0020 twin, which left no trace to find.
    expect(await itemsOf(client, M(14))).toEqual([
      [0, F(1), X(9), [], null],
      [1, F(2), X(9), [], null],
    ]);
    // Merged serve (a container of r plus a fresh r): one group.
    expect(await itemsOf(client, M(15))).toEqual([[0, R(4), X(11), counted(1, 4), null]]);
    // Orphans: a container edited in Storage since gets no group.
    expect(await itemsOf(client, M(16))).toEqual([[0, R(1), null, counted(1, 2), null]]);
    expect(await itemsOf(client, M(17))).toEqual([[0, F(1), X(13), [], null]]);
    // The 50-food meal: 50 rows, by name.
    expect((await itemsOf(client, M(18))).map((item) => item[1])).toEqual(
      Array.from({ length: 50 }, (_, i) => F(i + 11)),
    );
    // Milk on its own and milk through a recipe stay what they were.
    expect(await itemsOf(client, M(19))).toEqual([
      [0, F(1), null, [], null],
      [1, F(6), null, [], null],
    ]);
    expect(await itemsOf(client, M(20))).toEqual([
      [0, R(2), null, counted(2, 6, 7), null],
      [1, F(5), null, [], 2],
    ]);
    // Known limit, split container recipes: the group sits at 0 and 2.
    expect(await itemsOf(client, M(21))).toEqual([
      [0, R(1), X(15), counted(1, 2), null],
      [1, R(3), null, counted(3), null],
      [2, R(2), X(15), counted(2, 6, 7), null],
    ]);
    // A legacy container of foods AND a recipe: held foods win, the recipe
    // row counts nothing.
    expect(await itemsOf(client, M(22))).toEqual([
      [0, R(3), X(16), [], null],
      [1, F(9), X(16), [], null],
    ]);
    // The V4 meal has no recipe to put a rating on.
    expect(await itemsOf(client, M(23))).toEqual([[0, F(2), null, [], null]]);
    // A recipe container plus a food container holding one of its ingredients.
    expect(await itemsOf(client, M(24))).toEqual([
      [0, R(1), X(5), counted(1, 2), 5],
      [1, F(2), X(17), [], null],
    ]);
    // A container the serve finished keeps its group.
    expect(await itemsOf(client, M(25))).toEqual([[0, F(8), X(18), [], null]]);
    // F (c): the container keeps BOTH its foods, though the recipe counts Egg.
    expect(await itemsOf(client, M(29))).toEqual([
      [0, R(5), null, counted(2), null],
      [1, F(1), X(1), [], null],
      [2, F(2), X(1), [], null],
    ]);
  });

  it("the heal's backfill IS the migration's: rebuilt from nothing, every meal gets the same rows", async () => {
    await boot();
    const strip = async () =>
      (await itemRows(client)).map(({ id: _id, ...rest }) => rest).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const migrated = await strip();
    await client.exec(`DELETE FROM "meal_items"`);
    await db.transaction((tx) => healMealItems(tx));
    expect(await strip()).toEqual(migrated);
  });

  // The dry run trusts these two to say when something IS wrong.
  it("the invariant checker and the recorder flag what breaks", async () => {
    await boot();
    const before = await recordPlateParity(db);
    await client.exec(`
      DELETE FROM "meal_items" WHERE "meal_id" = '${M(12)}' AND "position" = 1;            -- 4: a5 loses its group
      UPDATE "meal_items" SET "counted_food_ids" = '{}' WHERE "meal_id" = '${M(2)}';        -- 1
      UPDATE "meal_items" SET "position" = 9 WHERE "meal_id" = '${M(3)}' AND "position" = 0; -- 2
      UPDATE "meal_items" SET "rating" = 1 WHERE "meal_id" = '${M(1)}' AND "position" = 0;  -- 3
      DELETE FROM "meal_items" WHERE "meal_id" = '${M(5)}';                                 -- 1, 3, 4, 5
      UPDATE "meal_foods" SET "storage_item_id" = NULL WHERE "meal_id" = '${M(13)}' AND "food_id" = '${F(1)}';
    `);
    const { violations } = await checkPlateInvariants(db);
    const flagged = (mealId: string) => violations.filter((v) => v.mealId === mealId).map((v) => v.invariant);
    expect(flagged(M(12))).toEqual([4]);
    expect(flagged(M(2))).toEqual([1]);
    expect(flagged(M(3))).toEqual([2]);
    expect(flagged(M(1))).toEqual([3]);
    expect(flagged(M(5))).toEqual([1, 3, 4, 5]);
    const mismatches = comparePlateParity(before, await recordPlateParity(db));
    expect(mismatches.mealFoods).toBe(1);
    expect(mismatches.loadMeals).toBe(1);
    expect(mismatches.meals).toBe(0);
  });

  it("ends 0024 with MEAL_ITEMS_BACKFILL verbatim", async () => {
    const file = await fs.readFile(path.join(migrationsFolder, "0024_meal_items.sql"), "utf8");
    expect(file.split("--> statement-breakpoint").at(-1)!.trim()).toBe(MEAL_ITEMS_BACKFILL.trim());
  });

  it("creates the table with its checks, defaults and cascades", async () => {
    await boot();
    await expect(client.exec(`INSERT INTO "meal_items" ("meal_id", "position") VALUES ('${M(1)}', 9)`)).rejects.toThrow(
      /meal_items_one_ref/,
    );
    await expect(
      client.exec(`INSERT INTO "meal_items" ("meal_id", "position", "food_id", "recipe_id") VALUES ('${M(1)}', 9, '${F(1)}', '${R(1)}')`),
    ).rejects.toThrow(/meal_items_one_ref/);
    await expect(
      client.exec(`INSERT INTO "meal_items" ("meal_id", "position", "food_id", "counted_food_ids") VALUES ('${M(1)}', 9, '${F(1)}', '{${F(2)}}')`),
    ).rejects.toThrow(/meal_items_counted_recipe_only/);
    await expect(client.exec(`UPDATE "meal_items" SET "rating" = 0`)).rejects.toThrow(/meal_items_rating_range/);
    await expect(client.exec(`UPDATE "meal_items" SET "rating" = 6`)).rejects.toThrow(/meal_items_rating_range/);

    // A new write's row: not inferred, counts nothing unless told.
    await client.exec(`INSERT INTO "meal_items" ("meal_id", "position", "food_id") VALUES ('${M(26)}', 1, '${F(9)}')`);
    expect(await rows(client, `SELECT "inferred", "counted_food_ids" FROM "meal_items" WHERE "meal_id" = '${M(26)}' AND "position" = 1`)).toEqual([
      { inferred: false, counted_food_ids: [] },
    ]);
    // A food delete takes its item rows (meal_foods does not hold Peas on m26).
    await client.exec(`DELETE FROM "recipe_ingredients" WHERE "food_id" = '${F(9)}'; DELETE FROM "storage_item_foods" WHERE "food_id" = '${F(9)}';
                       DELETE FROM "meal_foods" WHERE "food_id" = '${F(9)}'; DELETE FROM "foods" WHERE "id" = '${F(9)}'`);
    expect(await rows(client, `SELECT * FROM "meal_items" WHERE "food_id" = '${F(9)}'`)).toEqual([]);
    // A container delete keeps the rows and drops the link.
    await client.exec(`DELETE FROM "storage_items" WHERE "id" = '${X(1)}'`);
    expect((await itemsOf(client, M(5))).map((item) => item[2])).toEqual([null, null]);
    // A meal delete takes its items.
    await client.exec(`DELETE FROM "meals" WHERE "id" = '${M(7)}'`);
    expect(await rows(client, `SELECT * FROM "meal_items" WHERE "meal_id" = '${M(7)}'`)).toEqual([]);
  });
});

describe("healMealItems — what older writers leave behind", () => {
  let client: PGlite;
  let db: Database;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: stoppedAt0023 });
    await client.exec(SEED_0023);
    await migrate(db, { migrationsFolder });
  });

  afterEach(async () => {
    await client.close();
  });

  const heal = (mealIds?: string[]) => db.transaction((tx) => healMealItems(tx, mealIds));
  const idsOf = async (mealId: string) =>
    (await rows(client, `SELECT "id" FROM "meal_items" WHERE "meal_id" = '${mealId}' ORDER BY "position"`)).map((row) => row.id);

  it("repairs every old-image write, leaves other meals' rows alone, and a second run changes nothing", async () => {
    const untouched = await idsOf(M(13));
    // A new client's ratings on m12: R row 5, the C row 4 (mirror = 5).
    await client.exec(`UPDATE "meal_items" SET "rating" = CASE "position" WHEN 0 THEN 5 ELSE 4 END WHERE "meal_id" = '${M(12)}';
                       UPDATE "meal_recipes" SET "rating" = 5 WHERE "meal_id" = '${M(12)}';
                       UPDATE "meals" SET "recipe_rating" = 5 WHERE "id" = '${M(12)}'`);

    // What an older image (or an old bundle's legacy request) writes:
    await client.exec(`
      -- a new meal, legacy rows only
      INSERT INTO "meals" ("id", "baby_id", "served_at") VALUES ('${M(40)}', '${B1}', now());
      INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${M(40)}', '${F(3)}');
      -- a food added
      INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${M(1)}', '${F(8)}');
      -- a recipe removed, with its foods
      DELETE FROM "meal_recipes" WHERE "meal_id" = '${M(3)}' AND "recipe_id" = '${R(3)}';
      DELETE FROM "meal_foods" WHERE "meal_id" = '${M(3)}' AND "food_id" = '${F(3)}';
      -- recipes reordered (and the mirror rewritten, as every writer does)
      UPDATE "meal_recipes" SET "position" = 2 - "position" WHERE "meal_id" = '${M(21)}';
      UPDATE "meals" SET "recipe_id" = '${R(2)}', "recipe_rating" = NULL WHERE "id" = '${M(21)}';
      -- a food rated that only a recipe row counted
      UPDATE "meal_foods" SET "rating" = 3 WHERE "meal_id" = '${M(2)}' AND "food_id" = '${F(1)}';
      -- a container food re-rated, a recipe rated, a recipe rating cleared
      UPDATE "meal_foods" SET "rating" = 2 WHERE "meal_id" = '${M(5)}' AND "food_id" = '${F(1)}';
      UPDATE "meal_recipes" SET "rating" = 1 WHERE "meal_id" = '${M(15)}';
      UPDATE "meals" SET "recipe_rating" = 1 WHERE "id" = '${M(15)}';
      UPDATE "meal_recipes" SET "rating" = NULL WHERE "meal_id" = '${M(12)}';
      UPDATE "meals" SET "recipe_rating" = NULL WHERE "id" = '${M(12)}';
      -- custom food Replace (My mash -> Banana): the meal_foods merge, then the hard delete
      UPDATE "meal_foods" SET "rating" = 3 WHERE "meal_id" = '${M(8)}' AND "food_id" = '${F(1)}';
      DELETE FROM "meal_foods" WHERE "food_id" = '${F(10)}';
      DELETE FROM "foods" WHERE "id" = '${F(10)}';
    `);
    expect(await findDriftedMeals(db)).toEqual([M(1), M(2), M(3), M(21), M(40)].sort());

    await healMealRecipes(db);
    await heal();

    const items = async (mealId: string) =>
      (
        await rows(
          client,
          `SELECT coalesce("food_id", "recipe_id") AS "ref", "storage_item_id", "rating" FROM "meal_items" WHERE "meal_id" = '${mealId}' ORDER BY "position"`,
        )
      ).map((row) => [row.ref, row.storage_item_id, row.rating]);
    expect(await items(M(40))).toEqual([[F(3), null, null]]);
    expect(await items(M(1))).toEqual([
      [F(1), null, 5],
      [F(8), null, null],
      [F(3), null, null],
    ]);
    expect(await items(M(3))).toEqual([[R(1), null, 3]]);
    expect(await items(M(21))).toEqual([
      [R(2), X(15), null],
      [R(3), null, null],
      [R(1), X(15), null],
    ]);
    expect(await items(M(2))).toEqual([
      [R(1), null, 4],
      [F(1), null, 3],
    ]);
    // Ratings land on the first row only; a clear clears every row.
    expect(await items(M(5))).toEqual([
      [F(1), X(1), 2],
      [F(2), X(1), null],
    ]);
    expect(await items(M(15))).toEqual([[R(4), X(11), 1]]);
    expect(await items(M(12))).toEqual([
      [R(1), X(6), null],
      [R(1), X(5), null],
    ]);
    // Replace: the old food's row cascaded, the merged rating came back.
    expect(await items(M(8))).toEqual([[F(1), null, 3]]);
    // A meal no older writer touched keeps its very rows.
    expect(await idsOf(M(13))).toEqual(untouched);

    expect(await checkPlateInvariants(db)).toEqual({ violations: [], orphans: 2 });
    expect(await findDriftedMeals(db)).toEqual([]);
    const once = await itemRows(client);
    await heal();
    expect(await itemRows(client)).toEqual(once);
  });

  it("a rating the old client gives lands on ONE row, so a meal never counts it twice", async () => {
    await client.exec(`UPDATE "meal_recipes" SET "rating" = 4 WHERE "meal_id" = '${M(12)}';
                       UPDATE "meals" SET "recipe_rating" = 4 WHERE "id" = '${M(12)}'`);
    await heal();
    expect(await rows(client, `SELECT "position", "rating" FROM "meal_items" WHERE "meal_id" = '${M(12)}' ORDER BY "position"`)).toEqual([
      { position: 0, rating: 4 },
      { position: 1, rating: null },
    ]);
  });

  it("with meal ids, heals only those meals", async () => {
    await client.exec(`INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${M(1)}', '${F(8)}'), ('${M(26)}', '${F(8)}')`);
    await heal([M(1)]);
    expect(await findDriftedMeals(db)).toEqual([M(26)]);
    expect(await findDriftedMeals(db, [M(1)])).toEqual([]);
    await heal([]);
    expect(await findDriftedMeals(db)).toEqual([M(26)]);
    await heal();
    expect(await findDriftedMeals(db)).toEqual([]);
  });

  // One transaction: a failure after the DELETE must not leave a meal empty.
  it("a heal that fails part-way changes nothing, and the next run repairs", async () => {
    await client.exec(`INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${M(1)}', '${F(8)}')`);
    await client.exec(`
      CREATE FUNCTION heal_test_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'heal test boom'; END $$;
      CREATE TRIGGER heal_test_boom BEFORE INSERT ON "meal_items" FOR EACH ROW EXECUTE FUNCTION heal_test_boom();`);
    const before = await itemRows(client);
    await expect(heal()).rejects.toThrow(/heal test boom/);
    expect(await itemRows(client)).toEqual(before);

    await client.exec(`DROP TRIGGER heal_test_boom ON "meal_items"; DROP FUNCTION heal_test_boom();`);
    await heal();
    expect(await findDriftedMeals(db)).toEqual([]);
  });
});
