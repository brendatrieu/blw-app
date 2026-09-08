// The allergen ladder, read two ways. GET /api/babies/:babyId/allergen-progress
// renders every row of it; GET /api/babies/:babyId/allergen-progress/:slug
// renders one row plus the story behind it (the foods that carry the
// allergen, and the meals that exposed this baby to them).
//
// Both go through `loadAllergenProgress`, which is the ONLY place the ladder
// is derived. That is deliberate: the detail page opens from a ladder row,
// so any second derivation would eventually let the two disagree about the
// same allergen — the row saying "started", the page it opened saying
// something else. Ownership is the caller's business here, exactly as in
// `loadMeals`: these functions only read by id.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { unionAllergenStatus, type AllergenDetail, type AllergenProgressItem } from "@blw/shared";
import type { Database } from "../db/index.js";
import {
  allergenLadderSteps,
  allergenOverrides,
  allergens,
  foodAllergens,
  foods,
  mealFoods,
  meals,
} from "../db/schema.js";
import { visibleFoodsCondition } from "./foods.js";

/** Newest 50 exposures. The history is a page, not an archive — a baby with
 * a year of egg on the log does not need all of it to answer "how is this
 * one going?", and the client renders the list in one scroll. */
const EXPOSURE_LIMIT = 50;

/**
 * Every allergen with this baby's derived progress, in ladder order
 * (unstepped allergens last, alphabetically) so the response is already in
 * the order the tracker renders it.
 *
 * One exposure = one (meal, food) pair carrying the allergen, exactly the
 * granularity the old one-row-per-food serve log counted. Parent overrides
 * are read alongside the derivation rather than folded into the exposure
 * query on purpose: `exposures` stays a pure count of real meals, and the
 * union happens in one shared function.
 */
export async function loadAllergenProgress(db: Database, babyId: string): Promise<AllergenProgressItem[]> {
  const allergenRows = await db
    .select({
      id: allergens.id,
      slug: allergens.slug,
      name: allergens.name,
      introGuidance: allergens.introGuidance,
    })
    .from(allergens)
    .leftJoin(allergenLadderSteps, eq(allergenLadderSteps.allergenId, allergens.id))
    .orderBy(asc(sql`coalesce(${allergenLadderSteps.step}, 999)`), asc(allergens.name));

  const exposureRows = await db
    .select({
      allergenId: foodAllergens.allergenId,
      exposures: sql<number>`count(*)::int`,
      firstAt: sql<string>`min(${meals.servedAt})`,
      lastAt: sql<string>`max(${meals.servedAt})`,
    })
    .from(mealFoods)
    .innerJoin(meals, eq(mealFoods.mealId, meals.id))
    .innerJoin(foodAllergens, eq(foodAllergens.foodId, mealFoods.foodId))
    .where(eq(meals.babyId, babyId))
    .groupBy(foodAllergens.allergenId);

  const exposuresByAllergenId = new Map(exposureRows.map((r) => [r.allergenId, r]));

  const overrideRows = await db
    .select({ allergenKey: allergenOverrides.allergenKey })
    .from(allergenOverrides)
    .where(eq(allergenOverrides.babyId, babyId));
  const overriddenSlugs = new Set(overrideRows.map((row) => row.allergenKey));

  return allergenRows.map((a) => {
    const exposure = exposuresByAllergenId.get(a.id);
    const exposures = exposure?.exposures ?? 0;
    const { status, overridden } = unionAllergenStatus(exposures, overriddenSlugs.has(a.slug));
    return {
      allergenSlug: a.slug,
      allergenName: a.name,
      introGuidance: a.introGuidance,
      exposures,
      firstAt: exposure ? new Date(exposure.firstAt).toISOString() : null,
      // Null means "nothing logged", including for a row an override alone
      // established — see the schema's note on `lastServedAt`.
      lastServedAt: exposure ? new Date(exposure.lastAt).toISOString() : null,
      status,
      overridden,
    };
  });
}

