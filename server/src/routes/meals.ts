// Meal tracking: the per-baby completion log (create/list/edit/delete), the
// allergen-ladder progress derived from it, and the parent's manual
// "established before we started using the app" overrides on top. A meal is
// one sitting with one or more foods; `meal_foods` JOIN `meals` is the single
// exposure surface every consumer reads, and an override never touches it —
// it only unions into the reported status (see `unionAllergenStatus`). Every
// route sits behind requireAuth and every baby/meal lookup is scoped to the
// caller's own rows — a miss (wrong owner or unknown id) is 404, never 403.
import { and, desc, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
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
import { allergenOverrides, allergens, babies, foods, mealFoods, meals, recipes } from "../db/schema.js";
import { loadAllergenDetail, loadAllergenProgress } from "../services/allergens.js";
import { visibleRecipesCondition } from "../services/recipes.js";
import {
  insertMealWithFoods,
  loadMeals,
  loadRatingHistory,
  loadRatingSummaries,
  ownsBaby,
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
async function validateFoodIds(
  db: Database,
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
 * A recipe id is attribution, but it still has to name a recipe this user can
 * see: the catalog plus their own. Another account's custom recipe reads as
 * an unknown id, exactly as its foods do in `validateFoodIds`.
 */
async function validateRecipeId(db: Database, recipeId: string, userId: string): Promise<Validated<string>> {
  const [recipe] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), visibleRecipesCondition(userId)))
    .limit(1);
  if (!recipe) return { ok: false, details: { recipeId: "unknown recipe" } };
  return { ok: true, value: recipeId };
}

/**
 * Item 572: a rating must fit the meal it lands on. A loose-food meal (no
 * recipe) is rated per food, and each rated food must be on the meal; a
 * recipe meal is rated once, as the recipe. A misplaced rating is a 400
 * rather than silently dropped — the parent tapped it, so losing it quietly
 * would be the worse failure. `null` (clear) is always accepted: clearing a
 * rating that cannot exist is already true.
 */
