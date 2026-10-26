// Migration 0025 (ledger 903, plan SPEC §3.1): `babies.daily_meals` and the
// planning tables. Steps a database stopped at 0024 — a parent, two babies, a
// meal with its plate, a container — forward one migration. It is additive,
// so the claim on trial is "no row touched, daily_meals NULL (the shared
// defaults), the new tables empty", plus the constraints that keep a plan in
// the plate's shapes and the cascades that keep it from outliving its baby.
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
const RECIPE = "66666666-6666-4666-8666-666666666666";
const BABY = "bbbbbbbb-0000-4000-8000-000000000001";
const TWIN = "bbbbbbbb-0000-4000-8000-000000000002";
const MEAL = "cccccccc-0000-4000-8000-000000000001";
const BOX = "dddddddd-0000-4000-8000-000000000001";
const PLANNED = "eeeeeeee-0000-4000-8000-000000000001";

async function snapshot(client: PGlite) {
  const all = async (sql: string) => (await client.query<Record<string, unknown>>(sql)).rows;
  return {
    babies: await all(`SELECT "id", "user_id", "name", "birth_date", "notes", "archived_at", "created_at" FROM "babies" ORDER BY "id"`),
    meals: await all(`SELECT * FROM "meals" ORDER BY "id"`),
    mealFoods: await all(`SELECT * FROM "meal_foods" ORDER BY "id"`),
    mealItems: await all(`SELECT * FROM "meal_items" ORDER BY "id"`),
    storage: await all(`SELECT * FROM "storage_items" ORDER BY "id"`),
  };
}

