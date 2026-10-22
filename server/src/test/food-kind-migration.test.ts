// Migration 0022 (ledger 838): `foods.kind` and
// `food_allergens.counts_toward_progress`; migration 0023 (ledger 864):
// `food_allergens.counts_when_alone`.
//
// Steps a database stopped at 0021 — holding a catalog food, a parent's
// custom food with an allergen tag, and a meal of both — forward one
// migration. Both columns are additive with a constant default, so the claim
// on trial is "no row touched, every food is 'food', every tag still counts",
// plus the CHECK refusing a kind that does not exist. Then the same for 0023
// from a database at 0022 that also holds a non-counting tag and a recipe
// meal: no row touched, the new column false everywhere.
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

const INDEX_0021 = 21;
const INDEX_0022 = 22;
const INDEX_0023 = 23;

const CATALOG = "11111111-1111-4111-8111-111111111111";
const CUSTOM = "22222222-2222-4222-8222-222222222222";
const PEANUT = "44444444-4444-4444-8444-444444444444";

async function snapshot(client: PGlite) {
  const rows = async (sql: string) => (await client.query<Record<string, unknown>>(sql)).rows;
  return {
    foods: await rows(`SELECT "id", "slug", "name", "category", "owner_id" FROM "foods" ORDER BY "slug"`),
    allergens: await rows(`SELECT "food_id", "allergen_id" FROM "food_allergens" ORDER BY "food_id"`),
    meals: await rows(`SELECT "meal_id", "food_id" FROM "meal_foods" ORDER BY "meal_id", "food_id"`),
  };
}

describe("migration 0022 — foods.kind and food_allergens.counts_toward_progress", () => {
  it("adds both columns to a database in use, touching no row", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0021);

      await client.exec(`
        INSERT INTO "user" ("id", "name", "email") VALUES ('u1', 'Parent', 'parent@example.com');
        INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
        VALUES ('produce_cooked_soft', 72, 90, 2, 'Steamed veg.');
        INSERT INTO "allergens" ("id", "slug", "name", "intro_guidance")
        VALUES ('${PEANUT}', 'peanut', 'Peanut', 'Thinned only.');
        INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                             "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category", "owner_id")
        VALUES
          ('${CATALOG}', 'banana', 'Banana', 'fruit', 'low', 'moderate', 'low', 6,
           'strip', 'chop', 'slice', 'produce_cooked_soft', NULL),
          ('${CUSTOM}', 'satay-sauce-k3f9q1', 'Satay sauce', 'protein', 'low', 'low', 'low', 6,
           '', '', '', 'produce_cooked_soft', 'u1');
        INSERT INTO "food_allergens" ("food_id", "allergen_id") VALUES ('${CUSTOM}', '${PEANUT}');
        INSERT INTO "babies" ("id", "user_id", "name", "birth_date")
        VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'u1', 'Robin', '2025-01-15');
        INSERT INTO "meals" ("id", "baby_id", "served_at")
        VALUES ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', now());
        INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES
          ('cccccccc-0000-4000-8000-000000000001', '${CUSTOM}'),
          ('cccccccc-0000-4000-8000-000000000001', '${CATALOG}');
      `);

      const before = await snapshot(client);
      await applyMigrations(client, INDEX_0022, INDEX_0022);
      expect(await snapshot(client)).toEqual(before);

      const kinds = await client.query<{ kind: string }>(`SELECT DISTINCT "kind" FROM "foods"`);
      expect(kinds.rows).toEqual([{ kind: "food" }]);
      const counts = await client.query<{ counts_toward_progress: boolean }>(
        `SELECT "counts_toward_progress" FROM "food_allergens"`,
      );
      expect(counts.rows).toEqual([{ counts_toward_progress: true }]);

      // A new custom food (the API never names a kind) still lands as 'food'.
      await client.exec(`
        INSERT INTO "foods" ("slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                             "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category", "owner_id")
        VALUES ('toast-a1b2c3', 'Toast', 'grain', 'low', 'low', 'low', 6, '', '', '', 'produce_cooked_soft', 'u1');
      `);
      const fresh = await client.query<{ kind: string }>(`SELECT "kind" FROM "foods" WHERE "slug" = 'toast-a1b2c3'`);
      expect(fresh.rows).toEqual([{ kind: "food" }]);

      await expect(client.exec(`UPDATE "foods" SET "kind" = 'drink' WHERE "id" = '${CATALOG}'`)).rejects.toThrow(
        /foods_kind_valid/,
      );
    } finally {
      await client.close();
    }
  });
});

