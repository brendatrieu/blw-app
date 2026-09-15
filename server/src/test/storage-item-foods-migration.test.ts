// Migration 0015 (item 345): `storage_items.food_id` -> `storage_item_foods`.
//
// The rest of the suite only ever sees a database migrated all the way to
// head, where the backfill runs against an empty table and proves nothing.
// This file is the one place the MOVE itself is exercised: a database stopped
// at 0014, filled with one of each kind of row a real account has, then
// stepped forward one migration.
//
// Two things are on trial. Every food-sourced container must come out the far
// side still naming its food — the generated SQL dropped the column before
// the copy, which would have emptied every container in production — and
// `meal_foods.storage_item_id` must be exactly as it was, because that column
// is how a logged meal remembers which container it came out of. The
// migration never writes to `meal_foods` at all; this pins that.
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
  for (const entry of journal.entries.filter((e) => e.idx >= firstIdx && e.idx <= lastIdx).sort((a, b) => a.idx - b.idx)) {
    const sql = await fs.readFile(path.join(migrationsFolder, `${entry.tag}.sql`), "utf8");
    // drizzle's own runner splits on this marker and runs the statements in
    // order; PGlite's `exec` runs a script the same way.
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim().length > 0) await client.exec(statement);
    }
  }
}

const INDEX_0014 = 14;
const INDEX_0015 = 15;

/** Does `storage_items` still have the dropped column? */
async function hasFoodIdColumn(client: PGlite): Promise<boolean> {
  const result = await client.query<{ column_name: string }>(
    `SELECT "column_name" FROM "information_schema"."columns"
     WHERE "table_name" = 'storage_items' AND "column_name" = 'food_id'`,
  );
  return result.rows.length > 0;
}

