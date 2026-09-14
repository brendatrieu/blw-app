// Migration 0014 (item 329): `food_category` enum gains 'spice'.
//
// The rest of the suite only ever sees a database migrated all the way to head,
// where the new enum value has always existed. This file is the one place that
// proves the STEP: a database stopped at 0013 rejects a spice food, the same
// database stepped forward one migration accepts it, and the value survives on
// a database that already had catalog rows in it.
//
// `ALTER TYPE ... ADD VALUE` is the reason seeds run in a process of their own,
// after `db:migrate` rather than inside it: Postgres will not let a transaction
// USE an enum value the same transaction added. The "already seeded" case below
// is what that ordering has to hold up under.
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

const INDEX_0013 = 13;
const INDEX_0014 = 14;

/** A minimal storage guideline + food insert, since foods FK into the guideline. */
async function insertSpiceFood(client: PGlite, slug: string): Promise<void> {
  await client.exec(`
    INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
    VALUES ('pantry_dry', 2160, 365, 4320, 'Sealed jar, cool and dark.')
    ON CONFLICT ("category") DO NOTHING;
  `);
  await client.exec(`
    INSERT INTO "foods"
      ("slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
       "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category")
    VALUES
      ('${slug}', 'Cinnamon', 'spice', 'low', 'low', 'low', 6, 'A pinch.', 'A pinch.', 'A pinch.', 'pantry_dry');
  `);
}

describe("migration 0014 — food_category gains 'spice'", () => {
  it("is what makes a spice food insertable, on a database that was empty at 0013", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0013);
      await expect(insertSpiceFood(client, "cinnamon")).rejects.toThrow(/invalid input value for enum|spice/i);

      await applyMigrations(client, INDEX_0014, INDEX_0014);
      await insertSpiceFood(client, "cinnamon");

      const rows = await client.query<{ slug: string; category: string }>(
        `SELECT "slug", "category" FROM "foods" WHERE "category" = 'spice'`,
      );
      expect(rows.rows).toEqual([{ slug: "cinnamon", category: "spice" }]);
    } finally {
      await client.close();
    }
  });

  it("leaves the six pre-existing categories and their rows untouched", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0013);
      // A database that already carries catalog content at 0013.
      await client.exec(`
        INSERT INTO "storage_guidelines" ("category", "fridge_hours", "freezer_days", "room_temp_hours", "notes")
        VALUES ('produce_raw_cut', 24, NULL, 2, 'Best served fresh.');
      `);
      await client.exec(`
        INSERT INTO "foods"
          ("slug", "name", "category", "iron_level", "vitamin_c_level", "choking_risk",
           "min_age_months", "prep_6m", "prep_9m", "prep_12m", "storage_category")
        VALUES
          ('banana', 'Banana', 'fruit', 'low', 'low', 'moderate', 6, 'Spears.', 'Half-moons.', 'Rounds.', 'produce_raw_cut');
      `);

      await applyMigrations(client, INDEX_0014, INDEX_0014);

      const existing = await client.query<{ slug: string; category: string }>(
        `SELECT "slug", "category" FROM "foods" ORDER BY "slug"`,
      );
      expect(existing.rows).toEqual([{ slug: "banana", category: "fruit" }]);

      const labels = await client.query<{ enumlabel: string }>(
        `SELECT "enumlabel" FROM "pg_enum"
         JOIN "pg_type" ON "pg_type"."oid" = "pg_enum"."enumtypid"
         WHERE "pg_type"."typname" = 'food_category'
         ORDER BY "enumsortorder"`,
      );
      expect(labels.rows.map((r) => r.enumlabel)).toEqual([
        "protein",
        "veg",
        "fruit",
        "grain",
        "dairy",
        "legume",
        "spice",
      ]);
    } finally {
      await client.close();
    }
  });
});
