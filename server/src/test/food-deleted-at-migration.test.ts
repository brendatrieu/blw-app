// Migration 0018 (ledger 536): `foods.deleted_at`.
//
// The rest of the suite only ever sees a database migrated all the way to
// head. This file steps a database stopped at 0017 — already holding a
// parent's custom food with meals, a container and a recipe built on it —
// forward one migration, and checks that nothing was lost and nothing reads
// as deleted. The column is additive and nullable, so the claim on trial is
// simply "no row touched".
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

const INDEX_0017 = 17;
const INDEX_0018 = 18;

const CUSTOM = "22222222-2222-4222-8222-222222222222";

/** Every row that names a food, in a stable order, as plain text. */
async function snapshot(client: PGlite) {
  const rows = async (sql: string) => (await client.query<Record<string, unknown>>(sql)).rows;
  return {
    foods: await rows(`SELECT "id", "slug", "name", "owner_id", "emoji" FROM "foods" ORDER BY "slug"`),
    allergens: await rows(`SELECT "food_id", "allergen_id" FROM "food_allergens" ORDER BY "food_id"`),
    meals: await rows(`SELECT "meal_id", "food_id" FROM "meal_foods" ORDER BY "meal_id", "food_id"`),
    storage: await rows(`SELECT "storage_item_id", "food_id", "position" FROM "storage_item_foods" ORDER BY "position"`),
    recipes: await rows(`SELECT "recipe_id", "food_id", "quantity_note" FROM "recipe_ingredients" ORDER BY "food_id"`),
  };
}

describe("migration 0018 — foods.deleted_at", () => {
  it("adds the column to a database with custom foods in use, touching no row", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0017);

      await client.exec(`
        INSERT INTO "user" ("id", "name", "email") VALUES ('u1', 'Parent', 'parent@example.com');

        INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
        VALUES ('produce_cooked_soft', 72, 90, 2, 'Steamed veg.');

        INSERT INTO "allergens" ("id", "slug", "name", "intro_guidance")
        VALUES ('44444444-4444-4444-8444-444444444444', 'peanut', 'Peanut', 'Thinned only.');

        INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                             "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category",
                             "owner_id", "emoji")
        VALUES
          ('11111111-1111-4111-8111-111111111111', 'banana', 'Banana', 'fruit', 'low', 'moderate', 'low', 6,
           'strip', 'chop', 'slice', 'produce_cooked_soft', NULL, NULL),
          ('${CUSTOM}', 'satay-sauce-k3f9q1', 'Satay sauce', 'protein', 'low', 'low', 'low', 6,
           '', '', '', 'produce_cooked_soft', 'u1', '🥜');

        INSERT INTO "food_allergens" ("food_id", "allergen_id")
        VALUES ('${CUSTOM}', '44444444-4444-4444-8444-444444444444');

        INSERT INTO "babies" ("id", "user_id", "name", "birth_date")
        VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'u1', 'Robin', '2025-01-15');

        INSERT INTO "meals" ("id", "baby_id", "served_at")
        VALUES ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', now());
        INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES
          ('cccccccc-0000-4000-8000-000000000001', '${CUSTOM}'),
          ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111');

        INSERT INTO "storage_items" ("id", "user_id", "prepared_at", "location")
        VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'u1', now(), 'fridge');
        INSERT INTO "storage_item_foods" ("storage_item_id", "food_id", "position") VALUES
          ('aaaaaaaa-0000-4000-8000-000000000001', '${CUSTOM}', 0),
          ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 1);

        INSERT INTO "recipes" ("id", "slug", "title", "min_age_months", "prep_minutes", "owner_id")
        VALUES ('33333333-3333-4333-8333-333333333333', 'satay-noodles-a1b2c3', 'Satay noodles', 9, 0, 'u1');
        INSERT INTO "recipe_ingredients" ("recipe_id", "food_id", "quantity_note")
        VALUES ('33333333-3333-4333-8333-333333333333', '${CUSTOM}', '1 tbsp');
      `);

      const before = await snapshot(client);
      expect(before.foods).toHaveLength(2);

      await applyMigrations(client, INDEX_0018, INDEX_0018);

      // Every row that was there is there, unchanged.
      expect(await snapshot(client)).toEqual(before);

      // And no food reads as deleted.
      const deleted = await client.query<{ count: number }>(
        `SELECT count(*)::int AS "count" FROM "foods" WHERE "deleted_at" IS NOT NULL`,
      );
      expect(deleted.rows[0]?.count).toBe(0);

      const columns = await client.query<{ is_nullable: string; column_default: string | null; data_type: string }>(
        `SELECT "is_nullable", "column_default", "data_type" FROM "information_schema"."columns"
         WHERE "table_name" = 'foods' AND "column_name" = 'deleted_at'`,
      );
      expect(columns.rows).toEqual([
        { is_nullable: "YES", column_default: null, data_type: "timestamp with time zone" },
      ]);
    } finally {
      await client.close();
    }
  });
});
