// Meal tracking: the per-baby completion log (create/list/edit/delete), the
// allergen-ladder progress derived from it, and the parent's manual
// "established before we started using the app" overrides on top. A meal is
// one sitting with one or more foods; `meal_foods` JOIN `meals` is the single
// exposure surface every consumer reads, and an override never touches it —
// it only unions into the reported status (see `unionAllergenStatus`). Every
// route sits behind requireAuth and every baby/meal lookup is scoped to the
// caller's own rows — a miss (wrong owner or unknown id) is 404, never 403.
import { and, desc, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  allergenDetailParamsSchema,
  allergenKeyParamSchema,
  babyIdRouteParamSchema,
  createMealInputSchema,
  markAllergenEstablishedInputSchema,
  mealIdParamSchema,
  mealsQuerySchema,
  ratingHistoryQuerySchema,
  updateMealInputSchema,
  type AllergenDetail,
  type AllergenProgressResponse,
  type MealsResponse,
  type RatingHistoryResponse,
  type RatingsResponse,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import {
  allergenOverrides,
  allergens,
  babies,
  foods,
  mealFoods,
  mealRecipes,
  mealStorageItems,
  meals,
  recipes,
  storageItemRecipes,
  storageItems,
} from "../db/schema.js";
import { returnServings } from "../services/storage.js";
import { loadAllergenDetail, loadAllergenProgress } from "../services/allergens.js";
import { visibleRecipesCondition } from "../services/recipes.js";
import {
  countServed,
  ingredientUnion,
  insertMeal,
  loadIngredientFoodIds,
  loadMealRecipeRows,
  loadMeals,
  loadRatingHistory,
  loadRatingSummaries,
  ownsBaby,
  writeMealMirror,
  type Queryable,
  type Transaction,
} from "../services/meals.js";

const DEFAULT_LIMIT = 50;

function badRequest(reply: FastifyReply, details: unknown): FastifyReply {
  return reply.code(400).send({ error: "invalid_request", details });
}

/** Every handler behind `requireAuth` has a user; this makes that explicit. */
function currentUserId(request: FastifyRequest): string {
  const id = request.user?.id;
  if (!id) {
    throw new Error("currentUserId called on an unauthenticated request");
  }
  return id;
}

/** Every meal id belonging to a baby this user owns — the ownership filter
 * for the by-id routes, which have no :babyId to check directly. */
function ownedMealCondition(db: Database, mealId: string, userId: string) {
  const ownedBabyIds = db.select({ id: babies.id }).from(babies).where(eq(babies.userId, userId));
  return and(eq(meals.id, mealId), inArray(meals.babyId, ownedBabyIds));
}

type Validated<T> = { ok: true; value: T } | { ok: false; details: unknown };

/**
 * Deduped, existence-checked food ids — the same check POST and PATCH share.
 * "Exists" means visible to THIS user: the seeded catalog plus their own
 * custom foods. Another account's custom food reads as an unknown id, so it
 * can never be logged into a meal (and the 400 says nothing about whether it
 * exists elsewhere). A food its owner DELETED passes only when it is
 * already on THIS meal (`keptFoodIds`): editing an old meal resends the foods
 * it already has, but a deleted food can never be added to a new or edited
 * meal — it reads as unknown, like any food the caller cannot choose.
 */
export async function validateFoodIds(
  db: Queryable,
  rawFoodIds: string[],
  userId: string,
  keptFoodIds: ReadonlySet<string> = new Set(),
): Promise<Validated<string[]>> {
  // Dedupe so the same food twice in one submission is one row, not a
  // unique-index violation.
  const foodIds = [...new Set(rawFoodIds)];

  const foodRows = await db
    .select({ id: foods.id, deletedAt: foods.deletedAt })
    .from(foods)
    .where(and(inArray(foods.id, foodIds), or(isNull(foods.ownerId), eq(foods.ownerId, userId))));
  const known = new Set(foodRows.filter((row) => !row.deletedAt || keptFoodIds.has(row.id)).map((row) => row.id));
  const unknownFoodIds = foodIds.filter((id) => !known.has(id));
  if (unknownFoodIds.length > 0) {
    return { ok: false, details: { foodIds: "unknown food", unknownFoodIds } };
  }

  return { ok: true, value: foodIds };
}

/**
 * Resolves `:key` against the CANONICAL allergen list — the seeded
 * `allergens` table. Both a malformed slug and a well-formed one that names
 * no allergen are 400s: neither can ever become a meaningful override, and
 * the key is catalog content, not a per-user id, so saying "no such allergen"
 * leaks nothing about anybody's data.
 */
async function validateAllergenKey(db: Database, rawKey: unknown): Promise<Validated<string>> {
  const parsed = allergenKeyParamSchema.safeParse({ key: rawKey });
  if (!parsed.success) return { ok: false, details: parsed.error.flatten() };

  const [row] = await db
    .select({ slug: allergens.slug })
    .from(allergens)
    .where(eq(allergens.slug, parsed.data.key))
    .limit(1);
  if (!row) return { ok: false, details: { key: "unknown allergen" } };

  return { ok: true, value: row.slug };
}

/**
 * Recipe ids are attribution, but each still has to name a recipe this user
 * can see: the catalog plus their own. Another account's custom recipe reads
 * as an unknown id, exactly as its foods do in `validateFoodIds`. One query
 * for the whole list. `field` names the key the 400 is about, so an older
 * app's single `recipeId` still gets `{recipeId: "unknown recipe"}`.
 */
export async function validateRecipeIds(
  db: Queryable,
  recipeIds: readonly string[],
  userId: string,
  field: "recipeId" | "recipeIds",
): Promise<Validated<null>> {
  if (recipeIds.length === 0) return { ok: true, value: null };
  const rows = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(inArray(recipes.id, [...recipeIds]), visibleRecipesCondition(userId)));
  const known = new Set(rows.map((row) => row.id));
  const unknownRecipeIds = recipeIds.filter((id) => !known.has(id));
  if (unknownRecipeIds.length === 0) return { ok: true, value: null };
  return {
    ok: false,
    details: field === "recipeId" ? { recipeId: "unknown recipe" } : { recipeIds: "unknown recipe", unknownRecipeIds },
  };
}

