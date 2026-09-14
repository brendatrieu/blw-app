import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { and, eq, isNull, ne } from "drizzle-orm";
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
 * Ledger item 266. Runs over the seeded catalog, which is every recipe file
 * (recipes.ts exports the curated 15, the 43 coverage recipes and the 61
 * basics), so a step added to any of them is covered.
 */
const COOKING_VERB = /\b(?:roast|bake|steam|boil|simmer|saut[eé]|fry|poach|scramble|toast|cook)\b/i;
/** The same verbs minus `toast`, which in these recipes only ever means bread. */
const NON_TOAST_VERB = /\b(?:roast|bake|steam|boil|simmer|saut[eé]|fry|poach|scramble|cook)\b/i;
/** °F / °C, or a stovetop heat setting ("medium heat", "medium-low heat", "low heat"). */
const TEMPERATURE = /\d\s*°\s*[FC]|\b(?:high|medium|low)(?:-(?:high|medium|low))?\s+heat\b/i;
/** A clock time ("10-12 minutes", "30 seconds", "2-3 hours") or a "until …" doneness cue. */
const TIME = /\b\d+(?:\s*[-–]\s*\d+)?\s*(?:second|minute|hour)s?\b|\buntil\b/i;

/**
 * Items 337-339. The safety rules below used to be pinned against a list of
 * `simple-*` recipe slugs, which left the 39 coverage recipes — and any recipe
 * added after them — outside every one of them. They are keyed on FOODS now,
 * so they apply to whichever recipe happens to carry that food, and each has a
 * completeness half so a newly catalogued food cannot slip past unclassified.
 *
 * Foods the catalog never cooks: canned fish, every seed, every nut and nut or
 * seed butter, dairy, and the fruit that is served raw. No cooking step may
 * reach one of these at any age — a seed toasted dry, or tuna "warmed through",
 * is a different food from the one the catalog's prep text and choking copy
 * describe.
 */
const RAW_SERVED_FOODS: readonly string[] = [
  "sardines",
  "tuna",
  "strawberry",
  "orange",
  "kiwi",
  "mango",
  "yogurt",
  "cheese",
  "avocado",
  "banana",
  "blueberry",
  "watermelon",
  "sesame_seeds",
  "chia_seeds",
  "flax_seeds",
  "hemp_seeds",
  "pumpkin_seeds",
  "peanut_butter",
  "almond_butter",
  "tahini",
  "sunflower_seed_butter",
  "cashew_butter",
  "walnuts",
  "pistachios",
  "hazelnuts",
  "pecans",
  // Item 342: the plain nuts, ground to a meal and stirred into a wet food —
  // never cooked, in any recipe, at any age.
  "almonds",
  "cashews",
];

/**
 * The other side of that coin: foods whose own prep text never cooks them, but
 * which the recipes legitimately cook. Tomato is served raw in quarters and
 * simmered into sauce; egg is raw in the shell and always cooked through.
 */
const COOKED_IN_RECIPES: readonly string[] = ["tomato", "egg"];

/**
 * USDA/FSIS + FDA figures, recorded in .workflow/scratch/recipe-detail/sources.md
 * and .workflow/scratch/catalog-expansion/sources.md. Poultry is 165°F whatever
 * the cut; pork and lamb take the ground-meat figure because babies get meat
 * well-done, the same call the catalog already made for beef. EVERY stage of
 * EVERY recipe carrying one of these foods has to cite it — a stage that says
 * "prepare as for the 6-month version" has to name the temperature too.
 */
const INTERNAL_TEMP: Record<string, RegExp> = {
  beef: /160°F \(71°C\)/,
  pork: /160°F \(71°C\)/,
  lamb: /160°F \(71°C\)/,
  chicken: /165°F \(74°C\)/,
  chicken_thigh: /165°F \(74°C\)/,
  turkey: /165°F \(74°C\)/,
  salmon: /145°F \(63°C\)/,
  cod: /145°F \(63°C\)/,
  trout: /145°F \(63°C\)/,
  shrimp: /145°F \(63°C\)/,
};

