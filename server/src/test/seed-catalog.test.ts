import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createTestApp } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same dynamic-import dance as pairings.test.ts and basic-recipes.test.ts:
// db/seeds sits outside server/src (the tsconfig rootDir), so the specifier is
// computed — tsc stays out of it, and the REAL seed pipeline runs over the REAL
// seed data.
async function loadRunSeeds(): Promise<(db: Database) => Promise<void>> {
  const seedsIndexPath = path.resolve(__dirname, "../../db/seeds/index.js");
  const mod = (await import(pathToFileURL(seedsIndexPath).href)) as {
    runSeeds: (db: Database) => Promise<void>;
  };
  return mod.runSeeds;
}

/** Catalog size after the spices batch (ledger items 329-332). */
const CATALOG_FOOD_COUNT = 71;

/** The 12 spice/herb rows, in seed order. */
const SPICE_SLUGS = [
  "cinnamon",
  "cumin",
  "turmeric",
  "paprika",
  "curry_powder",
  "black_pepper",
  "oregano",
  "garlic",
  "ginger",
  "basil",
  "cilantro",
  "dill",
];

/** Every catalog food that carries each allergen, after the expansion. */
const ALLERGEN_CARRIERS: Record<string, string[]> = {
  tree_nut: ["almond_butter", "cashew_butter", "hazelnuts", "pecans", "pistachios", "walnuts"],
  fish: ["cod", "salmon", "sardines", "trout", "tuna"],
  sesame: ["sesame_seeds", "tahini"],
};

/**
 * The words the copy is allowed to say "no" with. Item 330's rule is that a
 * food whose safety depends on how it is prepared must actually forbid the
 * unsafe form somewhere a parent reads — a note that only describes the safe
 * form ("grind them to a meal") leaves "a handful of walnuts" unanswered.
 */
const PROHIBITION = /\bnever\b|stays? off the menu|\bavoid\b|\brather than\b/i;

interface HazardCopy {
  /** The preparation that makes the food safe, asserted on `chokingNotes`. */
  safeForm: RegExp;
  /** The unsafe form the note must still name, asserted on `chokingNotes`. */
  hazard: RegExp;
  /** The safe preparation, asserted on prep6m AND prep9m AND prep12m. */
  everyPrep: RegExp;
}

/**
 * Item 330's conservative choking copy, pinned per food.
 *
 * These are deliberately literal: for a food that is only safe in one form,
 * the sentence that says so IS the feature, and losing it is a safety
 * regression rather than a copy edit. Fragments are kept to the safety claim
 * itself (the required preparation, the named hazard) so ordinary rewording
 * around them still passes, but deleting or softening the claim cannot.
 *
 * Every entry also has to carry a PROHIBITION somewhere across its four
 * safety strings, and `hazardCopyCoversEveryHighRiskFood` below refuses to let
 * a new `chokingRisk: 'high'` food into the catalog without an entry here.
 */
