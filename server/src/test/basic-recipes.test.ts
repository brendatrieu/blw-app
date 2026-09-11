import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same dynamic-import dance as pairings.test.ts: db/seeds lives outside
// server/src (the tsconfig rootDir), so a static import would break
// `tsc --noEmit`. The specifier is computed, which keeps tsc out of it while
// still running the REAL seed pipeline over the REAL seed data.
async function loadRunSeeds(): Promise<(db: Database) => Promise<void>> {
  const seedsIndexPath = path.resolve(__dirname, "../../db/seeds/index.js");
  const mod = (await import(pathToFileURL(seedsIndexPath).href)) as {
    runSeeds: (db: Database) => Promise<void>;
  };
  return mod.runSeeds;
}

/** The 15 curated recipes that shipped before the single-food basics. */
const CURATED_SLUGS = [
  "beef-sweet-potato-strips",
  "salmon-oat-patties",
  "lentil-veggie-fritters",
  "banana-pb-oat-pancakes",
  "veggie-omelet-fingers",
  "broccoli-cheese-egg-muffins",
  "overnight-oats-chia-pear",
  "chicken-apple-meatballs",
  "hummus-avocado-toast-fingers",
  "tofu-nuggets",
  "sardine-mash-on-toast",
  "chickpea-sweet-potato-mild-curry",
  "zucchini-quinoa-bites",
  "apple-cinnamon-tahini-porridge",
  "greek-yogurt-with-smashed-berries",
];

/**
 * Ledger item 254. `pnpm db:seed` is never run against the dev database from
 * a test — this proves the same `runSeeds()` the script calls, against a
 * throwaway in-memory Postgres, and proves it TWICE so the "idempotent upsert
 * by slug" claim is a tested property rather than a comment.
 */