/** Cooked proteins that carry a doneness cue instead of a probe temperature. */
const NO_INTERNAL_TEMP: readonly string[] = ["egg", "tofu"];

/** "on a toast finger", "onto toast cut into squares" — bread, not a cooking step. */
const TOAST_AS_NOUN_SOURCE =
  "\\b(?:on|onto)\\s+(?:a\\s+soft\\s+)?toast\\b|\\btoast\\s+(?:finger|square|strip|cut)";
const TOAST_AS_NOUN = new RegExp(TOAST_AS_NOUN_SOURCE, "gi");
/** The step is talking about bread, so a `toast` in it is not cooking the raw food. */
const BREAD_IN_STEP = new RegExp(`${TOAST_AS_NOUN_SOURCE}|\\bbread\\b`, "i");

/** Words a slug shares with every other food of its kind, so useless as a cue. */
const RAW_KEYWORD_NOISE = new Set(["seed", "butter"]);

/** How a step would name a raw-served food: the slug as a phrase, plus its distinctive words. */
function rawFoodKeywords(slug: string): string[] {
  const words = slug.split("_").filter((w) => w.length > 3 && !RAW_KEYWORD_NOISE.has(w));
  // A step names the food in the singular as often as not ("the pecan mixture",
  // "the walnut meal"), so a plural slug guards both forms.
  const singular = words.filter((w) => w.length > 4 && w.endsWith("s")).map((w) => w.slice(0, -1));
  return [...new Set([slug.replace(/_/g, " "), ...words, ...singular])];
}

const RAW_VERBS = "roast|bake|steam|boil|simmer|saut[eé]|fry|poach|scramble|toast|cook";
/** Articles and adjectives that may sit between a verb and the food it governs. */
const RAW_MODIFIERS =
  "the|a|an|some|your|any|two|three|more|rest|of|it|them|[a-z]+ly|[a-z-]+ed|[a-z-]+ing|" +
  "ripe|soft|fine|small|thin|warm|cold|smooth|whole|plain|mild|extra";

/**
 * Does this step apply a cooking verb TO one of these foods? The verb has to
 * govern the food within three modifier words, so "Toast the bread, then spread
 * the mashed avocado over it" stays legal while "Simmer the tuna over medium
 * heat" does not.
 */
function cookedRawFood(step: string, slugs: readonly string[]): string | undefined {
  for (const slug of slugs) {
    for (const keyword of rawFoodKeywords(slug)) {
      const pattern = new RegExp(
        `\\b(?:${RAW_VERBS})\\b(?:\\s+(?:${RAW_MODIFIERS})){0,3}\\s+(?:${keyword})\\b`,
        "i",
      );
      if (pattern.test(step)) return slug;
    }
  }
  return undefined;
}

/**
 * honey-salt-sugar.mdx: honey is off-limits in every form under 12 months, and
 * the catalog never sweetens anything. Every mention has to be a prohibition,
 * so the negation is required right next to the word — "no honey before 12
 * months" passes, "with a drizzle of honey, no added salt" does not.
 */
