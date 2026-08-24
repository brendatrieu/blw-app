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
import { and, asc, desc, eq, ilike, inArray, lte } from "drizzle-orm";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { ageInMonths, deriveAllergenStatus } from "@blw/shared";
import type { Database } from "../db/index.js";
import { allergens, babies, foodAllergens, foods, pantryItems, recipes, serveLogs, storageGuidelines } from "../db/schema.js";

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

  const servedRows = await db
    .select({ foodName: foods.name, reactionNote: serveLogs.reactionNote })
    .from(serveLogs)
    .innerJoin(foods, eq(serveLogs.foodId, foods.id))
    .where(eq(serveLogs.babyId, babyId));

  const foodsIntroduced = new Set(servedRows.map((r) => r.foodName));
  const knownReactiveFoods = [...new Set(servedRows.filter((r) => r.reactionNote).map((r) => r.foodName))];

  // Same >=3-exposures threshold the allergen ladder tracker uses, via the
  // shared derivation function, so this summary never disagrees with what
  // the parent sees on /babies/:id/allergens.
  const exposureRows = await db
    .select({ allergenSlug: allergens.slug })
    .from(serveLogs)
    .innerJoin(foodAllergens, eq(serveLogs.foodId, foodAllergens.foodId))
    .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
    .where(eq(serveLogs.babyId, babyId));
  const exposureCountBySlug = new Map<string, number>();
  for (const row of exposureRows) {
    exposureCountBySlug.set(row.allergenSlug, (exposureCountBySlug.get(row.allergenSlug) ?? 0) + 1);
  }
  const establishedTop9Allergens = [...exposureCountBySlug.entries()]
    .filter(([, count]) => deriveAllergenStatus(count) === "established")
    .map(([slug]) => slug);

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
// get_pantry
// ---------------------------------------------------------------------------

/** Same fallback window server/src/routes/pantry.ts uses for an item with no
 * resolvable storage category — kept in sync by hand since duplicating the
 * whole hydration pipeline here for a model-facing summary isn't worth it. */
const PANTRY_TOOL_FALLBACK_WINDOW = { fridgeHours: 48, freezerDays: 60, roomTempHours: 2 };
const HOUR_MS = 60 * 60 * 1000;

function buildPantryTool(db: Database, userId: string) {
  return betaTool({
    name: "get_pantry",
    description:
      "List the household's active prepared-food pantry items with a freshness flag. An item flagged expired must never be suggested for reuse.",
    inputSchema: EMPTY_INPUT_SCHEMA,
    run: async () => {
      const rows = await db
        .select({
          label: pantryItems.label,
          foodName: foods.name,
          recipeTitle: recipes.title,
          preparedAt: pantryItems.preparedAt,
          location: pantryItems.location,
          foodStorageCategory: foods.storageCategory,
          recipeFridgeOverride: recipes.fridgeHoursOverride,
          recipeFreezerOverride: recipes.freezerDaysOverride,
        })
        .from(pantryItems)
        .leftJoin(foods, eq(pantryItems.foodId, foods.id))
        .leftJoin(recipes, eq(pantryItems.recipeId, recipes.id))
        .where(and(eq(pantryItems.userId, userId), eq(pantryItems.status, "active")));

      if (rows.length === 0) return "The pantry is empty — nothing prepared right now.";

      const categories = [...new Set(rows.map((r) => r.foodStorageCategory).filter((c): c is string => Boolean(c)))];
      const guidelineRows =
        categories.length > 0
          ? await db.select().from(storageGuidelines).where(inArray(storageGuidelines.category, categories))
          : [];
      const guidelineByCategory = new Map(guidelineRows.map((g) => [g.category, g]));

      const now = Date.now();
      const items = rows.map((row) => {
        const guideline = row.foodStorageCategory ? guidelineByCategory.get(row.foodStorageCategory) : undefined;
        const fridgeHours = row.recipeFridgeOverride ?? guideline?.fridgeHours ?? PANTRY_TOOL_FALLBACK_WINDOW.fridgeHours;
        const freezerDays = row.recipeFreezerOverride ?? guideline?.freezerDays ?? PANTRY_TOOL_FALLBACK_WINDOW.freezerDays;
        const roomTempHours = guideline?.roomTempHours ?? PANTRY_TOOL_FALLBACK_WINDOW.roomTempHours;
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

function buildSearchRecipesTool(db: Database) {
  return betaTool({
    name: "search_recipes",
    description: "Search the seeded recipe catalog, filtered by the baby's age in months. Returns at most 5 matches.",
    inputSchema: SEARCH_RECIPES_INPUT_SCHEMA,
    run: async ({ ageMonths, query }) => {
      const conditions = [lte(recipes.minAgeMonths, ageMonths)];
      const trimmedQuery = query?.trim();
      if (trimmedQuery) conditions.push(ilike(recipes.title, `%${trimmedQuery}%`));

      const rows = await db
        .select({ id: recipes.id, title: recipes.title, minAgeMonths: recipes.minAgeMonths, ironFocus: recipes.ironFocus })
        .from(recipes)
        .where(and(...conditions))
        .orderBy(desc(recipes.ironFocus), asc(recipes.title))
        .limit(5);

      if (rows.length === 0) {
        return "No seed recipes matched. You may propose an original recipe instead, following the ingredient-limit and safety rules.";
      }
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

function buildFoodPrepGuidanceTool(db: Database) {
  return betaTool({
    name: "get_food_prep_guidance",
    description: "Get the choking-safe prep instructions for one catalog food at a given age stage.",
    inputSchema: FOOD_PREP_INPUT_SCHEMA,
    run: async ({ foodSlug, ageStage }) => {
      const [food] = await db.select().from(foods).where(eq(foods.slug, foodSlug)).limit(1);
      if (!food) return `No catalog food found with slug "${foodSlug}".`;

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
  get_pantry: ReturnType<typeof buildPantryTool>;
  search_recipes: ReturnType<typeof buildSearchRecipesTool>;
  get_food_prep_guidance: ReturnType<typeof buildFoodPrepGuidanceTool>;
}

/** Builds every tool, closed over the caller's identity. The route picks the
 * subset for the thread's kind (recipe: all four; blw: get_baby_profile only). */
export function buildChatTools(db: Database, userId: string, babyId: string | null): ChatTools {
  return {
    get_baby_profile: buildBabyProfileTool(db, userId, babyId),
    get_pantry: buildPantryTool(db, userId),
    search_recipes: buildSearchRecipesTool(db),
    get_food_prep_guidance: buildFoodPrepGuidanceTool(db),
  };
}
