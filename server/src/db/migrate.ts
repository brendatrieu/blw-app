import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
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

/**
 * Applies generated SQL migrations for whichever driver is active, mirroring
 * the dual-driver split in createDb(): DATABASE_URL set -> node-postgres
 * against real Postgres, otherwise -> PGlite persisted at server/.data/pglite.
 * Then the legacy-mirror heal, for both drivers.
 */
export async function migrateDatabase(databaseUrl: string | undefined): Promise<void> {
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const db = drizzleNodePg(pool, { schema });
      await migrateNodePg(db, { migrationsFolder });
      await healMealRecipes(db);
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
    await healMealRecipes(db);
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