const SWEETENER = /\b(?:honey|maple syrup|agave|molasses|golden syrup)\b/i;
const NEGATED_JUST_BEFORE = /\b(?:no|not|never|without|avoid|skip|don'?t)\b[^.;]{0,24}$/i;

function suggestsSweetener(text: string): boolean {
  const scan = new RegExp(SWEETENER.source, "gi");
  let match = scan.exec(text);
  while (match !== null) {
    if (!NEGATED_JUST_BEFORE.test(text.slice(Math.max(0, match.index - 28), match.index))) {
      return true;
    }
    match = scan.exec(text);
  }
  return false;
}

/**
 * Salt and sugar are named far more loosely ("no-salt-added stock", "check the
 * label for added salt and sugar"), so the qualifier is required somewhere in
 * the same sentence rather than adjacent. An unqualified "season with a pinch
 * of salt" has nowhere to hide.
 */
const SALT_OR_SUGAR = /\b(?:salt|sugar|syrup|sweeten\w*)\b/i;
const SALT_SUGAR_QUALIFIER =
  /\b(?:no|not|never|without|avoid|skip|free|instead|unsweetened|unsalted|label)\b/i;

function unqualifiedSaltOrSugar(text: string): string | undefined {
  for (const sentence of text.split(/(?<=[.;!?])\s+/)) {
    if (!SALT_OR_SUGAR.test(sentence)) continue;
    if (!SALT_SUGAR_QUALIFIER.test(sentence)) return sentence;
  }
  return undefined;
}

/**
 * Ledger item 254. `pnpm db:seed` is never run against the dev database from
 * a test — this proves the same `runSeeds()` the script calls, against a
 * throwaway in-memory Postgres, and proves it TWICE so the "idempotent upsert
 * by slug" claim is a tested property rather than a comment.
 */
describe("catalog recipes: the single-food basics and the curated dishes", () => {
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

  it("gives every non-spice catalog food exactly one single-ingredient recipe of its own", async () => {
    // Spices are exempt (item 331): a pinch of cinnamon is a seasoning, not a
    // serving, so "Simple cinnamon" would be a recipe for nothing. The
    // zero-basics half of that rule is pinned in its own test below.
    const foodRows = await db
      .select({ slug: schema.foods.slug, minAgeMonths: schema.foods.minAgeMonths })
      .from(schema.foods)
      .where(and(isNull(schema.foods.ownerId), ne(schema.foods.category, "spice")));
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

  it("gives spice foods no basic recipe at all", async () => {
    const spiceRows = await db
      .select({ slug: schema.foods.slug })
      .from(schema.foods)
      .where(eq(schema.foods.category, "spice"));
    expect(spiceRows.length).toBeGreaterThan(0);

    const slugs = new Set((await catalogRecipes()).map((r) => r.slug));
    const unwanted = spiceRows
      .map((food) => `simple-${food.slug.replace(/_/g, "-")}`)
      .filter((slug) => slugs.has(slug));
    expect(unwanted).toEqual([]);
  });

  it("matches each basic recipe's minimum age, slug, and title to its food", async () => {
    const foodRows = await db
      .select({ slug: schema.foods.slug, name: schema.foods.name, minAgeMonths: schema.foods.minAgeMonths })
      .from(schema.foods)
      .where(and(isNull(schema.foods.ownerId), ne(schema.foods.category, "spice")));

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

  it("carries a variant for every stage at or above each recipe's minimum age", async () => {
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

    // Items 339-340: EVERY catalog recipe, not only the basics. A 6-month
    // recipe carries 6/9/12 and a 9-month recipe carries 9/12 — a coverage
    // recipe that lost its 9-month stage would leave that age with nothing to
    // cook, and one that gained a stage below its minimum would offer a baby a
    // food it is not ready for.
    const wrong = recipes
      .map((r) => ({
        slug: r.slug,
        have: [...(stagesByRecipeId.get(r.id) ?? [])].sort().join(","),
        want: (["6", "9", "12"] as const)
          .filter((stage) => Number(stage) >= r.minAgeMonths)
          .sort()
          .join(","),
      }))
      .filter((entry) => entry.have !== entry.want);
    expect(wrong).toEqual([]);

    // The exact row count, so deleting one stage of one recipe fails HERE even
    // though the recipe count is untouched: 116 six-month recipes x 3 stages +
    // 3 nine-month recipes (simple-shrimp and the two shrimp dishes) x 2.
    expect(variantRows.length).toBe(354);
  });

  it("gives every catalog variant 3-6 steps and a texture note", async () => {
    // Item 339: the coverage recipes are held to the same shape as the basics,
    // so this no longer filters to `simple-*`.
    const variants = await catalogVariants();
    expect(variants.length).toBeGreaterThan(300);

    const bad = variants
      .filter((v) => v.textureNote.trim() === "" || v.instructions.length < 3 || v.instructions.length > 6)
      .map((v) => ({ slug: v.slug, stage: v.ageStage, steps: v.instructions.length }));
    expect(bad).toEqual([]);
  });

  /** Every seeded catalog variant, with its recipe slug, stage and foods. */
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
      return recipe
        ? [
            {
              ...v,
              slug: recipe.slug,
              foodSlugs: recipe.foodSlugs,
              minAgeMonths: recipe.minAgeMonths,
            },
          ]
        : [];
    });
  }

  it("gives every cooking step a temperature or a time", async () => {
    const variants = await catalogVariants();
    // 119 recipes: the curated 15, the 43 coverage recipes added for the
    // "3 recipes per food" rule (items 338-339, 343), and 61 basics (60 x 3
    // stages + shrimp's 2) — one per non-spice food (item 331, item 342).
    expect(new Set(variants.map((v) => v.slug)).size).toBe(119);

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

  it("gives every stovetop step a heat level — a simmer or a poach is one by itself", async () => {
    const variants = await catalogVariants();
    // Frying, sautéing, browning and scrambling need a burner setting; a
    // simmer or a poach names its own (just under the boil), so those pass
    // as written. Steaming and boiling are water temperature and need nothing.
    // Verbs only — "a soft scrambled pile" and "not browned and brittle"
    // describe a result, they do not put a pan on the hob.
    const STOVETOP = /\b(?:fry|frying|saut[eé]|saut[eé]ing|scramble|scrambling|grill|grilling|brown|browning|sear|searing)\b/i;
    const HEAT_LEVEL =
      /\b(?:high|medium|low)(?:-(?:high|medium|low))?\s+heat\b|\b(?:low|gentle|bare|slow)\s+simmer\b|\bsimmer\w*\b|\bpoach\w*\b/i;
    const stovetop = variants.flatMap((v) =>
      v.instructions
        .map((step, index) => ({ slug: v.slug, stage: v.ageStage, index, step }))
        .filter((s) => STOVETOP.test(s.step)),
    );
    expect(stovetop.length).toBeGreaterThan(20);
    expect(stovetop.filter((s) => !HEAT_LEVEL.test(s.step))).toEqual([]);
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

  it("adds no cooking step to a food that is served raw, in any recipe", async () => {
    // Guard the guard: the detector has to fire on a step that really does
    // cook a raw-served food, and stay quiet on one that cooks something else
    // in the same sentence. Without these two, a regex that stopped matching
    // would make the whole test pass vacuously.
    expect(cookedRawFood("Simmer the tuna over medium heat for 5 minutes, until hot.", ["tuna"])).toBe(
      "tuna",
    );
    expect(cookedRawFood("Toast the sesame seeds in a dry pan for 2 minutes.", ["sesame_seeds"])).toBe(
      "sesame_seeds",
    );
    expect(
      cookedRawFood("Toast the bread, then spread the mashed avocado over it.", ["avocado"]),
    ).toBeUndefined();

    const variants = await catalogVariants();
    const offenders = variants.flatMap((v) => {
      const raw = v.foodSlugs.filter((slug) => RAW_SERVED_FOODS.includes(slug));
      if (raw.length === 0) return [];
      return v.instructions.flatMap((step, index) => {
        const found: { slug: string; stage: string; index: number; problem: string }[] = [];
        // A single-food basic for a raw food may cook NOTHING — except bread,
        // which several of the spreads suggest as a toast finger. A `toast`
        // that is not talking about bread is cooking the food itself.
        if (v.foodSlugs.length === 1) {
          const cooksItsOwnFood =
            NON_TOAST_VERB.test(step) || (/\btoast\b/i.test(step) && !BREAD_IN_STEP.test(step));
          if (cooksItsOwnFood) {
            found.push({ slug: v.slug, stage: v.ageStage, index, problem: `cooks its only food: ${step}` });
          }
        }
        // Everywhere else the verb has to be governing something other than
        // the raw food — "toast the bread" is fine, "toast the seeds" is not.
        const cooked = cookedRawFood(step, raw);
        if (cooked !== undefined) {
          found.push({ slug: v.slug, stage: v.ageStage, index, problem: `cooks ${cooked}: ${step}` });
        }
        return found;
      });
    });
    expect(offenders).toEqual([]);

    // Every raw-served food is actually in the seeded catalog, so the list
    // cannot quietly name foods that no longer exist.
    const seeded = new Set(variants.flatMap((v) => v.foodSlugs));
    expect(RAW_SERVED_FOODS.filter((slug) => !seeded.has(slug))).toEqual([]);
  });

  it("classifies every food the catalog never cooks as raw-served or cooked-by-recipe", async () => {
    // The completeness half of the rule above (item 339). A new food whose prep
    // text never cooks it has to be sorted into one of the two lists rather
    // than landing outside the raw-served guard by default — which is exactly
    // how the coverage recipes' own raw-served copy came to be undefended.
    const foodRows = await db
      .select({
        slug: schema.foods.slug,
        category: schema.foods.category,
        prep6m: schema.foods.prep6m,
        prep9m: schema.foods.prep9m,
        prep12m: schema.foods.prep12m,
      })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));
    expect(foodRows.length).toBeGreaterThan(0);

    // `toast` as a noun ("on a soft toast finger") is bread, not a method.
    const neverCooked = foodRows
      .filter((f) => f.category !== "spice")
      .filter(
        (f) =>
          ![f.prep6m, f.prep9m, f.prep12m].some((text) =>
            COOKING_VERB.test(text.replace(TOAST_AS_NOUN, " ")),
          ),
      )
      .map((f) => f.slug);
    expect(neverCooked.length).toBeGreaterThan(20);

    const unclassified = neverCooked.filter(
      (slug) => !RAW_SERVED_FOODS.includes(slug) && !COOKED_IN_RECIPES.includes(slug),
    );
    expect(unclassified).toEqual([]);

    // …and the reverse: a food listed as raw-served whose prep text has started
    // cooking it means the list, or the prep copy, has drifted.
    expect(RAW_SERVED_FOODS.filter((slug) => !neverCooked.includes(slug))).toEqual([]);
  });

  it("cites the safe internal temperature in every stage of every recipe that cooks meat or fish", async () => {
    // Item 339: keyed on the FOOD, so the rule follows beef or cod into any
    // recipe that carries them rather than stopping at the `simple-*` basics.
    const variants = await catalogVariants();

    const missing = variants.flatMap((v) =>
      v.foodSlugs.flatMap((foodSlug) => {
        const pattern = INTERNAL_TEMP[foodSlug];
        if (pattern === undefined) return [];
        if (v.instructions.some((step) => pattern.test(step))) return [];
        return [{ slug: v.slug, problem: `stage ${v.ageStage} never cites ${String(pattern)} for ${foodSlug}` }];
      }),
    );
    expect(missing).toEqual([]);

    // Guard the guard: every food the map names is really on the menu, so a
    // renamed slug shows up here instead of silently checking nothing.
    const unused = Object.keys(INTERNAL_TEMP).filter(
      (foodSlug) => !variants.some((v) => v.foodSlugs.includes(foodSlug)),
    );
    expect(unused).toEqual([]);

    // Egg is the one cooked protein that carries a doneness cue rather than a
    // probe reading — the basic is where that cue is pinned.
    const eggBasic = variants.filter((v) => v.slug === "simple-egg");
    expect(eggBasic.length).toBeGreaterThan(0);
    expect(
      eggBasic
        .filter((v) => !v.instructions.some((s) => /yolk and (?:the )?white are firm/i.test(s)))
        .map((v) => v.ageStage),
    ).toEqual([]);
  });

  it("classifies every protein food as probe-temperature, raw-served, or doneness-cued", async () => {
    // The completeness half (item 339): a new meat or fish added to the catalog
    // has to be given its temperature here rather than arriving unguarded.
    const proteinRows = await db
      .select({ slug: schema.foods.slug })
      .from(schema.foods)
      .where(and(eq(schema.foods.category, "protein"), isNull(schema.foods.ownerId)));
    expect(proteinRows.length).toBeGreaterThan(20);

    const unclassified = proteinRows
      .map((f) => f.slug)
      .filter(
        (slug) =>
          INTERNAL_TEMP[slug] === undefined &&
          !RAW_SERVED_FOODS.includes(slug) &&
          !NO_INTERNAL_TEMP.includes(slug),
      );
    expect(unclassified).toEqual([]);
  });

  it("never suggests honey, added salt, or added sugar in any recipe", async () => {
    // Item 339. The catalog's honey guard reads FOOD prep text
    // (seed-catalog.test.ts); nothing read the recipes themselves, so a step
    // that finished "…with a drizzle of honey" was free to ship. Every field a
    // parent reads is scanned here: steps, texture notes, ingredient quantity
    // notes and the free-text extras.
    expect(suggestsSweetener("Mash the rice and beans with a drizzle of honey.")).toBe(true);
    expect(suggestsSweetener("Serve unsweetened — no honey before 12 months.")).toBe(false);
    expect(unqualifiedSaltOrSugar("Season the mince with a pinch of salt.")).toBeDefined();
    expect(unqualifiedSaltOrSugar("Serve with no added salt.")).toBeUndefined();

    const variants = await catalogVariants();
    const recipeRows = await db
      .select({ slug: schema.recipes.slug, extraIngredients: schema.recipes.extraIngredients })
      .from(schema.recipes)
      .where(isNull(schema.recipes.ownerId));
    const ingredientRows = await db
      .select({ slug: schema.recipes.slug, quantityNote: schema.recipeIngredients.quantityNote })
      .from(schema.recipeIngredients)
      .innerJoin(schema.recipes, eq(schema.recipeIngredients.recipeId, schema.recipes.id))
      .where(isNull(schema.recipes.ownerId));

    const fields: { slug: string; where: string; text: string }[] = [
      ...variants.flatMap((v) => [
        ...v.instructions.map((text, index) => ({
          slug: v.slug,
          where: `stage ${v.ageStage} step ${String(index)}`,
          text,
        })),
        { slug: v.slug, where: `stage ${v.ageStage} texture note`, text: v.textureNote },
      ]),
      ...recipeRows.flatMap((r) =>
        (r.extraIngredients ?? []).map((extra) => ({
          slug: r.slug,
          where: "extra ingredient",
          text: `${extra.quantityNote} ${extra.name}`,
        })),
      ),
      ...ingredientRows.map((row) => ({
        slug: row.slug,
        where: "quantity note",
        text: row.quantityNote,
      })),
    ];
    expect(fields.length).toBeGreaterThan(1000);

    const offenders = fields.flatMap((field) => {
      if (suggestsSweetener(field.text)) {
        return [{ slug: field.slug, where: field.where, problem: `sweetener: ${field.text}` }];
      }
      const sentence = unqualifiedSaltOrSugar(field.text);
      return sentence === undefined
        ? []
        : [{ slug: field.slug, where: field.where, problem: `unqualified salt/sugar: ${sentence}` }];
    });
    expect(offenders).toEqual([]);
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
    // Item 338: cumin left this list when it became a real `cumin` ingredient
    // link, so the spice counts toward its own coverage minimum. Olive oil has
    // no catalog food row, so it stays an extra.
    expect(bySlug.get("beef-sweet-potato-strips")).toEqual([{ name: "olive oil", quantityNote: "" }]);
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