const HAZARD_COPY: Record<string, HazardCopy> = {
  // ---- Seeds: bloomed, ground, hulled, or thinned (item 330) ----
  sesame_seeds: {
    safeForm: /sprinkle a pinch onto wet food/i,
    hazard: /dry spoonful/i,
    everyPrep: /\bpinch\b/i,
  },
  chia_seeds: {
    safeForm: /\bbloom\b|\bsoak\b/i,
    hazard: /swell and clump/i,
    everyPrep: /soak|gel/i,
  },
  flax_seeds: {
    safeForm: /\bgrind\b|\bground\b/i,
    hazard: /whole flaxseeds/i,
    everyPrep: /\bground\b/i,
  },
  hemp_seeds: {
    safeForm: /hulled hemp hearts/i,
    hazard: /\bshell\b/i,
    everyPrep: /hulled hemp hearts/i,
  },
  pumpkin_seeds: {
    safeForm: /fine meal|thinned runny/i,
    hazard: /whole pumpkin seeds/i,
    everyPrep: /\bgrind\b|\bground\b/i,
  },
  sunflower_seed_butter: {
    safeForm: /thin it until runny/i,
    hazard: /thick or sticky/i,
    everyPrep: /\brunny\b/i,
  },
  // ---- Tree nuts: ground to a meal or thinned runny, never a piece ----
  cashew_butter: {
    safeForm: /thin it until runny/i,
    hazard: /thick or sticky/i,
    everyPrep: /\brunny\b/i,
  },
  walnuts: {
    safeForm: /fine meal/i,
    hazard: /whole nuts and nut pieces/i,
    everyPrep: /\bgrind\b|\bground\b/i,
  },
  pistachios: {
    safeForm: /fine meal/i,
    hazard: /whole and chopped/i,
    everyPrep: /\bgrind\b|\bground\b/i,
  },
  hazelnuts: {
    safeForm: /fine meal|thinned runny/i,
    hazard: /whole and chopped/i,
    everyPrep: /\bgrind\b|\bground\b/i,
  },
  pecans: {
    safeForm: /fine meal/i,
    hazard: /halves and pieces/i,
    everyPrep: /\bgrind\b|\bground\b/i,
  },
  // ---- The spices whose safety is a shape, not a dose (item 330) ----
  garlic: {
    safeForm: /mince, crush, or roast/i,
    hazard: /whole or halved clove/i,
    everyPrep: /minced|crushed|roast|powder/i,
  },
  ginger: {
    safeForm: /grate it finely/i,
    hazard: /fibrous and stringy/i,
    everyPrep: /grate|grated|minced/i,
  },
  // ---- Pre-existing foods in the same hazard class, so a future edit to
  //      them is held to the same rule as the batch that added the rest. ----
  peanut_butter: {
    safeForm: /thin it until runny/i,
    hazard: /thick or sticky/i,
    everyPrep: /\brunny\b/i,
  },
  almond_butter: {
    safeForm: /thin it until runny/i,
    hazard: /thick or sticky/i,
    everyPrep: /\brunny\b/i,
  },
  tahini: {
    safeForm: /always thin it/i,
    hazard: /thick layer/i,
    everyPrep: /\bthin/i,
  },
  tomato: {
    safeForm: /quarter lengthwise/i,
    hazard: /\bwhole\b/i,
    everyPrep: /quarter|mash|dice/i,
  },
  apple: {
    safeForm: /cook until squishable/i,
    hazard: /\braw\b/i,
    everyPrep: /cook|grate/i,
  },
  blueberry: {
    safeForm: /smash flat or quarter/i,
    hazard: /whole blueberries/i,
    everyPrep: /smash|quarter/i,
  },
  carrot: {
    safeForm: /cook until it mashes/i,
    hazard: /\braw\b/i,
    everyPrep: /cook|steam|boil/i,
  },
};

/**
 * A digest of everything `runSeeds` writes into the three catalog tables that
 * can never be un-written by hand (`food_allergens` is insert-only). Keyed on
 * slugs rather than uuids so it is stable across databases, and sorted so row
 * order cannot change it.
 */