/** The meal's rating state that one write is checked against (DESIGN-B §2). */
export interface RatingCheck {
  /** F: the meal's recipes after the write. */
  recipeIds: readonly string[];
  /** ing(F): current ingredient foods of those recipes. */
  ingredientsOfFinal: ReadonlySet<string>;
  /** ing(A): current ingredient foods of the recipes this write ADDS. */
  ingredientsOfAdded: ReadonlySet<string>;
  /** stored(f): each food's rating before the write (empty on create/serve). */
  stored: ReadonlyMap<string, number | null>;
  /** The meal's foods after the write. */
  foodIds: readonly string[];
  foodRatings?: Readonly<Record<string, number | null>> | undefined;
  recipeRatings?: Readonly<Record<string, number | null>> | undefined;
}

/**
 * Ledger 752 (DESIGN-B §2): a food can carry its own stars when it is not an
 * ingredient of any of the meal's recipes, or when it already holds a rating
 * and no recipe this write adds lists it (a rated extra that later became an
 * ingredient stays visible AND editable).
 */
export function isRateableFood(foodId: string, check: Pick<RatingCheck, "ingredientsOfFinal" | "ingredientsOfAdded" | "stored">): boolean {
  if (!check.ingredientsOfFinal.has(foodId)) return true;
  return check.stored.get(foodId) != null && !check.ingredientsOfAdded.has(foodId);
}

/**
 * Item 572 / ledger 752: every rating must fit the meal it lands on. A food
 * rating needs the food on the meal and rateable; a recipe rating needs the
 * recipe on the meal. A misplaced rating is a 400 rather than silently
 * dropped — the parent tapped it, so losing it quietly would be the worse
 * failure. `null` (clear) is always accepted: clearing a rating that cannot
 * exist is already true. One rule for create, PATCH and serve.
 */
