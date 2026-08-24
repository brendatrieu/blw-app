// Serve-log tracking: the per-baby completion log (create/list/delete) plus
// the allergen-ladder progress derived from it. Every route sits behind
// requireAuth and every baby/serve-log lookup is scoped to the caller's own
// rows — a miss (wrong owner or unknown id) is 404, never 403.
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  babyIdRouteParamSchema,
  createServeLogInputSchema,
  deriveAllergenStatus,
  serveLogIdParamSchema,
  serveLogsQuerySchema,
  type AllergenProgressItem,
  type AllergenProgressResponse,
  type ServeLogItem,
  type ServeLogsResponse,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import { allergenLadderSteps, allergens, babies, foodAllergens, foods, recipes, serveLogs } from "../db/schema.js";

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

export function registerServeLogRoutes(app: FastifyInstance, db: Database): void {
  // -----------------------------------------------------------------------
  // GET /api/babies/:babyId/serve-logs
  // -----------------------------------------------------------------------
  app.get("/api/babies/:babyId/serve-logs", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    if (!(await ownsBaby(db, params.data.babyId, currentUserId(request)))) return notFound(reply);

    const query = serveLogsQuerySchema.safeParse(request.query);
    if (!query.success) return badRequest(reply, query.error.flatten());

    const conditions = [eq(serveLogs.babyId, params.data.babyId)];
    if (query.data.before) conditions.push(lt(serveLogs.servedAt, new Date(query.data.before)));

    const rows = await db
      .select({
        id: serveLogs.id,
        foodId: serveLogs.foodId,
        foodSlug: foods.slug,
        foodName: foods.name,
        recipeId: serveLogs.recipeId,
        recipeTitle: recipes.title,
        servedAt: serveLogs.servedAt,
        reactionNote: serveLogs.reactionNote,
      })
      .from(serveLogs)
      .innerJoin(foods, eq(serveLogs.foodId, foods.id))
      .leftJoin(recipes, eq(serveLogs.recipeId, recipes.id))
      .where(and(...conditions))
      .orderBy(desc(serveLogs.servedAt))
      .limit(query.data.limit ?? DEFAULT_LIMIT);

    const items: ServeLogItem[] = rows.map((r) => ({
      id: r.id,
      foodId: r.foodId,
      foodSlug: r.foodSlug,
      foodName: r.foodName,
      recipeId: r.recipeId,
      recipeTitle: r.recipeTitle ?? null,
      servedAt: r.servedAt.toISOString(),
      reactionNote: r.reactionNote,
    }));

    return reply.send({ items } satisfies ServeLogsResponse);
  });

  // -----------------------------------------------------------------------
  // POST /api/babies/:babyId/serve-logs
  // -----------------------------------------------------------------------
  app.post("/api/babies/:babyId/serve-logs", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    if (!(await ownsBaby(db, params.data.babyId, currentUserId(request)))) return notFound(reply);

    const body = createServeLogInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    const [food] = await db
      .select({ id: foods.id, slug: foods.slug, name: foods.name })
      .from(foods)
      .where(eq(foods.id, body.data.foodId))
      .limit(1);
    if (!food) return badRequest(reply, { foodId: "unknown food" });

    let recipeTitle: string | null = null;
    if (body.data.recipeId) {
      const [recipe] = await db
        .select({ id: recipes.id, title: recipes.title })
        .from(recipes)
        .where(eq(recipes.id, body.data.recipeId))
        .limit(1);
      if (!recipe) return badRequest(reply, { recipeId: "unknown recipe" });
      recipeTitle = recipe.title;
    }

    const inserted = await db
      .insert(serveLogs)
      .values({
        babyId: params.data.babyId,
        foodId: body.data.foodId,
        recipeId: body.data.recipeId,
        servedAt: body.data.servedAt ? new Date(body.data.servedAt) : new Date(),
        reactionNote: body.data.reactionNote,
      })
      .returning();

    const row = inserted[0];
    if (!row) {
      throw new Error("Insert of serve log returned no row");
    }

    const item: ServeLogItem = {
      id: row.id,
      foodId: row.foodId,
      foodSlug: food.slug,
      foodName: food.name,
      recipeId: row.recipeId,
      recipeTitle,
      servedAt: row.servedAt.toISOString(),
      reactionNote: row.reactionNote,
    };
    return reply.code(201).send(item);
  });

  // -----------------------------------------------------------------------
  // DELETE /api/serve-logs/:id
  // -----------------------------------------------------------------------
  app.delete("/api/serve-logs/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = serveLogIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const ownedBabyIds = db.select({ id: babies.id }).from(babies).where(eq(babies.userId, currentUserId(request)));

    const deleted = await db
      .delete(serveLogs)
      .where(and(eq(serveLogs.id, params.data.id), inArray(serveLogs.babyId, ownedBabyIds)))
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

    const exposureRows = await db
      .select({
        allergenId: foodAllergens.allergenId,
        exposures: sql<number>`count(*)::int`,
        firstAt: sql<string>`min(${serveLogs.servedAt})`,
        lastAt: sql<string>`max(${serveLogs.servedAt})`,
      })
      .from(serveLogs)
      .innerJoin(foodAllergens, eq(foodAllergens.foodId, serveLogs.foodId))
      .where(eq(serveLogs.babyId, params.data.babyId))
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
