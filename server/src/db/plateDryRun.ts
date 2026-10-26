// Ledger 901 (plan SPEC §8.1): the Phase 1 dry run on a restored production
// backup. server/scripts/plate-dry-run.ts is its command line; the migration
// test runs these same functions on the corpus.
//
// Every line here is a count or pass/fail, never a name, a food or an id:
// the record files hold those (`recordPlateParity` reads everything), and
// they never leave the machine that made them.
import { sql } from "drizzle-orm";
import type { Database } from "./index.js";
import { backfillPassCounts, findDriftedMeals } from "./migrate.js";
import { checkPlateInvariants, comparePlateParity, recordPlateParity, type ParityRecord } from "./plateParity.js";

/** What `record` writes: where the database stood, and every observable. */
export interface DryRunRecord {
  migrations: number;
  /** Whether `meal_items` existed (migration 0024 had run). */
  plate: boolean;
  record: ParityRecord;
}

async function databaseState(db: Database): Promise<{ migrations: number; plate: boolean }> {
  const result = await db.execute(
    sql`SELECT (SELECT count(*) FROM "drizzle"."__drizzle_migrations")::int AS "migrations",
               to_regclass('meal_items') IS NOT NULL AS "plate"`,
  );
  return (result as unknown as { rows: { migrations: number; plate: boolean }[] }).rows[0]!;
}

export async function recordDryRun(db: Database): Promise<DryRunRecord> {
  return { ...(await databaseState(db)), record: await recordPlateParity(db) };
}

const keys = (record: ParityRecord, observable: string) => Object.keys(record[observable] ?? {}).length;

const describeState = ({ migrations, plate }: { migrations: number; plate: boolean }) =>
  `${migrations} migrations, meal_items ${plate ? "present" : "absent"}`;

export function describeRecord(file: DryRunRecord): string {
  return `recorded: ${keys(file.record, "meals")} meals, ${keys(file.record, "allergenProgress")} babies, ${describeState(file)}`;
}

/**
 * The summary the owner pastes back (SPEC §8.1 step 5): the two records
 * compared observable by observable, then the migrated database itself
 * (drift, invariants, orphans, and the backfill's rows by pass). PASS needs
 * `before` taken before the migration and `after` after it, 0 mismatches,
 * drift 0, no invariant broken, and every item accounted for by a pass.
 */
export async function compareDryRun(
  db: Database,
  before: DryRunRecord,
  after: DryRunRecord,
): Promise<{ pass: boolean; lines: string[] }> {
  const state = await databaseState(db);
  const ordered = !before.plate && after.plate && state.plate;
  const lines = [
    `before: ${describeState(before)}; after: ${describeState(after)}; database now: ${describeState(state)}`,
  ];
  if (!ordered) {
    lines.push("record `before` before migrating and `after` (and compare) after it", "result: FAIL");
    return { pass: false, lines };
  }

  const mismatches = comparePlateParity(before.record, after.record);
  const mismatched = Object.values(mismatches).reduce((sum, n) => sum + n, 0);
  const drift = (await findDriftedMeals(db)).length;
  const { violations, orphans } = await checkPlateInvariants(db);
  const { r, f, c } = await backfillPassCounts(db);
  const [items] = (
    (await db.execute(
      sql`SELECT count(*)::int AS "n", count(*) FILTER (WHERE "inferred")::int AS "inferred" FROM "meal_items"`,
    )) as unknown as { rows: { n: number; inferred: number }[] }
  ).rows;
  const pass = mismatched === 0 && drift === 0 && violations.length === 0 && r + f + c === items!.n;

  lines.push(
    `meals checked: ${keys(before.record, "meals")} before, ${keys(after.record, "meals")} after; babies checked: ${keys(after.record, "allergenProgress")}`,
    ...Object.entries(mismatches).map(([observable, n]) => `mismatches ${observable}: ${n}`),
    `drift after the second heal: ${drift} meals`,
    `invariant violations: ${violations.length}`,
    `orphans (allowed, reported): ${orphans}`,
    `meal_items: ${items!.n} (inferred ${items!.inferred}); backfill rows R ${r} + F ${f} + C ${c} = ${r + f + c}`,
    `result: ${pass ? "PASS" : "FAIL"}`,
  );
  return { pass, lines };
}
