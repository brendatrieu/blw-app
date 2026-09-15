// Migration 0016 (item 358): the `feedback` table, its status enum, and
// `admin_audit.target_ref`.
//
// The rest of the suite only ever sees a database migrated all the way to
// head, where a new table is simply there and nothing about HOW it arrived is
// exercised. This file is the one place the step itself is on trial, in the
// two shapes a real deployment takes: a brand new database going 0 → 16, and
// the production one sitting at 0015 with rows in it.
//
// What is asserted rather than assumed: the delete rules (`user_id` CASCADE
// takes a parent's messages with their account; `resolved_by` SET NULL means
// deleting an ADMIN never takes a parent's message with them), the enum
// labels the status column is limited to, both indexes the inbox reads by,
// and — for the seeded case — that an `admin_audit` row written before this
// migration comes out the far side untouched with a null `target_ref`.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

interface Journal {
  entries: { idx: number; tag: string }[];
}

/** Applies the migrations whose journal index falls in [firstIdx, lastIdx], in order.
 * (The harness from storage-item-foods-migration.test.ts.) */
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

const INDEX_0015 = 15;
const INDEX_0016 = 16;

describe("migration 0016 — feedback", () => {
  it("lands on a fresh database with the columns, enum, delete rules and indexes the inbox needs", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0016);

      const columns = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT "column_name", "is_nullable" FROM "information_schema"."columns"
         WHERE "table_name" = 'feedback' ORDER BY "column_name"`,
      );
      expect(columns.rows).toEqual([
        { column_name: "app_version", is_nullable: "NO" },
        // Written by "Clear", cleared by "Restore" — never a delete.
        { column_name: "archived_at", is_nullable: "YES" },
        { column_name: "created_at", is_nullable: "NO" },
        { column_name: "id", is_nullable: "NO" },
        { column_name: "message", is_nullable: "NO" },
        { column_name: "read_at", is_nullable: "YES" },
        { column_name: "resolved_at", is_nullable: "YES" },
        { column_name: "resolved_by", is_nullable: "YES" },
        { column_name: "route_pattern", is_nullable: "YES" },
        { column_name: "status", is_nullable: "NO" },
        { column_name: "user_id", is_nullable: "NO" },
      ]);

      const labels = await client.query<{ enumlabel: string }>(
        `SELECT "enumlabel" FROM "pg_enum" "e"
         JOIN "pg_type" "t" ON "t"."oid" = "e"."enumtypid"
         WHERE "t"."typname" = 'feedback_status' ORDER BY "e"."enumsortorder"`,
      );
      expect(labels.rows.map((row) => row.enumlabel)).toEqual(["new", "read", "resolved"]);

      // The two rules the privacy story rests on.
      const constraints = await client.query<{ constraint_name: string; delete_rule: string }>(
        `SELECT "rc"."constraint_name", "rc"."delete_rule"
         FROM "information_schema"."referential_constraints" "rc"
         JOIN "information_schema"."table_constraints" "tc"
           ON "tc"."constraint_name" = "rc"."constraint_name"
         WHERE "tc"."table_name" = 'feedback'
         ORDER BY "rc"."constraint_name"`,
      );
      expect(constraints.rows).toEqual([
        { constraint_name: "feedback_resolved_by_user_id_fk", delete_rule: "SET NULL" },
        { constraint_name: "feedback_user_id_user_id_fk", delete_rule: "CASCADE" },
      ]);

      const indexes = await client.query<{ indexname: string }>(
        `SELECT "indexname" FROM "pg_indexes" WHERE "tablename" = 'feedback' ORDER BY "indexname"`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "feedback_pkey",
        "feedback_status_created_at_idx",
        "feedback_user_id_created_at_idx",
      ]);

      // Default status, so a message is `new` without the route saying so.
      const statusDefault = await client.query<{ column_default: string | null }>(
        `SELECT "column_default" FROM "information_schema"."columns"
         WHERE "table_name" = 'feedback' AND "column_name" = 'status'`,
      );
      expect(statusDefault.rows[0]?.column_default).toContain("'new'");

      const targetRef = await client.query<{ data_type: string; is_nullable: string }>(
        `SELECT "data_type", "is_nullable" FROM "information_schema"."columns"
         WHERE "table_name" = 'admin_audit' AND "column_name" = 'target_ref'`,
      );
      expect(targetRef.rows).toEqual([{ data_type: "text", is_nullable: "YES" }]);

      // Deliberately NO foreign key: the audit trail has to outlive the row
      // it names, so `target_ref` is plain text.
      const auditConstraints = await client.query<{ constraint_name: string }>(
        `SELECT "tc"."constraint_name"
         FROM "information_schema"."table_constraints" "tc"
         WHERE "tc"."table_name" = 'admin_audit' AND "tc"."constraint_type" = 'FOREIGN KEY'
         ORDER BY "tc"."constraint_name"`,
      );
      expect(auditConstraints.rows.map((row) => row.constraint_name)).toEqual([
        "admin_audit_actor_user_id_user_id_fk",
        "admin_audit_target_user_id_user_id_fk",
      ]);
    } finally {
      await client.close();
    }
  });

  it("steps a database seeded at 0015 forward without touching what is already there", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0015);

      await client.exec(`
        INSERT INTO "user" ("id", "name", "email") VALUES
          ('u1', 'Owner', 'owner@example.com'),
          ('u2', 'Parent', 'parent@example.com');

        INSERT INTO "admin_audit" ("id", "actor_user_id", "action", "target_user_id")
        VALUES ('dddddddd-0000-4000-8000-000000000001', 'u1', 'grant', 'u2');
      `);

      await applyMigrations(client, INDEX_0016, INDEX_0016);

      const audit = await client.query<{
        id: string;
        action: string;
        target_user_id: string | null;
        target_ref: string | null;
      }>(`SELECT "id", "action", "target_user_id", "target_ref" FROM "admin_audit"`);
      expect(audit.rows).toEqual([
        {
          id: "dddddddd-0000-4000-8000-000000000001",
          action: "grant",
          target_user_id: "u2",
          // The pre-existing grant was about an account, not a row.
          target_ref: null,
        },
      ]);

      // And the new table is usable straight away, with its default.
      await client.exec(`
        INSERT INTO "feedback" ("user_id", "message", "app_version")
        VALUES ('u2', 'The log form saves twice on my phone.', 'abc123def456');
      `);
      const seeded = await client.query<{ status: string; archived_at: string | null; route_pattern: string | null }>(
        `SELECT "status", "archived_at", "route_pattern" FROM "feedback"`,
      );
      expect(seeded.rows).toEqual([{ status: "new", archived_at: null, route_pattern: null }]);

      // The cascade really does reach across the new table.
      await client.exec(`DELETE FROM "user" WHERE "id" = 'u2'`);
      const left = await client.query(`SELECT "id" FROM "feedback"`);
      expect(left.rows).toHaveLength(0);
      // While the audit row survives its subject, with the id nulled.
      const survived = await client.query<{ target_user_id: string | null }>(
        `SELECT "target_user_id" FROM "admin_audit"`,
      );
      expect(survived.rows).toEqual([{ target_user_id: null }]);
    } finally {
      await client.close();
    }
  });
});