describe("migration 0023 — food_allergens.counts_when_alone", () => {
  const MILK = "33333333-3333-4333-8333-333333333333";
  const MILK_ALLERGEN = "55555555-5555-4555-8555-555555555555";
  const RECIPE = "66666666-6666-4666-8666-666666666666";
  const BABY = "bbbbbbbb-0000-4000-8000-000000000001";
  const MEAL_ALONE = "cccccccc-0000-4000-8000-000000000001";
  const MEAL_RECIPE = "cccccccc-0000-4000-8000-000000000002";

  async function rows(client: PGlite) {
    const all = async (sql: string) => (await client.query<Record<string, unknown>>(sql)).rows;
    return {
      foods: await all(`SELECT "id", "slug", "name", "kind", "owner_id" FROM "foods" ORDER BY "slug"`),
      tags: await all(
        `SELECT "food_id", "allergen_id", "counts_toward_progress" FROM "food_allergens" ORDER BY "food_id", "allergen_id"`,
      ),
      mealFoods: await all(`SELECT "meal_id", "food_id" FROM "meal_foods" ORDER BY "meal_id", "food_id"`),
      mealRecipes: await all(`SELECT "meal_id", "recipe_id", "position" FROM "meal_recipes" ORDER BY "meal_id"`),
      ingredients: await all(`SELECT "recipe_id", "food_id" FROM "recipe_ingredients" ORDER BY "food_id"`),
    };
  }

  it("adds the column to a database in use, touching no row, false everywhere", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0022);

      await client.exec(`
        INSERT INTO "user" ("id", "name", "email") VALUES ('u1', 'Parent', 'parent@example.com');
        INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
        VALUES ('dairy_soft', 48, NULL, 2, 'Dairy.');
        INSERT INTO "allergens" ("id", "slug", "name", "intro_guidance")
        VALUES ('${PEANUT}', 'peanut', 'Peanut', 'Thinned only.'), ('${MILK_ALLERGEN}', 'milk', 'Milk', 'Yogurt first.');
        INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                             "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category", "owner_id", "kind")
        VALUES
          ('${MILK}', 'milk', 'Whole Milk', 'dairy', 'low', 'low', 'low', 6, 'p', 'p', 'p', 'dairy_soft', NULL, 'info'),
          ('${CUSTOM}', 'satay-sauce-k3f9q1', 'Satay sauce', 'protein', 'low', 'low', 'low', 6,
           '', '', '', 'dairy_soft', 'u1', 'food');
        INSERT INTO "food_allergens" ("food_id", "allergen_id", "counts_toward_progress") VALUES
          ('${MILK}', '${MILK_ALLERGEN}', false),
          ('${CUSTOM}', '${PEANUT}', true);
        INSERT INTO "recipes" ("id", "slug", "title", "min_age_months", "prep_minutes", "iron_focus")
        VALUES ('${RECIPE}', 'egg-bake', 'Egg Bake', 6, 60, true);
        INSERT INTO "recipe_ingredients" ("recipe_id", "food_id", "quantity_note") VALUES ('${RECIPE}', '${MILK}', '1/4 cup');
        INSERT INTO "babies" ("id", "user_id", "name", "birth_date") VALUES ('${BABY}', 'u1', 'Robin', '2025-01-15');
        INSERT INTO "meals" ("id", "baby_id", "served_at") VALUES ('${MEAL_ALONE}', '${BABY}', now()), ('${MEAL_RECIPE}', '${BABY}', now());
        INSERT INTO "meal_recipes" ("meal_id", "recipe_id", "position") VALUES ('${MEAL_RECIPE}', '${RECIPE}', 0);
        INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES
          ('${MEAL_ALONE}', '${MILK}'),
          ('${MEAL_ALONE}', '${CUSTOM}'),
          ('${MEAL_RECIPE}', '${MILK}');
      `);

      const before = await rows(client);
      await applyMigrations(client, INDEX_0023, INDEX_0023);
      expect(await rows(client)).toEqual(before);

      const alone = await client.query<{ counts_when_alone: boolean }>(
        `SELECT DISTINCT "counts_when_alone" FROM "food_allergens"`,
      );
      expect(alone.rows).toEqual([{ counts_when_alone: false }]);

      // A tag written without the column (every API path) lands false.
      await client.exec(`INSERT INTO "food_allergens" ("food_id", "allergen_id") VALUES ('${CUSTOM}', '${MILK_ALLERGEN}')`);
      const fresh = await client.query<{ counts_when_alone: boolean }>(
        `SELECT "counts_when_alone" FROM "food_allergens" WHERE "food_id" = '${CUSTOM}' AND "allergen_id" = '${MILK_ALLERGEN}'`,
      );
      expect(fresh.rows).toEqual([{ counts_when_alone: false }]);
    } finally {
      await client.close();
    }
  });
});
