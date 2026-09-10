// Meal tracking: the per-baby completion log (create/list/edit/delete), the
// allergen-ladder progress derived from it, and the parent's manual
// "established before we started using the app" overrides on top. A meal is
// one sitting with one or more foods; `meal_foods` JOIN `meals` is the single
// exposure surface every consumer reads, and an override never touches it —
// it only unions into the reported status (see `unionAllergenStatus`). Every
// route sits behind requireAuth and every baby/meal lookup is scoped to the
// caller's own rows — a miss (wrong owner or unknown id) is 404, never 403.
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  allergenDetailParamsSchema,
  allergenKeyParamSchema,
  babyIdRouteParamSchema,
  createMealInputSchema,
  mealIdParamSchema,
  mealsQuerySchema,
  updateMealInputSchema,
  type AllergenDetail,
  type AllergenProgressResponse,
  type MealsResponse,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import { allergenOverrides, allergens, babies, foods, mealFoods, meals, recipes } from "../db/schema.js";
import { loadAllergenDetail, loadAllergenProgress } from "../services/allergens.js";
import { visibleRecipesCondition } from "../services/recipes.js";
import { insertMealWithFoods, loadMeals, ownsBaby } from "../services/meals.js";

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
 * exists elsewhere).
 */
async function validateFoodIds(db: Database, rawFoodIds: string[], userId: string): Promise<Validated<string[]>> {
  // Dedupe so the same food twice in one submission is one row, not a
  // unique-index violation.
  const foodIds = [...new Set(rawFoodIds)];

  const foodRows = await db
    .select({ id: foods.id })
    .from(foods)
    .where(and(inArray(foods.id, foodIds), or(isNull(foods.ownerId), eq(foods.ownerId, userId))));
  const known = new Set(foodRows.map((row) => row.id));
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

    const servedAt = body.data.servedAt ? new Date(body.data.servedAt) : new Date();

    // One transaction so a meal is all-or-nothing: either the meal and every
    // one of its foods land, or nothing does. Hand-logged meals never link to
    // a fridge item — that link is what the serve endpoint alone creates.
    const mealId = await db.transaction((tx) =>
      insertMealWithFoods(tx, {
        babyId: params.data.babyId,
        recipeId: body.data.recipeId,
        servedAt,
        reactionNote: body.data.reactionNote,
        notes: body.data.notes,
        foods: children.value.map((foodId) => ({ foodId })),
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
      .select({ id: meals.id })
      .from(meals)
      .where(ownedMealCondition(db, params.data.id, currentUserId(request)))
      .limit(1);
    if (!existing) return notFound(reply);

    const body = updateMealInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    let foodIds: string[] | null = null;
    if (body.data.foodIds) {
      const children = await validateFoodIds(db, body.data.foodIds, currentUserId(request));
      if (!children.ok) return badRequest(reply, children.details);
      foodIds = children.value;
    }

    if (body.data.recipeId) {
      const recipe = await validateRecipeId(db, body.data.recipeId, currentUserId(request));
      if (!recipe.ok) return badRequest(reply, recipe.details);
    }

    // One transaction so the column updates and the child replacement can
    // never be observed half-applied.
    await db.transaction(async (tx) => {
      const columns: Partial<typeof meals.$inferInsert> = {};
      if (body.data.servedAt !== undefined) columns.servedAt = new Date(body.data.servedAt);
      if (body.data.reactionNote !== undefined) columns.reactionNote = body.data.reactionNote;
      if (body.data.notes !== undefined) columns.notes = body.data.notes;
      if (body.data.recipeId !== undefined) columns.recipeId = body.data.recipeId;
      if (Object.keys(columns).length > 0) {
        await tx.update(meals).set(columns).where(eq(meals.id, existing.id));
      }

      if (foodIds) {
        // Replacing the children wholesale would throw away each row's
        // fridge provenance, so it is carried forward per food: a food that
        // survives the edit keeps the fridge item it was served from, and a
        // food swapped in during the edit was not served from anywhere and
        // gets null. Read before the delete — the rows are gone after it.
        const previous = await tx
          .select({ foodId: mealFoods.foodId, fridgeItemId: mealFoods.fridgeItemId })
          .from(mealFoods)
          .where(eq(mealFoods.mealId, existing.id));
        const fridgeItemIdByFoodId = new Map(previous.map((row) => [row.foodId, row.fridgeItemId]));

        await tx.delete(mealFoods).where(eq(mealFoods.mealId, existing.id));
        await tx.insert(mealFoods).values(
          foodIds.map((foodId) => ({
            mealId: existing.id,
            foodId,
            fridgeItemId: fridgeItemIdByFoodId.get(foodId) ?? null,
          })),
        );
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
  // "We already established this one before we started using the app."
  // Idempotent by the unique index: marking an already-marked allergen is a
  // no-op 204, never a conflict. Nothing about the derived ladder is written
  // or reset — the override is a separate row the progress route unions in.
  app.put("/api/babies/:babyId/allergens/:key/established", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    if (!(await ownsBaby(db, params.data.babyId, currentUserId(request)))) return notFound(reply);

    const key = await validateAllergenKey(db, (request.params as { key?: unknown }).key);
    if (!key.ok) return badRequest(reply, key.details);

    await db
      .insert(allergenOverrides)
      .values({ babyId: params.data.babyId, allergenKey: key.value })
      .onConflictDoNothing();

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