describe("single-food basic recipes", () => {
  let close: () => Promise<void>;
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    close = testDb.close;
    const runSeeds = await loadRunSeeds();
    // Twice: the second pass must upsert, not duplicate or fail.
    await runSeeds(db);
    await runSeeds(db);
  });

  afterAll(async () => {
    await close();
  });

  /** Every catalog recipe with its ingredient food slugs, keyed by slug. */
  async function catalogRecipes() {
    const recipeRows = await db
      .select({
        id: schema.recipes.id,
        slug: schema.recipes.slug,
        title: schema.recipes.title,
        minAgeMonths: schema.recipes.minAgeMonths,
      })
      .from(schema.recipes)
      .where(isNull(schema.recipes.ownerId));

    const ingredientRows = await db
      .select({ recipeId: schema.recipeIngredients.recipeId, foodSlug: schema.foods.slug })
      .from(schema.recipeIngredients)
      .innerJoin(schema.foods, eq(schema.recipeIngredients.foodId, schema.foods.id));

    const foodSlugsByRecipeId = new Map<string, string[]>();
    for (const row of ingredientRows) {
      const list = foodSlugsByRecipeId.get(row.recipeId) ?? [];
      list.push(row.foodSlug);
      foodSlugsByRecipeId.set(row.recipeId, list);
    }

    return recipeRows.map((r) => ({ ...r, foodSlugs: foodSlugsByRecipeId.get(r.id) ?? [] }));
  }

  it("gives every catalog food exactly one single-ingredient recipe of its own", async () => {
    const foodRows = await db
      .select({ slug: schema.foods.slug, minAgeMonths: schema.foods.minAgeMonths })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));
    expect(foodRows.length).toBeGreaterThan(0);

    const recipes = await catalogRecipes();
    const singleIngredient = recipes.filter((r) => r.foodSlugs.length === 1);

    // "Exactly one" in both directions: no food is missed, and no food has two.
    const countByFoodSlug = new Map<string, number>();
    for (const recipe of singleIngredient) {
      const foodSlug = recipe.foodSlugs[0];
      if (foodSlug === undefined) continue;
      countByFoodSlug.set(foodSlug, (countByFoodSlug.get(foodSlug) ?? 0) + 1);
    }

    const wrong = foodRows
      .map((food) => ({ slug: food.slug, count: countByFoodSlug.get(food.slug) ?? 0 }))
      .filter((entry) => entry.count !== 1);
    expect(wrong).toEqual([]);
    expect(singleIngredient).toHaveLength(foodRows.length);
  });

  it("matches each basic recipe's minimum age, slug, and title to its food", async () => {
    const foodRows = await db
      .select({ slug: schema.foods.slug, name: schema.foods.name, minAgeMonths: schema.foods.minAgeMonths })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));

    const bySlug = new Map((await catalogRecipes()).map((r) => [r.slug, r]));

    const mismatches = foodRows.flatMap((food) => {
      const expectedSlug = `simple-${food.slug.replace(/_/g, "-")}`;
      const recipe = bySlug.get(expectedSlug);
      if (!recipe) return [{ food: food.slug, problem: "missing" }];
      const problems: { food: string; problem: string }[] = [];
      if (recipe.foodSlugs.length !== 1 || recipe.foodSlugs[0] !== food.slug) {
        problems.push({ food: food.slug, problem: `ingredients ${recipe.foodSlugs.join(",")}` });
      }
      if (recipe.minAgeMonths !== food.minAgeMonths) {
        problems.push({ food: food.slug, problem: `minAgeMonths ${String(recipe.minAgeMonths)}` });
      }
      if (recipe.title !== `Simple ${food.name.toLowerCase()}`) {
        problems.push({ food: food.slug, problem: `title ${recipe.title}` });
      }
      return problems;
    });

    expect(mismatches).toEqual([]);
    // Shrimp is the one food held past 6 months, so it is the one basic that
    // must not claim to be a 6-month recipe.
    expect(bySlug.get("simple-shrimp")?.minAgeMonths).toBe(9);
  });

  it("carries a variant for every stage the food allows, and none below it", async () => {
    const recipes = await catalogRecipes();
    const bySlug = new Map(recipes.map((r) => [r.slug, r]));

    const variantRows = await db
      .select({ recipeId: schema.recipeVariants.recipeId, ageStage: schema.recipeVariants.ageStage })
      .from(schema.recipeVariants);
    const stagesByRecipeId = new Map<string, string[]>();
    for (const row of variantRows) {
      const list = stagesByRecipeId.get(row.recipeId) ?? [];
      list.push(row.ageStage);
      stagesByRecipeId.set(row.recipeId, list);
    }

    const sixMonthBasic = bySlug.get("simple-sweet-potato");
    expect(sixMonthBasic).toBeDefined();
    expect([...(stagesByRecipeId.get(sixMonthBasic?.id ?? "") ?? [])].sort()).toEqual(["12", "6", "9"]);

    const shrimp = bySlug.get("simple-shrimp");
    expect(shrimp).toBeDefined();
    expect([...(stagesByRecipeId.get(shrimp?.id ?? "") ?? [])].sort()).toEqual(["12", "9"]);

    // No basic recipe may carry a variant for a stage below its own minimum.
    const tooEarly = recipes
      .filter((r) => r.slug.startsWith("simple-") && r.minAgeMonths > 6)
      .filter((r) => (stagesByRecipeId.get(r.id) ?? []).includes("6"))
      .map((r) => r.slug);
    expect(tooEarly).toEqual([]);
  });

  it("gives every basic variant 3-6 steps and a texture note", async () => {
    const basicIds = new Set(
      (await catalogRecipes()).filter((r) => r.slug.startsWith("simple-")).map((r) => r.id),
    );

    const variantRows = await db
      .select({
        recipeId: schema.recipeVariants.recipeId,
        ageStage: schema.recipeVariants.ageStage,
        textureNote: schema.recipeVariants.textureNote,
        instructions: schema.recipeVariants.instructions,
      })
      .from(schema.recipeVariants);

    const bad = variantRows
      .filter((v) => basicIds.has(v.recipeId))
      .filter((v) => v.textureNote.trim() === "" || v.instructions.length < 3 || v.instructions.length > 6);
    expect(bad).toEqual([]);
  });

  /**
   * Ledger item 266. Runs over the seeded catalog, which is BOTH recipe files
   * (recipes.ts exports the curated 15 followed by the 40 basics), so a step
   * added to either file is covered.
   */
  const COOKING_VERB = /\b(?:roast|bake|steam|boil|simmer|saut[eé]|fry|poach|scramble|toast|cook)\b/i;
  /** °F / °C, or a stovetop heat setting ("medium heat", "medium-low heat", "low heat"). */
  const TEMPERATURE = /\d\s*°\s*[FC]|\b(?:high|medium|low)(?:-(?:high|medium|low))?\s+heat\b/i;
  /** A clock time ("10-12 minutes", "30 seconds", "2-3 hours") or a "until …" doneness cue. */
  const TIME = /\b\d+(?:\s*[-–]\s*\d+)?\s*(?:second|minute|hour)s?\b|\buntil\b/i;

  /** Every seeded catalog variant, with its recipe slug and stage. */
  async function catalogVariants() {
    const recipeRows = await catalogRecipes();
    const byId = new Map(recipeRows.map((r) => [r.id, r]));
    const variantRows = await db
      .select({
        recipeId: schema.recipeVariants.recipeId,
        ageStage: schema.recipeVariants.ageStage,
        textureNote: schema.recipeVariants.textureNote,
        instructions: schema.recipeVariants.instructions,
      })
      .from(schema.recipeVariants);
    return variantRows.flatMap((v) => {
      const recipe = byId.get(v.recipeId);
      return recipe ? [{ ...v, slug: recipe.slug, foodSlugs: recipe.foodSlugs }] : [];
    });
  }

  it("gives every cooking step a temperature or a time", async () => {
    const variants = await catalogVariants();
    // 55 recipes: the curated 15 (3 stages each) plus 40 basics (39 x 3 + shrimp's 2).
    expect(new Set(variants.map((v) => v.slug)).size).toBe(55);

    const cookingSteps = variants.flatMap((v) =>
      v.instructions
        .map((step, index) => ({ slug: v.slug, stage: v.ageStage, index, step }))
        .filter((s) => COOKING_VERB.test(s.step)),
    );
    // Guard the guard: if a refactor stopped matching cooking verbs entirely,
    // the filter below would pass vacuously.
    expect(cookingSteps.length).toBeGreaterThan(100);

    const undated = cookingSteps.filter((s) => !TEMPERATURE.test(s.step) && !TIME.test(s.step));
    expect(undated).toEqual([]);
  });

  it("gives every oven step a temperature in both °F and °C", async () => {
    const variants = await catalogVariants();
    const ovenSteps = variants.flatMap((v) =>
      v.instructions
        .map((step, index) => ({ slug: v.slug, stage: v.ageStage, index, step }))
        .filter((s) => /\b(?:bake|roast)\b/i.test(s.step)),
    );
    expect(ovenSteps.length).toBeGreaterThan(10);

    // The OVEN temperature must sit in the bake/roast clause itself (no
    // period or semicolon between) and be an oven figure (300–499°F) — an
    // internal-temperature cue like "until it reads 165°F (74°C)" elsewhere
    // in the sentence must not satisfy this.
    const OVEN_TEMP_IN_CLAUSE =
      /\b(?:bake|roast)\b[^.;]*?\b[34]\d{2}\s*°F\s*\(\s*\d{3}\s*°C\s*\)|\b[34]\d{2}\s*°F\s*\(\s*\d{3}\s*°C\s*\)[^.;]*?\b(?:bake|roast)\b/i;
    const missingUnits = ovenSteps.filter((s) => !OVEN_TEMP_IN_CLAUSE.test(s.step));
    expect(missingUnits).toEqual([]);
  });

  it("adds no cooking step to a food that is served raw", async () => {
    // Every basic whose food's prep text never cooks it. A regression that
    // sneaks "bake the banana" in would otherwise pass every other guard.
    const RAW_SERVED = [
      "simple-sardines",
      "simple-strawberry",
      "simple-orange",
      "simple-kiwi",
      "simple-mango",
      "simple-yogurt",
      "simple-cheese",
      "simple-avocado",
      "simple-banana",
      "simple-blueberry",
      "simple-watermelon",
    ];
    const variants = await catalogVariants();
    const offenders = variants
      .filter((v) => RAW_SERVED.includes(v.slug))
      .flatMap((v) =>
        v.instructions
          .map((step, index) => ({ slug: v.slug, stage: v.ageStage, index, step }))
          .filter((s) => COOKING_VERB.test(s.step)),
      );
    expect(variants.filter((v) => RAW_SERVED.includes(v.slug)).length).toBeGreaterThanOrEqual(RAW_SERVED.length);
    expect(offenders).toEqual([]);
  });

  it("cites the safe minimum internal temperature in every meat, fish, and egg basic", async () => {
    // USDA/FSIS + FDA figures, recorded in .workflow/scratch/recipe-detail/sources.md.
    const required: [string, RegExp][] = [
      ["simple-beef", /160°F \(71°C\)/],
      ["simple-chicken-thigh", /165°F \(74°C\)/],
      ["simple-salmon", /145°F \(63°C\)/],
      ["simple-shrimp", /145°F \(63°C\)/],
      ["simple-egg", /yolk and (?:the )?white are firm/i],
    ];
    const variants = await catalogVariants();

    const missing = required.flatMap(([slug, pattern]) => {
      const stages = variants.filter((v) => v.slug === slug);
      if (stages.length === 0) return [{ slug, problem: "no variants seeded" }];
      return stages
        .filter((v) => !v.instructions.some((step) => pattern.test(step)))
        .map((v) => ({ slug, problem: `stage ${v.ageStage} never cites ${String(pattern)}` }));
    });
    expect(missing).toEqual([]);
  });

  /**
   * Ledger item 267's prep guard: a basic recipe's texture note may not drift
   * from the shape its food's own prep text prescribes for that stage. Only
   * enforced where the prep text actually names a shape — tahini and the nut
   * butters describe a consistency ("runny", "thin layer"), not a cut.
   */
  const SHAPE_WORDS = [
    "strip",
    "stick",
    "mash",
    "pea-sized",
    "shred",
    "dice",
    "wedge",
    "spear",
    "puree",
    "finger",
    "bite",
  ];

  it("keeps every basic texture note on the shape words its food's prep text uses", async () => {
    const foodRows = await db
      .select({
        slug: schema.foods.slug,
        prep6m: schema.foods.prep6m,
        prep9m: schema.foods.prep9m,
        prep12m: schema.foods.prep12m,
      })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));
    const prepByFood = new Map(
      foodRows.map((f) => [f.slug, { "6": f.prep6m, "9": f.prep9m, "12": f.prep12m }]),
    );

    const basics = (await catalogVariants()).filter((v) => v.slug.startsWith("simple-"));
    expect(basics.length).toBeGreaterThan(100);

    let checked = 0;
    const drifted = basics.flatMap((v) => {
      const foodSlug = v.foodSlugs[0];
      const prep = foodSlug === undefined ? undefined : prepByFood.get(foodSlug);
      const prepText = prep?.[v.ageStage as "6" | "9" | "12"];
      if (prepText === undefined) return [{ slug: v.slug, problem: "no prep text for stage" }];

      const wanted = SHAPE_WORDS.filter((w) => prepText.toLowerCase().includes(w));
      if (wanted.length === 0) return []; // prep text names no shape — nothing to share
      checked += 1;
      const note = v.textureNote.toLowerCase();
      if (wanted.some((w) => note.includes(w))) return [];
      return [{ slug: v.slug, problem: `stage ${v.ageStage} shares none of ${wanted.join("/")}` }];
    });

    expect(drifted).toEqual([]);
    // Most basics DO name a shape; if this collapsed the test would be hollow.
    expect(checked).toBeGreaterThan(80);
  });

  // Item 298: the seed data is where a leading quantity is split off, so the
  // stored objects are checked against the REAL seeded rows rather than a
  // fixture — a split that lost a word fails here.
  it("seeds every extra ingredient as an object, splitting an obvious leading quantity", async () => {
    const rows = await db
      .select({ slug: schema.recipes.slug, extraIngredients: schema.recipes.extraIngredients })
      .from(schema.recipes)
      .where(isNull(schema.recipes.ownerId));
    const bySlug = new Map(rows.map((row) => [row.slug, row.extraIngredients ?? []]));

    // One curated recipe and one basic, pinned exactly.
    expect(bySlug.get("beef-sweet-potato-strips")).toEqual([
      { name: "olive oil", quantityNote: "" },
      { name: "cumin (optional)", quantityNote: "pinch of" },
    ]);
    expect(bySlug.get("simple-egg")).toEqual([
      { name: "breast milk, formula, or water, to loosen", quantityNote: "a splash of" },
    ]);

    for (const [slug, extras] of bySlug) {
      for (const extra of extras) {
        // Every entry is a real object with a non-empty name, and nothing
        // still reads like a leading quantity waiting to be split.
        expect(typeof extra.name, slug).toBe("string");
        expect(extra.name.trim(), slug).toBe(extra.name);
        expect(extra.name.length, slug).toBeGreaterThan(0);
        expect(typeof extra.quantityNote, slug).toBe("string");
        expect(extra.name, slug).not.toMatch(/^(a pinch of|pinch of|a splash of|a little|a drizzle of|drizzle of|squeeze of|\d)/i);
      }
    }
  });

  it("leaves the 15 curated recipes in place, un-duplicated, after re-seeding", async () => {
    const recipes = await catalogRecipes();
    const slugs = recipes.map((r) => r.slug);

    for (const slug of CURATED_SLUGS) {
      expect(slugs.filter((s) => s === slug)).toHaveLength(1);
    }
    // The curated 15 all have more than one ingredient, so the "one basic per
    // food" count above can never have been satisfied by one of them.
    const curated = recipes.filter((r) => CURATED_SLUGS.includes(r.slug));
    expect(curated).toHaveLength(CURATED_SLUGS.length);
    expect(curated.filter((r) => r.foodSlugs.length === 1)).toEqual([]);

    // Seeding twice must not have doubled anything.
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
