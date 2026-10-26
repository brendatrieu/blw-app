// Ledger 901 (plan SPEC §8 row 1, §8.1): ONE recorder of everything the plate
// migration must leave unchanged, and one checker of the `meal_items`
// invariants (SPEC §2.2). The migration test and the prod-backup dry run both
// call these, so they cannot disagree about what "unchanged" means.
//
// `recordPlateParity` reads through the app's own readers (loadMeals,
// allergen progress and detail, foods tried, rating summaries and history,
// served counts, the symptom snapshot, the AI profile summary) plus raw dumps
// of the legacy tables, and returns plain JSON (it holds names and ids, so a
// dry run keeps it on the machine that made it and prints only
// `comparePlateParity`'s counts).
import { isDeepStrictEqual } from "node:util";
import { sql, type SQL } from "drizzle-orm";
import { fetchBabyProfileSummary } from "../ai/tools.js";
import { buildExposureSnapshot } from "../ai/snapshot.js";
import { loadAllergenDetail, loadAllergenProgress } from "../services/allergens.js";
import {
  countFoodsTried,
  countServed,
  loadMeals,
  loadRatingHistory,
  loadRatingSummaries,
  type MealReads,
} from "../services/meals.js";
import type { Database } from "./index.js";

/** observable -> key -> value, JSON only. */
export type ParityRecord = Record<string, Record<string, unknown>>;

async function rows<T>(db: Database, query: string | SQL): Promise<T[]> {
  return ((await db.execute(typeof query === "string" ? sql.raw(query) : query)) as unknown as { rows: T[] }).rows;
}

function groupBy<T extends Record<string, unknown>>(list: T[], key: keyof T): Record<string, Omit<T, typeof key>[]> {
  const out: Record<string, Omit<T, typeof key>[]> = {};
  for (const row of list) {
    const { [key]: id, ...rest } = row;
    (out[String(id)] ??= []).push(rest);
  }
  return out;
}

const LOAD_MEALS_CHUNK = 500;

/**
 * A database from before 0024 has no `meal_items`: it is recorded with the
 * readers its own app used (`MealReads` "legacy"); a migrated one with
 * today's readers, which read the plate. `loadMeals` is read without
 * `items` on both sides: the comparison is of what every older reader sees.
 */