function validateRatings(
  recipeId: string | null,
  foodIds: readonly string[],
  foodRatings: Record<string, number | null> | undefined,
  recipeRating: number | null | undefined,
): Validated<null> {
  const rated = Object.entries(foodRatings ?? {}).filter(([, rating]) => rating !== null);
  if (recipeId !== null && rated.length > 0) {
    return { ok: false, details: { foodRatings: "a recipe meal is rated as a recipe, not per food" } };
  }
  if (recipeId === null && recipeRating != null) {
    return { ok: false, details: { recipeRating: "only a recipe meal has a recipe rating" } };
  }
  const onMeal = new Set(foodIds);
  const strays = rated.filter(([foodId]) => !onMeal.has(foodId)).map(([foodId]) => foodId);
  if (strays.length > 0) return { ok: false, details: { foodRatings: "food is not on this meal", strays } };
  return { ok: true, value: null };
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

    const children = await validateFoodIds(db, body.data.foodIds, currentUserId(request));
    if (!children.ok) return badRequest(reply, children.details);

    if (body.data.recipeId) {
      const recipe = await validateRecipeId(db, body.data.recipeId, currentUserId(request));
      if (!recipe.ok) return badRequest(reply, recipe.details);
    }

    const ratings = validateRatings(body.data.recipeId, children.value, body.data.foodRatings, body.data.recipeRating);
    if (!ratings.ok) return badRequest(reply, ratings.details);

    const servedAt = body.data.servedAt ? new Date(body.data.servedAt) : new Date();

    // One transaction so a meal is all-or-nothing: either the meal and every
    // one of its foods land, or nothing does. Hand-logged meals never link to
    // a storage item — that link is what the serve endpoint alone creates.
    const mealId = await db.transaction((tx) =>
      insertMealWithFoods(tx, {
        babyId: params.data.babyId,
        recipeId: body.data.recipeId,
        servedAt,
        reactionNote: body.data.reactionNote,
        notes: body.data.notes,
        recipeRating: body.data.recipeRating,
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

    const [existing] = await db
      .select({ id: meals.id, recipeId: meals.recipeId })
      .from(meals)
      .where(ownedMealCondition(db, params.data.id, currentUserId(request)))
      .limit(1);
    if (!existing) return notFound(reply);

    const body = updateMealInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    const onMeal = await db
      .select({ foodId: mealFoods.foodId })
      .from(mealFoods)
      .where(eq(mealFoods.mealId, existing.id));
    const kept = new Set(onMeal.map((row) => row.foodId));
    let foodIds: string[] | null = null;
    if (body.data.foodIds) {
      const children = await validateFoodIds(db, body.data.foodIds, currentUserId(request), kept);
      if (!children.ok) return badRequest(reply, children.details);
      foodIds = children.value;
    }

    if (body.data.recipeId) {
      const recipe = await validateRecipeId(db, body.data.recipeId, currentUserId(request));
      if (!recipe.ok) return badRequest(reply, recipe.details);
    }

    // Ratings are checked against the meal as it will be AFTER this edit.
    const finalRecipeId = body.data.recipeId !== undefined ? body.data.recipeId : existing.recipeId;
    const ratings = validateRatings(
      finalRecipeId,
      foodIds ?? [...kept],
      body.data.foodRatings,
      body.data.recipeRating,
    );
    if (!ratings.ok) return badRequest(reply, ratings.details);

    // One transaction so the column updates and the child replacement can
    // never be observed half-applied.
    await db.transaction(async (tx) => {
      const columns: Partial<typeof meals.$inferInsert> = {};
      if (body.data.servedAt !== undefined) columns.servedAt = new Date(body.data.servedAt);
      if (body.data.reactionNote !== undefined) columns.reactionNote = body.data.reactionNote;
      if (body.data.notes !== undefined) columns.notes = body.data.notes;
      if (body.data.recipeId !== undefined) columns.recipeId = body.data.recipeId;
      // A recipe rating belongs to the recipe it was given for: a changed or
      // removed recipe drops it unless this same edit rates the new one.
      if (body.data.recipeRating !== undefined) columns.recipeRating = body.data.recipeRating;
      else if (finalRecipeId !== existing.recipeId) columns.recipeRating = null;
      if (Object.keys(columns).length > 0) {
        await tx.update(meals).set(columns).where(eq(meals.id, existing.id));
      }

      if (foodIds) {
        // Replacing the children wholesale would throw away each row's
        // storage provenance, so it is carried forward per food: a food that
        // survives the edit keeps the storage item it was served from, and a
        // food swapped in during the edit was not served from anywhere and
        // gets null. Read before the delete — the rows are gone after it.
        const previous = await tx
          .select({ foodId: mealFoods.foodId, storageItemId: mealFoods.storageItemId, rating: mealFoods.rating })
          .from(mealFoods)
          .where(eq(mealFoods.mealId, existing.id));
        const previousByFoodId = new Map(previous.map((row) => [row.foodId, row]));

        await tx.delete(mealFoods).where(eq(mealFoods.mealId, existing.id));
        await tx.insert(mealFoods).values(
          foodIds.map((foodId) => ({
            mealId: existing.id,
            foodId,
            // Ratings ride along the same way, so editing a meal's foods
            // never silently wipes what the parent rated.
            storageItemId: previousByFoodId.get(foodId)?.storageItemId ?? null,
            rating: previousByFoodId.get(foodId)?.rating ?? null,
          })),
        );
      }

      if (finalRecipeId !== null) {
        // Turned into a recipe meal: its per-food ratings no longer apply
        // (validateRatings already refused new ones).
        if (existing.recipeId === null) {
          await tx
            .update(mealFoods)
            .set({ rating: null })
            .where(and(eq(mealFoods.mealId, existing.id), isNotNull(mealFoods.rating)));
        }
      } else {
        for (const [foodId, rating] of Object.entries(body.data.foodRatings ?? {})) {
          await tx
            .update(mealFoods)
            .set({ rating })
            .where(and(eq(mealFoods.mealId, existing.id), eq(mealFoods.foodId, foodId)));
        }
      }
    });

    const item = (await loadMeals(db, [existing.id])).get(existing.id);
    if (!item) throw new Error("Meal was updated but could not be read back");
    return reply.send(item);
  });

  // -----------------------------------------------------------------------
  // DELETE /api/meals/:id
  // -----------------------------------------------------------------------
  app.delete("/api/meals/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = mealIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    // meal_foods rows go with it through ON DELETE CASCADE.
    const deleted = await db
      .delete(meals)
      .where(ownedMealCondition(db, params.data.id, currentUserId(request)))
      .returning();

    if (deleted.length === 0) return notFound(reply);
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

    const points = await loadRatingHistory(db, params.data.babyId, query.data);
    return reply.send({ points } satisfies RatingHistoryResponse);
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

    return reply.send({ items } satisfies AllergenProgressResponse);
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
