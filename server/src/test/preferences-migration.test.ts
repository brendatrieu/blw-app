// Migration 0012 (item 302): the `user_preferences` table.
//
// The rest of the suite only ever sees a database migrated all the way to
// head, where a fresh table is indistinguishable from one that was always
// there. This file is the one place that proves the STEP: a database stopped
// at 0011 with a real user row in it, moved forward one migration, still has
// its user — and the new table hangs off that user by a cascade, so deleting
// the account really does take the preferences with it.
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
    // drizzle's own runner splits on this marker and runs the statements in
    // order; PGlite's `exec` runs a script the same way.
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim().length > 0) await client.exec(statement);
    }
  }
}

const INDEX_0011 = 11;
const INDEX_0012 = 12;

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

async function columnsOf(client: PGlite, table: string): Promise<Map<string, ColumnRow>> {
  const result = await client.query<ColumnRow>(
    `SELECT "column_name", "data_type", "is_nullable", "column_default"
     FROM "information_schema"."columns" WHERE "table_name" = $1`,
    [table],
  );
  return new Map(result.rows.map((row) => [row.column_name, row]));
}

describe("migration 0012 — user_preferences", () => {
  it("creates the table with the shape the API relies on, on a fresh database", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0012);

      const columns = await columnsOf(client, "user_preferences");
      expect([...columns.keys()].sort()).toEqual(["tour_completed_at", "updated_at", "user_id"]);

      expect(columns.get("user_id")?.data_type).toBe("text");
      expect(columns.get("user_id")?.is_nullable).toBe("NO");

      // Nullable is the whole point: null means "has not seen the tour".
      expect(columns.get("tour_completed_at")?.data_type).toBe("timestamp with time zone");
      expect(columns.get("tour_completed_at")?.is_nullable).toBe("YES");

      expect(columns.get("updated_at")?.data_type).toBe("timestamp with time zone");
      expect(columns.get("updated_at")?.is_nullable).toBe("NO");
      expect(columns.get("updated_at")?.column_default).toMatch(/now\(\)/);

      // One row per account, enforced by the database rather than by the
      // upsert remembering to.
      const pk = await client.query<{ column_name: string }>(
        `SELECT "kcu"."column_name"
         FROM "information_schema"."table_constraints" AS "tc"
         JOIN "information_schema"."key_column_usage" AS "kcu"
           ON "tc"."constraint_name" = "kcu"."constraint_name"
         WHERE "tc"."table_name" = 'user_preferences' AND "tc"."constraint_type" = 'PRIMARY KEY'`,
      );
      expect(pk.rows.map((row) => row.column_name)).toEqual(["user_id"]);
    } finally {
      await client.close();
    }
  });

  it("steps a 0011 database forward without disturbing its users, and cascades from them", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0011);

      // A database as it stood before this migration: an account already in
      // it, with no notion of preferences.
      await client.exec(`
        INSERT INTO "user" ("id", "name", "email")
        VALUES ('user-kept', 'Kept Parent', 'kept@example.com'),
               ('user-gone', 'Gone Parent', 'gone@example.com');
      `);

      await applyMigrations(client, INDEX_0012, INDEX_0012);

      // The existing accounts survived the step untouched.
      const users = await client.query<{ id: string }>(`SELECT "id" FROM "user" ORDER BY "id"`);
      expect(users.rows.map((row) => row.id)).toEqual(["user-gone", "user-kept"]);

      await client.exec(`
        INSERT INTO "user_preferences" ("user_id", "tour_completed_at")
        VALUES ('user-kept', NULL),
               ('user-gone', '2026-09-11T10:00:00Z');
      `);

      // Deleting the account takes its preferences with it — and only its
      // own: the neighbour's row is still there afterwards.
      await client.exec(`DELETE FROM "user" WHERE "id" = 'user-gone'`);

      const left = await client.query<{ user_id: string }>(`SELECT "user_id" FROM "user_preferences"`);
      expect(left.rows.map((row) => row.user_id)).toEqual(["user-kept"]);
    } finally {
      await client.close();
    }
  });
});
