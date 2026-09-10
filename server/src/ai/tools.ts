// Tool definitions for both chat surfaces. Every tool is closed over
// (db, userId, babyId?) at build time — the model never supplies an id, and
// none of these input schemas accept one. Every query is scoped to the
// caller (and, where relevant, to the linked baby) exactly the way the REST
// routes are; a tool is just another read path into the same data.
//
// Built with `betaTool()` (raw JSON Schema) rather than `betaZodTool()`
// (zod). The task brief's convention is the zod helper, but
// `betaZodTool` calls the SDK's own `z.toJSONSchema(...)` internally, which
// requires zod's default export to be the v4 API surface — this project's
// installed `zod@3.25.76` (pinned `^3.24.1` for the rest of the app's zod-3
// schemas) resolves "." to the v3-compat surface, where `toJSONSchema` does
// not exist, so `betaZodTool` throws at tool-build time. `betaTool()` is the
// SDK's documented zod-free alternative for exactly this situation. Each
// schema below is still a `.strict`-equivalent object (`additionalProperties:
// false` + `required`), which is the wire-level guarantee the task brief
// actually cares about. Flagged in the phase brief.
import { and, asc, eq, ilike, inArray, isNull, lte, or } from "drizzle-orm";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { ageInMonths, unionAllergenStatus } from "@blw/shared";
import type { Database } from "../db/index.js";
import {
  allergenOverrides,
  allergens,
  babies,
  foodAllergens,
  foods,
  mealFoods,
  meals,
  fridgeItems,
  recipes,
  storageGuidelines,
} from "../db/schema.js";
import { visibleRecipesCondition } from "../services/recipes.js";
import { deriveIronFocus, loadRecipeNutrition, nutritionFor } from "../services/recipeNutrition.js";

// ---------------------------------------------------------------------------
// get_baby_profile
// ---------------------------------------------------------------------------

export interface BabyProfileSummary {
  ageMonths: number;
  foodsIntroducedCount: number;
  /** Food names only — never a baby name or id (privacy invariant). */
  knownReactiveFoods: string[];
  establishedTop9Allergens: string[];
}

/**
 * Shared by the get_baby_profile tool's `run()` and the recipe route's
 * post-reply allergy cross-check, so both read the exact same numbers.
 * Returns null when the baby doesn't exist or isn't the caller's — the tool
 * and the route each turn that into their own appropriate response.
 */
export async function fetchBabyProfileSummary(
  db: Database,
  userId: string,
  babyId: string,
): Promise<BabyProfileSummary | null> {
  const [baby] = await db
    .select({ birthDate: babies.birthDate })
    .from(babies)
    .where(and(eq(babies.id, babyId), eq(babies.userId, userId)))
    .limit(1);
  if (!baby) return null;

  // One row per (meal, food): the note is meal-level, so every food in a
  // meal that got a note counts as reactive — the same thing the old
  // per-food serve log recorded when a batch was logged with one note.
  const servedRows = await db
    .select({ foodName: foods.name, reactionNote: meals.reactionNote })
    .from(mealFoods)
    .innerJoin(meals, eq(mealFoods.mealId, meals.id))
    .innerJoin(foods, eq(mealFoods.foodId, foods.id))
    .where(eq(meals.babyId, babyId));

  const foodsIntroduced = new Set(servedRows.map((r) => r.foodName));
  const knownReactiveFoods = [...new Set(servedRows.filter((r) => r.reactionNote).map((r) => r.foodName))];

  // Same >=3-exposures threshold the allergen ladder tracker uses, via the
  // shared derivation function, so this summary never disagrees with what
  // the parent sees on /babies/:id/allergens.
  const exposureRows = await db
    .select({ allergenSlug: allergens.slug })
    .from(mealFoods)
    .innerJoin(meals, eq(mealFoods.mealId, meals.id))
    .innerJoin(foodAllergens, eq(mealFoods.foodId, foodAllergens.foodId))
    .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
    .where(eq(meals.babyId, babyId));
  const exposureCountBySlug = new Map<string, number>();
  for (const row of exposureRows) {
    exposureCountBySlug.set(row.allergenSlug, (exposureCountBySlug.get(row.allergenSlug) ?? 0) + 1);
  }

  // Same union the progress route reports: an allergen a parent marked as
  // established before they started logging counts as established here too,
  // or the model would keep suggesting a "first try" for something the baby
  // has eaten for months. Overrides are per-baby, and this baby is already
  // proven to be the caller's by the lookup above.
  const overrideRows = await db
    .select({ allergenKey: allergenOverrides.allergenKey })
    .from(allergenOverrides)
    .where(eq(allergenOverrides.babyId, babyId));
  const overriddenSlugs = new Set(overrideRows.map((row) => row.allergenKey));

  const candidateSlugs = new Set([...exposureCountBySlug.keys(), ...overriddenSlugs]);
  const establishedTop9Allergens = [...candidateSlugs]
    .filter((slug) => {
      const exposures = exposureCountBySlug.get(slug) ?? 0;
      return unionAllergenStatus(exposures, overriddenSlugs.has(slug)).status === "established";
    })
    // Sorted so the same baby always produces the same summary string —
    // the set's insertion order depends on row order otherwise.
    .sort();

  return {
    ageMonths: ageInMonths(baby.birthDate),
    foodsIntroducedCount: foodsIntroduced.size,
    knownReactiveFoods,
    establishedTop9Allergens,
  };
}