describe("migration 0015 — storage_items.food_id -> storage_item_foods", () => {
  it("moves every food-sourced container's food into the join table, leaving meal provenance untouched", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0014);

      // An account with the four kinds of storage row that exist in the wild,
      // and a meal logged by serving one of them.
      await client.exec(`
        INSERT INTO "user" ("id", "name", "email") VALUES ('u1', 'Parent', 'parent@example.com');

        INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
        VALUES ('produce_cooked_soft', 72, 90, 2, 'Steamed veg.');

        INSERT INTO "foods" ("id", "slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
                             "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category")
        VALUES
          ('11111111-1111-4111-8111-111111111111', 'banana', 'Banana', 'fruit', 'low', 'moderate', 'low', 6,
           'strip', 'chop', 'slice', 'produce_cooked_soft'),
          ('22222222-2222-4222-8222-222222222222', 'chicken', 'Chicken', 'protein', 'high', 'low', 'moderate', 6,
           'shred', 'chop', 'dice', 'produce_cooked_soft');

        INSERT INTO "recipes" ("id", "slug", "title", "min_age_months", "prep_minutes")
        VALUES ('33333333-3333-4333-8333-333333333333', 'chicken-puree', 'Chicken Puree', 6, 10);

        INSERT INTO "storage_items" ("id", "user_id", "food_id", "recipe_id", "label", "prepared_at", "location")
        VALUES
          ('aaaaaaaa-0000-4000-8000-000000000001', 'u1', '11111111-1111-4111-8111-111111111111', NULL, NULL,
           now(), 'fridge'),
          ('aaaaaaaa-0000-4000-8000-000000000002', 'u1', '22222222-2222-4222-8222-222222222222', NULL, 'Tuesday batch',
           now(), 'freezer'),
          ('aaaaaaaa-0000-4000-8000-000000000003', 'u1', NULL, '33333333-3333-4333-8333-333333333333', 'From Sunday',
           now(), 'fridge'),
          ('aaaaaaaa-0000-4000-8000-000000000004', 'u1', NULL, NULL, 'Leftover soup', now(), 'counter');

        INSERT INTO "babies" ("id", "user_id", "name", "birth_date")
        VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'u1', 'Robin', '2025-01-15');

        INSERT INTO "meals" ("id", "baby_id", "served_at")
        VALUES ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', now());

        -- Provenance: this food was eaten out of the first container.
        INSERT INTO "meal_foods" ("meal_id", "food_id", "storage_item_id")
        VALUES ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
                'aaaaaaaa-0000-4000-8000-000000000001');
      `);

      expect(await hasFoodIdColumn(client)).toBe(true);

      await applyMigrations(client, INDEX_0015, INDEX_0015);

      // One join row per former food_id, at position 0, and none for the
      // recipe-sourced or label-only containers.
      const joined = await client.query<{ storage_item_id: string; food_id: string; position: number }>(
        `SELECT "storage_item_id", "food_id", "position" FROM "storage_item_foods" ORDER BY "storage_item_id"`,
      );
      expect(joined.rows).toEqual([
        {
          storage_item_id: "aaaaaaaa-0000-4000-8000-000000000001",
          food_id: "11111111-1111-4111-8111-111111111111",
          position: 0,
        },
        {
          storage_item_id: "aaaaaaaa-0000-4000-8000-000000000002",
          food_id: "22222222-2222-4222-8222-222222222222",
          position: 0,
        },
      ]);

      // Every container is still there — this moves data, it never drops a row.
      const items = await client.query<{ id: string; label: string | null; recipe_id: string | null }>(
        `SELECT "id", "label", "recipe_id" FROM "storage_items" ORDER BY "id"`,
      );
      expect(items.rows).toHaveLength(4);
      expect(items.rows[2]).toMatchObject({ label: "From Sunday", recipe_id: "33333333-3333-4333-8333-333333333333" });
      expect(items.rows[3]).toMatchObject({ label: "Leftover soup", recipe_id: null });

      // Provenance is byte-for-byte what it was: the meal still points at the
      // container it was served from.
      const provenance = await client.query<{ food_id: string; storage_item_id: string | null }>(
        `SELECT "food_id", "storage_item_id" FROM "meal_foods"`,
      );
      expect(provenance.rows).toEqual([
        {
          food_id: "11111111-1111-4111-8111-111111111111",
          storage_item_id: "aaaaaaaa-0000-4000-8000-000000000001",
        },
      ]);

      // And the old column is gone, so nothing can quietly keep reading it.
      expect(await hasFoodIdColumn(client)).toBe(false);
    } finally {
      await client.close();
    }
  });

  it("applies to a fresh database, which lands with the join table and no food_id column", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0015);

      expect(await hasFoodIdColumn(client)).toBe(false);

      const columns = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT "column_name", "is_nullable" FROM "information_schema"."columns"
         WHERE "table_name" = 'storage_item_foods' ORDER BY "column_name"`,
      );
      expect(columns.rows).toEqual([
        { column_name: "food_id", is_nullable: "NO" },
        { column_name: "position", is_nullable: "NO" },
        { column_name: "storage_item_id", is_nullable: "NO" },
      ]);

      // The cascade is what lets a container be deleted without leaving
      // orphans behind, and the `food_id` FK is what stops a food vanishing
      // out from under one. Both are asserted rather than assumed.
      const constraints = await client.query<{ constraint_name: string; delete_rule: string }>(
        `SELECT "rc"."constraint_name", "rc"."delete_rule"
         FROM "information_schema"."referential_constraints" "rc"
         JOIN "information_schema"."table_constraints" "tc"
           ON "tc"."constraint_name" = "rc"."constraint_name"
         WHERE "tc"."table_name" = 'storage_item_foods'
         ORDER BY "rc"."constraint_name"`,
      );
      expect(constraints.rows).toEqual([
        { constraint_name: "storage_item_foods_food_id_foods_id_fk", delete_rule: "NO ACTION" },
        { constraint_name: "storage_item_foods_storage_item_id_storage_items_id_fk", delete_rule: "CASCADE" },
      ]);
    } finally {
      await client.close();
    }
  });
});
