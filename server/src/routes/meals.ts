// Meal tracking: the per-baby completion log (create/list/edit/delete) plus
// the allergen-ladder progress derived from it. A meal is one sitting with
// one or more foods; `meal_foods` JOIN `meals` is the single exposure
// surface every consumer reads. Every route sits behind requireAuth and
// every baby/meal lookup is scoped to the caller's own rows — a miss (wrong
// owner or unknown id) is 404, never 403.
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  babyIdRouteParamSchema,
  createMealInputSchema,
  deriveAllergenStatus,
  mealIdParamSchema,
  mealsQuerySchema,
  updateMealInputSchema,
  type AllergenProgressItem,
  type AllergenProgressResponse,
  type MealItem,
  type MealsResponse,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import {
  allergenLadderSteps,
  allergens,
  babies,
  foodAllergens,
  foods,
  mealFoods,
  meals,
  recipes,
} from "../db/schema.js";

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

async function ownsBaby(db: Database, babyId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: babies.id })
    .from(babies)
    .where(and(eq(babies.id, babyId), eq(babies.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** Every meal id belonging to a baby this user owns — the ownership filter
 * for the by-id routes, which have no :babyId to check directly. */
function ownedMealCondition(db: Database, mealId: string, userId: string) {
  const ownedBabyIds = db.select({ id: babies.id }).from(babies).where(eq(babies.userId, userId));
  return and(eq(meals.id, mealId), inArray(meals.babyId, ownedBabyIds));
}

/**
 * Hydrates meal rows into API items: one `meals` row plus its foods, in a
 * fixed order (foods by name) so the same meal always renders the same way.
 * Ownership is the caller's business — this only reads by id.
 */
async function loadMeals(db: Database, mealIds: string[]): Promise<Map<string, MealItem>> {
  if (mealIds.length === 0) return new Map();

  const mealRows = await db
    .select({
      id: meals.id,
      babyId: meals.babyId,
      servedAt: meals.servedAt,
      reactionNote: meals.reactionNote,
      recipeId: meals.recipeId,
      recipeTitle: recipes.title,
    })
    .from(meals)
    .leftJoin(recipes, eq(meals.recipeId, recipes.id))
    .where(inArray(meals.id, mealIds));

  const foodRows = await db
    .select({
      mealId: mealFoods.mealId,
      id: foods.id,
      slug: foods.slug,
      name: foods.name,
      category: foods.category,
    })
    .from(mealFoods)
    .innerJoin(foods, eq(mealFoods.foodId, foods.id))
    .where(inArray(mealFoods.mealId, mealIds))
    .orderBy(asc(foods.name));

  const byMealId = new Map<string, MealItem>(
    mealRows.map((row) => [
      row.id,
      {
        id: row.id,
        babyId: row.babyId,
        servedAt: row.servedAt.toISOString(),
        reactionNote: row.reactionNote,
        recipeId: row.recipeId,
        recipeTitle: row.recipeTitle ?? null,
        foods: [],
      },
    ]),
  );

  for (const row of foodRows) {
    byMealId.get(row.mealId)?.foods.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
    });
  }

  return byMealId;
}

type Validated<T> = { ok: true; value: T } | { ok: false; details: unknown };

/** Deduped, existence-checked food ids — the same check POST and PATCH share. */
async function validateFoodIds(db: Database, rawFoodIds: string[]): Promise<Validated<string[]>> {
  // Dedupe so the same food twice in one submission is one row, not a
  // unique-index violation.
  const foodIds = [...new Set(rawFoodIds)];

  const foodRows = await db.select({ id: foods.id }).from(foods).where(inArray(foods.id, foodIds));
  const known = new Set(foodRows.map((row) => row.id));
  const unknownFoodIds = foodIds.filter((id) => !known.has(id));
  if (unknownFoodIds.length > 0) {
    return { ok: false, details: { foodIds: "unknown food", unknownFoodIds } };
  }

  return { ok: true, value: foodIds };
}

/** A recipe id is attribution, but it still has to name a real recipe. */
async function validateRecipeId(db: Database, recipeId: string): Promise<Validated<string>> {
  const [recipe] = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, recipeId)).limit(1);
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

    const children = await validateFoodIds(db, body.data.foodIds);
    if (!children.ok) return badRequest(reply, children.details);

    if (body.data.recipeId) {
      const recipe = await validateRecipeId(db, body.data.recipeId);
      if (!recipe.ok) return badRequest(reply, recipe.details);
    }

    const servedAt = body.data.servedAt ? new Date(body.data.servedAt) : new Date();

    // One transaction so a meal is all-or-nothing: either the meal and every
    // one of its foods land, or nothing does.
    const mealId = await db.transaction(async (tx) => {
      const [meal] = await tx
        .insert(meals)
        .values({
          babyId: params.data.babyId,
          recipeId: body.data.recipeId,
          servedAt,
          reactionNote: body.data.reactionNote,
        })
        .returning();
      if (!meal) throw new Error("Meal insert returned no row");

      await tx.insert(mealFoods).values(children.value.map((foodId) => ({ mealId: meal.id, foodId })));
      return meal.id;
    });

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
      const children = await validateFoodIds(db, body.data.foodIds);
      if (!children.ok) return badRequest(reply, children.details);
      foodIds = children.value;
    }

    if (body.data.recipeId) {
      const recipe = await validateRecipeId(db, body.data.recipeId);
      if (!recipe.ok) return badRequest(reply, recipe.details);
    }

    // One transaction so the column updates and the child replacement can
    // never be observed half-applied.
    await db.transaction(async (tx) => {
      const columns: Partial<typeof meals.$inferInsert> = {};
      if (body.data.servedAt !== undefined) columns.servedAt = new Date(body.data.servedAt);
      if (body.data.reactionNote !== undefined) columns.reactionNote = body.data.reactionNote;
      if (body.data.recipeId !== undefined) columns.recipeId = body.data.recipeId;
      if (Object.keys(columns).length > 0) {
        await tx.update(meals).set(columns).where(eq(meals.id, existing.id));
      }

      if (foodIds) {
        await tx.delete(mealFoods).where(eq(mealFoods.mealId, existing.id));
        await tx.insert(mealFoods).values(foodIds.map((foodId) => ({ mealId: existing.id, foodId })));
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

    // Every allergen, ordered by its ladder step (unstepped allergens sort
    // last, alphabetically) so the response is already in the order the
    // ladder tracker wants to render it.
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

    // One exposure = one (meal, food) pair carrying the allergen, exactly
    // the granularity the old one-row-per-food serve log counted.
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
      .where(eq(meals.babyId, params.data.babyId))
      .groupBy(foodAllergens.allergenId);

    const exposuresByAllergenId = new Map(exposureRows.map((r) => [r.allergenId, r]));

    const items: AllergenProgressItem[] = allergenRows.map((a) => {
      const exposure = exposuresByAllergenId.get(a.id);
      const exposures = exposure?.exposures ?? 0;
      return {
        allergenSlug: a.slug,
        allergenName: a.name,
        introGuidance: a.introGuidance,
        exposures,
        firstAt: exposure ? new Date(exposure.firstAt).toISOString() : null,
        lastAt: exposure ? new Date(exposure.lastAt).toISOString() : null,
        status: deriveAllergenStatus(exposures),
      };
    });

    return reply.send({ items } satisfies AllergenProgressResponse);
  });
}
