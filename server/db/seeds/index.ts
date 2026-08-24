// Idempotent content seeding: the 9 top allergens (inline) plus the
// foods/pairings/recipes/ladder/storage-guideline data files. Safe to run
// repeatedly — every insert is an upsert keyed on each table's natural key
// (slug / step / category), matching what drizzle-kit migrations create.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "../../src/db/index.js";
import {
  allergenLadderSteps,
  allergens,
  foodAllergens,
  foodPairings,
  foods,
  recipeIngredients,
  recipeVariants,
  recipes,
  storageGuidelines,
} from "../../src/db/schema.js";
// Imported as a namespace because the content-authoring agent's export name
// (`ladderSteps`) differs from the task spec that scaffolded this file
// (`ladder`) — accept either so the seed script works regardless of which
// lands.
import * as ladderModule from "./data/ladder.js";
import { pairings } from "./data/pairings.js";
import { recipes as recipeSeeds } from "./data/recipes.js";
import { foods as foodSeeds } from "./data/foods.js";
import { storageGuidelines as storageGuidelineSeeds } from "./data/storage.js";
import type { AllergenSlug, LadderStepSeed } from "./data/types.js";

const ladder: LadderStepSeed[] =
  (ladderModule as { ladder?: LadderStepSeed[] }).ladder ??
  (ladderModule as { ladderSteps?: LadderStepSeed[] }).ladderSteps ??
  [];

const ALLERGENS: { slug: AllergenSlug; name: string; introGuidance: string }[] = [
  { slug: "milk", name: "Milk", introGuidance: "Offer whole-milk yogurt or cheese as a first taste; watch for hives, vomiting, or eczema flares over the following days." },
  { slug: "egg", name: "Egg", introGuidance: "Well-cooked egg (e.g. scrambled or baked into pancakes) in a tiny first portion; one of the most common early allergens." },
  { slug: "peanut", name: "Peanut", introGuidance: "Thinned smooth peanut butter only — never whole nuts or thick globs, which are choking hazards." },
  { slug: "tree_nut", name: "Tree nut", introGuidance: "Smooth nut butter thinned with water/yogurt/breastmilk, or finely ground nut mixed into food — never whole or chopped nuts." },
  { slug: "fish", name: "Fish", introGuidance: "Well-cooked, deboned, flaked low-mercury fish (e.g. salmon) as a tiny first portion." },
  { slug: "shellfish", name: "Shellfish", introGuidance: "Well-cooked, finely chopped shellfish (e.g. shrimp) as a tiny first portion." },
  { slug: "wheat", name: "Wheat", introGuidance: "Wheat toast fingers or pasta as a tiny first portion." },
  { slug: "soy", name: "Soy", introGuidance: "Soft tofu or soy-based foods as a tiny first portion." },
  { slug: "sesame", name: "Sesame", introGuidance: "Tahini thinned with water/yogurt, or hummus, as a tiny first portion." },
];

