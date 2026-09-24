import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same dodge as pairings.test.ts: db/seeds lives outside server/src (the
// tsconfig rootDir), so it is imported dynamically through a computed
// specifier rather than statically.
async function loadRunSeeds(): Promise<(db: Database) => Promise<void>> {
  const seedsIndexPath = path.resolve(__dirname, "../../db/seeds/index.js");
  const mod = (await import(pathToFileURL(seedsIndexPath).href)) as {
    runSeeds: (db: Database) => Promise<void>;
  };
  return mod.runSeeds;
}

/**
 * The curated per-food fiber levels (ledger item 276) checked against the real
 * seed pipeline rather than a fixture, so a level that silently reverts to the
 * column default fails here.
 *
 * The spot-checked values below come from USDA FoodData Central per 100 g,
 * recorded with a source URL each in
 * `.workflow/scratch/fiber/sources.md`, and bucketed by that item's rule:
 * >= 3 g high, >= 1.5 g moderate, < 1.5 g low.
 */
const EXPECTED_FIBER_LEVEL: Record<string, "high" | "moderate" | "low"> = {
  lentils: "high", // 7.9 g, cooked
  peas: "high", // 5.5 g, cooked
  pear: "high", // 3.1 g, raw
  carrot: "high", // 3.0 g, cooked — exactly on the >= 3 boundary
  wheat_toast: "high", // 4.7 g
  banana: "moderate", // 2.6 g, raw
  quinoa: "moderate", // 2.8 g, cooked
  iron_fortified_oats: "moderate", // 1.7 g, prepared with water
  rice: "low", // 0.4 g, white long-grain cooked
  watermelon: "low", // 0.4 g, raw
  beef: "low", // 0 g — meat carries none
  yogurt: "low", // 0 g
  // Item 335, from .workflow/scratch/catalog-expansion/sources.md (same rule,
  // same per-100 g convention: the form the app actually serves).
  oats: "moderate", // 1.7 g, rolled/quick cooked with water — same as the fortified kind
  chia_seeds: "high", // 34.4 g, dried
  cashew_butter: "moderate", // 2.0 g, plain without salt — the one nut/seed here under 3 g
  cod: "low", // 0 g, Atlantic, cooked
  // Item 342, same sources file and the same rule. Cashews sit just over the
  // 3 g line, so a row that reused the cashew-BUTTER figure (2.0 g) would fail
  // here rather than ship a `moderate` badge on the whole nut.
  almonds: "high", // 12.5 g, whole nuts
  cashews: "high", // 3.3 g, raw
  // Item 356, .workflow/scratch/catalog-expansion/sources.md §11 (fdcId 170093,
  // baked flesh and skin without salt). 2.2 g is the one place potato parts
  // company with the other roots: sweet potato (3.3 g) and carrot (3.0 g) are
  // both `high`, and a row that copied either would fail here.
  potato: "moderate", // 2.2 g, baked flesh and skin
  // Item 508 (fdcId 170397, boiled without salt). Broccoli beside it is `high`,
  // and a row that copied broccoli's would fail here.
  cauliflower: "moderate", // 2.3 g, boiled
};

describe("seeded fiber levels", () => {
  let close: () => Promise<void>;
  let db: Database;
  let runSeeds: (db: Database) => Promise<void>;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    close = testDb.close;
    runSeeds = await loadRunSeeds();
    await runSeeds(db);
  });

  afterAll(async () => {
    await close();
  });

  it("gives every seeded food a curated level, spanning all three", async () => {
    const rows = await db.select({ slug: schema.foods.slug, fiberLevel: schema.foods.fiberLevel }).from(schema.foods);
    expect(rows.length).toBeGreaterThan(0);

    const bySlug = new Map(rows.map((r) => [r.slug, r.fiberLevel]));
    for (const [slug, level] of Object.entries(EXPECTED_FIBER_LEVEL)) {
      expect(`${slug}=${bySlug.get(slug)}`).toBe(`${slug}=${level}`);
    }

    // All three levels are represented, so a seeder that dropped the column
    // and left every row on the `low` default cannot pass.
    const levels = new Set(rows.map((r) => r.fiberLevel));
    expect([...levels].sort()).toEqual(["high", "low", "moderate"]);
  });

  it("re-seeding corrects a drifted fiber level (the upsert writes the column)", async () => {
    await db.update(schema.foods).set({ fiberLevel: "low" }).where(eq(schema.foods.slug, "lentils"));
    const [drifted] = await db
      .select({ fiberLevel: schema.foods.fiberLevel })
      .from(schema.foods)
      .where(eq(schema.foods.slug, "lentils"));
    expect(drifted?.fiberLevel).toBe("low");

    await runSeeds(db);

    const [restored] = await db
      .select({ fiberLevel: schema.foods.fiberLevel })
      .from(schema.foods)
      .where(eq(schema.foods.slug, "lentils"));
    expect(restored?.fiberLevel).toBe("high");
  });
});