/**
 * One ladder row plus its story, or `null` when `slug` names no allergen —
 * the canonical list is the seeded `allergens` table, so "not in the ladder"
 * and "does not exist" are the same miss and the route answers both as 404.
 *
 * `foods` is the catalog's foods carrying the allergen plus THIS caller's
 * custom ones; another parent's custom food is invisible here exactly as it
 * is everywhere else. `exposures` is the baby's meals containing at least one
 * of those foods, newest first and capped, each listing only the
 * allergen-carrying foods of that meal — the rest of the plate is not what
 * this page is about.
 */
export async function loadAllergenDetail(
  db: Database,
  babyId: string,
  slug: string,
  userId: string,
): Promise<AllergenDetail | null> {
  const progress = (await loadAllergenProgress(db, babyId)).find((item) => item.allergenSlug === slug);
  if (!progress) return null;

  const matchingFoodIds = db
    .select({ foodId: foodAllergens.foodId })
    .from(foodAllergens)
    .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
    .where(eq(allergens.slug, slug));

  const foodRows = await db
    .select({
      id: foods.id,
      slug: foods.slug,
      name: foods.name,
      category: foods.category,
      emoji: foods.emoji,
      ownerId: foods.ownerId,
    })
    .from(foods)
    // Visibility first: every other condition narrows what this allows.
    .where(and(visibleFoodsCondition(userId), inArray(foods.id, matchingFoodIds)))
    .orderBy(asc(foods.name));

  const detailFoods = foodRows.map((f) => ({
    id: f.id,
    slug: f.slug,
    name: f.name,
    category: f.category,
    // Null for every catalog food; the client falls back to its own
    // slug/category emoji table for those.
    emoji: f.emoji,
    isCustom: f.ownerId !== null,
  }));

  // No food carries this allergen (or none this caller can see), so no meal
  // can have exposed the baby to it — including an override-only row, whose
  // status came from a parent and never from the log.
  if (detailFoods.length === 0) return { progress, foods: detailFoods, exposures: [] };

  const foodIds = detailFoods.map((f) => f.id);

  // Page the meals first, then hydrate: joining the foods in one query would
  // make `limit` count food rows instead of meals. `selectDistinct` because a
  // meal carrying two of the allergen's foods is still one exposure row.
  const mealRows = await db
    .selectDistinct({
      id: meals.id,
      servedAt: meals.servedAt,
      reactionNote: meals.reactionNote,
      notes: meals.notes,
    })
    .from(meals)
    .innerJoin(mealFoods, eq(mealFoods.mealId, meals.id))
    .where(and(eq(meals.babyId, babyId), inArray(mealFoods.foodId, foodIds)))
    .orderBy(desc(meals.servedAt), desc(meals.id))
    .limit(EXPOSURE_LIMIT);

  const mealIds = mealRows.map((row) => row.id);
  const exposureFoodRows =
    mealIds.length > 0
      ? await db
          .select({
            mealId: mealFoods.mealId,
            id: foods.id,
            name: foods.name,
            emoji: foods.emoji,
          })
          .from(mealFoods)
          .innerJoin(foods, eq(mealFoods.foodId, foods.id))
          .where(and(inArray(mealFoods.mealId, mealIds), inArray(mealFoods.foodId, foodIds)))
          .orderBy(asc(foods.name))
      : [];

  const foodsByMealId = new Map<string, { id: string; name: string; emoji: string | null }[]>();
  for (const row of exposureFoodRows) {
    const list = foodsByMealId.get(row.mealId);
    const food = { id: row.id, name: row.name, emoji: row.emoji };
    if (list) {
      list.push(food);
    } else {
      foodsByMealId.set(row.mealId, [food]);
    }
  }

  const exposures = mealRows.map((row) => ({
    mealId: row.id,
    servedAt: row.servedAt.toISOString(),
    foods: foodsByMealId.get(row.id) ?? [],
    reaction: row.reactionNote,
    notes: row.notes,
  }));

  return { progress, foods: detailFoods, exposures };
}