const EMPTY_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

function buildBabyProfileTool(db: Database, userId: string, babyId: string | null) {
  return betaTool({
    name: "get_baby_profile",
    description:
      "Get the linked baby's age in months and a privacy-safe summary of foods introduced so far (never names or ids). Call this before suggesting anything age-specific or checking for a known food reaction.",
    inputSchema: EMPTY_INPUT_SCHEMA,
    run: async () => {
      if (!babyId) {
        return "No baby is linked to this chat thread. Ask the parent for the baby's age in months if you need it — do not guess.";
      }
      const summary = await fetchBabyProfileSummary(db, userId, babyId);
      if (!summary) {
        return "The linked baby could not be found (it may have been deleted since this chat started).";
      }
      return JSON.stringify(summary);
    },
  });
}

// ---------------------------------------------------------------------------
// get_fridge
// ---------------------------------------------------------------------------

/** Same fallback window server/src/routes/fridge.ts uses for an item with no
 * resolvable storage category — kept in sync by hand since duplicating the
 * whole hydration pipeline here for a model-facing summary isn't worth it. */
const FRIDGE_TOOL_FALLBACK_WINDOW = { fridgeHours: 48, freezerDays: 60, roomTempHours: 2 };
const HOUR_MS = 60 * 60 * 1000;

function buildFridgeTool(db: Database, userId: string) {
  return betaTool({
    name: "get_fridge",
    description:
      "List the household's active prepared-food fridge items with a freshness flag. An item flagged expired must never be suggested for reuse.",
    inputSchema: EMPTY_INPUT_SCHEMA,
    run: async () => {
      const rows = await db
        .select({
          label: fridgeItems.label,
          foodName: foods.name,
          recipeTitle: recipes.title,
          preparedAt: fridgeItems.preparedAt,
          location: fridgeItems.location,
          foodStorageCategory: foods.storageCategory,
          recipeFridgeOverride: recipes.fridgeHoursOverride,
          recipeFreezerOverride: recipes.freezerDaysOverride,
        })
        .from(fridgeItems)
        .leftJoin(foods, eq(fridgeItems.foodId, foods.id))
        .leftJoin(recipes, eq(fridgeItems.recipeId, recipes.id))
        .where(and(eq(fridgeItems.userId, userId), eq(fridgeItems.status, "active")));

      if (rows.length === 0) return "The fridge is empty — nothing prepared right now.";

      const categories = [...new Set(rows.map((r) => r.foodStorageCategory).filter((c): c is string => Boolean(c)))];
      const guidelineRows =
        categories.length > 0
          ? await db.select().from(storageGuidelines).where(inArray(storageGuidelines.category, categories))
          : [];
      const guidelineByCategory = new Map(guidelineRows.map((g) => [g.category, g]));

      const now = Date.now();
      const items = rows.map((row) => {
        const guideline = row.foodStorageCategory ? guidelineByCategory.get(row.foodStorageCategory) : undefined;
        const fridgeHours = row.recipeFridgeOverride ?? guideline?.fridgeHours ?? FRIDGE_TOOL_FALLBACK_WINDOW.fridgeHours;
        const freezerDays = row.recipeFreezerOverride ?? guideline?.freezerDays ?? FRIDGE_TOOL_FALLBACK_WINDOW.freezerDays;
        const roomTempHours = guideline?.roomTempHours ?? FRIDGE_TOOL_FALLBACK_WINDOW.roomTempHours;
        const windowHours = row.location === "fridge" ? fridgeHours : row.location === "freezer" ? freezerDays * 24 : roomTempHours;
        const expired = now > row.preparedAt.getTime() + windowHours * HOUR_MS;

        return {
          name: row.label ?? row.foodName ?? row.recipeTitle ?? "prepared item",
          location: row.location,
          expired,
        };
      });

      return JSON.stringify({ items });
    },
  });
}

// ---------------------------------------------------------------------------
// search_recipes
// ---------------------------------------------------------------------------

const SEARCH_RECIPES_INPUT_SCHEMA = {
  type: "object",
  properties: {
    ageMonths: {
      type: "integer",
      minimum: 0,
      maximum: 60,
      description: "The baby's age in months, from get_baby_profile.",
    },
    query: {
      type: "string",
      maxLength: 80,
      description: "Optional keyword to match against the recipe title, e.g. 'salmon' or 'breakfast'.",
    },
  },
  required: ["ageMonths"],
  additionalProperties: false,
} as const;

