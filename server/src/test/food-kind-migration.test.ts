// Migration 0022 (ledger 838): `foods.kind` and
// `food_allergens.counts_toward_progress`.
//
// Steps a database stopped at 0021 — holding a catalog food, a parent's
// custom food with an allergen tag, and a meal of both — forward one
// migration. Both columns are additive with a constant default, so the claim
// on trial is "no row touched, every food is 'food', every tag still counts",
// plus the CHECK refusing a kind that does not exist.
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