export function validateRatings(check: RatingCheck): Validated<null> {
  const onMealRecipes = new Set(check.recipeIds);
  const strayRecipes = Object.entries(check.recipeRatings ?? {})
    .filter(([recipeId, rating]) => rating !== null && !onMealRecipes.has(recipeId))
    .map(([recipeId]) => recipeId);
  if (strayRecipes.length > 0) {
    return { ok: false, details: { recipeRatings: "recipe is not on this meal", strays: strayRecipes } };
  }
  const rated = Object.entries(check.foodRatings ?? {}).filter(([, rating]) => rating !== null);
  const onMeal = new Set(check.foodIds);
  const strays = rated.filter(([foodId]) => !onMeal.has(foodId)).map(([foodId]) => foodId);
  if (strays.length > 0) return { ok: false, details: { foodRatings: "food is not on this meal", strays } };
  const inRecipe = rated.filter(([foodId]) => !isRateableFood(foodId, check)).map(([foodId]) => foodId);
  if (inRecipe.length > 0) return { ok: false, details: { foodRatings: "rated as part of its recipe", foods: inRecipe } };
  return { ok: true, value: null };
}

/** What a request asks of the meal's recipes, in the new shape. */
interface RecipeRequest {
  /** The new recipe set in order, or undefined to leave it as it is. */
  recipeIds: string[] | undefined;
  recipeRatings: Record<string, number | null> | undefined;
  /** Which shape the request used, so a 400 names the key it sent. */
  field: "recipeId" | "recipeIds";
}

type RecipeMapping = { ok: true; value: RecipeRequest } | { ok: false; code: 400 | 409; details: unknown };

const ONLY_RECIPE_MEALS = { recipeRating: "only a recipe meal has a recipe rating" } as const;

/**
 * DESIGN-B §4: the one place the LEGACY single-recipe shape (`recipeId`,
 * `recipeRating`, sent by older app versions and their offline queue) is read
 * into the new one. `current` is the meal's recipe set before the write
 * (empty on create). On a meal with 0 or 1 recipe this is exactly the old
 * behaviour; on a meal with 2+ recipes an older app may change everything
 * except the recipes it cannot see — any recipe change is a 409 and nothing
 * is written. The new shape passes through, deduped.
 */
export function mapRecipeRequest(
  body: {
    recipeIds?: string[] | undefined;
    recipeRatings?: Record<string, number | null> | undefined;
    recipeId?: string | null | undefined;
    recipeRating?: number | null | undefined;
  },
  current: readonly string[],
): RecipeMapping {
  if (body.recipeId === undefined && body.recipeRating === undefined) {
    return {
      ok: true,
      value: {
        recipeIds: body.recipeIds === undefined ? undefined : [...new Set(body.recipeIds)],
        recipeRatings: body.recipeRatings,
        field: "recipeIds",
      },
    };
  }

  let recipeIds: string[] | undefined;
  if (body.recipeId !== undefined && body.recipeId !== (current[0] ?? null)) {
    if (current.length >= 2) {
      return { ok: false, code: 409, details: "this meal has more than one recipe" };
    }
    recipeIds = body.recipeId === null ? [] : [body.recipeId];
  }

  let recipeRatings: Record<string, number | null> | undefined;
  if (body.recipeRating !== undefined) {
    const first = (recipeIds ?? current)[0];
    if (first !== undefined) recipeRatings = { [first]: body.recipeRating };
    else if (body.recipeRating !== null) return { ok: false, code: 400, details: ONLY_RECIPE_MEALS };
  }
  return { ok: true, value: { recipeIds, recipeRatings, field: "recipeId" } };
}

/**
 * PATCH step 5 (ledger 751, DESIGN-B §5a). A served container leaves the meal
 * when this edit takes it off: a recipe container when its recipe was on the
 * meal and no longer is (fridge and freezer containers of one recipe both
 * leave; a several-recipe container once none of its recipes is left), a food container when the edit removes the LAST food linked to it.
 * Removing some of a container's foods, or an ingredient chip while its
 * recipe stays, returns nothing — that part was still served.
 *
 * ponytail: a food container whose foods ALL overlapped an earlier part of
 * the same serve has no link, and custom-food Replace can merge a container's
 * last link away; such a part only comes back on delete. Upgrade path: store
 * the part's food ids on the meal_storage_items row.
 */
