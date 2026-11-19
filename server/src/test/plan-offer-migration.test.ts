// Migration 0027 (ledger 995): `user_preferences.plan_offer_dismissed_at`.
//
// Steps a database stopped at 0026 — two accounts with preference rows (one
// tour seen, sharing off) and one without — forward one migration. The column
// is additive and nullable, so the claim on trial is "no row touched, nobody
// reads as dismissed", and the account cascade still takes the row with it.
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

describe("migration 0027 — user_preferences.plan_offer_dismissed_at", () => {
  it("adds the column, touching no row; an account delete still cascades", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, 26);
      await client.exec(`
        INSERT INTO "user" ("id", "name", "email") VALUES
          ('u1', 'Parent', 'parent@example.com'), ('u2', 'Other', 'other@example.com'), ('u3', 'Third', 'third@example.com');
        INSERT INTO "user_preferences" ("user_id", "tour_completed_at", "share_usage_data", "updated_at") VALUES
          ('u1', '2026-09-11T10:00:00Z', false, '2026-09-11T10:00:00Z'),
          ('u2', NULL, true, '2026-09-12T10:00:00Z');
      `);
      const rows = async () =>
        (await client.query(`SELECT "user_id", "tour_completed_at", "share_usage_data", "updated_at" FROM "user_preferences" ORDER BY "user_id"`)).rows;
      const before = await rows();
      expect(before).toHaveLength(2);

      await applyMigrations(client, 27, 27);

      expect(await rows()).toEqual(before);
      expect((await client.query(`SELECT count(*)::int AS "n" FROM "user_preferences" WHERE "plan_offer_dismissed_at" IS NOT NULL`)).rows).toEqual([{ n: 0 }]);
      const columns = await client.query(
        `SELECT "is_nullable", "column_default", "data_type" FROM "information_schema"."columns"
         WHERE "table_name" = 'user_preferences' AND "column_name" = 'plan_offer_dismissed_at'`,
      );
      expect(columns.rows).toEqual([{ is_nullable: "YES", column_default: null, data_type: "timestamp with time zone" }]);

      await client.exec(`UPDATE "user_preferences" SET "plan_offer_dismissed_at" = now() WHERE "user_id" = 'u1'; DELETE FROM "user" WHERE "id" = 'u1';`);
      expect((await client.query(`SELECT "user_id" FROM "user_preferences"`)).rows).toEqual([{ user_id: "u2" }]);
    } finally {
      await client.close();
    }
  });
});
