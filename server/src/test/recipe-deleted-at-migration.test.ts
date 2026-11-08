// Migration 0026 (ledger 957): `recipes.deleted_at`.
//
// Steps a database stopped at 0025 — a parent's custom recipe logged (on a
// meal's plate and as its second recipe), stored, planned and favorited —
// forward one migration. The column is additive and nullable, so the claim on
// trial is "no row touched, no recipe reads as deleted".
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/** Applies the migrations whose journal index falls in [firstIdx, lastIdx], in order. */
async function applyMigrations(client: PGlite, firstIdx: number, lastIdx: number): Promise<void> {
  const journal = JSON.parse(await fs.readFile(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.filter((e) => e.idx >= firstIdx && e.idx <= lastIdx).sort((a, b) => a.idx - b.idx)) {
    const sql = await fs.readFile(path.join(migrationsFolder, `${entry.tag}.sql`), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim().length > 0) await client.exec(statement);
    }
  }
}

const FOOD = "11111111-1111-4111-8111-111111111111";
const CATALOG = "55555555-5555-4555-8555-555555555555";
const MINE = "66666666-6666-4666-8666-666666666666";
const BABY = "bbbbbbbb-0000-4000-8000-000000000001";
const MEAL = "cccccccc-0000-4000-8000-000000000001";
const BOX = "dddddddd-0000-4000-8000-000000000001";
const PLANNED = "eeeeeeee-0000-4000-8000-000000000001";

/** Every table that names a recipe, whole, in a stable order. */
async function snapshot(client: PGlite) {
  const all = async (sql: string) => (await client.query<Record<string, unknown>>(sql)).rows;
  return {
    recipes: await all(`SELECT "id", "slug", "title", "min_age_months", "prep_minutes", "owner_id", "notes" FROM "recipes" ORDER BY "id"`),
    ingredients: await all(`SELECT * FROM "recipe_ingredients" ORDER BY "id"`),
    variants: await all(`SELECT * FROM "recipe_variants" ORDER BY "id"`),
    meals: await all(`SELECT * FROM "meals" ORDER BY "id"`),
    mealRecipes: await all(`SELECT * FROM "meal_recipes" ORDER BY "meal_id", "position"`),
    mealItems: await all(`SELECT * FROM "meal_items" ORDER BY "id"`),
    storage: await all(`SELECT * FROM "storage_items" ORDER BY "id"`),
    storageRecipes: await all(`SELECT * FROM "storage_item_recipes" ORDER BY "position"`),
    planned: await all(`SELECT * FROM "planned_items" ORDER BY "position"`),
    favorites: await all(`SELECT "user_id", "recipe_id" FROM "favorites" ORDER BY "recipe_id"`),
  };
}

describe("migration 0026 — recipes.deleted_at", () => {
  it("adds the column to a database with a custom recipe in use, touching no row", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, 25);
      await client.exec(`
        INSERT INTO "user" ("id", "name", "email") VALUES ('u1', 'Parent', 'parent@example.com');
        INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
        VALUES ('produce_cooked', 48, 60, 2, 'Cooked.');
        INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                             "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category")
        VALUES ('${FOOD}', 'pear', 'Pear', 'fruit', 'low', 'low', 'low', 6, 's', 'c', 'c', 'produce_cooked');
        INSERT INTO "recipes" ("id", "slug", "title", "min_age_months", "prep_minutes", "owner_id", "notes") VALUES
          ('${CATALOG}', 'pear-mash', 'Pear Mash', 6, 5, NULL, NULL),
          ('${MINE}', 'pear-bake-a1b2c3', 'Pear bake', 9, 0, 'u1', 'Warm.');
        INSERT INTO "recipe_ingredients" ("recipe_id", "food_id", "quantity_note") VALUES
          ('${CATALOG}', '${FOOD}', '1'), ('${MINE}', '${FOOD}', '');
        INSERT INTO "recipe_variants" ("recipe_id", "age_stage", "texture_note", "instructions")
        VALUES ('${MINE}', '9', '', '["Bake it."]'::jsonb);
        INSERT INTO "babies" ("id", "user_id", "name", "birth_date") VALUES ('${BABY}', 'u1', 'Robin', '2025-01-15');
        INSERT INTO "meals" ("id", "baby_id", "served_at", "recipe_id") VALUES ('${MEAL}', '${BABY}', now(), '${CATALOG}');
        INSERT INTO "meal_recipes" ("meal_id", "recipe_id", "position", "rating") VALUES
          ('${MEAL}', '${CATALOG}', 0, NULL), ('${MEAL}', '${MINE}', 1, 4);
        INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${MEAL}', '${FOOD}');
        INSERT INTO "meal_items" ("meal_id", "position", "recipe_id", "counted_food_ids") VALUES
          ('${MEAL}', 0, '${CATALOG}', ARRAY['${FOOD}']::uuid[]), ('${MEAL}', 1, '${MINE}', ARRAY['${FOOD}']::uuid[]);
        INSERT INTO "storage_items" ("id", "user_id", "prepared_at", "location", "recipe_id")
        VALUES ('${BOX}', 'u1', now(), 'fridge', '${CATALOG}');
        INSERT INTO "storage_item_recipes" ("storage_item_id", "recipe_id", "position") VALUES
          ('${BOX}', '${CATALOG}', 0), ('${BOX}', '${MINE}', 1);
        INSERT INTO "planned_days" ("baby_id", "date") VALUES ('${BABY}', '2026-11-02');
        INSERT INTO "planned_meals" ("id", "baby_id", "date", "name", "position") VALUES ('${PLANNED}', '${BABY}', '2026-11-02', 'Lunch', 0);
        INSERT INTO "planned_items" ("planned_meal_id", "position", "recipe_id") VALUES ('${PLANNED}', 0, '${MINE}');
        INSERT INTO "favorites" ("user_id", "recipe_id") VALUES ('u1', '${MINE}');
      `);

      const before = await snapshot(client);
      expect(before.recipes).toHaveLength(2);
      expect(before.mealRecipes).toHaveLength(2);
      expect(before.planned).toHaveLength(1);

      await applyMigrations(client, 26, 26);

      // Every row that was there is there, unchanged.
      expect(await snapshot(client)).toEqual(before);
      // And no recipe reads as deleted.
      expect((await client.query(`SELECT count(*)::int AS "n" FROM "recipes" WHERE "deleted_at" IS NOT NULL`)).rows).toEqual([{ n: 0 }]);
      const columns = await client.query(
        `SELECT "is_nullable", "column_default", "data_type" FROM "information_schema"."columns"
         WHERE "table_name" = 'recipes' AND "column_name" = 'deleted_at'`,
      );
      expect(columns.rows).toEqual([{ is_nullable: "YES", column_default: null, data_type: "timestamp with time zone" }]);
    } finally {
      await client.close();
    }
  });
});