async function catalogChecksum(db: Database): Promise<{ counts: Record<string, number>; digest: string }> {
  const foodRows = await db
    .select({
      slug: schema.foods.slug,
      name: schema.foods.name,
      category: schema.foods.category,
      ironLevel: schema.foods.ironLevel,
      vitaminCLevel: schema.foods.vitaminCLevel,
      fiberLevel: schema.foods.fiberLevel,
      chokingRisk: schema.foods.chokingRisk,
      minAgeMonths: schema.foods.minAgeMonths,
      prep6m: schema.foods.prep6m,
      prep9m: schema.foods.prep9m,
      prep12m: schema.foods.prep12m,
      chokingNotes: schema.foods.chokingNotes,
      notes: schema.foods.notes,
      storageCategory: schema.foods.storageCategory,
    })
    .from(schema.foods)
    .where(isNull(schema.foods.ownerId));

  const recipeRows = await db
    .select({
      slug: schema.recipes.slug,
      title: schema.recipes.title,
      minAgeMonths: schema.recipes.minAgeMonths,
      prepMinutes: schema.recipes.prepMinutes,
      ironFocus: schema.recipes.ironFocus,
      extraIngredients: schema.recipes.extraIngredients,
    })
    .from(schema.recipes)
    .where(isNull(schema.recipes.ownerId));

  const linkRows = await db
    .select({ foodSlug: schema.foods.slug, allergenSlug: schema.allergens.slug })
    .from(schema.foodAllergens)
    .innerJoin(schema.foods, eq(schema.foodAllergens.foodId, schema.foods.id))
    .innerJoin(schema.allergens, eq(schema.foodAllergens.allergenId, schema.allergens.id));

  const serialize = (rows: unknown[]) =>
    rows.map((row) => JSON.stringify(row)).sort().join("\n");
  const digest = crypto
    .createHash("sha256")
    .update([serialize(foodRows), serialize(recipeRows), serialize(linkRows)].join("\n--\n"))
    .digest("hex");

  return {
    counts: { foods: foodRows.length, recipes: recipeRows.length, foodAllergens: linkRows.length },
    digest,
  };
}

/**
 * Ledger item 335. `pnpm db:seed` is never pointed at the dev database from a
 * test: this file runs the same `runSeeds()` the script calls against a
 * throwaway in-memory Postgres, wired to a real app so the catalog routes read
 * the real seeded rows.
 */
