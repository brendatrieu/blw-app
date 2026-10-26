// Migration 0024 (ledger 901, plan SPEC §2, §8 row 1): `meal_items`, its
// backfill (passes R, F, C) and the boot heal `healMealItems`.
//
// A database is stopped at 0023 by drizzle's REAL migrator, filled with every
// kind of meal a real account holds (the §8 row 1 corpus, B1 cases included),
// then migrated to head and booted twice. Everything a reader sees must come
// out identical (the shared recorder in db/plateParity.ts, which the prod
// dry run uses too), the §2.2 invariants must hold, and no meal may drift.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/index.js";
import { MEAL_ITEMS_BACKFILL, findDriftedMeals, healMealItems, healMealRecipes } from "../db/migrate.js";
import { checkPlateInvariants, comparePlateParity, recordPlateParity } from "../db/plateParity.js";
import { compareDryRun, describeRecord, recordDryRun, type DryRunRecord } from "../db/plateDryRun.js";
import * as schema from "../db/schema.js";
import { B1, B2, F, M, R, X, id, plateCorpusSql } from "./plateCorpus.js";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

async function readJournal(): Promise<Journal & Record<string, unknown>> {
  return JSON.parse(await fs.readFile(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as Journal &
    Record<string, unknown>;
}

/** A copy of the migrations folder holding only migrations up to `lastIdx`. */
async function foldersUpTo(lastIdx: number): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blw-0024-"));
  await fs.mkdir(path.join(dir, "meta"));
  const journal = await readJournal();
  const entries = journal.entries.filter((entry) => entry.idx <= lastIdx);
  await fs.writeFile(path.join(dir, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) {
    await fs.copyFile(path.join(migrationsFolder, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
  }
  return dir;
}

let stoppedAt0023: string;
beforeAll(async () => {
  stoppedAt0023 = await foldersUpTo(23);
});
afterAll(async () => {
  await fs.rm(stoppedAt0023, { recursive: true, force: true });
});

const U = "u1";
const SEED_0023 = plateCorpusSql(U, { withUser: true });

async function rows(client: PGlite, sql: string) {
  return (await client.query<Record<string, unknown>>(sql)).rows;
}

const itemRows = (client: PGlite) =>
  rows(client, `SELECT * FROM "meal_items" ORDER BY "meal_id", "position", "id"`);

/** One meal's items as [position, food|recipe, storage, counted, rating]. */
async function itemsOf(client: PGlite, mealId: string) {
  return (
    await rows(
      client,
      `SELECT "position", coalesce("food_id", "recipe_id") AS "ref", "storage_item_id", "counted_food_ids", "rating", "inferred"
         FROM "meal_items" WHERE "meal_id" = '${mealId}' ORDER BY "position"`,
    )
  ).map((row) => {
    expect(row.inferred).toBe(true);
    return [row.position, row.ref, row.storage_item_id, row.counted_food_ids, row.rating];
  });
}

describe("migration 0024 — meal_items backfill", () => {
  let client: PGlite;
  let db: Database;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: stoppedAt0023 });
    await client.exec(SEED_0023);
  });

  afterEach(async () => {
    await client.close();
  });

  /** What production's boot does: migrate to head, then heal. */
  const boot = async () => {
    await migrate(db, { migrationsFolder });
    await healMealRecipes(db);
    await db.transaction((tx) => healMealItems(tx));
  };

  it("gives every corpus meal its items, changes nothing any reader sees, and two boots change nothing", async () => {
    const before = await recordPlateParity(db);

    await migrate(db, { migrationsFolder });
    const backfilled = await itemRows(client);
    expect(await checkPlateInvariants(db)).toEqual({ violations: [], orphans: 2 });
    expect(await findDriftedMeals(db)).toEqual([]);

    await boot();
    expect(await itemRows(client)).toEqual(backfilled);
    await boot();
    expect(await itemRows(client)).toEqual(backfilled);

    const after = await recordPlateParity(db);
    expect(after).toEqual(before);
    expect(Object.values(comparePlateParity(before, after)).every((n) => n === 0)).toBe(true);
    // The recorder really looked: every meal, both babies, every allergen.
    expect(Object.keys(after.loadMeals!)).toHaveLength(29);
    expect(Object.keys(after.allergenDetail!)).toHaveLength(4);
    // 9 named foods (whole milk is info, not a food tried) + 50 fillers.
    expect(after.foodsTried).toEqual({ [B1]: 59, [B2]: 2 });

    // Every meal has items, every row is inferred (chair §10.1).
    expect(await rows(client, `SELECT count(DISTINCT "meal_id")::int AS "n", bool_and("inferred") AS "all" FROM "meal_items"`)).toEqual([
      { n: 29, all: true },
    ]);
    expect(await rows(client, `SELECT count(*)::int AS "n" FROM "drizzle"."__drizzle_migrations"`)).toEqual([
      { n: (await readJournal()).entries.length },
    ]);
  });

  it("builds each meal kind exactly (passes R, F and C)", async () => {
    await boot();
    const counted = (...foods: number[]) => foods.map(F).sort();
    // Loose foods, by name; the rated one keeps its stars.
    expect(await itemsOf(client, M(1))).toEqual([
      [0, F(1), null, [], 5],
      [1, F(3), null, [], null],
    ]);
    // A left-out ingredient is simply not counted.
    expect(await itemsOf(client, M(2))).toEqual([[0, R(1), null, counted(1), 4]]);
    expect(await itemsOf(client, M(3))).toEqual([
      [0, R(1), null, counted(1, 2), 3],
      [1, R(3), null, counted(3), 5],
    ]);
    // F (a): a rated extra that is now an ingredient keeps its own row.
    expect(await itemsOf(client, M(4))).toEqual([
      [0, R(4), null, counted(1, 4), null],
      [1, F(1), null, [], 4],
    ]);
    // A food container: one row per held food, rated per food.
    expect(await itemsOf(client, M(5))).toEqual([
      [0, F(1), X(1), [], 4],
      [1, F(2), X(1), [], null],
    ]);
    // A recipe container from before 0020 is found through the food links.
    expect(await itemsOf(client, M(6))).toEqual([[0, R(2), X(2), counted(2, 6, 7), 2]]);
    // Multi-part serve: a several-recipe container, an untracked food
    // container, a fresh recipe and a fresh rated food.
    expect(await itemsOf(client, M(7))).toEqual([
      [0, R(4), X(3), counted(1, 4), 4],
      [1, R(3), X(3), counted(3), null],
      [2, R(5), null, counted(2), null],
      [3, F(8), null, [], 3],
      [4, F(5), X(4), [], null],
    ]);
    // F (b): a food the recipe no longer lists.
    expect(await itemsOf(client, M(10))).toEqual([
      [0, R(3), null, counted(3), null],
      [1, F(9), null, [], null],
    ]);
    // An ingredient added since is not counted (and, inferred, never shown as left out).
    expect(await itemsOf(client, M(11))).toEqual([[0, R(2), null, counted(2, 6), null]]);
    // B1: fridge + freezer of one recipe are two groups. R takes the
    // container the serve LINKED (a6), even though a5 has the lower id; C
    // adds a5 with R's counted set, unrated.
    expect(await itemsOf(client, M(12))).toEqual([
      [0, R(1), X(6), counted(1, 2), null],
      [1, R(1), X(5), counted(1, 2), null],
    ]);
    // B1: a food container whose food overlapped an earlier part (C)...
    expect(await itemsOf(client, M(13))).toEqual([
      [0, F(1), X(7), [], null],
      [1, F(2), X(7), [], null],
      [2, F(1), X(8), [], null],
    ]);
    // ...and its pre-0020 twin, which left no trace to find.
    expect(await itemsOf(client, M(14))).toEqual([
      [0, F(1), X(9), [], null],
      [1, F(2), X(9), [], null],
    ]);
    // Merged serve (a container of r plus a fresh r): one group.
    expect(await itemsOf(client, M(15))).toEqual([[0, R(4), X(11), counted(1, 4), null]]);
    // Orphans: a container edited in Storage since gets no group.
    expect(await itemsOf(client, M(16))).toEqual([[0, R(1), null, counted(1, 2), null]]);
    expect(await itemsOf(client, M(17))).toEqual([[0, F(1), X(13), [], null]]);
    // The 50-food meal: 50 rows, by name.
    expect((await itemsOf(client, M(18))).map((item) => item[1])).toEqual(
      Array.from({ length: 50 }, (_, i) => F(i + 11)),
    );
    // Milk on its own and milk through a recipe stay what they were.
    expect(await itemsOf(client, M(19))).toEqual([
      [0, F(1), null, [], null],
      [1, F(6), null, [], null],
    ]);
    expect(await itemsOf(client, M(20))).toEqual([
      [0, R(2), null, counted(2, 6, 7), null],
      [1, F(5), null, [], 2],
    ]);
    // Known limit, split container recipes: the group sits at 0 and 2.
    expect(await itemsOf(client, M(21))).toEqual([
      [0, R(1), X(15), counted(1, 2), null],
      [1, R(3), null, counted(3), null],
      [2, R(2), X(15), counted(2, 6, 7), null],
    ]);
    // A legacy container of foods AND a recipe: held foods win, the recipe
    // row counts nothing.
    expect(await itemsOf(client, M(22))).toEqual([
      [0, R(3), X(16), [], null],
      [1, F(9), X(16), [], null],
    ]);
    // The V4 meal has no recipe to put a rating on.
    expect(await itemsOf(client, M(23))).toEqual([[0, F(2), null, [], null]]);
    // A recipe container plus a food container holding one of its ingredients.
    expect(await itemsOf(client, M(24))).toEqual([
      [0, R(1), X(5), counted(1, 2), 5],
      [1, F(2), X(17), [], null],
    ]);
    // A container the serve finished keeps its group.
    expect(await itemsOf(client, M(25))).toEqual([[0, F(8), X(18), [], null]]);
    // F (c): the container keeps BOTH its foods, though the recipe counts Egg.
    expect(await itemsOf(client, M(29))).toEqual([
      [0, R(5), null, counted(2), null],
      [1, F(1), X(1), [], null],
      [2, F(2), X(1), [], null],
    ]);
  });

  it("the heal's backfill IS the migration's: rebuilt from nothing, every meal gets the same rows", async () => {
    await boot();
    const strip = async () =>
      (await itemRows(client)).map(({ id: _id, ...rest }) => rest).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const migrated = await strip();
    await client.exec(`DELETE FROM "meal_items"`);
    await db.transaction((tx) => healMealItems(tx));
    expect(await strip()).toEqual(migrated);
  });

  // The dry run trusts these two to say when something IS wrong.
  it("the invariant checker and the recorder flag what breaks", async () => {
    await boot();
    const before = await recordPlateParity(db);
    await client.exec(`
      DELETE FROM "meal_items" WHERE "meal_id" = '${M(12)}' AND "position" = 1;            -- 4: a5 loses its group
      UPDATE "meal_items" SET "counted_food_ids" = '{}' WHERE "meal_id" = '${M(2)}';        -- 1
      UPDATE "meal_items" SET "position" = 9 WHERE "meal_id" = '${M(3)}' AND "position" = 0; -- 2
      UPDATE "meal_items" SET "rating" = 1 WHERE "meal_id" = '${M(1)}' AND "position" = 0;  -- 3
      DELETE FROM "meal_items" WHERE "meal_id" = '${M(5)}';                                 -- 1, 3, 4, 5
      UPDATE "meal_foods" SET "storage_item_id" = NULL WHERE "meal_id" = '${M(13)}' AND "food_id" = '${F(1)}';
    `);
    const { violations } = await checkPlateInvariants(db);
    const flagged = (mealId: string) => violations.filter((v) => v.mealId === mealId).map((v) => v.invariant);
    expect(flagged(M(12))).toEqual([4]);
    expect(flagged(M(2))).toEqual([1]);
    expect(flagged(M(3))).toEqual([2]);
    expect(flagged(M(1))).toEqual([3]);
    expect(flagged(M(5))).toEqual([1, 3, 4, 5]);
    const mismatches = comparePlateParity(before, await recordPlateParity(db));
    expect(mismatches.mealFoods).toBe(1);
    expect(mismatches.loadMeals).toBe(1);
    expect(mismatches.meals).toBe(0);
  });

  // SPEC §8.1: the prod-backup dry run, on the corpus. It must pass here,
  // fail on a break, and print nothing that names anything.
  it("the dry run passes on the corpus, fails on a break, and prints only counts", async () => {
    // Through JSON, as the record files go.
    const record = async () => JSON.parse(JSON.stringify(await recordDryRun(db))) as DryRunRecord;
    const before = await record();
    expect(before).toMatchObject({ migrations: 24, plate: false });
    // Records taken in the wrong order are a FAIL, not a vacuous pass.
    expect((await compareDryRun(db, before, before)).lines.at(-1)).toBe("result: FAIL");
    await boot();
    await boot();
    const after = await record();
    expect(after).toMatchObject({ migrations: 25, plate: true });

    const { pass, lines } = await compareDryRun(db, before, after);
    expect(pass).toBe(true);
    expect(lines).toEqual([
      "before: 24 migrations, meal_items absent; after: 25 migrations, meal_items present; database now: 25 migrations, meal_items present",
      "meals checked: 29 before, 29 after; babies checked: 2",
      ...Object.keys(before.record).map((observable) => `mismatches ${observable}: 0`),
      "drift after the second heal: 0 meals",
      "invariant violations: 0",
      "orphans (allowed, reported): 2",
      expect.stringMatching(/^meal_items: (\d+) \(inferred \1\); backfill rows R \d+ \+ F \d+ \+ C \d+ = \1$/),
      "result: PASS",
    ]);
    // Every pass made rows on this corpus.
    expect(lines.at(-2)).toMatch(/R [1-9]\d* \+ F [1-9]\d* \+ C [1-9]/);
    expect((await compareDryRun(db, after, after)).pass).toBe(false);

    // A legacy rating an older image changed is caught, by observable.
    await client.exec(`UPDATE "meal_foods" SET "rating" = 1 WHERE "meal_id" = '${M(1)}' AND "food_id" = '${F(3)}'`);
    const broken = await compareDryRun(db, before, await record());
    expect(broken.pass).toBe(false);
    expect(broken.lines).toContain("mismatches mealFoods: 1");
    expect(broken.lines.at(-1)).toBe("result: FAIL");

    // Nothing printed names a food, recipe, baby or account, or holds an id.
    const printed = [describeRecord(before), describeRecord(after), ...lines, ...broken.lines].join("\n");
    expect(printed).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    const names = await rows(
      client,
      `SELECT "name" AS "v" FROM "foods" UNION SELECT "title" FROM "recipes" UNION SELECT "name" FROM "babies"
       UNION SELECT "name" FROM "user" UNION SELECT "email" FROM "user"`,
    );
    expect(names.length).toBeGreaterThan(60);
    for (const { v } of names) expect(printed).not.toContain(String(v));
  });

  // Verifier p1-c1 blocker 1: the old client rated every food of a loose
  // meal and sent them in its own order; the legacy reader returns a meal's
  // rows in whatever order the engine leaves ties, the plate by name. The
  // rating summaries then hold the same values with their ids in another
  // order, which is no difference (every client reads them by key).
  it("the dry run passes when a baby's latest meal rated two loose foods sent Z before A (or A before Z)", async () => {
    // Two new babies with one meal each, alike but for the order sent: B3's
    // Yogurt then Broccoli, B4's Broccoli then Yogurt. Whatever the engine
    // does with ties, it does the same to both, so one of them reads back
    // in another order than the plate's.
    const [B3, B4] = [id("b", 3), id("b", 4)];
    await client.exec(`
      INSERT INTO "babies" ("id", "user_id", "name", "birth_date") VALUES
        ('${B3}', '${U}', 'Sky', '2025-02-01'), ('${B4}', '${U}', 'Ash', '2025-02-01');
      INSERT INTO "meals" ("id", "baby_id", "served_at") VALUES
        ('${M(30)}', '${B3}', '2026-09-03T08:00:00Z'), ('${M(31)}', '${B4}', '2026-09-03T08:00:00Z');
      INSERT INTO "meal_foods" ("meal_id", "food_id", "rating") VALUES ('${M(30)}', '${F(5)}', 4);
      INSERT INTO "meal_foods" ("meal_id", "food_id", "rating") VALUES ('${M(30)}', '${F(8)}', 2);
      INSERT INTO "meal_foods" ("meal_id", "food_id", "rating") VALUES ('${M(31)}', '${F(8)}', 2);
      INSERT INTO "meal_foods" ("meal_id", "food_id", "rating") VALUES ('${M(31)}', '${F(5)}', 4);
    `);
    const record = async () => JSON.parse(JSON.stringify(await recordDryRun(db))) as DryRunRecord;
    const before = await record();
    await boot();
    await boot();
    const after = await record();

    const foods = (file: DryRunRecord, baby: string) =>
      (file.record.ratingSummaries![baby] as { foods: Record<string, unknown> }).foods;
    for (const baby of [B3, B4]) {
      expect(foods(after, baby)).toEqual(foods(before, baby));
      expect(foods(after, baby)).toEqual({
        [F(8)]: { count: 1, average: 2, latest: 2, lastRatedAt: "2026-09-03T08:00:00.000Z" },
        [F(5)]: { count: 1, average: 4, latest: 4, lastRatedAt: "2026-09-03T08:00:00.000Z" },
      });
      // On the plate, Broccoli then Yogurt.
      expect(Object.keys(foods(after, baby))).toEqual([F(8), F(5)]);
    }
    // The case is really here: one of the two read Yogurt first before.
    expect([B3, B4].map((baby) => Object.keys(foods(before, baby))[0])).toContain(F(5));

    const { pass, lines } = await compareDryRun(db, before, after);
    expect(lines).toContain("mismatches ratingSummaries: 0");
    expect(lines.at(-1)).toBe("result: PASS");
    expect(pass).toBe(true);
  });

  // Verifier p1-c3 pins (901b): the dry run is the push gate, so each of its
  // PASS conditions must FAIL it on its own, and the comparison must count a
  // reorder, a one-sided key and a changed value, but not object key order.
  it("comparePlateParity counts a reorder, a one-sided key and a changed value; ignores object key order", () => {
    const before = { o: { a: [1, 2], b: { x: 1, y: 2 }, c: 1 } };
    expect(comparePlateParity(before, { o: { a: [1, 2], b: { y: 2, x: 1 }, c: 1 } })).toEqual({ o: 0 });
    expect(comparePlateParity(before, { o: { a: [2, 1], b: { x: 1, y: 2 }, c: 1 } })).toEqual({ o: 1 });
    expect(comparePlateParity(before, { o: { a: [1, 2], b: { x: 1, y: 2 } } })).toEqual({ o: 1 });
    expect(comparePlateParity(before, { o: { a: [1, 2], b: { x: 1, y: 2 }, c: 1, d: 0 } })).toEqual({ o: 1 });
    expect(comparePlateParity(before, { o: { a: [1, 2], b: { x: 1, y: 3 }, c: 1 } })).toEqual({ o: 1 });
  });

  describe("the dry run FAILs on each condition alone", () => {
    const line = (lines: string[], prefix: string) => lines.find((l) => l.startsWith(prefix));
    const allMatch = (lines: string[]) => lines.filter((l) => l.startsWith("mismatches ")).every((l) => l.endsWith(": 0"));

    it("a mismatch (a meal's notes changed under the migration)", async () => {
      const before = await recordDryRun(db);
      await boot();
      await client.exec(`UPDATE "meals" SET "notes" = 'changed' WHERE "id" = '${M(1)}'`);
      const { pass, lines } = await compareDryRun(db, before, await recordDryRun(db));
      expect(line(lines, "mismatches meals:")).toBe("mismatches meals: 1");
      expect(line(lines, "drift after")).toBe("drift after the second heal: 0 meals");
      expect(line(lines, "invariant violations")).toBe("invariant violations: 0");
      expect(pass).toBe(false);
    });

    it("an invariant violation (an item's stars disagree with the legacy mirror)", async () => {
      const before = await recordDryRun(db);
      await boot();
      const after = await recordDryRun(db);
      // After both records: they still agree and nothing drifts; only invariant 3 breaks.
      await client.exec(`UPDATE "meal_items" SET "rating" = CASE WHEN "rating" = 1 THEN 2 ELSE 1 END
                          WHERE "id" = (SELECT "id" FROM "meal_items" WHERE "meal_id" = '${M(1)}' AND "rating" IS NOT NULL ORDER BY "position" LIMIT 1)`);
      const { pass, lines } = await compareDryRun(db, before, after);
      expect(allMatch(lines)).toBe(true);
      expect(line(lines, "drift after")).toBe("drift after the second heal: 0 meals");
      expect(line(lines, "invariant violations")).not.toBe("invariant violations: 0");
      expect(pass).toBe(false);
    });

    it("an item no backfill pass accounts for (an extra unrated copy of a food row)", async () => {
      const before = await recordDryRun(db);
      await boot();
      await client.exec(`INSERT INTO "meal_items" ("meal_id", "position", "food_id")
                         SELECT "meal_id", 99, "food_id" FROM "meal_items" WHERE "meal_id" = '${M(1)}' AND "food_id" IS NOT NULL ORDER BY "position" LIMIT 1`);
      const { pass, lines } = await compareDryRun(db, before, await recordDryRun(db));
      expect(allMatch(lines)).toBe(true);
      expect(line(lines, "drift after")).toBe("drift after the second heal: 0 meals");
      expect(line(lines, "invariant violations")).toBe("invariant violations: 0");
      expect(pass).toBe(false);
    });
  });

  it("ends 0024 with MEAL_ITEMS_BACKFILL verbatim", async () => {
    const file = await fs.readFile(path.join(migrationsFolder, "0024_meal_items.sql"), "utf8");
    expect(file.split("--> statement-breakpoint").at(-1)!.trim()).toBe(MEAL_ITEMS_BACKFILL.trim());
  });

  it("creates the table with its checks, defaults and cascades", async () => {
    await boot();
    await expect(client.exec(`INSERT INTO "meal_items" ("meal_id", "position") VALUES ('${M(1)}', 9)`)).rejects.toThrow(
      /meal_items_one_ref/,
    );
    await expect(
      client.exec(`INSERT INTO "meal_items" ("meal_id", "position", "food_id", "recipe_id") VALUES ('${M(1)}', 9, '${F(1)}', '${R(1)}')`),
    ).rejects.toThrow(/meal_items_one_ref/);
    await expect(
      client.exec(`INSERT INTO "meal_items" ("meal_id", "position", "food_id", "counted_food_ids") VALUES ('${M(1)}', 9, '${F(1)}', '{${F(2)}}')`),
    ).rejects.toThrow(/meal_items_counted_recipe_only/);
    await expect(client.exec(`UPDATE "meal_items" SET "rating" = 0`)).rejects.toThrow(/meal_items_rating_range/);
    await expect(client.exec(`UPDATE "meal_items" SET "rating" = 6`)).rejects.toThrow(/meal_items_rating_range/);

    // A new write's row: not inferred, counts nothing unless told.
    await client.exec(`INSERT INTO "meal_items" ("meal_id", "position", "food_id") VALUES ('${M(26)}', 1, '${F(9)}')`);
    expect(await rows(client, `SELECT "inferred", "counted_food_ids" FROM "meal_items" WHERE "meal_id" = '${M(26)}' AND "position" = 1`)).toEqual([
      { inferred: false, counted_food_ids: [] },
    ]);
    // A food delete takes its item rows (meal_foods does not hold Peas on m26).
    await client.exec(`DELETE FROM "recipe_ingredients" WHERE "food_id" = '${F(9)}'; DELETE FROM "storage_item_foods" WHERE "food_id" = '${F(9)}';
                       DELETE FROM "meal_foods" WHERE "food_id" = '${F(9)}'; DELETE FROM "foods" WHERE "id" = '${F(9)}'`);
    expect(await rows(client, `SELECT * FROM "meal_items" WHERE "food_id" = '${F(9)}'`)).toEqual([]);
    // A container delete keeps the rows and drops the link.
    await client.exec(`DELETE FROM "storage_items" WHERE "id" = '${X(1)}'`);
    expect((await itemsOf(client, M(5))).map((item) => item[2])).toEqual([null, null]);
    // A meal delete takes its items.
    await client.exec(`DELETE FROM "meals" WHERE "id" = '${M(7)}'`);
    expect(await rows(client, `SELECT * FROM "meal_items" WHERE "meal_id" = '${M(7)}'`)).toEqual([]);
  });
});