function buildSearchRecipesTool(db: Database, userId: string) {
  return betaTool({
    name: "search_recipes",
    description: "Search the recipe catalog, filtered by the baby's age in months. Returns at most 5 matches.",
    inputSchema: SEARCH_RECIPES_INPUT_SCHEMA,
    run: async ({ ageMonths, query }) => {
      // Scoped like every other recipe read: the seeded catalog plus this
      // parent's own recipes, never another account's.
      const conditions = [visibleRecipesCondition(userId), lte(recipes.minAgeMonths, ageMonths)];
      const trimmedQuery = query?.trim();
      if (trimmedQuery) conditions.push(ilike(recipes.title, `%${trimmedQuery}%`));

      // ironFocus is DERIVED (stored flag OR a high-iron ingredient), the
      // same value the list, detail, and favorites routes report (and so is
      // the fiberHigh added to each row below) — so the
      // assistant ranks a custom beef recipe as iron-rich too. Derivation
      // needs the ingredient join, so rank in memory over a bounded
      // candidate set rather than ordering by the raw column.
      const candidates = await db
        .select({ id: recipes.id, title: recipes.title, minAgeMonths: recipes.minAgeMonths, ironFocus: recipes.ironFocus })
        .from(recipes)
        .where(and(...conditions))
        .orderBy(asc(recipes.title))
        .limit(50);

      if (candidates.length === 0) {
        return "No recipes matched. You may propose an original recipe instead, following the ingredient-limit and safety rules.";
      }
      const nutrition = await loadRecipeNutrition(
        db,
        candidates.map((row) => row.id),
      );
      // `fiberHigh` rides along on the same batch — a parent asking about
      // constipation gets to see which matches are high-fiber without the
      // assistant guessing from the title. It never reorders the list;
      // iron-first ranking is unchanged.
      const rows = candidates
        .map((row) => ({
          ...row,
          ironFocus: deriveIronFocus(row.ironFocus, nutritionFor(nutrition, row.id)),
          fiberHigh: nutritionFor(nutrition, row.id).fiberHigh,
          vitaminCHigh: nutritionFor(nutrition, row.id).vitaminCHigh,
        }))
        .sort((a, b) => Number(b.ironFocus) - Number(a.ironFocus) || a.title.localeCompare(b.title))
        .slice(0, 5);
      return JSON.stringify({ recipes: rows });
    },
  });
}

// ---------------------------------------------------------------------------
// get_food_prep_guidance
// ---------------------------------------------------------------------------

const FOOD_PREP_INPUT_SCHEMA = {
  type: "object",
  properties: {
    foodSlug: {
      type: "string",
      minLength: 1,
      maxLength: 80,
      description: "The food's catalog slug, e.g. 'banana' or 'chicken-thigh'.",
    },
    ageStage: {
      type: "string",
      enum: ["6", "9", "12"],
      description: "The closest age stage in months: 6, 9, or 12.",
    },
  },
  required: ["foodSlug", "ageStage"],
  additionalProperties: false,
} as const;

function buildFoodPrepGuidanceTool(db: Database, userId: string) {
  return betaTool({
    name: "get_food_prep_guidance",
    description: "Get the choking-safe prep instructions for one catalog food at a given age stage.",
    inputSchema: FOOD_PREP_INPUT_SCHEMA,
    run: async ({ foodSlug, ageStage }) => {
      // Same visibility rule as GET /api/foods/:slug: the seeded catalog
      // plus this user's own custom foods, never anybody else's.
      const [food] = await db
        .select()
        .from(foods)
        .where(and(eq(foods.slug, foodSlug), or(isNull(foods.ownerId), eq(foods.ownerId, userId))))
        .limit(1);
      if (!food) return `No catalog food found with slug "${foodSlug}".`;

      // A custom food has no curated guidance at all — the prep columns are
      // empty placeholders, and inventing an answer from them would be worse
      // than saying so.
      if (food.ownerId !== null) {
        return `"${food.name}" is a food this parent added themselves, so the catalog has no prep or choking guidance for it.`;
      }

      const prep = ageStage === "6" ? food.prep6m : ageStage === "9" ? food.prep9m : food.prep12m;
      return JSON.stringify({
        food: food.name,
        ageStage,
        prep,
        minAgeMonths: food.minAgeMonths,
        chokingRisk: food.chokingRisk,
        chokingNotes: food.chokingNotes,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface ChatTools {
  get_baby_profile: ReturnType<typeof buildBabyProfileTool>;
  get_fridge: ReturnType<typeof buildFridgeTool>;
  search_recipes: ReturnType<typeof buildSearchRecipesTool>;
  get_food_prep_guidance: ReturnType<typeof buildFoodPrepGuidanceTool>;
}

/** Builds every tool, closed over the caller's identity. The route picks the
 * subset for the thread's kind (recipe: all four; blw: get_baby_profile only). */
export function buildChatTools(db: Database, userId: string, babyId: string | null): ChatTools {
  return {
    get_baby_profile: buildBabyProfileTool(db, userId, babyId),
    get_fridge: buildFridgeTool(db, userId),
    search_recipes: buildSearchRecipesTool(db, userId),
    get_food_prep_guidance: buildFoodPrepGuidanceTool(db, userId),
  };
}