async function returnRemovedParts(
  tx: Transaction,
  userId: string,
  mealId: string,
  change: {
    previousRecipeIds: readonly string[];
    finalRecipeIds: readonly string[];
    linksBefore: readonly (string | null)[];
    linksAfter: readonly (string | null)[];
  },
): Promise<void> {
  const served = await tx
    .select({
      storageItemId: mealStorageItems.storageItemId,
      servings: mealStorageItems.servings,
      recipeId: storageItems.recipeId,
    })
    .from(mealStorageItems)
    .innerJoin(storageItems, eq(mealStorageItems.storageItemId, storageItems.id))
    .where(eq(mealStorageItems.mealId, mealId));
  if (served.length === 0) return;
  // A several-recipe container (ledger 753) leaves once NONE of its recipes
  // is on the meal any more.
  const several = await tx
    .select({ storageItemId: storageItemRecipes.storageItemId, recipeId: storageItemRecipes.recipeId })
    .from(storageItemRecipes)
    .where(
      inArray(
        storageItemRecipes.storageItemId,
        served.map((row) => row.storageItemId),
      ),
    );
  const recipesOf = (row: (typeof served)[number]): string[] => {
    const list = several.filter((entry) => entry.storageItemId === row.storageItemId).map((entry) => entry.recipeId);
    return list.length > 0 ? list : row.recipeId ? [row.recipeId] : [];
  };

  const before = new Set(change.linksBefore);
  const after = new Set(change.linksAfter);
  const removed = served.filter((row) => {
    const containerRecipes = recipesOf(row);
    return containerRecipes.length > 0
      ? containerRecipes.some((id) => change.previousRecipeIds.includes(id)) &&
          !containerRecipes.some((id) => change.finalRecipeIds.includes(id))
      : before.has(row.storageItemId) && !after.has(row.storageItemId);
  });
  if (removed.length === 0) return;

  await returnServings(tx, userId, removed);
  await tx.delete(mealStorageItems).where(
    and(
      eq(mealStorageItems.mealId, mealId),
      inArray(
        mealStorageItems.storageItemId,
        removed.map((row) => row.storageItemId),
      ),
    ),
  );
}

/** Thrown inside the PATCH transaction to roll it back with a reply. */
class MealEditAborted extends Error {
  constructor(readonly outcome: { code: 404 } | { code: 409; message: string } | { code: 400; details: unknown }) {
    super("meal edit aborted");
    this.name = "MealEditAborted";
  }
}