export async function runSeeds(db: Database): Promise<void> {
  // 1. Allergens (natural key: slug).
  await db
    .insert(allergens)
    .values(ALLERGENS)
    .onConflictDoUpdate({
      target: allergens.slug,
      set: { name: sqlExcluded("name"), introGuidance: sqlExcluded("intro_guidance") },
    });

  // 2. Storage guidelines (natural key: category) — must exist before foods,
  // which FK into storage_guidelines.category.
  if (storageGuidelineSeeds.length > 0) {
    await db
      .insert(storageGuidelines)
      .values(
        storageGuidelineSeeds.map((s) => ({
          category: s.category,
          fridgeHours: s.fridgeHours,
          freezerDays: s.freezerDays,
          roomTempHours: s.roomTempHours,
          notes: s.notes,
        })),
      )
      .onConflictDoUpdate({
        target: storageGuidelines.category,
        set: {
          fridgeHours: sqlExcluded("fridge_hours"),
          freezerDays: sqlExcluded("freezer_days"),
          roomTempHours: sqlExcluded("room_temp_hours"),
          notes: sqlExcluded("notes"),
        },
      });
  }

  // 3. Foods (natural key: slug).
  if (foodSeeds.length > 0) {
    await db
      .insert(foods)
      .values(
        foodSeeds.map((f) => ({
          slug: f.slug,
          name: f.name,
          category: f.category,
          ironLevel: f.ironLevel,
          vitaminCLevel: f.vitaminCLevel,
          chokingRisk: f.chokingRisk,
          minAgeMonths: f.minAgeMonths,
          prep6m: f.prep6m,
          prep9m: f.prep9m,
          prep12m: f.prep12m,
          chokingNotes: f.chokingNotes ?? null,
          notes: f.notes ?? null,
          storageCategory: f.storageCategory,
        })),
      )
      .onConflictDoUpdate({
        target: foods.slug,
        set: {
          name: sqlExcluded("name"),
          category: sqlExcluded("category"),
          ironLevel: sqlExcluded("iron_level"),
          vitaminCLevel: sqlExcluded("vitamin_c_level"),
          chokingRisk: sqlExcluded("choking_risk"),
          minAgeMonths: sqlExcluded("min_age_months"),
          prep6m: sqlExcluded("prep_6m"),
          prep9m: sqlExcluded("prep_9m"),
          prep12m: sqlExcluded("prep_12m"),
          chokingNotes: sqlExcluded("choking_notes"),
          notes: sqlExcluded("notes"),
          storageCategory: sqlExcluded("storage_category"),
        },
      });
  }

  const foodIdBySlug = await slugIdMap(db, foods, foods.slug, foods.id);
  const allergenIdBySlug = await slugIdMap(db, allergens, allergens.slug, allergens.id);

  // 4. food_allergens M:N, derived from each FoodSeed.allergens list.
  const foodAllergenRows = foodSeeds.flatMap((f) => {
    const foodId = foodIdBySlug.get(f.slug);
    if (!foodId) return [];
    return f.allergens.flatMap((slug) => {
      const allergenId = allergenIdBySlug.get(slug);
      return allergenId ? [{ foodId, allergenId }] : [];
    });
  });
  if (foodAllergenRows.length > 0) {
    await db
      .insert(foodAllergens)
      .values(foodAllergenRows)
      .onConflictDoNothing({ target: [foodAllergens.foodId, foodAllergens.allergenId] });
  }

  // 5. food_pairings (natural key: iron_food_id + vit_c_food_id).
  const pairingRows = pairings.flatMap((p) => {
    const ironFoodId = foodIdBySlug.get(p.ironFoodSlug);
    const vitCFoodId = foodIdBySlug.get(p.vitCFoodSlug);
    return ironFoodId && vitCFoodId ? [{ ironFoodId, vitCFoodId, reason: p.reason }] : [];
  });
  if (pairingRows.length > 0) {
    await db
      .insert(foodPairings)
      .values(pairingRows)
      .onConflictDoUpdate({
        target: [foodPairings.ironFoodId, foodPairings.vitCFoodId],
        set: { reason: sqlExcluded("reason") },
      });
  }

  // 6. Recipes (natural key: slug). Recipe allergens are NOT stored
  // redundantly — they're derived at query time by joining
  // recipe_ingredients -> food_allergens, per the plan's single-source-of-
  // truth approach.
  if (recipeSeeds.length > 0) {
    await db
      .insert(recipes)
      .values(
        recipeSeeds.map((r) => ({
          slug: r.slug,
          title: r.title,
          minAgeMonths: r.minAgeMonths,
          prepMinutes: r.prepMinutes,
          ironFocus: r.ironFocus,
          fridgeHoursOverride: r.fridgeHoursOverride ?? null,
          freezerDaysOverride: r.freezerDaysOverride ?? null,
          extraIngredients: r.extraIngredients ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: recipes.slug,
        set: {
          title: sqlExcluded("title"),
          minAgeMonths: sqlExcluded("min_age_months"),
          prepMinutes: sqlExcluded("prep_minutes"),
          ironFocus: sqlExcluded("iron_focus"),
          fridgeHoursOverride: sqlExcluded("fridge_hours_override"),
          freezerDaysOverride: sqlExcluded("freezer_days_override"),
          extraIngredients: sqlExcluded("extra_ingredients"),
        },
      });

    const recipeIdBySlug = await slugIdMap(db, recipes, recipes.slug, recipes.id);

    const ingredientRows = recipeSeeds.flatMap((r) => {
      const recipeId = recipeIdBySlug.get(r.slug);
      if (!recipeId) return [];
      return r.ingredients.flatMap((ing) => {
        const foodId = foodIdBySlug.get(ing.foodSlug);
        return foodId ? [{ recipeId, foodId, quantityNote: ing.quantityNote }] : [];
      });
    });
    if (ingredientRows.length > 0) {
      await db
        .insert(recipeIngredients)
        .values(ingredientRows)
        .onConflictDoUpdate({
          target: [recipeIngredients.recipeId, recipeIngredients.foodId],
          set: { quantityNote: sqlExcluded("quantity_note") },
        });
    }

    const variantRows = recipeSeeds.flatMap((r) => {
      const recipeId = recipeIdBySlug.get(r.slug);
      if (!recipeId) return [];
      return (["6", "9", "12"] as const).map((stage) => ({
        recipeId,
        ageStage: stage,
        textureNote: r.variants[stage].textureNote,
        instructions: r.variants[stage].steps,
      }));
    });
    if (variantRows.length > 0) {
      await db
        .insert(recipeVariants)
        .values(variantRows)
        .onConflictDoUpdate({
          target: [recipeVariants.recipeId, recipeVariants.ageStage],
          set: { textureNote: sqlExcluded("texture_note"), instructions: sqlExcluded("instructions") },
        });
    }
  }

  // 7. Allergen ladder (natural key: step).
  if (ladder.length > 0) {
    const ladderRows = ladder.flatMap((step) => {
      const allergenId = allergenIdBySlug.get(step.allergen);
      const starterFoodId = foodIdBySlug.get(step.starterFoodSlug);
      if (!allergenId || !starterFoodId) return [];
      return [
        {
          step: step.step,
          allergenId,
          starterFoodId,
          howTo: step.howTo,
          waitDays: step.waitDays,
        },
      ];
    });
    if (ladderRows.length > 0) {
      await db
        .insert(allergenLadderSteps)
        .values(ladderRows)
        .onConflictDoUpdate({
          target: allergenLadderSteps.step,
          set: {
            allergenId: sqlExcluded("allergen_id"),
            starterFoodId: sqlExcluded("starter_food_id"),
            howTo: sqlExcluded("how_to"),
            waitDays: sqlExcluded("wait_days"),
          },
        });
    }
  }
}

// drizzle-orm's query builder doesn't (yet) expose a typed `excluded.<col>`
// helper for onConflictDoUpdate, so this builds the raw `excluded.<column>`
// reference Postgres's ON CONFLICT DO UPDATE ... SET expects.
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

// Loose typing on purpose: this file runs standalone via tsx (outside the
// package's tsc build) and is a thin, generic "slug -> id" lookup shared by
// every seed step below.
async function slugIdMap(db: Database, table: any, slugCol: any, idCol: any): Promise<Map<string, string>> {
  const rows: { slug: string; id: string }[] = await (db as any).select({ slug: slugCol, id: idCol }).from(table);
  return new Map(rows.map((r) => [r.slug, r.id]));
}

// Standalone entrypoint: `tsx db/seeds/index.ts` (invoked by the
// db:seed script after db:migrate).
async function main() {
  const db = createDb(process.env.DATABASE_URL);
  await runSeeds(db);
  console.log("Seeds applied.");
}

const isMainModule =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  main().catch((err: unknown) => {
    console.error("Seeding failed:", err);
    process.exitCode = 1;
  });
}
