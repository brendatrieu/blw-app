// Migration 0013 (item 316): the analytics tables.
//
// The rest of the suite only ever sees a database migrated all the way to
// head, where a new table is indistinguishable from one that was always
// there. This file is the one place that proves the STEP — a database stopped
// at 0012 with real rows in it, moved forward one migration, keeps its users
// and its preferences, and the columns the API relies on arrive with the
// defaults that make an existing account behave like a new one:
//
//   * `user.role` defaults to 'parent', so better-auth's own INSERTs, which
//     know nothing about the column, keep working;
//   * `user_preferences.share_usage_data` defaults to true, so a parent who
//     was already using the app is in the same state as a new one — which is
//     the state the Settings copy describes;
//   * `usage_events.id` has NO default, because the client generates it and a
//     server-assigned id would dedupe against nothing.
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

const INDEX_0012 = 12;
const INDEX_0013 = 13;

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

async function indexesOf(client: PGlite, table: string): Promise<string[]> {
  const result = await client.query<{ indexname: string }>(
    `SELECT "indexname" FROM "pg_indexes" WHERE "tablename" = $1 ORDER BY "indexname"`,
    [table],
  );
  return result.rows.map((row) => row.indexname);
}

describe("migration 0013 — usage analytics", () => {
  it("creates the shape the API relies on, on a fresh database", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0013);

      const events = await columnsOf(client, "usage_events");
      expect([...events.keys()].sort()).toEqual([
        "app_version",
        "context",
        "id",
        "name",
        "occurred_at",
        "props",
        "received_at",
        "route",
        "user_id",
      ]);

      // Client-generated: the id IS the dedupe key, so the server must not
      // be able to invent one.
      expect(events.get("id")?.data_type).toBe("uuid");
      expect(events.get("id")?.column_default).toBeNull();
      expect(events.get("id")?.is_nullable).toBe("NO");

      // Nullable on purpose — the sign-in and sign-up screens are measured
      // too, and those visitors have no account yet.
      expect(events.get("user_id")?.is_nullable).toBe("YES");
      expect(events.get("props")?.data_type).toBe("jsonb");
      expect(events.get("context")?.data_type).toBe("jsonb");
      // Route PATTERN, and null for events with no screen behind them.
      expect(events.get("route")?.is_nullable).toBe("YES");
      expect(events.get("occurred_at")?.data_type).toBe("timestamp with time zone");
      expect(events.get("received_at")?.column_default).toMatch(/now\(\)/);

      // The two access shapes every panel and the opt-out wipe read.
      expect(await indexesOf(client, "usage_events")).toEqual([
        "usage_events_name_occurred_at_idx",
        "usage_events_pkey",
        "usage_events_user_id_occurred_at_idx",
      ]);

      const deploys = await columnsOf(client, "deploys");
      expect([...deploys.keys()].sort()).toEqual(["deployed_at", "note", "sha"]);
      expect(deploys.get("sha")?.is_nullable).toBe("NO");
      expect(deploys.get("note")?.is_nullable).toBe("YES");

      const audit = await columnsOf(client, "admin_audit");
      expect([...audit.keys()].sort()).toEqual([
        "action",
        "actor_user_id",
        "at",
        "id",
        "target_user_id",
      ]);
    } finally {
      await client.close();
    }
  });

  it("steps a 0012 database forward, defaulting existing rows into the new state", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, 0, INDEX_0012);

      // A database as it stood before this migration: two accounts, one of
      // which had already finished the tour.
      await client.exec(`
        INSERT INTO "user" ("id", "name", "email")
        VALUES ('user-kept', 'Kept Parent', 'kept@example.com'),
               ('user-gone', 'Gone Parent', 'gone@example.com');
        INSERT INTO "user_preferences" ("user_id", "tour_completed_at")
        VALUES ('user-kept', '2026-09-11T10:00:00Z');
      `);

      await applyMigrations(client, INDEX_0013, INDEX_0013);

      const users = await client.query<{ id: string; role: string }>(
        `SELECT "id", "role" FROM "user" ORDER BY "id"`,
      );
      expect(users.rows).toEqual([
        { id: "user-gone", role: "parent" },
        { id: "user-kept", role: "parent" },
      ]);

      // The existing preference row kept its timestamp and was defaulted into
      // sharing — the same state a new account starts in.
      const prefs = await client.query<{
        user_id: string;
        tour_completed_at: string | null;
        share_usage_data: boolean;
      }>(`SELECT "user_id", "tour_completed_at", "share_usage_data" FROM "user_preferences"`);
      expect(prefs.rows).toHaveLength(1);
      expect(prefs.rows[0]?.share_usage_data).toBe(true);
      expect(prefs.rows[0]?.tour_completed_at).not.toBeNull();

      // Events hang off the user by a cascade, so deleting the account takes
      // them with it — and only its own.
      await client.exec(`
        INSERT INTO "usage_events" ("id", "user_id", "name", "props", "app_version", "context", "occurred_at")
        VALUES ('11111111-1111-4111-8111-111111111111', 'user-kept', 'session_started', '{}', 'abc', '{}', now()),
               ('22222222-2222-4222-8222-222222222222', 'user-gone', 'session_started', '{}', 'abc', '{}', now()),
               ('33333333-3333-4333-8333-333333333333', NULL,        'session_started', '{}', 'abc', '{}', now());
        INSERT INTO "admin_audit" ("actor_user_id", "action", "target_user_id")
        VALUES ('user-kept', 'grant', 'user-gone');
      `);

      await client.exec(`DELETE FROM "user" WHERE "id" = 'user-gone'`);

      const left = await client.query<{ id: string }>(`SELECT "id" FROM "usage_events" ORDER BY "id"`);
      expect(left.rows.map((row) => row.id)).toEqual([
        "11111111-1111-4111-8111-111111111111",
        // Anonymous rows belong to nobody and survive.
        "33333333-3333-4333-8333-333333333333",
      ]);

      // The audit record survives the deletion; the deleted person's id does
      // not — SET NULL, not CASCADE.
      const audit = await client.query<{ actor_user_id: string | null; target_user_id: string | null }>(
        `SELECT "actor_user_id", "target_user_id" FROM "admin_audit"`,
      );
      expect(audit.rows).toEqual([{ actor_user_id: "user-kept", target_user_id: null }]);
    } finally {
      await client.close();
    }
  });
});
