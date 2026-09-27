// Migration 0019 (ledger 571): `meal_foods.rating` + `meals.recipe_rating`.
//
// Steps a database stopped at 0018 — already holding a baby's loose-food
// meal and a recipe meal with notes and a reaction — forward one migration,
// and checks that nothing was lost, nothing reads as rated, and the CHECKs
// accept 1-5 and NULL but refuse 0 and 6 (there is no 0-star state).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

interface Journal {
  entries: { idx: number; tag: string }[];
}

/** Applies the migrations whose journal index falls in [firstIdx, lastIdx], in order. */
async function applyMigrations(client: PGlite, firstIdx: number, lastIdx: number): Promise<void> {
  const journal = JSON.parse(
    await fs.readFile(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as Journal;
  for (const entry of journal.entries
    .filter((e) => e.idx >= firstIdx && e.idx <= lastIdx)
    .sort((a, b) => a.idx - b.idx)) {
    const sql = await fs.readFile(path.join(migrationsFolder, `${entry.tag}.sql`), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim().length > 0) await client.exec(statement);
    }
  }
}

const INDEX_0018 = 18;
const INDEX_0019 = 19;

const BANANA = "11111111-1111-4111-8111-111111111111";
const LOOSE_MEAL = "cccccccc-0000-4000-8000-000000000001";
const RECIPE_MEAL = "cccccccc-0000-4000-8000-000000000002";

async function snapshot(client: PGlite) {
  const rows = async (sql: string) => (await client.query<Record<string, unknown>>(sql)).rows;
  return {
    meals: await rows(
      `SELECT "id", "baby_id", "recipe_id", "served_at", "reaction_note", "notes" FROM "meals" ORDER BY "id"`,
    ),
    mealFoods: await rows(
      `SELECT "id", "meal_id", "food_id", "storage_item_id" FROM "meal_foods" ORDER BY "meal_id", "food_id"`,
    ),
  };
}

describe("migration 0019 — meal ratings", () => {
  it("adds nullable 1-5 rating columns to a database with meals, touching no row", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0018);

      await client.exec(`
        INSERT INTO "user" ("id", "name", "email") VALUES ('u1', 'Parent', 'parent@example.com');
        INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
        VALUES ('produce_cooked_soft', 72, 90, 2, 'Steamed veg.');
        INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                             "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category")
        VALUES ('${BANANA}', 'banana', 'Banana', 'fruit', 'low', 'moderate', 'low', 6,
                'strip', 'chop', 'slice', 'produce_cooked_soft');
        INSERT INTO "babies" ("id", "user_id", "name", "birth_date")
        VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'u1', 'Robin', '2025-01-15');
        INSERT INTO "recipes" ("id", "slug", "title", "min_age_months", "prep_minutes", "owner_id")
        VALUES ('33333333-3333-4333-8333-333333333333', 'banana-mash-a1b2c3', 'Banana mash', 6, 0, 'u1');

        INSERT INTO "meals" ("id", "baby_id", "recipe_id", "served_at", "reaction_note", "notes") VALUES
          ('${LOOSE_MEAL}', 'bbbbbbbb-0000-4000-8000-000000000001', NULL, now(), 'rash', 'ate it all'),
          ('${RECIPE_MEAL}', 'bbbbbbbb-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
           now(), NULL, NULL);
        INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES
          ('${LOOSE_MEAL}', '${BANANA}'), ('${RECIPE_MEAL}', '${BANANA}');
      `);

      const before = await snapshot(client);
      expect(before.meals).toHaveLength(2);

      await applyMigrations(client, INDEX_0019, INDEX_0019);

      expect(await snapshot(client)).toEqual(before);

      const rated = await client.query<{ foods: number; recipes: number }>(
        `SELECT (SELECT count(*)::int FROM "meal_foods" WHERE "rating" IS NOT NULL) AS "foods",
                (SELECT count(*)::int FROM "meals" WHERE "recipe_rating" IS NOT NULL) AS "recipes"`,
      );
      expect(rated.rows[0]).toEqual({ foods: 0, recipes: 0 });

      const columns = await client.query<Record<string, unknown>>(
        `SELECT "table_name", "column_name", "is_nullable", "column_default", "data_type"
         FROM "information_schema"."columns"
         WHERE ("table_name", "column_name") IN (('meal_foods', 'rating'), ('meals', 'recipe_rating'))
         ORDER BY "table_name"`,
      );
      expect(columns.rows).toEqual([
        { table_name: "meal_foods", column_name: "rating", is_nullable: "YES", column_default: null, data_type: "smallint" },
        { table_name: "meals", column_name: "recipe_rating", is_nullable: "YES", column_default: null, data_type: "smallint" },
      ]);

      // 1 and 5 are the ends of the scale; NULL clears; 0 and 6 are refused.
      for (const value of [1, 5, null]) {
        await client.query(`UPDATE "meal_foods" SET "rating" = $1 WHERE "meal_id" = '${LOOSE_MEAL}'`, [value]);
        await client.query(`UPDATE "meals" SET "recipe_rating" = $1 WHERE "id" = '${RECIPE_MEAL}'`, [value]);
      }
      for (const value of [0, 6]) {
        await expect(
          client.query(`UPDATE "meal_foods" SET "rating" = $1 WHERE "meal_id" = '${LOOSE_MEAL}'`, [value]),
        ).rejects.toThrow(/meal_foods_rating_range/);
        await expect(
          client.query(`UPDATE "meals" SET "recipe_rating" = $1 WHERE "id" = '${RECIPE_MEAL}'`, [value]),
        ).rejects.toThrow(/meals_recipe_rating_range/);
      }
    } finally {
      await client.close();
    }
  });
});
