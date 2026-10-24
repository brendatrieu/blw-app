import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eq, inArray, isNull } from "drizzle-orm";
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

    const pairingRows = await db
      .select({ ironFoodId: schema.foodPairings.ironFoodId })
      .from(schema.foodPairings);
    const pairedIronFoodIds = new Set(pairingRows.map((r) => r.ironFoodId));

    const unpaired = ironHighFoods
      .filter((food) => !pairedIronFoodIds.has(food.id))
      .map((food) => food.slug);

    expect(unpaired).toEqual([]);
  });
  // 853: the iron foods added in the 2026-10-15/16 rounds each get a pairing (their notes name
  // one), every partner really is a vitamin-C food, and no pairing uses an info-only food.
  it("pairs the 10-15/16 round iron foods and only uses real vitamin-C partners", async () => {
    const all = await db
      .select({
        id: schema.foods.id,
        slug: schema.foods.slug,
        vitC: schema.foods.vitaminCLevel,
        kind: schema.foods.kind,
      })
      .from(schema.foods);
    const byId = new Map(all.map((f) => [f.id, f]));
    const rows = await db.select().from(schema.foodPairings);

    for (const r of rows) {
      const vitC = byId.get(r.vitCFoodId);
      expect([vitC?.slug, vitC?.vitC]).toEqual([
        vitC?.slug,
        expect.stringMatching(/^(high|moderate)$/),
      ]);
      expect(vitC?.kind).not.toBe("info");
      expect(byId.get(r.ironFoodId)?.kind).not.toBe("info");
    }

    const roundSlugs = [
      "kidney_beans",
      "pinto_beans",
      "white_beans",
      "butter_beans",
      "edamame",
      "brussels_sprouts",
      // 871: the round's vitamin-C foods get a pairing as the partner (owner: Kale page).
      "kale",
      "cranberries",
    ];
    const round = await db
      .select({ id: schema.foods.id, slug: schema.foods.slug })
      .from(schema.foods)
      .where(inArray(schema.foods.slug, roundSlugs));
    expect(round).toHaveLength(roundSlugs.length);
    const pairedIds = new Set(rows.flatMap((r) => [r.ironFoodId, r.vitCFoodId]));
    expect(round.filter((f) => !pairedIds.has(f.id)).map((f) => f.slug)).toEqual([]);
  });

  // 880 + 883b: the partners these foods' notes used to name now live in the pairing section, so
  // the section must hold every one of them (the notes dropped the lists).
  it("pairs every partner the notes used to name", async () => {
    const all = await db.select({ id: schema.foods.id, slug: schema.foods.slug }).from(schema.foods);
    const slugOf = new Map(all.map((f) => [f.id, f.slug]));
    const rows = await db.select().from(schema.foodPairings);
    const partnersOf = (slug: string) =>
      rows
        .flatMap((r) => {
          const iron = slugOf.get(r.ironFoodId);
          const vitC = slugOf.get(r.vitCFoodId);
          return iron === slug ? [vitC] : vitC === slug ? [iron] : [];
        })
        .sort();
    const named: Record<string, string[]> = {
      cranberries: ["beef", "iron_fortified_oats", "turkey"],
      kale: ["beef", "chickpeas", "egg", "lentils", "tofu"],
      brussels_sprouts: ["beef", "lentils"],
      lentils: ["bell_pepper", "tomato"],
      kidney_beans: ["bell_pepper", "tomato"],
      pinto_beans: ["bell_pepper", "tomato"],
      white_beans: ["bell_pepper", "broccoli", "tomato"],
      butter_beans: ["broccoli", "tomato"],
      edamame: ["bell_pepper", "broccoli"],
      // 883b
      chickpeas: ["orange", "tomato"],
      black_beans: ["bell_pepper", "orange"],
      tofu: ["broccoli"],
      spinach: ["kiwi"],
      quinoa: ["mango"],
      broccoli: ["beef", "lentils", "tofu"],
      cauliflower: ["beef", "lentils"],
      bell_pepper: ["beef", "chickpeas", "lentils"],
      strawberry: ["iron_fortified_oats"],
      orange: ["beef", "chicken"],
      kiwi: ["spinach"],
      mango: ["quinoa"],
      tomato: ["salmon", "sardines"],
      sweet_potato: ["beef", "chicken_thigh"],
      butternut_squash: ["chicken_thigh"],
    };
    for (const [slug, partners] of Object.entries(named)) {
      expect([slug, partnersOf(slug)]).toEqual([slug, expect.arrayContaining(partners)]);
    }
  });

  // 883b (owner: "do for whole catalog"; Potato had no section): every catalog food — not a spice,
  // ingredient or info food — with moderate/high vitamin C has an iron partner, and every one with
  // moderate/high iron has a vitamin-C partner. A food that is both needs only the side that makes
  // sense; these are the only exceptions, and each must still be paired on its other side.
  it("pairs every iron and vitamin-C food in the catalog", async () => {
    const exempt: Record<string, "iron" | "vitaminC"> = {
      // Their own high vitamin C already helps absorb their moderate iron: paired as the vitamin-C side.
      brussels_sprouts: "iron",
      peas: "iron",
      // Its oxalates hold back iron absorption, so it isn't offered as another food's vitamin-C
      // partner: paired as the iron side (with an extra vitamin-C food, as its notes say).
      spinach: "vitaminC",
    };
    const all = await db
      .select({
        id: schema.foods.id,
        slug: schema.foods.slug,
        kind: schema.foods.kind,
        category: schema.foods.category,
        iron: schema.foods.ironLevel,
        vitC: schema.foods.vitaminCLevel,
      })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));
    const rows = await db.select().from(schema.foodPairings);
    const asIron = new Set(rows.map((r) => r.ironFoodId));
    const asVitC = new Set(rows.map((r) => r.vitCFoodId));
    const notable = (level: string | undefined) => level === "moderate" || level === "high";

    const missing: string[] = [];
    for (const f of all) {
      if (f.kind !== "food" || f.category === "spice") continue;
      if (notable(f.iron) && exempt[f.slug] !== "iron" && !asIron.has(f.id)) missing.push(`${f.slug}: no vitamin-C partner`);
      if (notable(f.vitC) && exempt[f.slug] !== "vitaminC" && !asVitC.has(f.id)) missing.push(`${f.slug}: no iron partner`);
    }
    expect(missing).toEqual([]);

    const bySlug = new Map(all.map((f) => [f.slug, f]));
    for (const [slug, side] of Object.entries(exempt)) {
      const f = bySlug.get(slug);
      expect([slug, notable(f?.iron) && notable(f?.vitC)]).toEqual([slug, true]);
      expect([slug, (side === "iron" ? asVitC : asIron).has(f?.id ?? "")]).toEqual([slug, true]);
    }

    // The iron side of every pairing really is an iron food (the vitamin-C side is checked above).
    const byId = new Map(all.map((f) => [f.id, f]));
    expect(rows.filter((r) => !notable(byId.get(r.ironFoodId)?.iron)).map((r) => byId.get(r.ironFoodId)?.slug)).toEqual([]);
  });
});
