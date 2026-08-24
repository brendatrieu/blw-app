import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// db/seeds lives outside server/src (server/tsconfig.json's rootDir), so it
// can't be a static import without breaking `tsc --noEmit`'s rootDir check.
// A dynamic import with a computed specifier sidesteps that while still
// running the real seed pipeline against real seed data.
async function loadRunSeeds(): Promise<(db: Database) => Promise<void>> {
  const seedsIndexPath = path.resolve(__dirname, "../../db/seeds/index.js");
  const mod = (await import(pathToFileURL(seedsIndexPath).href)) as {
    runSeeds: (db: Database) => Promise<void>;
  };
  return mod.runSeeds;
}

// Guards the "every iron-high food has a pairing" plan requirement against
// silent regression (tahini shipped with zero pairing rows — see
// server/db/seeds/data/pairings.ts). Runs the real seed data through the
// real runSeeds() pipeline rather than hand-built fixtures, so a future gap
// in the actual content fails this test.
describe("food pairing completeness", () => {
  let close: () => Promise<void>;
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    close = testDb.close;
    const runSeeds = await loadRunSeeds();
    await runSeeds(db);
  });

  afterAll(async () => {
    await close();
  });

  it("gives every high-iron food at least one pairing row as the iron food", async () => {
    const ironHighFoods = await db
      .select({ id: schema.foods.id, slug: schema.foods.slug })
      .from(schema.foods)
      .where(eq(schema.foods.ironLevel, "high"));

    expect(ironHighFoods.length).toBeGreaterThan(0);

    const pairingRows = await db.select({ ironFoodId: schema.foodPairings.ironFoodId }).from(schema.foodPairings);
    const pairedIronFoodIds = new Set(pairingRows.map((r) => r.ironFoodId));

    const unpaired = ironHighFoods.filter((food) => !pairedIronFoodIds.has(food.id)).map((food) => food.slug);

    expect(unpaired).toEqual([]);
  });
});
