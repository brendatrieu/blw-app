// Migration 0017 (item 363): `allergen_overrides.established_at`.
//
// The rest of the suite only ever sees a database migrated all the way to
// head, where the backfill runs against an empty table and proves nothing.
// This file is the one place the BACKFILL itself is exercised: a database
// stopped at 0016, filled with marks whose `created_at` is nothing like now,
// then stepped forward one migration.
//
// One thing is on trial. `DEFAULT now()` alone satisfies the NOT NULL and
// would have shipped — and it would have stamped every mark a parent has ever
// made with the moment of the deploy, resetting the new maintenance countdown
// for all of them at once (a mark made in March reading "established today"
// and going un-due for a week). So the assertion is equality with
// `created_at`, to the microsecond, not merely "something plausible".
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

const INDEX_0016 = 16;
const INDEX_0017 = 17;

interface OverrideRow {
  allergen_key: string;
  baby_id: string;
  created_at: Date;
  established_at: Date;
}

/** The pre-0017 shape, for the snapshot taken while the column is still absent. */
async function marksBefore(client: PGlite): Promise<{ allergen_key: string; baby_id: string; created_at: Date }[]> {
  const result = await client.query<{ allergen_key: string; baby_id: string; created_at: Date }>(
    `SELECT "allergen_key", "baby_id", "created_at" FROM "allergen_overrides" ORDER BY "allergen_key"`,
  );
  return result.rows;
}

async function overrideRows(client: PGlite): Promise<OverrideRow[]> {
  const result = await client.query<OverrideRow>(
    `SELECT "allergen_key", "baby_id", "created_at", "established_at"
     FROM "allergen_overrides" ORDER BY "allergen_key"`,
  );
  return result.rows;
}

describe("migration 0017 — allergen_overrides.established_at", () => {
  it("backfills every existing mark from created_at, to the microsecond, losing no row", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0016);

      // Two babies on one account, with marks made at four very different
      // times — none of them "now", which is the whole point: a backfill that
      // quietly used the column default would pass a laxer assertion.
      await client.exec(`
        INSERT INTO "user" ("id", "name", "email") VALUES ('u1', 'Parent', 'parent@example.com');

        INSERT INTO "babies" ("id", "user_id", "name", "birth_date") VALUES
          ('bbbbbbbb-0000-4000-8000-000000000001', 'u1', 'Robin', '2025-01-15'),
          ('bbbbbbbb-0000-4000-8000-000000000002', 'u1', 'Sam', '2025-06-02');

        INSERT INTO "allergen_overrides" ("baby_id", "allergen_key", "created_at") VALUES
          ('bbbbbbbb-0000-4000-8000-000000000001', 'egg',    TIMESTAMPTZ '2026-03-04 08:15:30.123456+00'),
          ('bbbbbbbb-0000-4000-8000-000000000001', 'peanut', TIMESTAMPTZ '2025-11-20 22:47:01.000001+00'),
          ('bbbbbbbb-0000-4000-8000-000000000002', 'dairy',  TIMESTAMPTZ '2026-08-31 00:00:00+00'),
          -- One mark made moments ago, so "the backfill only fixes old rows"
          -- is covered too: every row goes through the same UPDATE.
          ('bbbbbbbb-0000-4000-8000-000000000002', 'wheat',  now());
      `);

      const before = await marksBefore(client);
      expect(before).toHaveLength(4);

      await applyMigrations(client, INDEX_0017, INDEX_0017);

      const after = await overrideRows(client);

      // Every row survived, in the same shape it went in.
      expect(after).toHaveLength(4);
      expect(after.map((row) => row.allergen_key)).toEqual(["dairy", "egg", "peanut", "wheat"]);
      expect(after.map((row) => row.baby_id)).toEqual(before.map((row) => row.baby_id));

      // `created_at` is untouched — this migration adds a fact, it does not
      // rewrite the one that was already there.
      expect(after.map((row) => row.created_at.toISOString())).toEqual(
        before.map((row) => row.created_at.toISOString()),
      );

      // And the new column IS that fact, exactly. Not "close to it": a mark
      // made in March must still read March.
      for (const row of after) {
        expect(row.established_at.toISOString()).toBe(row.created_at.toISOString());
      }
      expect(after[1]?.established_at.toISOString()).toBe("2026-03-04T08:15:30.123Z");

      // Asserted again in SQL, because a JS `Date` only carries milliseconds:
      // this is the one comparison that sees the stored microseconds, and
      // `<>` over the whole table is the strongest form of "equal".
      const mismatched = await client.query<{ count: number }>(
        `SELECT count(*)::int AS "count" FROM "allergen_overrides" WHERE "established_at" <> "created_at"`,
      );
      expect(mismatched.rows[0]?.count).toBe(0);
    } finally {
      await client.close();
    }
  });

  it("applies to a fresh database, landing NOT NULL with a now() default", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0017);

      const columns = await client.query<{
        column_name: string;
        is_nullable: string;
        column_default: string | null;
        data_type: string;
      }>(
        `SELECT "column_name", "is_nullable", "column_default", "data_type"
         FROM "information_schema"."columns"
         WHERE "table_name" = 'allergen_overrides' AND "column_name" = 'established_at'`,
      );
      expect(columns.rows).toEqual([
        {
          column_name: "established_at",
          is_nullable: "NO",
          column_default: "now()",
          data_type: "timestamp with time zone",
        },
      ]);

      // The default is what keeps a mark taken with no date meaning "now"
      // even if a caller never names the column.
      await client.exec(`
        INSERT INTO "user" ("id", "name", "email") VALUES ('u1', 'Parent', 'parent@example.com');
        INSERT INTO "babies" ("id", "user_id", "name", "birth_date")
        VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'u1', 'Robin', '2025-01-15');
        INSERT INTO "allergen_overrides" ("baby_id", "allergen_key")
        VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'egg');
      `);
      const [row] = await overrideRows(client);
      expect(row?.established_at).toBeInstanceOf(Date);
      expect(Math.abs(Date.now() - (row?.established_at.getTime() ?? 0))).toBeLessThan(60_000);

      // The index the PUT's upsert conflicts on is still the same one.
      const indexes = await client.query<{ indexname: string }>(
        `SELECT "indexname" FROM "pg_indexes" WHERE "tablename" = 'allergen_overrides' ORDER BY "indexname"`,
      );
      expect(indexes.rows.map((r) => r.indexname)).toContain("allergen_overrides_baby_key_idx");
    } finally {
      await client.close();
    }
  });
});
