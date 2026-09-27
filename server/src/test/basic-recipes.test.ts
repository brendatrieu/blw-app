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
 * (recipes.ts exports the curated 15, the 47 coverage recipes and the 63
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
  "lemon",
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
 * Item 357. RAW_SERVED_FOODS above is only half a rule: it stops a recipe
 * cooking a food the catalog serves raw, and nothing stopped the opposite —
 * a food the catalog only ever serves cooked being handed over raw, either by
 * deleting its cooking step or by adding a step that serves it straight from
 * the board. Potato's own choking copy promises "never raw or firm cubes" and
 * carrot's promises "never serve raw carrot under 12 months", so the two rules
 * below make those promises testable rather than editorial.
 *
 * The cook-required set is DERIVED, not listed: every non-spice catalog food
 * that is not raw-served has to be cooked, so a food added tomorrow lands
 * under the rule by default instead of outside it.
 *
 * The stage check looks for a cooking METHOD, not for the word "cook". The
 * first version of it matched a bare `cook`, and that let the whole cooking
 * instruction be deleted from a stage as long as some *other* sentence used
 * the word in passing: "test a wedge and cook it 5 minutes more if it
 * resists" is a follow-up to a cooking step, not a cooking step, yet it kept
 * the guard quiet while the 6-month stage handed over peeled raw potato.
 * `simple-carrot` carries the same follow-up clause, so the hole was
 * catalog-wide. A stage now has to NAME a method (steam, boil, bake, roast,
 * simmer, ...) — or say `cook` together with an oven figure or a burner
 * setting, which is how the porridges and the mince write it — and it has to
 * say how long or how done somewhere in the same stage. The three mutants
 * pinned in the test below are the exact copy this rule exists to reject.
 */
const COOKING_METHOD =
  /\b(?:roast|bake|steam|boil|simmer|saut[eé]|fry|poach|scramble|toast|wilt|blanch|braise|griddle)(?:e?[sd]|ing)?\b/i;
/** "Cook the oats over medium-low heat" / "Cook it ... at 400°F (200°C)". */
const GENERIC_COOK = /\bcook(?:s|ed|ing)?\b/i;

/**
 * Does this step name a way of cooking? `toast` as a NOUN ("onto a soft toast
 * finger") is stripped first, so a serving step cannot pose as a cooking one.
 */
function namesCookingMethod(step: string): boolean {
  const text = step.replace(TOAST_AS_NOUN, " ");
  return COOKING_METHOD.test(text) || (GENERIC_COOK.test(text) && TEMPERATURE.test(text));
}

/**
 * A stage really cooks its food when one of its steps names a method and the
 * stage says how long or how done. The per-step "temperature or a time" and
 * oven/stovetop rules above still apply to each cooking step on its own; this
 * one exists so a stage cannot lose its cooking step altogether.
 */
function stageCooks(steps: readonly string[]): boolean {
  return steps.some(namesCookingMethod) && steps.some((step) => TIME.test(step));
}

/**
 * Cook-required foods the catalog nevertheless offers raw at some age: apple
 * and bell pepper as thin raw pieces once chewing is confident (12 months),
 * ripe pear cooked only "if it is still firm", and tomato, which is either
 * simmered soft or quartered raw. Every OTHER cook-required food is never
 * offered raw, at any age, in any recipe.
 */
const SOMETIMES_RAW_FOODS: readonly string[] = ["apple", "bell_pepper", "pear", "tomato"];

/** A step or texture note only says "raw" to hand it over if it also serves. */
const OFFERS_SERVING =
  /\b(?:serve|serves|served|serving|offer|offers|offered|give|gives|hand|hands|eat|eats|gnaw|gnaws|straight from)\b/i;
/** …and a raw that is spoken against ("never served raw", "rather than raw") is a warning. */
const NEGATED_BEFORE_RAW =
  /\b(?:no|not|never|avoid\w*|without|skip|don'?t|rather than|instead of|hold off|beyond)\b[^.;!?]{0,30}$/i;

/**
 * Does this text OFFER the food raw? Same shape as `suggestsSweetener`: every
 * "raw"/"uncooked" in a serving sentence counts unless the negation sits right
 * in front of it, so "potato is never served raw or firm" passes and "Serve
 * the raw wedges straight from the board" does not.
 */
function offersRawServing(text: string): string | undefined {
  for (const sentence of text.split(/(?<=[.;!?])\s+/)) {
    if (!OFFERS_SERVING.test(sentence)) continue;
    const scan = /\b(?:raw|uncooked)\b/gi;
    let match = scan.exec(sentence);
    while (match !== null) {
      if (!NEGATED_BEFORE_RAW.test(sentence.slice(Math.max(0, match.index - 34), match.index))) {
        return sentence;
      }
      match = scan.exec(sentence);
    }
  }
  return undefined;
}

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

  /*
   * Item 484, owner's decision: some foods are only ever an INGREDIENT — lemon is
   * squeezed into hummus or a pasta, and a "Simple lemon" recipe read as odd. They
   * keep their real category (lemon stays a fruit, so its vitamin C still counts)
   * but, like spices, get no basic recipe of their own.
   */
  const NO_BASIC_RECIPE_FOODS: readonly string[] = ["lemon"];

  it("keeps the no-basic-recipe exemption honest", async () => {
    const foods = await db
      .select({ slug: schema.foods.slug, category: schema.foods.category })
      .from(schema.foods)
      .where(isNull(schema.foods.ownerId));
    const recipes = await catalogRecipes();
    for (const slug of NO_BASIC_RECIPE_FOODS) {
      const food = foods.find((f) => f.slug === slug);
      expect(food, `${slug} must be a catalog food`).toBeDefined();
      expect(food?.category, `${slug} must not be a spice (spices are exempt already)`).not.toBe("spice");
      expect(recipes.some((r) => r.slug === `simple-${slug.replace(/_/g, "-")}`), `${slug} must have no basic`).toBe(false);
      expect(recipes.filter((r) => r.foodSlugs.includes(slug)).length, `${slug} must still be used`).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives every non-spice catalog food exactly one single-ingredient recipe of its own", async () => {
    // Spices are exempt (item 331): a pinch of cinnamon is a seasoning, not a
    // serving, so "Simple cinnamon" would be a recipe for nothing. The
    // zero-basics half of that rule is pinned in its own test below.
    const foodRows = await db
      .select({ slug: schema.foods.slug, minAgeMonths: schema.foods.minAgeMonths })
      .from(schema.foods)
      .where(and(isNull(schema.foods.ownerId), ne(schema.foods.category, "spice")))
      .then((rows) => rows.filter((row) => !NO_BASIC_RECIPE_FOODS.includes(row.slug)));
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
      .where(and(isNull(schema.foods.ownerId), ne(schema.foods.category, "spice")))
      .then((rows) => rows.filter((row) => !NO_BASIC_RECIPE_FOODS.includes(row.slug)));

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
    // though the recipe count is untouched: 122 six-month recipes x 3 stages +
    // 3 nine-month recipes (simple-shrimp and the two shrimp dishes) x 2.
    expect(variantRows.length).toBe(372);
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

  /*
   * Items 428-445. A parent cooking at 9 or 12 months must be able to follow that
   * age alone. Three ways that broke in practice, each now pinned:
   *   1. a step literally saying "as above" / "as for the 6-month version";
   *   2. a variant that silently dropped its own 6m's cool-before-serving line —
   *      a 12-month-old can still burn their mouth, so it belongs in every band;
   *   3. a curated recipe listing an ingredient no step in that variant uses
   *      (tofu-nuggets listed garlic powder and never used it; beef listed cumin
   *      and only the 6m seasoned with it).
   * The regexes are deliberately loose on wording ("just warm" and "just-warm"
   * both count). They pin the SIGNAL, not a phrasing, so an author can reword.
   *
   * Items 461-465, owner's decision: generic supervision and post-exposure
   * allergen watching do NOT belong in recipe steps. Repeated on every recipe it
   * became wallpaper parents skim. Supervision is said once in the first-run
   * tour; allergens get a data-driven line on the recipe page. The guard below
   * keeps it that way. Food-specific choking warnings ("never a spoonful
   * straight", "whole nuts until age 4-5") are prep instructions and stay.
   */
  const BACK_REFERENCE = /as above|(?:as|than|like) (?:for |in )?the (?:6|9|12)[- ]month|as before|same as the|see the (?:6|9|12)/i;
  // NOT plain "serve warm": that instructs you to serve it hot, and accepting it
  // hid the only real gap left (pear-sunflower-flax-porridge 12m). "just warm" still counts.
  const COOLING = /\bcool\b|\bcooled\b|just[ -]warm|check the temperature|chilled|room temperature/i;
  const SUPERVISION = /supervis|sit(?:ting)? with (?:baby|them)|stay(?:ing)? (?:with (?:baby|them)|close)|\bupright\b|keep an eye on baby|never leave baby/i;
  const ALLERGEN_WATCH = /watch baby (?:for|afterwards)|watch for (?:signs of )?(?:a |any )?reaction|on its own at home|at home,? (?:in the morning|earl)/i;

  it("never tells the parent to look at another age band", async () => {
    const variants = await catalogVariants();
    expect(variants.length).toBeGreaterThan(300);
    const offenders = variants
      .filter((v) => v.instructions.some((s) => BACK_REFERENCE.test(s)))
      .map((v) => ({ slug: v.slug, stage: v.ageStage, step: v.instructions.find((s) => BACK_REFERENCE.test(s)) }));
    expect(offenders).toEqual([]);
  });

  it("keeps generic supervision and allergen watching out of the steps", async () => {
    // Guard the guard: both patterns must still recognise the lines they replace.
    expect(SUPERVISION.test("Stay with baby through the meal.")).toBe(true);
    // Phrasings that slipped past the first version of this guard:
    expect(SUPERVISION.test("and serve with baby sitting upright.")).toBe(true);
    expect(SUPERVISION.test("hand it to baby, sitting with them throughout.")).toBe(true);
    expect(ALLERGEN_WATCH.test("offer it on its own at home, in the morning, and watch baby for the rest of the day")).toBe(true);
    // ...and must not swallow a food-specific choking warning, which stays.
    expect(SUPERVISION.test("Thick nut butter is a choking hazard, so never serve a spoonful straight.")).toBe(false);

    const variants = await catalogVariants();
    expect(variants.length).toBeGreaterThan(300);
    const offenders = variants.flatMap((v) =>
      v.instructions
        .filter((s) => SUPERVISION.test(s) || ALLERGEN_WATCH.test(s))
        .map((step) => ({ slug: v.slug, stage: v.ageStage, step })),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the cooling line in every age band, not just six months", async () => {
    const variants = await catalogVariants();
    const bySlug = new Map<string, typeof variants>();
    for (const v of variants) {
      const list = bySlug.get(v.slug) ?? [];
      list.push(v);
      bySlug.set(v.slug, list);
    }

    // Guard the guard: if the stage literals ever change, this test must fail
    // loudly rather than silently comparing nothing.
    expect(variants.filter((v) => v.ageStage === "6").length).toBeGreaterThan(100);

    const lost: { slug: string; stage: string; signal: string }[] = [];
    for (const [slug, group] of bySlug) {
      const six = group.find((v) => v.ageStage === "6");
      if (!six) continue;
      for (const v of group) {
        if (v.ageStage === "6") continue;
        const sixHasIt = six.instructions.some((s) => COOLING.test(s));
        const thisHasIt = v.instructions.some((s) => COOLING.test(s));
        if (sixHasIt && !thisHasIt) lost.push({ slug, stage: v.ageStage, signal: "cooling" });
      }
    }
    expect(lost).toEqual([]);
  });

  it("gives every variant that cooks a cue to cool the food down", async () => {
    // Item 447: the owner's ruling. Parity was not enough — 17 recipes cooked at
    // every age and never once told the parent to let it cool. Burn risk does not
    // depend on which age tab is open.
    const COOKS = /\bbake|\bboil|\bsimmer|\bsteam|\broast|\bpan-?fry|\bsaut|\bpoach|\bgrill|\bcook\b|\btoast/i;
    const variants = await catalogVariants();
    expect(variants.length).toBeGreaterThan(300);

    const hot = variants.filter((v) => v.instructions.some((s) => COOKS.test(s)));
    expect(hot.length).toBeGreaterThan(100);

    const noCue = hot
      .filter((v) => !v.instructions.some((s) => COOLING.test(s)))
      .map((v) => ({ slug: v.slug, stage: v.ageStage }));
    expect(noCue).toEqual([]);
  });

  it("uses every ingredient and extra it lists, in every age band, for every catalog recipe", async () => {
    // Item 548: every seeded recipe — curated, coverage and single-food basics —
    // not just the curated 15. The basics used to be exempt because they call their
    // one food by a part ("the trimmed breast"); they now name the food in the steps.
    const variants = await catalogVariants();
    // 125 recipes, 372 variants (see the time/temperature guard below); a
    // collapse here would make the check below pass vacuously.
    expect(variants.length).toBeGreaterThan(350);
    const extraRows = await db
      .select({ slug: schema.recipes.slug, extraIngredients: schema.recipes.extraIngredients })
      .from(schema.recipes)
      .where(isNull(schema.recipes.ownerId));
    const extrasBySlug = new Map(extraRows.map((r) => [r.slug, r.extraIngredients ?? []]));

    // A word counts on a WORD BOUNDARY with an optional plural/possessive:
    // substring matching silently let "chickpeas" satisfy `peas` and "water"
    // satisfy `watermelon`. berry -> berries; a plural slug word also matches its
    // singular ("walnuts" is named "ground walnut", "almonds" "almond butter"), and
    // "-ed" counts ("a lightly oiled pan" uses the olive oil for the pan).
    const wordRe = (w: string) =>
      w.endsWith("y")
        ? `${w.slice(0, -1)}(?:y|ies)`
        : `${w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w}(?:e?s|'s|ed)?`;
    const mentions = (text: string, w: string) => new RegExp(`\\b${wordRe(w)}\\b`, "i").test(text);
    // A food's full name as a phrase, any word pluralised or not ("flax seed").
    const phrase = (words: string[]) =>
      new RegExp(`\\b${words.map(wordRe).join("[\\s-]+")}\\b`, "i");
    // "seeds" and "seed" are the same word when comparing two names.
    const stem = (w: string) => w.toLowerCase().replace(/ies$/, "y").replace(/(?<=\w{3})s$/, "");
    const key = (words: string[]) => words.map(stem).join(" ");

    // Item 564: a listed food counts ONLY on its full name (plural, possessive,
    // hyphenated or run together: "flaxseed", "sweet-potato") or on an entry of
    // this reviewed alias table. No automatic "distinctive word" rule: it counted
    // incidental words ("iron absorption" for iron_fortified_oats, watermelon
    // "seeds" for hemp_seeds, "sweet paprika" for sweet_potato, a "curry" dish
    // for curry_powder). A single word of a name never counts unless it is here.
    const ALIAS: Record<string, string[]> = {
      // Each entry is how the steps really name that food; each is needed today.
      iron_fortified_oats: ["oats"],
      wheat_pasta: ["pasta"],
      wheat_toast: ["toast"], // "toast a slice" toasts the listed toast
      // Never a bare "squash": the recipes also use it as a verb ("soft enough to
      // squash between two fingers"), which is not the food.
      butternut_squash: ["the squash"],
      chicken_thigh: ["chicken", "thigh"],
      black_beans: ["beans"],
      green_beans: ["beans"],
      bell_pepper: ["pepper"],
      chia_seeds: ["chia"],
      hemp_seeds: ["hemp"], // "hemp hearts" are the hulled seeds
    };

    // An extra's purpose is met ONLY by that verb's own forms (item 565): no
    // synonyms, so "steam over boiling water" neither cooks-and-thins a mash nor
    // loosens one. "for cooking" is met by cook or simmer; "for the pan" by pan,
    // (pan-)fry or the oven's "baking sheet" (never a bare "tray": that is the
    // high chair's).
    const PURPOSE: Record<string, string> = {
      thin: "thin(?:s|ned|ning)?",
      cook: "(?:cook|simmer)(?:s|ed|ing)?",
      pan: "pan|fr(?:y|ies|ied)|baking sheet",
    };
    const purposeRe = (verb: string) => {
      const base = verb.replace(/n?ing$/, "");
      return new RegExp(`\\b(?:${PURPOSE[base] ?? `${base}(?:s|e?d|n?ing)?`})\\b`, "i");
    };

    // Age-only extras (item 566, owner decisions 2026-09-26): the extra is listed
    // for the recipe but genuinely not used in that band. A fixed entry must leave
    // the list (checked below), so it cannot hide a later regression.
    const AGE_ONLY_EXTRAS = new Set([
      // The loosening liquid is for the 6-month mash; 9 and 12 serve egg pieces.
      "simple-egg|9|extra: breast milk, formula, or water, to loosen",
      "simple-egg|12|extra: breast milk, formula, or water, to loosen",
      // 12 months serves the beans soft and whole, not mashed.
      "simple-black-beans|12|extra: water, to loosen the mash",
      // 12 months serves golden toast on purpose; only 6 and 9 moisten the bread.
      "banana-almond-butter-toast-fingers|12|extra: water or milk to moisten the bread",
    ]);

    // ACCEPTED LIMITATION (item 565): an extra is satisfied by any genuine use of
    // one of its alternatives for its stated purpose in that band. When one liquid
    // serves two foods ("simmer the lentils in water" and "steam the cauliflower
    // over boiling water"), the guard cannot tell which food it was meant for; it
    // only proves the band uses it for what the extra says.
    const unused: { slug: string; stage: string; item: string }[] = [];
    for (const v of variants) {
      const steps = v.instructions.join(" ");
      // An extra is free text naming alternatives and an optional purpose:
      // "breast milk, formula, or water, to loosen". "(optional)" is dropped first.
      const extras = (extrasBySlug.get(v.slug) ?? []).map((extra) => {
        const [head, purpose] = extra.name.replace(/\s*\(.*?\)/g, "").split(/,?\s+(?:to|for)\s+/);
        const alternatives = head!.split(/,\s*(?:or\s+)?|\s+or\s+/).map((a) => a.trim().split(/\s+/));
        return { name: extra.name, alternatives, purpose };
      });
      const foodWords = v.foodSlugs.map((f) => f.split("_"));
      // A food's name, each word of it, and its aliases. An alias that another
      // listed food in this recipe also answers to never counts: with black_pepper
      // listed, "pepper" is not the bell pepper; with green_beans, "beans" is not
      // the black beans.
      const names = (j: number) => [
        foodWords[j]!,
        ...foodWords[j]!.map((w) => [w]),
        ...(ALIAS[v.foodSlugs[j]!] ?? []).map((a) => a.split(" ")),
      ];

      for (const [i, food] of v.foodSlugs.entries()) {
        const words = foodWords[i]!;
        const others = new Set(foodWords.flatMap((_, j) => (j === i ? [] : names(j))).map(key));
        const aliases = (ALIAS[food] ?? []).map((a) => a.split(" ")).filter((a) => !others.has(key(a)));
        const used =
          phrase(words).test(steps) ||
          (words.length > 1 && mentions(steps, words.join(""))) ||
          aliases.some((a) => phrase(a).test(steps));
        if (!used) unused.push({ slug: v.slug, stage: v.ageStage, item: food });
      }

      const foodStems = new Set(foodWords.flat().map(stem));
      for (const extra of extras) {
        // Item 560: an alternative is named by its head noun (last word), and never
        // by a word a listed food owns ("mashed avocado" is not the avocado).
        const heads = extra.alternatives
          .map((alt) => alt.at(-1)!)
          .filter((w) => w.length > 2 && !foodStems.has(stem(w)));
        let used: boolean;
        if (extra.purpose) {
          // With a purpose ("to loosen", "for the pan", "for cooking and thinning"),
          // ONE step must name an alternative AND the purpose: "steam over boiling
          // water" does not loosen a mash.
          const verbs = extra.purpose
            .replace(/^(?:the|a)\s+/, "")
            .match(/^(\w+)(?:\s+(?:and|or)\s+(\w+))?/)!
            .slice(1)
            .filter((w): w is string => !!w)
            .map(purposeRe);
          used = v.instructions.some(
            (s) => heads.some((w) => mentions(s, w)) && verbs.some((re) => re.test(s)),
          );
        } else {
          used = heads.some((w) => mentions(steps, w));
        }
        if (!used) unused.push({ slug: v.slug, stage: v.ageStage, item: `extra: ${extra.name}` });
      }
    }
    const keys = unused.map((u) => `${u.slug}|${u.stage}|${u.item}`);
    expect(keys.filter((k) => !AGE_ONLY_EXTRAS.has(k))).toEqual([]);
    expect([...AGE_ONLY_EXTRAS].filter((k) => !keys.includes(k))).toEqual([]);
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
    // 125 recipes: the curated 15, the 47 coverage recipes added for the
    // "3 recipes per food" rule (items 338-339, 343, 357, 510), and 63 basics (62 x 3
    // stages + shrimp's 2) — one per non-spice food except lemon (items 331,
    // 342, 356, 484, 509).
    expect(new Set(variants.map((v) => v.slug)).size).toBe(125);

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

  /** Every non-spice catalog food the catalog does not serve raw. */
  async function cookRequiredFoods(): Promise<string[]> {
    const foodRows = await db
      .select({ slug: schema.foods.slug })
      .from(schema.foods)
      .where(and(isNull(schema.foods.ownerId), ne(schema.foods.category, "spice")));
    return foodRows.map((f) => f.slug).filter((slug) => !RAW_SERVED_FOODS.includes(slug));
  }

  it("cooks a cook-required food at every stage of its own basic recipe", async () => {
    // Guard the guard: the detector has to see a real cooking step, and has to
    // stay blind to the copy a raw-serving rewrite would put in its place —
    // otherwise deleting the cook step from a basic passes unnoticed.
    expect(namesCookingMethod("Steam or boil the wedges for 15-20 minutes, until a wedge mashes.")).toBe(
      true,
    );
    expect(namesCookingMethod("Cook the oats over medium-low heat for 5-6 minutes.")).toBe(true);
    expect(namesCookingMethod("Bake them at 400°F (200°C) for 30-40 minutes.")).toBe(true);
    expect(namesCookingMethod("Serve the raw wedges straight from the board - no cooking needed.")).toBe(
      false,
    );
    expect(namesCookingMethod("Hand baby a firm raw wedge to gnaw on.")).toBe(false);
    expect(namesCookingMethod("Spread the mash onto a soft toast finger.")).toBe(false);
    // The follow-up clause that let the real cook step be deleted unnoticed:
    // it says "cook" and it says "5 minutes", and it is still not an
    // instruction to cook anything.
    expect(
      namesCookingMethod(
        "Test a wedge between your fingers before serving, and cook it 5 minutes more if it resists at all — potato is never served raw or firm.",
      ),
    ).toBe(false);

    // …and the same three mutants at stage level. Each is a real stage with
    // only its cooking step swapped for a neutral prep line; every one of them
    // hands baby a raw cook-required food, so every one has to fail.
    expect(
      stageCooks([
        "Scrub the potato, cut away any green patches or sprouts, then peel it and cut it into thick, finger-length wedges.",
        "Arrange the wedges on a board and pat them dry.",
        "Test a wedge between your fingers before serving, and cook it 5 minutes more if it resists at all — potato is never served raw or firm.",
        "Cool to just-warm, check the temperature, and serve with no added salt.",
      ]),
    ).toBe(false);
    expect(
      stageCooks([
        "Wash and peel the carrot and cut it into finger-length spears.",
        "Arrange the spears on a board and pat them dry.",
        "Raw carrot is hard and can shear into a firm, airway-blocking chunk, so test a spear between your fingers first and cook it 3-5 minutes more if it resists.",
        "Cool to just-warm, check the temperature, and serve.",
      ]),
    ).toBe(false);
    expect(
      stageCooks([
        "Peel the potato and cut it into thick wedges — no cooking needed.",
        "Cool to just-warm, check the temperature, and serve with no added salt.",
      ]),
    ).toBe(false);
    // The unmutated stage still passes, so the rule is not simply always-false.
    expect(
      stageCooks([
        "Scrub the potato, cut away any green patches or sprouts, then peel it and cut it into thick, finger-length wedges.",
        "Steam or boil the wedges for 15-20 minutes, or bake them at 400°F (200°C) for 30-40 minutes, until a wedge mashes easily between two fingers.",
        "Cool to just-warm, check the temperature, and serve with no added salt.",
      ]),
    ).toBe(true);

    const cookRequired = await cookRequiredFoods();
    expect(cookRequired.length).toBeGreaterThan(30);
    expect(cookRequired).toContain("potato");

    const basics = new Map(
      (await catalogVariants())
        .filter((v) => v.foodSlugs.length === 1)
        .map((v) => [`${v.foodSlugs[0] ?? ""}/${v.ageStage}`, v]),
    );
    // A cook-required food whose basic has a stage that never names a cooking
    // method is a stage that hands baby the food raw, whatever the copy says.
    const inScope = [...basics.entries()].filter(([key]) =>
      cookRequired.includes(key.split("/")[0] ?? ""),
    );
    // Guard the guard: the basics really are being read, so a lookup that
    // started returning nothing would fail here instead of passing vacuously.
    expect(inScope.length).toBeGreaterThan(90);
    const uncooked = inScope.filter(([, v]) => !stageCooks(v.instructions)).map(([key]) => key);
    expect(uncooked).toEqual([]);
  });

  it("never offers a cook-required food raw, in any recipe", async () => {
    // Guard the guard, both ways.
    expect(offersRawServing("Serve the raw wedges straight from the board - no cooking needed.")).toBe(
      "Serve the raw wedges straight from the board - no cooking needed.",
    );
    expect(offersRawServing("Hand baby a firm raw wedge to gnaw on.")).toBe(
      "Hand baby a firm raw wedge to gnaw on.",
    );
    expect(
      offersRawServing("Cook it 5 minutes more if it resists — potato is never served raw or firm."),
    ).toBeUndefined();
    expect(
      offersRawServing("Soften the garlic until it smells sweet rather than raw."),
    ).toBeUndefined();

    const cookRequired = await cookRequiredFoods();
    // The exemptions have to name foods that are really cook-required, so a
    // renamed or re-classified slug cannot leave a dead licence behind.
    expect(SOMETIMES_RAW_FOODS.filter((slug) => !cookRequired.includes(slug))).toEqual([]);

    const alwaysCooked = cookRequired.filter((slug) => !SOMETIMES_RAW_FOODS.includes(slug));
    expect(alwaysCooked).toContain("potato");
    expect(alwaysCooked).toContain("carrot");

    const variants = await catalogVariants();
    const inScope = variants.filter((v) => v.foodSlugs.some((slug) => alwaysCooked.includes(slug)));
    expect(inScope.length).toBeGreaterThan(100);

    const offenders = inScope.flatMap((v) =>
      [v.textureNote, ...v.instructions].flatMap((text) => {
        const sentence = offersRawServing(text);
        return sentence === undefined ? [] : [{ slug: v.slug, stage: v.ageStage, sentence }];
      }),
    );
    expect(offenders).toEqual([]);
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
