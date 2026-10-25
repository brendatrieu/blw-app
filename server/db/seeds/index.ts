// Idempotent content seeding: the 9 top allergens (inline) plus the
// foods/pairings/recipes/ladder/storage-guideline data files. Safe to run
// repeatedly — every insert is an upsert keyed on each table's natural key
// (slug / step / category), matching what drizzle-kit migrations create.
// Recipe ingredients, recipe stages and pairings a seed dropped are pruned
// (ledger 897); foods, recipes, allergen tags, ladder steps and storage
// categories are never deleted here.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
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
  { slug: "tree_nut", name: "Tree nut", introGuidance: "Smooth almond, cashew, or plain hazelnut butter thinned with water/yogurt/breastmilk, or walnut, pistachio, or pecan ground to a fine meal and stirred into food — never whole or chopped nuts." },
  { slug: "fish", name: "Fish", introGuidance: "Well-cooked, deboned, flaked low-mercury fish (salmon, cod, trout, sardines) as a tiny first portion; canned light tuna only in moderation." },
  { slug: "shellfish", name: "Shellfish", introGuidance: "Well-cooked, finely chopped shellfish (e.g. shrimp) as a tiny first portion." },
  { slug: "wheat", name: "Wheat", introGuidance: "Wheat toast fingers or pasta as a tiny first portion." },
  { slug: "soy", name: "Soy", introGuidance: "Soft tofu or soy-based foods as a tiny first portion." },
  { slug: "sesame", name: "Sesame", introGuidance: "Tahini thinned with water/yogurt, hummus, or a pinch of sesame seeds stirred into a wet food, as a tiny first portion." },
];

/** What a run pruned (ledger 897), for the container log. */
export interface SeedPruneCounts {
  ingredients: number;
  stages: number;
  pairings: number;
}