describe("seeded catalog after the spices expansion", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let firstPass: Awaited<ReturnType<typeof catalogChecksum>>;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    db = testApp.db;
    close = testApp.close;
    const runSeeds = await loadRunSeeds();
    await runSeeds(db);
    firstPass = await catalogChecksum(db);
  });

  afterAll(async () => {
    await close();
  });

  it("seeds exactly 71 catalog foods, 12 of them spices", async () => {
    const rows = await db
      .select({ slug: schema.foods.slug, category: schema.foods.category })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));

    expect(rows).toHaveLength(CATALOG_FOOD_COUNT);
    expect(rows.filter((r) => r.category === "spice").map((r) => r.slug).sort()).toEqual([...SPICE_SLUGS].sort());
  });

  it("gives every spice low/low/low levels, age 6, no allergen, and a dry or fresh storage window", async () => {
    const rows = await db
      .select({
        slug: schema.foods.slug,
        ironLevel: schema.foods.ironLevel,
        vitaminCLevel: schema.foods.vitaminCLevel,
        fiberLevel: schema.foods.fiberLevel,
        chokingRisk: schema.foods.chokingRisk,
        minAgeMonths: schema.foods.minAgeMonths,
        storageCategory: schema.foods.storageCategory,
      })
      .from(schema.foods)
      .where(eq(schema.foods.category, "spice"));
    expect(rows).toHaveLength(SPICE_SLUGS.length);

    const allergenLinks = await db
      .select({ slug: schema.foods.slug })
      .from(schema.foodAllergens)
      .innerJoin(schema.foods, eq(schema.foodAllergens.foodId, schema.foods.id))
      .where(eq(schema.foods.category, "spice"));
    expect(allergenLinks).toEqual([]);

    // A pinch is the serving, so no spice may claim a nutrition level — see
    // .workflow/scratch/catalog-expansion/sources.md for the per-100 g figures
    // and why they do not decide the badge.
    const wrong = rows.filter(
      (r) =>
        r.ironLevel !== "low" ||
        r.vitaminCLevel !== "low" ||
        r.fiberLevel !== "low" ||
        r.minAgeMonths !== 6 ||
        !["pantry_dry", "produce_raw_cut"].includes(r.storageCategory),
    );
    expect(wrong).toEqual([]);

    // Choking risk is about shape, not nutrition, so it is judged per food: a
    // raw garlic clove is firm, round and airway-sized (the same call whole
    // chickpeas get), while a powder, a grating or a chopped leaf is not.
    expect(rows.filter((r) => r.chokingRisk !== "low").map((r) => r.slug)).toEqual(["garlic"]);

    // Both storage categories are actually in use — a regression that filed
    // fresh herbs under the cupboard window would otherwise pass above.
    const byStorage = new Set(rows.map((r) => r.storageCategory));
    expect([...byStorage].sort()).toEqual(["pantry_dry", "produce_raw_cut"]);
    expect(rows.find((r) => r.slug === "cinnamon")?.storageCategory).toBe("pantry_dry");
    expect(rows.find((r) => r.slug === "basil")?.storageCategory).toBe("produce_raw_cut");
  });

  it("seeds the new pantry_dry storage guideline the dry goods point at", async () => {
    const [guideline] = await db
      .select()
      .from(schema.storageGuidelines)
      .where(eq(schema.storageGuidelines.category, "pantry_dry"));
    expect(guideline).toBeDefined();
    // Months, not hours: a sealed spice jar is not a 24-hour leftover.
    expect(guideline?.fridgeHours).toBeGreaterThan(24 * 30);
    expect(guideline?.roomTempHours).toBeGreaterThan(24 * 30);
    expect(guideline?.notes).toMatch(/rancid/i);
  });

  it("answers GET /api/foods?category=spice with the spices and nothing else", async () => {
    const response = await app.inject({ method: "GET", url: "/api/foods?category=spice" });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ foods: { slug: string; category: string }[] }>();

    expect(body.foods.map((f) => f.slug).sort()).toEqual([...SPICE_SLUGS].sort());
    expect(body.foods.every((f) => f.category === "spice")).toBe(true);
  });

  it("lists every carrier of the allergens the expansion touched", async () => {
    for (const [allergen, slugs] of Object.entries(ALLERGEN_CARRIERS)) {
      const response = await app.inject({ method: "GET", url: `/api/foods?allergen=${allergen}` });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ foods: { slug: string; allergens: string[] }[] }>();
      expect(body.foods.map((f) => f.slug).sort()).toEqual([...slugs].sort());
      expect(body.foods.every((f) => f.allergens.includes(allergen))).toBe(true);
    }
    expect(ALLERGEN_CARRIERS.tree_nut).toHaveLength(6);
    expect(ALLERGEN_CARRIERS.fish).toHaveLength(5);
    expect(ALLERGEN_CARRIERS.sesame).toHaveLength(2);
  });

  it("names the new carriers in the tree_nut, fish and sesame intro guidance", async () => {
    const rows = await db
      .select({ slug: schema.allergens.slug, introGuidance: schema.allergens.introGuidance })
      .from(schema.allergens)
      .orderBy(asc(schema.allergens.slug));
    const bySlug = new Map(rows.map((r) => [r.slug, r.introGuidance]));

    expect(bySlug.get("tree_nut")).toMatch(/cashew/i);
    expect(bySlug.get("tree_nut")).toMatch(/never whole or chopped nuts/i);
    expect(bySlug.get("fish")).toMatch(/cod/i);
    expect(bySlug.get("fish")).toMatch(/tuna/i);
    expect(bySlug.get("sesame")).toMatch(/sesame seeds/i);
  });

  it("carries the mercury limit on canned light tuna and never mentions honey", async () => {
    const [tuna] = await db
      .select({ name: schema.foods.name, notes: schema.foods.notes, chokingNotes: schema.foods.chokingNotes })
      .from(schema.foods)
      .where(eq(schema.foods.slug, "tuna"));
    expect(tuna?.name).toBe("Canned Light Tuna");
    expect(tuna?.notes).toMatch(/never albacore, white, or bigeye/i);
    expect(tuna?.notes).toMatch(/one small serving/i);

    // honey-salt-sugar.mdx: honey is off-limits in every form under 12 months,
    // so no seeded prep text may suggest it (item 330).
    const allText = await db
      .select({
        prep6m: schema.foods.prep6m,
        prep9m: schema.foods.prep9m,
        prep12m: schema.foods.prep12m,
        chokingNotes: schema.foods.chokingNotes,
        notes: schema.foods.notes,
      })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));
    const offenders = allText.filter((row) =>
      Object.values(row).some((value) => typeof value === "string" && /\bhoney\b/i.test(value)),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the conservative choking copy on every food that is only safe in one form", async () => {
    const rows = await db
      .select({
        slug: schema.foods.slug,
        prep6m: schema.foods.prep6m,
        prep9m: schema.foods.prep9m,
        prep12m: schema.foods.prep12m,
        chokingNotes: schema.foods.chokingNotes,
      })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));
    const bySlug = new Map(rows.map((r) => [r.slug, r]));

    // Collected rather than asserted one at a time: a deletion should report
    // every sentence it took out, not just the first.
    const failures: string[] = [];
    for (const [slug, copy] of Object.entries(HAZARD_COPY)) {
      const row = bySlug.get(slug);
      if (!row) {
        failures.push(`${slug}: missing from the catalog`);
        continue;
      }
      const notes = row.chokingNotes ?? "";
      if (!copy.safeForm.test(notes)) {
        failures.push(`${slug}: chokingNotes no longer gives the safe form ${copy.safeForm} — got "${notes}"`);
      }
      if (!copy.hazard.test(notes)) {
        failures.push(`${slug}: chokingNotes no longer names the hazard ${copy.hazard} — got "${notes}"`);
      }
      for (const stage of ["prep6m", "prep9m", "prep12m"] as const) {
        if (!copy.everyPrep.test(row[stage])) {
          failures.push(`${slug}.${stage} no longer says ${copy.everyPrep} — got "${row[stage]}"`);
        }
      }
      const safetyText = [notes, row.prep6m, row.prep9m, row.prep12m].join(" ");
      if (!PROHIBITION.test(safetyText)) {
        failures.push(`${slug}: nothing in the safety copy forbids the unsafe form (${PROHIBITION})`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("requires a pinned safety sentence for every high-choking-risk food", async () => {
    // The completeness half: a 12th nut, or any new food bucketed `high`, has
    // to arrive with its copy pinned in HAZARD_COPY above rather than slipping
    // in unguarded — which is exactly how the copy came to be undefended.
    const rows = await db
      .select({ slug: schema.foods.slug, chokingNotes: schema.foods.chokingNotes })
      .from(schema.foods)
      .where(and(eq(schema.foods.chokingRisk, "high"), isNull(schema.foods.ownerId)));

    expect(rows.filter((r) => !r.chokingNotes?.trim()).map((r) => r.slug)).toEqual([]);
    expect(rows.filter((r) => !Object.hasOwn(HAZARD_COPY, r.slug)).map((r) => r.slug)).toEqual([]);
    // The 13 the catalog holds today (4 produce, 3 butters, 5 nuts, pumpkin
    // seeds) — a food dropping OUT of `high` is a safety change too.
    expect(rows).toHaveLength(13);
  });

  it("re-seeds without changing a single catalog row", async () => {
    const runSeeds = await loadRunSeeds();
    await runSeeds(db);
    const secondPass = await catalogChecksum(db);

    // Row counts AND content: an upsert that rewrote a column, or an
    // insert-only link table that gained a duplicate, both fail here.
    expect(secondPass.counts).toEqual(firstPass.counts);
    expect(secondPass.digest).toBe(firstPass.digest);
    expect(firstPass.counts.foods).toBe(CATALOG_FOOD_COUNT);
    expect(firstPass.counts.recipes).toBe(74);
  });
});