export async function recordPlateParity(db: Database): Promise<ParityRecord> {
  const [{ plate } = { plate: null }] = await rows<{ plate: string | null }>(db, `SELECT to_regclass('meal_items')::text AS "plate"`);
  const reads: MealReads = plate ? "items" : "legacy";
  const record: ParityRecord = {
    meals: groupBy(
      await rows<Record<string, unknown>>(
        db,
        `SELECT "id", "baby_id", "recipe_id", "recipe_rating", "served_at", "reaction_note", "notes" FROM "meals" ORDER BY "id"`,
      ),
      "id",
    ),
    mealFoods: groupBy(
      await rows<Record<string, unknown>>(
        db,
        `SELECT "meal_id", "food_id", "storage_item_id", "rating" FROM "meal_foods" ORDER BY "meal_id", "food_id"`,
      ),
      "meal_id",
    ),
    mealRecipes: groupBy(
      await rows<Record<string, unknown>>(
        db,
        `SELECT "meal_id", "recipe_id", "position", "rating" FROM "meal_recipes" ORDER BY "meal_id", "position", "recipe_id"`,
      ),
      "meal_id",
    ),
    mealStorageItems: groupBy(
      await rows<Record<string, unknown>>(
        db,
        `SELECT "meal_id", "storage_item_id", "servings" FROM "meal_storage_items" ORDER BY "meal_id", "storage_item_id"`,
      ),
      "meal_id",
    ),
    containers: groupBy(
      await rows<Record<string, unknown>>(
        db,
        `SELECT "id", "status", "servings_total", "servings_left" FROM "storage_items" ORDER BY "id"`,
      ),
      "id",
    ),
    loadMeals: {},
    allergenProgress: {},
    allergenDetail: {},
    foodsTried: {},
    ratingSummaries: {},
    ratingHistory: {},
    servedCount: {},
    snapshot: {},
    profile: {},
  };

  const mealIds = Object.keys(record.meals!);
  for (let i = 0; i < mealIds.length; i += LOAD_MEALS_CHUNK) {
    const loaded = await loadMeals(db, mealIds.slice(i, i + LOAD_MEALS_CHUNK), { items: false });
    for (const [id, meal] of loaded) record.loadMeals![id] = meal;
  }

  const slugs = (await rows<{ slug: string }>(db, `SELECT "slug" FROM "allergens" ORDER BY "slug"`)).map((r) => r.slug);
  const babies = await rows<{ id: string; user_id: string }>(db, `SELECT "id", "user_id" FROM "babies" ORDER BY "id"`);
  for (const baby of babies) {
    const b = baby.id;
    record.allergenProgress![b] = await loadAllergenProgress(db, b, reads);
    for (const slug of slugs) record.allergenDetail![`${b}/${slug}`] = await loadAllergenDetail(db, b, slug, baby.user_id, reads);
    record.foodsTried![b] = await countFoodsTried(db, b);
    record.ratingSummaries![b] = await loadRatingSummaries(db, b, reads);
    const refs = await rows<{ kind: "foodId" | "recipeId"; id: string }>(
      db,
      sql`SELECT DISTINCT 'foodId' AS "kind", mf."food_id" AS "id" FROM "meal_foods" mf JOIN "meals" m ON m."id" = mf."meal_id" WHERE m."baby_id" = ${b}
       UNION SELECT DISTINCT 'recipeId', mr."recipe_id" FROM "meal_recipes" mr JOIN "meals" m ON m."id" = mr."meal_id" WHERE m."baby_id" = ${b}
       ORDER BY 1, 2`,
    );
    for (const ref of refs) {
      const query = { [ref.kind]: ref.id };
      record.ratingHistory![`${b}/${ref.id}`] = await loadRatingHistory(db, b, query, reads);
      record.servedCount![`${b}/${ref.id}`] = await countServed(db, b, query);
    }
    const servedAts = await rows<{ served_at: Date | string }>(
      db,
      sql`SELECT DISTINCT "served_at" FROM "meals" WHERE "baby_id" = ${b} ORDER BY "served_at"`,
    );
    for (const { served_at } of servedAts) {
      const onset = new Date(served_at);
      record.snapshot![`${b}@${onset.toISOString()}`] = await buildExposureSnapshot(db, b, onset);
    }
    const profile = await fetchBabyProfileSummary(db, baby.user_id, b, reads);
    // `ageMonths` moves with the clock, not with the migration.
    record.profile![b] = profile && {
      foodsIntroducedCount: profile.foodsIntroducedCount,
      knownReactiveFoods: profile.knownReactiveFoods,
      establishedTop9Allergens: profile.establishedTop9Allergens,
    };
  }

  const out = JSON.parse(JSON.stringify(record)) as ParityRecord;
  // Rows that tie on a reader's ORDER BY come back in plan order, and the
  // plan moves when ANALYZE runs (a restored Postgres analyzes itself within
  // a minute, often between the dry run's two records): one meal's foods in
  // the snapshot (by served_at only), the profile's reactive foods (no
  // order), same-name foods (by name only). Put ties in a fixed order; every
  // value is still compared (verifier p1-c2).
  type Named = { name: string; id: string };
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const byNameId = (a: Named, b: Named) => cmp(a.name, b.name) || cmp(a.id, b.id);
  for (const list of Object.values(out.snapshot!) as { servedAt: string }[][]) {
    list.sort((a, b) => cmp(b.servedAt, a.servedAt) || cmp(JSON.stringify(a), JSON.stringify(b)));
  }
  for (const profile of Object.values(out.profile!) as ({ knownReactiveFoods: string[] } | null)[]) profile?.knownReactiveFoods.sort();
  for (const detail of Object.values(out.allergenDetail!) as ({ foods: Named[]; exposures: { foods: Named[] }[] } | null)[]) {
    detail?.foods.sort(byNameId);
    for (const exposure of detail?.exposures ?? []) exposure.foods.sort(byNameId);
  }
  for (const meal of Object.values(out.loadMeals!) as { foods: Named[] }[]) meal.foods.sort(byNameId);
  return out;
}

/**
 * Mismatched keys per observable (a key missing on one side counts). Values
 * compare as JSON VALUES: arrays in order, object keys in any order. Rating
 * summaries are id-keyed objects built in row order, and within one meal the
 * legacy rows had no order (as the old client sent them) while the plate's
 * are by position; every client reads them by key (verifier p1-c1).
 */
export function comparePlateParity(before: ParityRecord, after: ParityRecord): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[name] ?? {};
    const b = after[name] ?? {};
    out[name] = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
      (key) => !(key in a) || !(key in b) || !isDeepStrictEqual(a[key], b[key]),
    ).length;
  }
  return out;
}

export interface InvariantViolation {
  mealId: string;
  /** SPEC §2.2 invariant number. */
  invariant: 1 | 2 | 3 | 4 | 5;
}

/**
 * The §2.2 invariants for every meal, recomputed in TypeScript from raw rows
 * (independent of the SQL in db/migrate.ts, so a bug there shows up here):
 * 1 `meal_foods` = the items' exposure union; 2 `meal_recipes` = the items'
 * recipes in order of first appearance; 3 every legacy rating equals its
 * mirror (the first rated row by position); 4 every linked container has a
 * group unless it is an orphan; 5 every `meal_foods` link names a group or an
 * orphan. `orphans` counts (meal, container) pairs.
 */