export function registerMealRoutes(app: FastifyInstance, db: Database): void {
  // -----------------------------------------------------------------------
  // GET /api/babies/:babyId/meals
  // -----------------------------------------------------------------------
  app.get("/api/babies/:babyId/meals", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    if (!(await ownsBaby(db, params.data.babyId, currentUserId(request)))) return notFound(reply);

    const query = mealsQuerySchema.safeParse(request.query);
    if (!query.success) return badRequest(reply, query.error.flatten());

    const conditions = [eq(meals.babyId, params.data.babyId)];
    if (query.data.before) conditions.push(lt(meals.servedAt, new Date(query.data.before)));

    // Page the meals first, then hydrate: joining foods in one query would
    // make `limit` count food rows instead of meals.
    const page = await db
      .select({ id: meals.id })
      .from(meals)
      .where(and(...conditions))
      .orderBy(desc(meals.servedAt), desc(meals.id))
      .limit(query.data.limit ?? DEFAULT_LIMIT);

    const byMealId = await loadMeals(db, page.map((row) => row.id));
    const items = page.flatMap((row) => {
      const item = byMealId.get(row.id);
      return item ? [item] : [];
    });

    return reply.send({ items } satisfies MealsResponse);
  });

  // -----------------------------------------------------------------------
  // POST /api/babies/:babyId/meals
  // -----------------------------------------------------------------------
  app.post("/api/babies/:babyId/meals", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    if (!(await ownsBaby(db, params.data.babyId, currentUserId(request)))) return notFound(reply);

    const body = createMealInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    const userId = currentUserId(request);
    const children = await validateFoodIds(db, body.data.foodIds, userId);
    if (!children.ok) return badRequest(reply, children.details);

    // On create the legacy fields arrive as null when absent (the schema's
    // transforms), so null is read as "not sent".
    const mapped = mapRecipeRequest(
      {
        recipeIds: body.data.recipeIds,
        recipeRatings: body.data.recipeRatings,
        recipeId: body.data.recipeId ?? undefined,
        recipeRating: body.data.recipeRating ?? undefined,
      },
      [],
    );
    if (!mapped.ok) return badRequest(reply, mapped.details);
    const recipeIds = mapped.value.recipeIds ?? [];

    const recipeCheck = await validateRecipeIds(db, recipeIds, userId, mapped.value.field);
    if (!recipeCheck.ok) return badRequest(reply, recipeCheck.details);

    const ingredients = ingredientUnion(await loadIngredientFoodIds(db, recipeIds), recipeIds);
    const ratings = validateRatings({
      recipeIds,
      ingredientsOfFinal: ingredients,
      ingredientsOfAdded: ingredients,
      stored: new Map(),
      foodIds: children.value,
      foodRatings: body.data.foodRatings,
      recipeRatings: mapped.value.recipeRatings,
    });
    if (!ratings.ok) return badRequest(reply, ratings.details);

    const servedAt = body.data.servedAt ? new Date(body.data.servedAt) : new Date();

    // One transaction so a meal is all-or-nothing: either the meal, its
    // recipes and every one of its foods land, or nothing does. Hand-logged
    // meals never link to a storage item — that link is what the serve
    // endpoint alone creates.
    const mealId = await db.transaction((tx) =>
      insertMeal(tx, {
        babyId: params.data.babyId,
        recipes: recipeIds.map((recipeId) => ({ recipeId, rating: mapped.value.recipeRatings?.[recipeId] ?? null })),
        servedAt,
        reactionNote: body.data.reactionNote,
        notes: body.data.notes,
        foods: children.value.map((foodId) => ({ foodId, rating: body.data.foodRatings?.[foodId] ?? null })),
      }),
    );

    const item = (await loadMeals(db, [mealId])).get(mealId);
    if (!item) throw new Error("Meal was inserted but could not be read back");
    return reply.code(201).send(item);
  });

  // -----------------------------------------------------------------------
  // PATCH /api/meals/:id
  // -----------------------------------------------------------------------
  app.patch("/api/meals/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = mealIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const userId = currentUserId(request);

    // DESIGN-B §4: the whole edit runs in ONE transaction behind a lock on the
    // meal row, because every rule below reads state first (the recipe set,
    // the stored ratings, which recipe is first). The meal page fires one
    // PATCH per star tap, so two taps on two recipes now serialize instead of
    // one overwriting the other's read. A rejection throws MealEditAborted to
    // roll everything back.
    let mealId: string;
    try {
      mealId = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ id: meals.id })
          .from(meals)
          .where(ownedMealCondition(db, params.data.id, userId))
          .for("update");
        if (!locked) throw new MealEditAborted({ code: 404 });

        const body = updateMealInputSchema.safeParse(request.body);
        if (!body.success) throw new MealEditAborted({ code: 400, details: body.error.flatten() });

        const before = await loadMealRecipeRows(tx, [locked.id]);
        const previousRecipeIds = before.map((row) => row.recipeId);
        const previousFoods = await tx
          .select({ foodId: mealFoods.foodId, storageItemId: mealFoods.storageItemId, rating: mealFoods.rating })
          .from(mealFoods)
          .where(eq(mealFoods.mealId, locked.id));
        const previousByFoodId = new Map(previousFoods.map((row) => [row.foodId, row]));

        const mapped = mapRecipeRequest(body.data, previousRecipeIds);
        if (!mapped.ok) {
          throw new MealEditAborted(
            mapped.code === 409
              ? { code: 409, message: String(mapped.details) }
              : { code: 400, details: mapped.details },
          );
        }

        let foodIds: string[] | null = null;
        if (body.data.foodIds) {
          const children = await validateFoodIds(tx, body.data.foodIds, userId, new Set(previousByFoodId.keys()));
          if (!children.ok) throw new MealEditAborted({ code: 400, details: children.details });
          foodIds = children.value;
        }

        const finalRecipeIds = mapped.value.recipeIds ?? previousRecipeIds;
        const added = finalRecipeIds.filter((id) => !previousRecipeIds.includes(id));
        const recipeCheck = await validateRecipeIds(tx, added, userId, mapped.value.field);
        if (!recipeCheck.ok) throw new MealEditAborted({ code: 400, details: recipeCheck.details });

        // Ratings are checked against the meal as it will be AFTER this edit.
        const ingredientsByRecipe = await loadIngredientFoodIds(tx, finalRecipeIds);
        const ingredientsOfAdded = ingredientUnion(ingredientsByRecipe, added);
        const ratings = validateRatings({
          recipeIds: finalRecipeIds,
          ingredientsOfFinal: ingredientUnion(ingredientsByRecipe, finalRecipeIds),
          ingredientsOfAdded,
          stored: new Map(previousFoods.map((row) => [row.foodId, row.rating])),
          foodIds: foodIds ?? [...previousByFoodId.keys()],
          foodRatings: body.data.foodRatings,
          recipeRatings: mapped.value.recipeRatings,
        });
        if (!ratings.ok) throw new MealEditAborted({ code: 400, details: ratings.details });

        const columns: Partial<typeof meals.$inferInsert> = {};
        if (body.data.servedAt !== undefined) columns.servedAt = new Date(body.data.servedAt);
        if (body.data.reactionNote !== undefined) columns.reactionNote = body.data.reactionNote;
        if (body.data.notes !== undefined) columns.notes = body.data.notes;
        if (Object.keys(columns).length > 0) {
          await tx.update(meals).set(columns).where(eq(meals.id, locked.id));
        }

        if (mapped.value.recipeIds !== undefined) {
          // A new list replaces the set and renumbers 0..n-1 in list order. A
          // recipe that stays keeps its rating; a removed recipe's rating
          // goes with its row; an added one starts unrated unless this same
          // edit rates it (below).
          if (finalRecipeIds.length === 0) {
            await tx.delete(mealRecipes).where(eq(mealRecipes.mealId, locked.id));
          } else {
            await tx
              .delete(mealRecipes)
              .where(and(eq(mealRecipes.mealId, locked.id), notInArray(mealRecipes.recipeId, finalRecipeIds)));
          }
          for (const [position, recipeId] of finalRecipeIds.entries()) {
            if (previousRecipeIds.includes(recipeId)) {
              await tx
                .update(mealRecipes)
                .set({ position })
                .where(and(eq(mealRecipes.mealId, locked.id), eq(mealRecipes.recipeId, recipeId)));
            } else {
              await tx.insert(mealRecipes).values({ mealId: locked.id, recipeId, position, rating: null });
            }
          }
        }

        // Merged per recipe: one targeted UPDATE per key, so a star tap on
        // one recipe never rewrites another's.
        for (const [recipeId, rating] of Object.entries(mapped.value.recipeRatings ?? {})) {
          await tx
            .update(mealRecipes)
            .set({ rating })
            .where(and(eq(mealRecipes.mealId, locked.id), eq(mealRecipes.recipeId, recipeId)));
        }

        if (foodIds) {
          // Replacing the children wholesale would throw away each row's
          // storage provenance, so it is carried forward per food: a food that
          // survives the edit keeps the storage item it was served from, and a
          // food swapped in during the edit was not served from anywhere and
          // gets null.
          await tx.delete(mealFoods).where(eq(mealFoods.mealId, locked.id));
          await tx.insert(mealFoods).values(
            foodIds.map((foodId) => ({
              mealId: locked.id,
              foodId,
              // Ratings ride along the same way, so editing a meal's foods
              // never silently wipes what the parent rated.
              storageItemId: previousByFoodId.get(foodId)?.storageItemId ?? null,
              rating: previousByFoodId.get(foodId)?.rating ?? null,
            })),
          );
        }

        // A recipe this edit ADDS rates its ingredient foods from now on, so
        // their own stars go (the generalization of "became a recipe meal
        // clears food ratings"). A note, time, rating-only or food-only edit
        // adds no recipe and clears nothing.
        if (ingredientsOfAdded.size > 0) {
          await tx
            .update(mealFoods)
            .set({ rating: null })
            .where(
              and(
                eq(mealFoods.mealId, locked.id),
                inArray(mealFoods.foodId, [...ingredientsOfAdded]),
                isNotNull(mealFoods.rating),
              ),
            );
        }

        // Merged per food: a food absent from the map keeps its rating.
        for (const [foodId, rating] of Object.entries(body.data.foodRatings ?? {})) {
          await tx
            .update(mealFoods)
            .set({ rating })
            .where(and(eq(mealFoods.mealId, locked.id), eq(mealFoods.foodId, foodId)));
        }

        // Ledger 751 (DESIGN-B §5a): an edit that takes a served part off the
        // meal gives that container's servings back, once — its record goes
        // with it. Only an edit of the recipes or the foods can do that.
        if (mapped.value.recipeIds !== undefined || foodIds) {
          await returnRemovedParts(tx, userId, locked.id, {
            previousRecipeIds,
            finalRecipeIds,
            linksBefore: previousFoods.map((row) => row.storageItemId),
            linksAfter: foodIds
              ? foodIds.map((foodId) => previousByFoodId.get(foodId)?.storageItemId ?? null)
              : previousFoods.map((row) => row.storageItemId),
          });
        }

        // Last, from the rows just written.
        await writeMealMirror(tx, locked.id);
        return locked.id;
      });
    } catch (error) {
      if (error instanceof MealEditAborted) {
        const { outcome } = error;
        if (outcome.code === 404) return notFound(reply);
        if (outcome.code === 409) return reply.code(409).send({ error: "conflict", message: outcome.message });
        return badRequest(reply, outcome.details);
      }
      throw error;
    }

    const item = (await loadMeals(db, [mealId])).get(mealId);
    if (!item) throw new Error("Meal was updated but could not be read back");
    return reply.send(item);
  });
  // -----------------------------------------------------------------------
  // DELETE /api/meals/:id
  // -----------------------------------------------------------------------
  app.delete("/api/meals/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = mealIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    // Ledger 751: deleting a meal (which is also Undo of a serve) gives back
    // what it took from storage. One transaction, the meal row locked first,
    // so two deletes of one meal queue: the second finds it gone and 404s,
    // and the servings come back once. meal_foods, meal_recipes and
    // meal_storage_items go with the meal through ON DELETE CASCADE.
    const userId = currentUserId(request);
    const found = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: meals.id })
        .from(meals)
        .where(ownedMealCondition(db, params.data.id, userId))
        .for("update");
      if (!locked) return false;
      const served = await tx
        .select({ storageItemId: mealStorageItems.storageItemId, servings: mealStorageItems.servings })
        .from(mealStorageItems)
        .where(eq(mealStorageItems.mealId, locked.id));
      await returnServings(tx, userId, served);
      await tx.delete(meals).where(eq(meals.id, locked.id));
      return true;
    });

    if (!found) return notFound(reply);
    return reply.code(204).send();
  });

  // -----------------------------------------------------------------------
  // GET /api/babies/:babyId/ratings
  // -----------------------------------------------------------------------
  // Item 573: this baby's average / count / latest per food and per recipe,
  // for the Foods and Recipes cards and their rating sorts. Separate from the
  // catalog lists on purpose: those are shared across babies (and the foods
  // list across signed-out visitors), and a rating is always one baby's.
  app.get("/api/babies/:babyId/ratings", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    if (!(await ownsBaby(db, params.data.babyId, currentUserId(request)))) return notFound(reply);

    return reply.send((await loadRatingSummaries(db, params.data.babyId)) satisfies RatingsResponse);
  });

  // -----------------------------------------------------------------------
  // GET /api/babies/:babyId/ratings/history?foodId=|recipeId=
  // -----------------------------------------------------------------------
  // The points of one food's or recipe's rating graph, oldest first. An id
  // the baby never rated (or cannot see) is simply an empty series.
  app.get("/api/babies/:babyId/ratings/history", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    if (!(await ownsBaby(db, params.data.babyId, currentUserId(request)))) return notFound(reply);

    const query = ratingHistoryQuerySchema.safeParse(request.query);
    if (!query.success) return badRequest(reply, query.error.flatten());

    const [points, servedCount] = await Promise.all([
      loadRatingHistory(db, params.data.babyId, query.data),
      countServed(db, params.data.babyId, query.data),
    ]);
    return reply.send({ points, servedCount } satisfies RatingHistoryResponse);
  });

  // -----------------------------------------------------------------------
  // GET /api/babies/:babyId/allergen-progress
  // -----------------------------------------------------------------------
  app.get("/api/babies/:babyId/allergen-progress", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    if (!(await ownsBaby(db, params.data.babyId, currentUserId(request)))) return notFound(reply);

    // Derivation lives in one place — the detail route below reads the same
    // helper, so a ladder row and the page it opens can never disagree.
    const items = await loadAllergenProgress(db, params.data.babyId);
    // Item 680: rides on this response because Home already fetches it and
    // every meal write already refreshes it.
    const [tried] = await db
      .select({ count: sql<number>`count(distinct ${mealFoods.foodId})::int` })
      .from(mealFoods)
      .innerJoin(meals, eq(mealFoods.mealId, meals.id))
      .where(eq(meals.babyId, params.data.babyId));

    return reply.send({ items, foodsTried: tried?.count ?? 0 } satisfies AllergenProgressResponse);
  });

  // -----------------------------------------------------------------------
  // GET /api/babies/:babyId/allergen-progress/:slug
  // -----------------------------------------------------------------------
  // One ladder row plus the story behind it. Sits under the progress route's
  // own prefix because it IS that route's row, zoomed in — `progress` comes
  // out of the same helper, byte for byte.
  //
  // Both halves of the path fail as 404 here: a baby this caller does not
  // own, and a slug that names no allergen. Unlike the override routes below
  // (where a bad key is a 400 on a write), this is a page address, and both
  // misses are the same dead end.
  app.get("/api/babies/:babyId/allergen-progress/:slug", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = allergenDetailParamsSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    const userId = currentUserId(request);
    if (!(await ownsBaby(db, params.data.babyId, userId))) return notFound(reply);

    const detail = await loadAllergenDetail(db, params.data.babyId, params.data.slug, userId);
    if (!detail) return notFound(reply);

    return reply.send(detail satisfies AllergenDetail);
  });

  // -----------------------------------------------------------------------
  // PUT /api/babies/:babyId/allergens/:key/established
  // -----------------------------------------------------------------------
  // "We already established this one before we started using the app", with
  // an optional WHEN (item 364) defaulting to now — the maintenance countdown
  // runs from that date, so a parent who established peanut in March can say
  // so instead of resetting the clock by telling us about it today.
  //
  // Idempotent by the unique index, and now an UPSERT rather than a
  // do-nothing: marking an already-marked allergen is still a 204, and it
  // MOVES `established_at` to the new date. That is the only sane reading of
  // re-marking — the row is one fact per (baby, allergen), and a parent
  // opening the sheet again to pick a different date is correcting it, not
  // asking for a second row. `created_at` is left alone, so "when did they
  // first tell us" survives every correction.
  //
  // Nothing about the derived ladder is written or reset — the override is a
  // separate row the progress route unions in.
  app.put("/api/babies/:babyId/allergens/:key/established", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    if (!(await ownsBaby(db, params.data.babyId, currentUserId(request)))) return notFound(reply);

    const key = await validateAllergenKey(db, (request.params as { key?: unknown }).key);
    if (!key.ok) return badRequest(reply, key.details);

    // The body is optional in every sense: the pre-item-364 client (and any
    // PWA still running that bundle) sends no body at all, which must keep
    // meaning "now" rather than becoming a 400.
    const body = markAllergenEstablishedInputSchema.safeParse(request.body ?? {});
    if (!body.success) return badRequest(reply, body.error.flatten());

    const establishedAt = body.data.establishedAt ? new Date(body.data.establishedAt) : new Date();

    await db
      .insert(allergenOverrides)
      .values({ babyId: params.data.babyId, allergenKey: key.value, establishedAt })
      .onConflictDoUpdate({
        target: [allergenOverrides.babyId, allergenOverrides.allergenKey],
        set: { establishedAt },
      });

    return reply.code(204).send();
  });

  // -----------------------------------------------------------------------
  // DELETE /api/babies/:babyId/allergens/:key/established
  // -----------------------------------------------------------------------
  // Undo. Idempotent: deleting an override that was never there still 204s,
  // and removing it only drops the manual promotion — whatever the meal log
  // derives on its own comes straight back.
  app.delete(
    "/api/babies/:babyId/allergens/:key/established",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const params = babyIdRouteParamSchema.safeParse(request.params);
      if (!params.success) return notFound(reply);
      if (!(await ownsBaby(db, params.data.babyId, currentUserId(request)))) return notFound(reply);

      // Validated on DELETE too (rather than the favorites route's "a bad id
      // could not have been favorited anyway, 204" shortcut): a typo'd key
      // here means the client is confidently un-marking the wrong thing, and
      // the allergen list is public catalog content, so a 400 tells it so.
      const key = await validateAllergenKey(db, (request.params as { key?: unknown }).key);
      if (!key.ok) return badRequest(reply, key.details);

      await db
        .delete(allergenOverrides)
        .where(and(eq(allergenOverrides.babyId, params.data.babyId), eq(allergenOverrides.allergenKey, key.value)));

      return reply.code(204).send();
    },
  );
}