export async function runSeeds(db: Database): Promise<SeedPruneCounts> {
  const pruned: SeedPruneCounts = { ingredients: 0, stages: 0, pairings: 0 };
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
          fiberLevel: f.fiberLevel,
          chokingRisk: f.chokingRisk,
          minAgeMonths: f.minAgeMonths,
          prep6m: f.prep6m,
          prep9m: f.prep9m,
          prep12m: f.prep12m,
          chokingNotes: f.chokingNotes ?? null,
          notes: f.notes ?? null,
          storageCategory: f.storageCategory,
          kind: f.kind ?? "food",
        })),
      )
      .onConflictDoUpdate({
        target: foods.slug,
        set: {
          kind: sqlExcluded("kind"),
          name: sqlExcluded("name"),
          category: sqlExcluded("category"),
          ironLevel: sqlExcluded("iron_level"),
          vitaminCLevel: sqlExcluded("vitamin_c_level"),
          fiberLevel: sqlExcluded("fiber_level"),
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
      return allergenId
        ? [
            {
              foodId,
              allergenId,
              countsTowardProgress: f.countsTowardLadder === undefined,
              countsWhenAlone: f.countsTowardLadder === 'alone',
            },
          ]
        : [];
    });
  });
  if (foodAllergenRows.length > 0) {
    // The counting flags are seed content like any other column, so a re-seed
    // writes both; the tag itself is still never removed here.
    await db
      .insert(foodAllergens)
      .values(foodAllergenRows)
      .onConflictDoUpdate({
        target: [foodAllergens.foodId, foodAllergens.allergenId],
        set: {
          countsTowardProgress: sqlExcluded("counts_toward_progress"),
          countsWhenAlone: sqlExcluded("counts_when_alone"),
        },
      });
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
  // A pairing the seed dropped goes too (ledger 897). Only this seeder ever
  // writes food_pairings, and nothing references its rows.
  const keepPairings = new Set(pairingRows.map((row) => `${row.ironFoodId}/${row.vitCFoodId}`));
  const stalePairingIds = (
    await db
      .select({ id: foodPairings.id, ironFoodId: foodPairings.ironFoodId, vitCFoodId: foodPairings.vitCFoodId })
      .from(foodPairings)
  )
    .filter((row) => !keepPairings.has(`${row.ironFoodId}/${row.vitCFoodId}`))
    .map((row) => row.id);
  if (stalePairingIds.length > 0) {
    await db.delete(foodPairings).where(inArray(foodPairings.id, stalePairingIds));
  }
  pruned.pairings = stalePairingIds.length;

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
          extraIngredients:
            r.extraIngredients?.map((extra) => ({ name: extra.name, quantityNote: extra.quantityNote ?? "" })) ?? null,
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
      // A stage below the recipe's own minAgeMonths is simply absent from the
      // seed (the shrimp basics carry 9 and 12 only), so skip it rather than
      // inventing a row for it.
      return (["6", "9", "12"] as const).flatMap((stage) => {
        const variant = r.variants[stage];
        if (!variant) return [];
        return [
          {
            recipeId,
            ageStage: stage,
            textureNote: variant.textureNote,
            instructions: variant.steps,
          },
        ];
      });
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

    // Ledger 897: the upserts above never delete, so an ingredient (or a
    // stage) a recipe seed later dropped lingered — the oats split left
    // iron_fortified_oats on two oatmeal recipes. Prune those rows on the
    // SEEDED catalog recipes only: a parent's own recipes have an owner and
    // are never seeded, so `owner_id IS NULL` keeps them out of reach.
    const seededRecipeIds = recipeSeeds.flatMap((r) => recipeIdBySlug.get(r.slug) ?? []);
    const seededCatalog = and(isNull(recipes.ownerId), inArray(recipes.id, seededRecipeIds));
    const keepIngredients = new Set(ingredientRows.map((row) => `${row.recipeId}/${row.foodId}`));
    const staleIngredientIds = (
      await db
        .select({ id: recipeIngredients.id, recipeId: recipeIngredients.recipeId, foodId: recipeIngredients.foodId })
        .from(recipeIngredients)
        .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
        .where(seededCatalog)
    )
      .filter((row) => !keepIngredients.has(`${row.recipeId}/${row.foodId}`))
      .map((row) => row.id);
    if (staleIngredientIds.length > 0) {
      await db.delete(recipeIngredients).where(inArray(recipeIngredients.id, staleIngredientIds));
    }
    pruned.ingredients = staleIngredientIds.length;
    const keepVariants = new Set(variantRows.map((row) => `${row.recipeId}/${row.ageStage}`));
    const staleVariantIds = (
      await db
        .select({ id: recipeVariants.id, recipeId: recipeVariants.recipeId, ageStage: recipeVariants.ageStage })
        .from(recipeVariants)
        .innerJoin(recipes, eq(recipes.id, recipeVariants.recipeId))
        .where(seededCatalog)
    )
      .filter((row) => !keepVariants.has(`${row.recipeId}/${row.ageStage}`))
      .map((row) => row.id);
    if (staleVariantIds.length > 0) {
      await db.delete(recipeVariants).where(inArray(recipeVariants.id, staleVariantIds));
    }
    pruned.stages = staleVariantIds.length;
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
  return pruned;
}

// drizzle-orm's query builder doesn't (yet) expose a typed `excluded.<col>`
// helper for onConflictDoUpdate, so this builds the raw `excluded.<column>`
// reference Postgres's ON CONFLICT DO UPDATE ... SET expects.
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

// Generic "slug -> id" lookup shared by every seed step below.
async function slugIdMap(
  db: Database,
  table: PgTable,
  slugCol: AnyPgColumn,
  idCol: AnyPgColumn,
): Promise<Map<string, string>> {
  const rows: { slug: string; id: string }[] = await db
    .select({ slug: slugCol, id: idCol })
    .from(table)
    .then((result) => result as { slug: string; id: string }[]);
  return new Map(rows.map((r) => [r.slug, r.id]));
}

// Standalone entrypoint: `tsx db/seeds/index.ts` (invoked by the
// db:seed script after db:migrate).
async function main() {
  const db = createDb(process.env.DATABASE_URL);
  const pruned = await runSeeds(db);
  // The container log is where the owner can confirm what a deploy removed.
  console.log(
    `Seeds applied (removed ${pruned.ingredients} stale recipe ingredients, ${pruned.stages} recipe stages, ${pruned.pairings} pairings).`,
  );
}

const isMainModule =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  main().catch((err: unknown) => {
    console.error("Seeding failed:", err);
    process.exitCode = 1;
  });
}