export async function checkPlateInvariants(db: Database): Promise<{ violations: InvariantViolation[]; orphans: number }> {
  type Item = {
    meal_id: string;
    food_id: string | null;
    recipe_id: string | null;
    storage_item_id: string | null;
    counted_food_ids: string[];
    rating: number | null;
  };
  type Legacy = { meal_id: string; ref: string; storage_item_id: string | null; rating: number | null };
  const items = await rows<Item>(
    db,
    `SELECT "meal_id", "food_id", "recipe_id", "storage_item_id", "counted_food_ids", "rating" FROM "meal_items" ORDER BY "meal_id", "position", "id"`,
  );
  const eaten = await rows<Legacy>(db, `SELECT "meal_id", "food_id" AS "ref", "storage_item_id", "rating" FROM "meal_foods"`);
  const recipes = await rows<Legacy>(
    db,
    `SELECT "meal_id", "recipe_id" AS "ref", NULL AS "storage_item_id", "rating" FROM "meal_recipes" ORDER BY "meal_id", "position", "recipe_id"`,
  );
  const served = await rows<{ meal_id: string; storage_item_id: string }>(db, `SELECT "meal_id", "storage_item_id" FROM "meal_storage_items"`);
  const containerRecipes = await rows<{ id: string; ref: string }>(
    db,
    `SELECT "id", "recipe_id" AS "ref" FROM "storage_items" WHERE "recipe_id" IS NOT NULL
     UNION SELECT "storage_item_id", "recipe_id" FROM "storage_item_recipes"`,
  );
  const containerFoods = await rows<{ id: string; ref: string }>(db, `SELECT "storage_item_id" AS "id", "food_id" AS "ref" FROM "storage_item_foods"`);
  const mealIds = (await rows<{ id: string }>(db, `SELECT "id" FROM "meals"`)).map((r) => r.id);

  const by = <T extends { meal_id: string }>(list: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of list) map.set(row.meal_id, [...(map.get(row.meal_id) ?? []), row]);
    return map;
  };
  const setsOf = (list: { id: string; ref: string }[]) => {
    const map = new Map<string, Set<string>>();
    for (const row of list) map.set(row.id, (map.get(row.id) ?? new Set()).add(row.ref));
    return map;
  };
  const itemsBy = by(items);
  const eatenBy = by(eaten);
  const recipesBy = by(recipes);
  const servedBy = by(served);
  const recipesOf = setsOf(containerRecipes);
  const foodsOf = setsOf(containerFoods);
  const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
  const mirror = (list: Item[], key: "food_id" | "recipe_id", ref: string) =>
    list.find((item) => item[key] === ref && item.rating !== null)?.rating ?? null;

  const violations: InvariantViolation[] = [];
  let orphans = 0;
  for (const mealId of mealIds) {
    const mi = itemsBy.get(mealId) ?? [];
    const mf = eatenBy.get(mealId) ?? [];
    const mr = recipesBy.get(mealId) ?? [];
    const flag = (invariant: InvariantViolation["invariant"]) => violations.push({ mealId, invariant });

    const exposure = new Set(mi.flatMap((item) => [...(item.food_id ? [item.food_id] : []), ...item.counted_food_ids]));
    if (!sameSet(exposure, new Set(mf.map((row) => row.ref)))) flag(1);

    const order = [...new Set(mi.flatMap((item) => (item.recipe_id ? [item.recipe_id] : [])))];
    if (order.join() !== mr.map((row) => row.ref).join()) flag(2);

    if (
      mf.some((row) => mirror(mi, "food_id", row.ref) !== row.rating) ||
      mr.some((row) => mirror(mi, "recipe_id", row.ref) !== row.rating)
    ) {
      flag(3);
    }

    const groups = new Set(mi.flatMap((item) => (item.storage_item_id ? [item.storage_item_id] : [])));
    const mealRecipeIds = new Set(mr.map((row) => row.ref));
    const mealFoodIds = new Set(mf.map((row) => row.ref));
    // An orphan: no group, and pass C would give it no row either.
    const isOrphan = (id: string) => {
      const held = recipesOf.get(id);
      return held ? ![...held].some((r) => mealRecipeIds.has(r)) : ![...(foodsOf.get(id) ?? [])].some((f) => mealFoodIds.has(f));
    };
    const links = mf.flatMap((row) => (row.storage_item_id ? [row.storage_item_id] : []));
    const linked = new Set([...(servedBy.get(mealId) ?? []).map((row) => row.storage_item_id), ...links]);
    for (const id of linked) {
      if (groups.has(id)) continue;
      if (isOrphan(id)) orphans += 1;
      else flag(4);
    }
    if (links.some((id) => !groups.has(id) && !isOrphan(id))) flag(5);
  }
  return { violations, orphans };
}