describe("healMealItems — what older writers leave behind", () => {
  let client: PGlite;
  let db: Database;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: stoppedAt0023 });
    await client.exec(SEED_0023);
    await migrate(db, { migrationsFolder });
  });

  afterEach(async () => {
    await client.close();
  });

  const heal = (mealIds?: string[]) => db.transaction((tx) => healMealItems(tx, mealIds));
  const idsOf = async (mealId: string) =>
    (await rows(client, `SELECT "id" FROM "meal_items" WHERE "meal_id" = '${mealId}' ORDER BY "position"`)).map((row) => row.id);

  it("repairs every old-image write, leaves other meals' rows alone, and a second run changes nothing", async () => {
    const untouched = await idsOf(M(13));
    // A new client's ratings on m12: R row 5, the C row 4 (mirror = 5).
    await client.exec(`UPDATE "meal_items" SET "rating" = CASE "position" WHEN 0 THEN 5 ELSE 4 END WHERE "meal_id" = '${M(12)}';
                       UPDATE "meal_recipes" SET "rating" = 5 WHERE "meal_id" = '${M(12)}';
                       UPDATE "meals" SET "recipe_rating" = 5 WHERE "id" = '${M(12)}'`);

    // What an older image (or an old bundle's legacy request) writes:
    await client.exec(`
      -- a new meal, legacy rows only
      INSERT INTO "meals" ("id", "baby_id", "served_at") VALUES ('${M(40)}', '${B1}', now());
      INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${M(40)}', '${F(3)}');
      -- a food added
      INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${M(1)}', '${F(8)}');
      -- a recipe removed, with its foods
      DELETE FROM "meal_recipes" WHERE "meal_id" = '${M(3)}' AND "recipe_id" = '${R(3)}';
      DELETE FROM "meal_foods" WHERE "meal_id" = '${M(3)}' AND "food_id" = '${F(3)}';
      -- recipes reordered (and the mirror rewritten, as every writer does)
      UPDATE "meal_recipes" SET "position" = 2 - "position" WHERE "meal_id" = '${M(21)}';
      UPDATE "meals" SET "recipe_id" = '${R(2)}', "recipe_rating" = NULL WHERE "id" = '${M(21)}';
      -- a food rated that only a recipe row counted
      UPDATE "meal_foods" SET "rating" = 3 WHERE "meal_id" = '${M(2)}' AND "food_id" = '${F(1)}';
      -- a container food re-rated, a recipe rated, a recipe rating cleared
      UPDATE "meal_foods" SET "rating" = 2 WHERE "meal_id" = '${M(5)}' AND "food_id" = '${F(1)}';
      UPDATE "meal_recipes" SET "rating" = 1 WHERE "meal_id" = '${M(15)}';
      UPDATE "meals" SET "recipe_rating" = 1 WHERE "id" = '${M(15)}';
      UPDATE "meal_recipes" SET "rating" = NULL WHERE "meal_id" = '${M(12)}';
      UPDATE "meals" SET "recipe_rating" = NULL WHERE "id" = '${M(12)}';
      -- custom food Replace (My mash -> Banana): the meal_foods merge, then the hard delete
      UPDATE "meal_foods" SET "rating" = 3 WHERE "meal_id" = '${M(8)}' AND "food_id" = '${F(1)}';
      DELETE FROM "meal_foods" WHERE "food_id" = '${F(10)}';
      DELETE FROM "foods" WHERE "id" = '${F(10)}';
    `);
    expect(await findDriftedMeals(db)).toEqual([M(1), M(2), M(3), M(21), M(40)].sort());

    await healMealRecipes(db);
    await heal();

    const items = async (mealId: string) =>
      (
        await rows(
          client,
          `SELECT coalesce("food_id", "recipe_id") AS "ref", "storage_item_id", "rating" FROM "meal_items" WHERE "meal_id" = '${mealId}' ORDER BY "position"`,
        )
      ).map((row) => [row.ref, row.storage_item_id, row.rating]);
    expect(await items(M(40))).toEqual([[F(3), null, null]]);
    expect(await items(M(1))).toEqual([
      [F(1), null, 5],
      [F(8), null, null],
      [F(3), null, null],
    ]);
    expect(await items(M(3))).toEqual([[R(1), null, 3]]);
    expect(await items(M(21))).toEqual([
      [R(2), X(15), null],
      [R(3), null, null],
      [R(1), X(15), null],
    ]);
    expect(await items(M(2))).toEqual([
      [R(1), null, 4],
      [F(1), null, 3],
    ]);
    // Ratings land on the first row only; a clear clears every row.
    expect(await items(M(5))).toEqual([
      [F(1), X(1), 2],
      [F(2), X(1), null],
    ]);
    expect(await items(M(15))).toEqual([[R(4), X(11), 1]]);
    expect(await items(M(12))).toEqual([
      [R(1), X(6), null],
      [R(1), X(5), null],
    ]);
    // Replace: the old food's row cascaded, the merged rating came back.
    expect(await items(M(8))).toEqual([[F(1), null, 3]]);
    // A meal no older writer touched keeps its very rows.
    expect(await idsOf(M(13))).toEqual(untouched);

    expect(await checkPlateInvariants(db)).toEqual({ violations: [], orphans: 2 });
    expect(await findDriftedMeals(db)).toEqual([]);
    const once = await itemRows(client);
    await heal();
    expect(await itemRows(client)).toEqual(once);
  });

  it("a rating the old client gives lands on ONE row, so a meal never counts it twice", async () => {
    await client.exec(`UPDATE "meal_recipes" SET "rating" = 4 WHERE "meal_id" = '${M(12)}';
                       UPDATE "meals" SET "recipe_rating" = 4 WHERE "id" = '${M(12)}'`);
    await heal();
    expect(await rows(client, `SELECT "position", "rating" FROM "meal_items" WHERE "meal_id" = '${M(12)}' ORDER BY "position"`)).toEqual([
      { position: 0, rating: 4 },
      { position: 1, rating: null },
    ]);
    // The same for a food: m13 holds Banana in two containers (REVIEW-c2 R2-1).
    await client.exec(`UPDATE "meal_foods" SET "rating" = 3 WHERE "meal_id" = '${M(13)}' AND "food_id" = '${F(1)}'`);
    await heal();
    expect(
      await rows(client, `SELECT "position", "rating" FROM "meal_items" WHERE "meal_id" = '${M(13)}' AND "food_id" = '${F(1)}' ORDER BY "position"`),
    ).toEqual([
      { position: 0, rating: 3 },
      { position: 2, rating: null },
    ]);
  });

  it("with meal ids, heals only those meals", async () => {
    await client.exec(`INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${M(1)}', '${F(8)}'), ('${M(26)}', '${F(8)}')`);
    await heal([M(1)]);
    expect(await findDriftedMeals(db)).toEqual([M(26)]);
    expect(await findDriftedMeals(db, [M(1)])).toEqual([]);
    await heal([]);
    expect(await findDriftedMeals(db)).toEqual([M(26)]);
    await heal();
    expect(await findDriftedMeals(db)).toEqual([]);
  });

  // One transaction: a failure after the DELETE must not leave a meal empty.
  it("a heal that fails part-way changes nothing, and the next run repairs", async () => {
    await client.exec(`INSERT INTO "meal_foods" ("meal_id", "food_id") VALUES ('${M(1)}', '${F(8)}')`);
    await client.exec(`
      CREATE FUNCTION heal_test_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'heal test boom'; END $$;
      CREATE TRIGGER heal_test_boom BEFORE INSERT ON "meal_items" FOR EACH ROW EXECUTE FUNCTION heal_test_boom();`);
    const before = await itemRows(client);
    await expect(heal()).rejects.toThrow(/heal test boom/);
    expect(await itemRows(client)).toEqual(before);

    await client.exec(`DROP TRIGGER heal_test_boom ON "meal_items"; DROP FUNCTION heal_test_boom();`);
    await heal();
    expect(await findDriftedMeals(db)).toEqual([]);
  });
});