describe("migration 0025 — planning", () => {
  it("adds daily meals and the plan tables to a database in use, touching no row", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, 24);
      await client.exec(`
        INSERT INTO "user" ("id", "name", "email") VALUES ('u1', 'Parent', 'parent@example.com');
        INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
        VALUES ('produce_cooked', 48, 60, 2, 'Cooked.');
        INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                             "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category")
        VALUES ('${FOOD}', 'pear', 'Pear', 'fruit', 'low', 'low', 'low', 6, 's', 'c', 'c', 'produce_cooked');
        INSERT INTO "recipes" ("id", "slug", "title", "min_age_months", "prep_minutes")
        VALUES ('${RECIPE}', 'pear-mash', 'Pear Mash', 6, 5);
        INSERT INTO "babies" ("id", "user_id", "name", "birth_date") VALUES
          ('${BABY}', 'u1', 'Robin', '2025-01-15'), ('${TWIN}', 'u1', 'Sam', '2025-01-15');
        INSERT INTO "meals" ("id", "baby_id", "served_at") VALUES ('${MEAL}', '${BABY}', now());
        INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${MEAL}', '${FOOD}');
        INSERT INTO "meal_items" ("meal_id", "position", "food_id") VALUES ('${MEAL}', 0, '${FOOD}');
        INSERT INTO "storage_items" ("id", "user_id", "prepared_at", "location") VALUES ('${BOX}', 'u1', now(), 'fridge');
      `);

      const before = await snapshot(client);
      await applyMigrations(client, 25, 25);
      expect(await snapshot(client)).toEqual(before);
      expect((await client.query(`SELECT DISTINCT "daily_meals" FROM "babies"`)).rows).toEqual([{ daily_meals: null }]);
      for (const table of ["planned_days", "planned_meals", "planned_items"]) {
        expect((await client.query(`SELECT count(*)::int AS "n" FROM "${table}"`)).rows).toEqual([{ n: 0 }]);
      }

      // A planned meal needs its day; a day is once per baby.
      await expect(
        client.exec(`INSERT INTO "planned_meals" ("baby_id", "date", "name", "position") VALUES ('${BABY}', '2026-11-02', 'Lunch', 0)`),
      ).rejects.toThrow(/planned_days/);
      await client.exec(`
        INSERT INTO "planned_days" ("baby_id", "date") VALUES ('${BABY}', '2026-11-02'), ('${TWIN}', '2026-11-02');
        INSERT INTO "planned_meals" ("id", "baby_id", "date", "name", "time", "position", "served_meal_id")
        VALUES ('${PLANNED}', '${BABY}', '2026-11-02', 'Lunch', '12:30', 0, '${MEAL}');
        INSERT INTO "planned_meals" ("baby_id", "date", "name", "position") VALUES ('${TWIN}', '2026-11-02', 'Lunch', 0);
        INSERT INTO "planned_items" ("planned_meal_id", "position", "food_id") VALUES ('${PLANNED}', 0, '${FOOD}');
        INSERT INTO "planned_items" ("planned_meal_id", "position", "recipe_id", "left_out_food_ids")
        VALUES ('${PLANNED}', 1, '${RECIPE}', ARRAY['${FOOD}']::uuid[]);
        INSERT INTO "planned_items" ("planned_meal_id", "position", "storage_item_id", "servings") VALUES ('${PLANNED}', 2, '${BOX}', 2);
      `);
      await expect(client.exec(`INSERT INTO "planned_days" ("baby_id", "date") VALUES ('${BABY}', '2026-11-02')`)).rejects.toThrow();
      expect((await client.query(`SELECT "time"::text AS "t" FROM "planned_meals" WHERE "id" = '${PLANNED}'`)).rows).toEqual([
        { t: "12:30:00" },
      ]);

      // The plate's shapes, held by CHECKs.
      const refused: [string, RegExp][] = [
        [`"position", "food_id", "recipe_id") VALUES ('${PLANNED}', 3, '${FOOD}', '${RECIPE}')`, /planned_items_one_ref/],
        [`"position") VALUES ('${PLANNED}', 3)`, /planned_items_one_ref/],
        [`"position", "storage_item_id") VALUES ('${PLANNED}', 3, '${BOX}')`, /planned_items_servings/],
        [`"position", "food_id", "servings") VALUES ('${PLANNED}', 3, '${FOOD}', 1)`, /planned_items_servings/],
        [`"position", "storage_item_id", "servings") VALUES ('${PLANNED}', 3, '${BOX}', 100)`, /planned_items_servings_range/],
        [`"position", "food_id", "left_out_food_ids") VALUES ('${PLANNED}', 3, '${FOOD}', ARRAY['${FOOD}']::uuid[])`, /planned_items_left_out/],
      ];
      for (const [values, constraint] of refused) {
        await expect(client.exec(`INSERT INTO "planned_items" ("planned_meal_id", ${values}`)).rejects.toThrow(constraint);
      }
      await expect(
        client.exec(`INSERT INTO "planned_meals" ("baby_id", "date", "name", "position") VALUES ('${BABY}', '2026-11-02', '', 1)`),
      ).rejects.toThrow(/planned_meals_name_length/);
      // One logged meal serves at most one planned meal.
      await expect(
        client.exec(`UPDATE "planned_meals" SET "served_meal_id" = '${MEAL}' WHERE "baby_id" = '${TWIN}'`),
      ).rejects.toThrow(/planned_meals_served_meal_idx/);

      // Deleting the meal un-serves the slot; deleting a recipe drops its
      // planned item; deleting a baby takes its whole plan, not the twin's.
      await client.exec(`DELETE FROM "meals" WHERE "id" = '${MEAL}'`);
      expect((await client.query(`SELECT "served_meal_id" FROM "planned_meals" WHERE "id" = '${PLANNED}'`)).rows).toEqual([
        { served_meal_id: null },
      ]);
      await client.exec(`DELETE FROM "recipes" WHERE "id" = '${RECIPE}'`);
      expect((await client.query(`SELECT count(*)::int AS "n" FROM "planned_items"`)).rows).toEqual([{ n: 2 }]);
      await client.exec(`DELETE FROM "babies" WHERE "id" = '${BABY}'`);
      const left = async (table: string) => (await client.query(`SELECT count(*)::int AS "n" FROM "${table}"`)).rows;
      expect(await left("planned_days")).toEqual([{ n: 1 }]);
      expect(await left("planned_meals")).toEqual([{ n: 1 }]);
      expect(await left("planned_items")).toEqual([{ n: 0 }]);
    } finally {
      await client.close();
    }
  });
});
