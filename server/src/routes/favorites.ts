// Recipe favorites: toggle + list. Favoriting isn't a per-baby resource —
// it's keyed on (user_id, recipe_id) — so there is no baby-ownership check
// here, only the usual requireAuth session.
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { favoriteRecipeIdParamSchema, type FavoriteItem, type FavoritesResponse } from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import { allergens, foodAllergens, favorites, recipeIngredients, recipes } from "../db/schema.js";

/** Every handler behind `requireAuth` has a user; this makes that explicit. */
function currentUserId(request: FastifyRequest): string {
  const id = request.user?.id;
  if (!id) {
    throw new Error("currentUserId called on an unauthenticated request");
  }
  return id;
}

export function registerFavoriteRoutes(app: FastifyInstance, db: Database): void {
  // -----------------------------------------------------------------------
  // PUT /api/recipes/:id/favorite
  // -----------------------------------------------------------------------
  app.put("/api/recipes/:id/favorite", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = favoriteRecipeIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const [recipe] = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, params.data.id)).limit(1);
    if (!recipe) return notFound(reply);

    // Idempotent: favoriting an already-favorited recipe is a no-op, not a
    // conflict.
    await db
      .insert(favorites)
      .values({ userId: currentUserId(request), recipeId: params.data.id })
      .onConflictDoNothing();

    return reply.code(204).send();
  });

  // -----------------------------------------------------------------------
  // DELETE /api/recipes/:id/favorite
  // -----------------------------------------------------------------------
  app.delete("/api/recipes/:id/favorite", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = favoriteRecipeIdParamSchema.safeParse(request.params);
    if (!params.success) {
      // Not a real id, so nothing could be favorited under it either —
      // un-favoriting something that was never favorited still succeeds.
      return reply.code(204).send();
    }

    await db
      .delete(favorites)
      .where(and(eq(favorites.userId, currentUserId(request)), eq(favorites.recipeId, params.data.id)));

    return reply.code(204).send();
  });

  // -----------------------------------------------------------------------
  // GET /api/favorites
  // -----------------------------------------------------------------------
  app.get("/api/favorites", { preHandler: app.requireAuth }, async (request, reply) => {
    const rows = await db
      .select({
        recipeId: recipes.id,
        title: recipes.title,
        minAgeMonths: recipes.minAgeMonths,
        ironFocus: recipes.ironFocus,
      })
      .from(favorites)
      .innerJoin(recipes, eq(favorites.recipeId, recipes.id))
      .where(eq(favorites.userId, currentUserId(request)))
      .orderBy(desc(favorites.createdAt));

    // Allergens are derived (not stored) the same way the recipe-detail
    // route derives them: join through ingredients -> food_allergens.
    // Batch-fetched for every favorited recipe in one query.
    const recipeIds = rows.map((r) => r.recipeId);
    const allergenRows =
      recipeIds.length > 0
        ? await db
            .select({ recipeId: recipeIngredients.recipeId, slug: allergens.slug })
            .from(recipeIngredients)
            .innerJoin(foodAllergens, eq(recipeIngredients.foodId, foodAllergens.foodId))
            .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
            .where(inArray(recipeIngredients.recipeId, recipeIds))
        : [];
    const allergensByRecipeId = new Map<string, string[]>();
    for (const row of allergenRows) {
      const slugs = allergensByRecipeId.get(row.recipeId) ?? [];
      if (!slugs.includes(row.slug)) slugs.push(row.slug);
      allergensByRecipeId.set(row.recipeId, slugs);
    }

    const items: FavoriteItem[] = rows.map((r) => ({
      recipeId: r.recipeId,
      title: r.title,
      minAgeMonths: r.minAgeMonths,
      ironFocus: r.ironFocus,
      allergens: allergensByRecipeId.get(r.recipeId) ?? [],
    }));

    return reply.send({ items } satisfies FavoritesResponse);
  });
}
