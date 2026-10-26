import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { inArray, sql } from "drizzle-orm";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import type { Queryable, Transaction } from "../services/meals.js";
import type { Database } from "./index.js";
import * as schema from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

/**
 * Ledger 752 (DESIGN-B §9): folds the legacy mirror `meals.recipe_id` /
 * `recipe_rating` back into `meal_recipes`, in one transaction, on every boot
 * after the migrations. Only a pre-0020 image (a rollback) writes the mirror
 * without the rows; new code writes both together, so in steady state all
 * three statements change nothing.
 *
 * "Mirror wins", but only on meals with at most ONE `meal_recipes` row: a
 * 2+ recipe meal was made by new code and is never touched. In order:
 * a row whose recipe is no longer the mirror's is deleted (recipe changed or
 * removed), a row whose rating differs from the mirror's is updated, and the
 * 0020 backfill INSERT adds the row of any recipe meal that has none.
 *
 * A failure here fails the boot exactly like a failed migration.
 */
// ponytail: legacy mirror heal; delete with the migration that drops
// meals.recipe_id/recipe_rating.
export async function healMealRecipes(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM "meal_recipes" mr USING "meals" m
       WHERE mr."meal_id" = m."id"
         AND mr."recipe_id" IS DISTINCT FROM m."recipe_id"
         AND NOT EXISTS (SELECT 1 FROM "meal_recipes" o
                          WHERE o."meal_id" = mr."meal_id" AND o."recipe_id" <> mr."recipe_id")`);
    await tx.execute(sql`
      UPDATE "meal_recipes" mr SET "rating" = m."recipe_rating"
        FROM "meals" m
       WHERE mr."meal_id" = m."id" AND mr."recipe_id" = m."recipe_id"
         AND mr."rating" IS DISTINCT FROM m."recipe_rating"
         AND NOT EXISTS (SELECT 1 FROM "meal_recipes" o
                          WHERE o."meal_id" = mr."meal_id" AND o."recipe_id" <> mr."recipe_id")`);
    await tx.execute(sql`
      INSERT INTO "meal_recipes" ("meal_id", "recipe_id", "position", "rating")
      SELECT m."id", m."recipe_id", 0, m."recipe_rating" FROM "meals" m
       WHERE m."recipe_id" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "meal_recipes" mr WHERE mr."meal_id" = m."id")`);
  });
}

// ---------------------------------------------------------------------------
// Ledger 901 (plan SPEC §2.2-2.3): `meal_items` backfill and heal.
// ---------------------------------------------------------------------------

/** The containers linked to each "scope" meal (what the serve recorded, plus
 * the `meal_foods` links, which also cover serves before 0020), and each such
 * container's recipes in its own order (the 0021 rows, else its one recipe).
 * Shared text, so the backfill and the drift test read containers alike. */
const LINKED_CTES = `"linked" AS (
  SELECT msi."meal_id", msi."storage_item_id" AS "id"
    FROM "meal_storage_items" msi JOIN "scope" s ON s."id" = msi."meal_id"
  UNION
  SELECT mf."meal_id", mf."storage_item_id"
    FROM "meal_foods" mf JOIN "scope" s ON s."id" = mf."meal_id"
   WHERE mf."storage_item_id" IS NOT NULL
),
"container_recipes" AS (
  SELECT sir."storage_item_id" AS "id", sir."recipe_id", sir."position" AS "ord"
    FROM "storage_item_recipes" sir
   WHERE sir."storage_item_id" IN (SELECT "id" FROM "linked")
  UNION
  SELECT si."id", si."recipe_id", -1
    FROM "storage_items" si
   WHERE si."id" IN (SELECT "id" FROM "linked") AND si."recipe_id" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM "storage_item_recipes" x
                      WHERE x."storage_item_id" = si."id" AND x."recipe_id" = si."recipe_id")
)`;

const BACKFILL_HEAD = `-- meal_items backfill (plan SPEC §2.2): every meal with no items gets them,
-- exactly, from the legacy rows. One statement, so "scope" is read once.
-- db/migrate.ts runs this same text (MEAL_ITEMS_BACKFILL) in healMealItems.
WITH "scope" AS (
  SELECT m."id" FROM "meals" m
   WHERE NOT EXISTS (SELECT 1 FROM "meal_items" i WHERE i."meal_id" = m."id")`;

/** The backfill's passes as CTEs (closing "scope" first), shared by the
 * INSERT below and `backfillPassCounts`. */
const BACKFILL_CTES = `
),
${LINKED_CTES},
-- R input: each meal recipe and what it counted (the meal's foods among its
-- current ingredients).
"counted" AS (
  SELECT mr."meal_id", mr."recipe_id", mr."position", mr."rating",
         coalesce(array_agg(mf."food_id" ORDER BY mf."food_id") FILTER (WHERE mf."food_id" IS NOT NULL), '{}') AS "food_ids"
    FROM "meal_recipes" mr
    JOIN "scope" s ON s."id" = mr."meal_id"
    LEFT JOIN "recipe_ingredients" ri ON ri."recipe_id" = mr."recipe_id"
    LEFT JOIN "meal_foods" mf ON mf."meal_id" = mr."meal_id" AND mf."food_id" = ri."food_id"
   GROUP BY mr."meal_id", mr."recipe_id", mr."position", mr."rating"
),
-- R: one row per meal recipe, in meal_recipes order. Its container is the
-- linked one holding the recipe that one of its counted foods links to (the
-- part the serve linked first), lowest id among those, else the lowest-id
-- candidate, else none.
"r_rows" AS (
  SELECT c."meal_id", c."recipe_id", c."food_ids", c."rating",
         row_number() OVER (PARTITION BY c."meal_id" ORDER BY c."position", c."recipe_id") - 1 AS "pos",
         (SELECT l."id" FROM "linked" l
            JOIN "container_recipes" cr ON cr."id" = l."id" AND cr."recipe_id" = c."recipe_id"
           WHERE l."meal_id" = c."meal_id"
           ORDER BY EXISTS (SELECT 1 FROM "meal_foods" lf
                             WHERE lf."meal_id" = c."meal_id" AND lf."storage_item_id" = l."id"
                               AND lf."food_id" = ANY (c."food_ids")) DESC, l."id"
           LIMIT 1) AS "storage_item_id"
    FROM "counted" c
),
-- F: a meal food that is rated, or counted by no recipe, or held by the
-- container it links to. By (name, id), today's display order.
"f_rows" AS (
  SELECT mf."meal_id", mf."food_id", mf."storage_item_id", mf."rating",
         row_number() OVER (PARTITION BY mf."meal_id" ORDER BY f."name", f."id") - 1 AS "ord"
    FROM "meal_foods" mf
    JOIN "scope" s ON s."id" = mf."meal_id"
    JOIN "foods" f ON f."id" = mf."food_id"
   WHERE mf."rating" IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM "counted" c WHERE c."meal_id" = mf."meal_id" AND mf."food_id" = ANY (c."food_ids"))
      OR EXISTS (SELECT 1 FROM "storage_item_foods" sif
                  WHERE sif."storage_item_id" = mf."storage_item_id" AND sif."food_id" = mf."food_id")
),
"counts" AS (
  SELECT s."id" AS "meal_id",
         (SELECT count(*) FROM "counted" c WHERE c."meal_id" = s."id") AS "r",
         (SELECT count(*) FROM "f_rows" f WHERE f."meal_id" = s."id") AS "f"
    FROM "scope" s
),
"grouped" AS (
  SELECT "meal_id", "storage_item_id" FROM "r_rows" WHERE "storage_item_id" IS NOT NULL
  UNION
  SELECT "meal_id", "storage_item_id" FROM "f_rows" WHERE "storage_item_id" IS NOT NULL
),
-- C: a linked container R and F gave no row. A recipe container gets one
-- unrated row per recipe it shares with the meal (R's counted set), in its
-- own order; a food container one unrated row per held food the meal has.
-- Neither (edited in Storage since) leaves it an orphan, with no row.
"c_rows" AS (
  SELECT l."meal_id", l."id" AS "storage_item_id", cr."recipe_id", NULL::uuid AS "food_id", c."food_ids",
         row_number() OVER (PARTITION BY l."meal_id", l."id" ORDER BY cr."ord", cr."recipe_id") AS "k"
    FROM "linked" l
    JOIN "container_recipes" cr ON cr."id" = l."id"
    JOIN "counted" c ON c."meal_id" = l."meal_id" AND c."recipe_id" = cr."recipe_id"
   WHERE NOT EXISTS (SELECT 1 FROM "grouped" g WHERE g."meal_id" = l."meal_id" AND g."storage_item_id" = l."id")
  UNION ALL
  SELECT l."meal_id", l."id", NULL::uuid, mf."food_id", '{}'::uuid[],
         row_number() OVER (PARTITION BY l."meal_id", l."id" ORDER BY f."name", f."id")
    FROM "linked" l
    JOIN "storage_item_foods" sif ON sif."storage_item_id" = l."id"
    JOIN "meal_foods" mf ON mf."meal_id" = l."meal_id" AND mf."food_id" = sif."food_id"
    JOIN "foods" f ON f."id" = mf."food_id"
   WHERE NOT EXISTS (SELECT 1 FROM "container_recipes" cr WHERE cr."id" = l."id")
     AND NOT EXISTS (SELECT 1 FROM "grouped" g WHERE g."meal_id" = l."meal_id" AND g."storage_item_id" = l."id")
)`;

const BACKFILL_TAIL = `${BACKFILL_CTES}
INSERT INTO "meal_items" ("meal_id", "position", "food_id", "recipe_id", "storage_item_id", "counted_food_ids", "rating", "inferred")
SELECT "meal_id", "pos", NULL, "recipe_id", "storage_item_id", "food_ids", "rating", true FROM "r_rows"
UNION ALL
SELECT f."meal_id", n."r" + f."ord", f."food_id", NULL, f."storage_item_id", '{}', f."rating", true
  FROM "f_rows" f JOIN "counts" n ON n."meal_id" = f."meal_id"
UNION ALL
SELECT c."meal_id", n."r" + n."f" + row_number() OVER (PARTITION BY c."meal_id" ORDER BY c."storage_item_id", c."k") - 1,
       c."food_id", c."recipe_id", c."storage_item_id", c."food_ids", NULL, true
  FROM "c_rows" c JOIN "counts" n ON n."meal_id" = c."meal_id";`;

/** The backfill statement migration 0024 ends with, verbatim (a test pins
 * the file to this text). Every row it writes is `inferred`. */
export const MEAL_ITEMS_BACKFILL = BACKFILL_HEAD + BACKFILL_TAIL;

/**
 * How many rows the §2.2 backfill makes for EVERY meal, by pass (the plate
 * dry run's "rows made by R, F and C", SPEC §8.1). It reads no `meal_items`,
 * so it answers before 0024 and after it alike; on a database where the
 * migration made every item, r + f + c is the item count.
 */
export async function backfillPassCounts(db: Queryable): Promise<{ r: number; f: number; c: number }> {
  const result = await db.execute(
    sql.raw(`WITH "scope" AS (
  SELECT m."id" FROM "meals" m${BACKFILL_CTES}
SELECT (SELECT count(*) FROM "r_rows")::int AS "r", (SELECT count(*) FROM "f_rows")::int AS "f",
       (SELECT count(*) FROM "c_rows")::int AS "c"`),
  );
  return (result as unknown as { rows: { r: number; f: number; c: number }[] }).rows[0]!;
}

/** `AND <meal id> IN (...)` for a per-meal heal, nothing for the boot heal. */
const inScope = (mealIds: readonly string[] | undefined, prefix: string) =>
  mealIds ? sql`${sql.raw(prefix)} ${inArray(sql`m."id"`, [...mealIds])}` : sql``;

/** The §2.2 backfill over the meals with no items (only `mealIds`, if given). */
const backfillSql = (mealIds?: readonly string[]) =>
  sql`${sql.raw(BACKFILL_HEAD)}${inScope(mealIds, " AND")}${sql.raw(BACKFILL_TAIL)}`;

/**
 * Drifted meals (SPEC §2.3 step 1), one `meal_id` per row, possibly repeated:
 * no items; `meal_foods` ≠ the items' exposure union; `meal_recipes` ≠ the
 * items' distinct recipes, as a set or in order of first appearance; a rated
 * `meal_foods` row with no food row; or a linked container with no group that
 * pass C WOULD give rows (an orphan is not drift, or it would be rebuilt with
 * new ids on every boot and every edit).
 */
const driftSql = (mealIds?: readonly string[]) => sql`
WITH "scope" AS (SELECT m."id" FROM "meals" m${inScope(mealIds, " WHERE")}),
${sql.raw(LINKED_CTES)},
"exposure" AS (
  SELECT i."meal_id", i."food_id" FROM "meal_items" i JOIN "scope" s ON s."id" = i."meal_id" WHERE i."food_id" IS NOT NULL
  UNION
  SELECT i."meal_id", unnest(i."counted_food_ids") FROM "meal_items" i JOIN "scope" s ON s."id" = i."meal_id"
),
"eaten" AS (SELECT mf."meal_id", mf."food_id" FROM "meal_foods" mf JOIN "scope" s ON s."id" = mf."meal_id"),
"item_order" AS (
  SELECT i."meal_id", i."recipe_id",
         row_number() OVER (PARTITION BY i."meal_id" ORDER BY min(i."position"), i."recipe_id") AS "k"
    FROM "meal_items" i JOIN "scope" s ON s."id" = i."meal_id"
   WHERE i."recipe_id" IS NOT NULL
   GROUP BY i."meal_id", i."recipe_id"
),
"legacy_order" AS (
  SELECT mr."meal_id", mr."recipe_id",
         row_number() OVER (PARTITION BY mr."meal_id" ORDER BY mr."position", mr."recipe_id") AS "k"
    FROM "meal_recipes" mr JOIN "scope" s ON s."id" = mr."meal_id"
)
SELECT s."id" AS "meal_id" FROM "scope" s
 WHERE NOT EXISTS (SELECT 1 FROM "meal_items" i WHERE i."meal_id" = s."id")
UNION SELECT "meal_id" FROM (SELECT * FROM "eaten" EXCEPT SELECT * FROM "exposure") d
UNION SELECT "meal_id" FROM (SELECT * FROM "exposure" EXCEPT SELECT * FROM "eaten") d
UNION SELECT "meal_id" FROM (SELECT * FROM "legacy_order" EXCEPT SELECT * FROM "item_order") d
UNION SELECT "meal_id" FROM (SELECT * FROM "item_order" EXCEPT SELECT * FROM "legacy_order") d
UNION SELECT mf."meal_id" FROM "meal_foods" mf JOIN "scope" s ON s."id" = mf."meal_id"
 WHERE mf."rating" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "meal_items" i WHERE i."meal_id" = mf."meal_id" AND i."food_id" = mf."food_id")
UNION SELECT l."meal_id" FROM "linked" l
 WHERE NOT EXISTS (SELECT 1 FROM "meal_items" i WHERE i."meal_id" = l."meal_id" AND i."storage_item_id" = l."id")
   AND (EXISTS (SELECT 1 FROM "container_recipes" cr JOIN "meal_recipes" mr ON mr."recipe_id" = cr."recipe_id"
                 WHERE cr."id" = l."id" AND mr."meal_id" = l."meal_id")
        OR (NOT EXISTS (SELECT 1 FROM "container_recipes" cr WHERE cr."id" = l."id")
            AND EXISTS (SELECT 1 FROM "storage_item_foods" sif JOIN "meal_foods" mf ON mf."food_id" = sif."food_id"
                         WHERE sif."storage_item_id" = l."id" AND mf."meal_id" = l."meal_id")))`;

/**
 * SPEC §2.3 step 3, for one legacy table: where a legacy rating IS DISTINCT
 * FROM its mirror (the first RATED item row of that food or recipe, by
 * position), the FIRST row of it takes the legacy rating, or, when the legacy
 * rating is NULL, every row of it is cleared. One point per legacy rating, so
 * an old client's star tap on a meal with two rows of one food (pass C) never
 * counts twice; other rows keep what the new client gave them.
 */
const ratingFixSql = (mealIds: readonly string[] | undefined, legacy: "meal_foods" | "meal_recipes") => {
  const table = sql.raw(`"${legacy}"`);
  const ref = sql.raw(legacy === "meal_foods" ? `"food_id"` : `"recipe_id"`);
  return sql`
WITH "scope" AS (SELECT m."id" FROM "meals" m${inScope(mealIds, " WHERE")}),
"mirror" AS (
  SELECT DISTINCT ON (i."meal_id", i.${ref}) i."meal_id", i.${ref} AS "ref", i."rating"
    FROM "meal_items" i JOIN "scope" s ON s."id" = i."meal_id"
   WHERE i.${ref} IS NOT NULL AND i."rating" IS NOT NULL
   ORDER BY i."meal_id", i.${ref}, i."position", i."id"
),
"off" AS (
  SELECT l."meal_id", l.${ref} AS "ref", l."rating"
    FROM ${table} l JOIN "scope" s ON s."id" = l."meal_id"
    LEFT JOIN "mirror" mi ON mi."meal_id" = l."meal_id" AND mi."ref" = l.${ref}
   WHERE l."rating" IS DISTINCT FROM mi."rating"
)
UPDATE "meal_items" i SET "rating" = o."rating" FROM "off" o
 WHERE i."meal_id" = o."meal_id" AND i.${ref} = o."ref"
   AND (o."rating" IS NULL OR i."id" = (SELECT j."id" FROM "meal_items" j
                                         WHERE j."meal_id" = o."meal_id" AND j.${ref} = o."ref"
                                         ORDER BY j."position", j."id" LIMIT 1))`;
};

/** Drifted meal ids (SPEC §2.3 step 1), for the dry run and the tests. */
export async function findDriftedMeals(db: Queryable, mealIds?: readonly string[]): Promise<string[]> {
  const result = await db.execute(sql`SELECT DISTINCT "meal_id" FROM (${driftSql(mealIds)}) d ORDER BY "meal_id"`);
  return (result as unknown as { rows: { meal_id: string }[] }).rows.map((row) => row.meal_id);
}

/**
 * Ledger 901 (SPEC §2.3): keeps `meal_items` exact against the legacy rows
 * that every older writer (a rolled-back image, an old bundle's legacy
 * request, a test's `insertMeals`, a seed) still writes alone. With no ids it
 * is the boot heal over every meal (run after `healMealRecipes`, in one
 * transaction); with ids, the per-meal heal a write runs in its own
 * transaction. Drifted meals lose their items and get the §2.2 backfill
 * again (new row ids); the rest only get their rating mirror restored. In
 * steady state it changes nothing. A failure fails the boot, like a failed
 * migration.
 */
// ponytail: set comparisons over every meal on every boot, fine at hundreds
// to thousands of meals; delete with the plate cleanup migration (SPEC §2.7).
export async function healMealItems(tx: Transaction, mealIds?: readonly string[]): Promise<void> {
  await tx.execute(sql`DELETE FROM "meal_items" WHERE "meal_id" IN (${driftSql(mealIds)})`);
  await tx.execute(backfillSql(mealIds));
  await tx.execute(ratingFixSql(mealIds, "meal_foods"));
  await tx.execute(ratingFixSql(mealIds, "meal_recipes"));
}

/** Every boot-time heal, in order, each in its own transaction. */
async function healAll(db: Database): Promise<void> {
  await healMealRecipes(db);
  await db.transaction((tx) => healMealItems(tx));
}

/**
 * Applies generated SQL migrations for whichever driver is active, mirroring
 * the dual-driver split in createDb(): DATABASE_URL set -> node-postgres
 * against real Postgres, otherwise -> PGlite persisted at server/.data/pglite.
 * Then the boot heals, for both drivers.
 */
export async function migrateDatabase(databaseUrl: string | undefined): Promise<void> {
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const db = drizzleNodePg(pool, { schema });
      await migrateNodePg(db, { migrationsFolder });
      await healAll(db);
    } finally {
      await pool.end();
    }
    return;
  }

  const dataDir = path.resolve(__dirname, "../../.data/pglite");
  // PGlite's nodefs backend does a plain (non-recursive) mkdir, which fails
  // on a fresh checkout where server/.data doesn't exist yet.
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  try {
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder });
    await healAll(db);
  } finally {
    await client.close();
  }
}

const isMainModule =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  migrateDatabase(process.env.DATABASE_URL)
    .then(() => {
      console.log("Migrations applied.");
    })
    .catch((err: unknown) => {
      console.error("Migration failed:", err);
      process.exitCode = 1;
    });
}
