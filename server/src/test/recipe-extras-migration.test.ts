// Migration 0011 (item 298): `recipes.extra_ingredients` text[] -> jsonb.
//
// The rest of the suite only ever sees a database migrated all the way to
// head, where the conversion runs against an empty table. This file is the
// one place that proves the CONVERSION itself: a database stopped at 0010,
// filled with the shape the seeded catalog actually has, then stepped forward
// one migration — every string has to come out the far side as a `name`, in
// order, with no quantity.
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

const INDEX_0010 = 10;
const INDEX_0011 = 11;

describe("migration 0011 — extra_ingredients text[] -> jsonb", () => {
  it("turns every stored string into a name with no quantity, keeping the order", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0010);

      // Written the way 0010's schema stores them: a text[] column.
      await client.exec(`
        INSERT INTO "recipes" ("slug", "title", "min_age_months", "prep_minutes", "extra_ingredients")
        VALUES
          ('beef-mash', 'Beef mash', 6, 10, ARRAY['pinch of cumin (optional)', 'olive oil']),
          ('plain-oats', 'Plain oats', 6, 5, ARRAY[]::text[]),
          ('no-extras', 'No extras', 6, 5, NULL);
      `);

      await applyMigrations(client, INDEX_0011, INDEX_0011);

      const after = await client.query<{ slug: string; extra_ingredients: unknown }>(
        `SELECT "slug", "extra_ingredients" FROM "recipes" ORDER BY "slug"`,
      );
      const bySlug = new Map(after.rows.map((row) => [row.slug, row.extra_ingredients]));

      expect(bySlug.get("beef-mash")).toEqual([
        // Deliberately NOT alphabetical: pins ORDER BY ordinality, not value.
        { name: "pinch of cumin (optional)", quantityNote: "" },
        { name: "olive oil", quantityNote: "" },
      ]);
      // An empty list stays an empty list, and "no extras at all" stays NULL —
      // the routes read that as [] exactly as they did before.
      expect(bySlug.get("plain-oats")).toEqual([]);
      expect(bySlug.get("no-extras")).toBeNull();

      // The column really is jsonb now, not text[] with JSON inside it.
      const type = await client.query<{ data_type: string }>(
        `SELECT "data_type" FROM "information_schema"."columns"
         WHERE "table_name" = 'recipes' AND "column_name" = 'extra_ingredients'`,
      );
      expect(type.rows[0]?.data_type).toBe("jsonb");
    } finally {
      await client.close();
    }
  });
});
