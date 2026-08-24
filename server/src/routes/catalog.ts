// Public, read-only catalog routes: foods list/detail and recipe detail.
// No auth, no ownership checks — this is seeded reference content.
import { and, asc, eq, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  foodDetailSchema,
  foodsQuerySchema,
  recipeDetailSchema,
  type AgeStage,
  type FoodDetail,
  type FoodListItem,
  type FoodPairing,
  type FoodRecipeRef,
  type FoodsResponse,
  type RecipeDetail,
  type RecipeIngredient,
  type RecipeVariant,
} from "@blw/shared";
import type { Database } from "../db/index.js";
import { allergens, foodAllergens, foodPairings, foods, recipeIngredients, recipeVariants, recipes } from "../db/schema.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Explicit iron-level ordering (the pgEnum's declaration order happens to
// match, but that isn't guaranteed by any driver — spell it out).
const IRON_LEVEL_ORDER = sql`case ${foods.ironLevel} when 'high' then 0 when 'moderate' then 1 else 2 end`;

export function registerCatalogRoutes(app: FastifyInstance, db: Database): void {
  // ---------------------------------------------------------------------
  // GET /api/foods
  // ---------------------------------------------------------------------
  app.get("/api/foods", async (request, reply) => {
    const parsed = foodsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_query", details: parsed.error.flatten() };
    }
    const { category, allergen, ironLevel, q, maxAgeMonths } = parsed.data;

    const conditions = [];
    if (category) conditions.push(eq(foods.category, category));
    if (ironLevel) conditions.push(eq(foods.ironLevel, ironLevel));
    if (maxAgeMonths !== undefined) conditions.push(lte(foods.minAgeMonths, maxAgeMonths));
    if (q) conditions.push(ilike(foods.name, `%${q}%`));
    if (allergen) {
      const matchingFoodIds = db
        .select({ foodId: foodAllergens.foodId })
        .from(foodAllergens)
        .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
        .where(eq(allergens.slug, allergen));
      conditions.push(inArray(foods.id, matchingFoodIds));
    }

    const rows = await db
      .select()
      .from(foods)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(IRON_LEVEL_ORDER, asc(foods.name));

    // Batch-fetch allergen slugs for every matched food in one query
    // (instead of one query per food) and group them in memory.
    const foodIds = rows.map((f) => f.id);
    const allergenRows =
      foodIds.length > 0
        ? await db
            .select({ foodId: foodAllergens.foodId, slug: allergens.slug })
            .from(foodAllergens)
            .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
            .where(inArray(foodAllergens.foodId, foodIds))
        : [];
    const allergensByFoodId = new Map<string, string[]>();
    for (const row of allergenRows) {
      const list = allergensByFoodId.get(row.foodId);
      if (list) {
        list.push(row.slug);
      } else {
        allergensByFoodId.set(row.foodId, [row.slug]);
      }
    }

    const items: FoodListItem[] = rows.map((f) => ({
      slug: f.slug,
      name: f.name,
      category: f.category,
      ironLevel: f.ironLevel,
      vitaminCLevel: f.vitaminCLevel,
      chokingRisk: f.chokingRisk,
      minAgeMonths: f.minAgeMonths,
      allergens: allergensByFoodId.get(f.id) ?? [],
    }));

    return { foods: items } satisfies FoodsResponse;
  });

  // ---------------------------------------------------------------------
  // GET /api/foods/:slug
  // ---------------------------------------------------------------------
  app.get("/api/foods/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const [food] = await db.select().from(foods).where(eq(foods.slug, slug)).limit(1);
    if (!food) {
      reply.code(404);
      return { error: "not_found" };
    }

    const allergenRows = await db
      .select({ slug: allergens.slug })
      .from(foodAllergens)
      .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
      .where(eq(foodAllergens.foodId, food.id));

    // Pairings are stored one-directional (iron food -> vitamin-C food), but
    // a food can appear on either side, so match both and resolve the
    // "other" food per row.
    const pairingRows = await db
      .select({
        reason: foodPairings.reason,
        ironFoodId: foodPairings.ironFoodId,
        vitCFoodId: foodPairings.vitCFoodId,
      })
      .from(foodPairings)
      .where(or(eq(foodPairings.ironFoodId, food.id), eq(foodPairings.vitCFoodId, food.id)));

    const pairedFoodIds = pairingRows.map((p) => (p.ironFoodId === food.id ? p.vitCFoodId : p.ironFoodId));
    const pairedFoodRows =
      pairedFoodIds.length > 0 ? await db.select().from(foods).where(inArray(foods.id, pairedFoodIds)) : [];
    const pairedFoodById = new Map(pairedFoodRows.map((f) => [f.id, f]));

    const pairings: FoodPairing[] = pairingRows.flatMap((p) => {
      const otherId = p.ironFoodId === food.id ? p.vitCFoodId : p.ironFoodId;
      const other = pairedFoodById.get(otherId);
      if (!other) return [];
      return [
        {
          food: { slug: other.slug, name: other.name, ironLevel: other.ironLevel, vitaminCLevel: other.vitaminCLevel },
          reason: p.reason,
        },
      ];
    });

    const recipeRows: FoodRecipeRef[] = await db
      .select({ id: recipes.id, title: recipes.title, minAgeMonths: recipes.minAgeMonths })
      .from(recipeIngredients)
      .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
      .where(eq(recipeIngredients.foodId, food.id));

    const detail: FoodDetail = {
      slug: food.slug,
      name: food.name,
      category: food.category,
      ironLevel: food.ironLevel,
      vitaminCLevel: food.vitaminCLevel,
      chokingRisk: food.chokingRisk,
      minAgeMonths: food.minAgeMonths,
      allergens: allergenRows.map((a) => a.slug),
      prep6m: food.prep6m,
      prep9m: food.prep9m,
      prep12m: food.prep12m,
      chokingNotes: food.chokingNotes,
      notes: food.notes,
      imageUrl: food.imageUrl,
      pairings,
      recipes: recipeRows,
    };

    return foodDetailSchema.parse(detail);
  });

  // ---------------------------------------------------------------------
  // GET /api/recipes/:id
  // ---------------------------------------------------------------------
  app.get("/api/recipes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) {
      reply.code(404);
      return { error: "not_found" };
    }

    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
    if (!recipe) {
      reply.code(404);
      return { error: "not_found" };
    }

    const ingredientRows: RecipeIngredient[] = await db
      .select({ foodSlug: foods.slug, foodName: foods.name, quantityNote: recipeIngredients.quantityNote })
      .from(recipeIngredients)
      .innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
      .where(eq(recipeIngredients.recipeId, recipe.id));

    const variantRows = await db.select().from(recipeVariants).where(eq(recipeVariants.recipeId, recipe.id));
    const variantByStage = new Map(variantRows.map((v) => [v.ageStage, v]));
    const variants: RecipeVariant[] = (["6", "9", "12"] as const satisfies readonly AgeStage[]).flatMap((stage) => {
      const v = variantByStage.get(stage);
      return v ? [{ ageStage: stage, textureNote: v.textureNote, steps: v.instructions }] : [];
    });

    const derivedAllergenRows = await db
      .select({ slug: allergens.slug })
      .from(recipeIngredients)
      .innerJoin(foodAllergens, eq(recipeIngredients.foodId, foodAllergens.foodId))
      .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
      .where(eq(recipeIngredients.recipeId, recipe.id));
    const allergenSlugs = [...new Set(derivedAllergenRows.map((a) => a.slug))];

    const detail: RecipeDetail = {
      id: recipe.id,
      slug: recipe.slug,
      title: recipe.title,
      minAgeMonths: recipe.minAgeMonths,
      prepMinutes: recipe.prepMinutes,
      ironFocus: recipe.ironFocus,
      imageUrl: recipe.imageUrl,
      fridgeHoursOverride: recipe.fridgeHoursOverride,
      freezerDaysOverride: recipe.freezerDaysOverride,
      allergens: allergenSlugs,
      ingredients: ingredientRows,
      extraIngredients: recipe.extraIngredients ?? [],
      variants,
    };

    return recipeDetailSchema.parse(detail);
  });
}
