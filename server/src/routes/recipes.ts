// Recipes: the seeded catalog, plus the recipes a parent writes for
// themselves.
//
// Same shape as custom foods one file over. `recipes.owner_id` is NULL for
// seeded content (everybody's) and set for a parent's own, and EVERY read
// here goes through `visibleRecipesCondition` — another account's recipe is
// absent from the list and 404 on detail, exactly like a row that does not
// exist. The write routes only ever touch custom recipes: a catalog row has
// no owner, so it can never match the ownership filter and is reported as not
// found like anybody else's.
//
// What a custom recipe does NOT get: an image, storage overrides, an
// iron-focus claim, or the catalog's three age variants. Its steps live in
// exactly ONE `recipe_variants` row, filed at the stage its "suitable from"
// age falls in, and `isCustom` tells the client to render them as a single
// "Steps" section instead of age tabs.
import { and, asc, eq, ilike, inArray, lte, notInArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ageStageForMonths,
  createCustomRecipeSchema,
  recipeDetailSchema,
  recipeIdParamSchema,
  recipesQuerySchema,
  updateCustomRecipeSchema,
  type AgeStage,
  type RecipeDetail,
  type RecipeIngredient,
  type RecipeListItem,
  type RecipeVariant,
  type RecipesResponse,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import { visibleFoodsCondition } from "../services/foods.js";
import { visibleRecipesCondition } from "../services/recipes.js";
import { buildCandidateSlug, isUniqueViolation, SLUG_ATTEMPTS } from "../services/slugs.js";
import type { Transaction } from "../services/meals.js";
import {
  allergens,
  favorites,
  foodAllergens,
  foods,
  meals,
  pantryItems,
  recipeIngredients,
  recipeVariants,
  recipes,
} from "../db/schema.js";

/** Values a custom recipe puts in the catalog-only columns. Nobody wrote an
 * iron-focus assessment or storage overrides for a recipe a parent typed in,
 * and `prep_minutes` is NOT NULL — 0 means "not stated" and the client hides
 * the prep line entirely rather than claiming "0 min". */
const CUSTOM_RECIPE_DEFAULTS = {
  prepMinutes: 0,
  ironFocus: false,
  imageUrl: null,
  fridgeHoursOverride: null,
  freezerDaysOverride: null,
} as const;

function badRequest(reply: FastifyReply, details: unknown): FastifyReply {
  return reply.code(400).send({ error: "invalid_request", details });
}

/** Every write handler here sits behind `requireAuth`; this makes that explicit. */
function currentUserId(request: FastifyRequest): string {
  const id = request.user?.id;
  if (!id) {
    throw new Error("currentUserId called on an unauthenticated request");
  }
  return id;
}

type RecipeRow = typeof recipes.$inferSelect;
type Validated<T> = { ok: true; value: T } | { ok: false; details: unknown };

interface IngredientInput {
  foodId: string;
  quantityNote: string;
}

/**
 * Deduped, visibility-checked ingredients. "Exists" means visible to THIS
 * user: the seeded catalog plus their own custom foods. Another account's
 * custom food reads as an unknown id, so it can never be written into a
 * recipe (and the 400 says nothing about whether it exists elsewhere).
 *
 * Deduped because `recipe_ingredients` is unique on (recipe_id, food_id):
 * the same food twice in one submission is one row, not a 500. The first
 * occurrence's quantity note wins.
 */
async function validateIngredients(
  db: Database,
  raw: IngredientInput[],
  userId: string,
): Promise<Validated<IngredientInput[]>> {
  const byFoodId = new Map<string, IngredientInput>();
  for (const ingredient of raw) {
    if (!byFoodId.has(ingredient.foodId)) byFoodId.set(ingredient.foodId, ingredient);
  }
  const deduped = [...byFoodId.values()];

  const rows = await db
    .select({ id: foods.id })
    .from(foods)
    .where(and(inArray(foods.id, [...byFoodId.keys()]), visibleFoodsCondition(userId)));
  const known = new Set(rows.map((row) => row.id));
  const unknownFoodIds = deduped.map((i) => i.foodId).filter((id) => !known.has(id));
  if (unknownFoodIds.length > 0) {
    return { ok: false, details: { ingredients: "unknown food", unknownFoodIds } };
  }

  return { ok: true, value: deduped };
}

/** Replaces a recipe's ingredient set wholesale — what create and edit both want. */
async function writeRecipeIngredients(tx: Transaction, recipeId: string, ingredients: IngredientInput[]): Promise<void> {
  await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
  if (ingredients.length === 0) return;
  await tx.insert(recipeIngredients).values(
    ingredients.map((ingredient) => ({
      recipeId,
      foodId: ingredient.foodId,
      quantityNote: ingredient.quantityNote,
    })),
  );
}

/**
 * A custom recipe's single variant row. Rewritten wholesale (delete, then
 * insert one) rather than updated in place: when the recipe's age changes so
 * does the stage the steps are filed under, and the unique index on
 * (recipe_id, age_stage) makes "move the row" the same work anyway.
 */
async function writeRecipeVariant(
  tx: Transaction,
  recipeId: string,
  minAgeMonths: number,
  steps: string[],
): Promise<void> {
  await tx.delete(recipeVariants).where(eq(recipeVariants.recipeId, recipeId));
  await tx.insert(recipeVariants).values({
    recipeId,
    ageStage: ageStageForMonths(minAgeMonths),
    // A catalog variant explains how the texture differs at this age; a
    // parent's own steps make no such claim, so the note is empty and the
    // client renders one plain "Steps" section.
    textureNote: "",
    // Steps are optional (item 240). The row is written EITHER WAY, with
    // empty instructions when there are none, so a custom recipe always
    // reads back as exactly one variant — the shape the detail page and
    // the edit form both assume — and gaining or losing its steps never
    // changes the number of variants.
    instructions: steps,
  });
}

/**
 * The full detail payload for one already-authorised recipe row. Shared by
 * GET /api/recipes/:id and the two write routes, so a recipe reads back the
 * same way however the caller reached it.
 */
async function loadRecipeDetail(db: Database, recipe: RecipeRow): Promise<RecipeDetail> {
  const ingredientRows: RecipeIngredient[] = await db
    .select({
      foodId: foods.id,
      foodSlug: foods.slug,
      foodName: foods.name,
      isCustom: sql<boolean>`${foods.ownerId} is not null`,
      foodEmoji: foods.emoji,
      quantityNote: recipeIngredients.quantityNote,
    })
    .from(recipeIngredients)
    .innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
    .where(eq(recipeIngredients.recipeId, recipe.id))
    // By name: `recipe_ingredients.id` is a random uuid and the table carries
    // no position column, so insertion order is not something a query can
    // recover — alphabetical is at least the same every time.
    .orderBy(asc(foods.name));

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

  const [highVitaminCRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recipeIngredients)
    .innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
    .where(and(eq(recipeIngredients.recipeId, recipe.id), eq(foods.vitaminCLevel, "high")));
  const vitaminCHigh = (highVitaminCRow?.count ?? 0) > 0;

  const detail: RecipeDetail = {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    minAgeMonths: recipe.minAgeMonths,
    prepMinutes: recipe.prepMinutes,
    ironFocus: recipe.ironFocus,
    vitaminCHigh,
    imageUrl: recipe.imageUrl,
    fridgeHoursOverride: recipe.fridgeHoursOverride,
    freezerDaysOverride: recipe.freezerDaysOverride,
    allergens: allergenSlugs,
    ingredients: ingredientRows,
    extraIngredients: recipe.extraIngredients ?? [],
    variants,
    isCustom: recipe.ownerId !== null,
    notes: recipe.notes,
  };

  return recipeDetailSchema.parse(detail);
}

/** This user's own recipe by id, or undefined — a catalog row (no owner) can
 * never match, which is what makes editing one a 404 rather than a 403. */
async function loadOwnedRecipe(db: Database, id: string, userId: string): Promise<RecipeRow | undefined> {
  const [row] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.ownerId, userId)))
    .limit(1);
  return row;
}

export function registerRecipeRoutes(app: FastifyInstance, db: Database): void {
  // ---------------------------------------------------------------------
  // GET /api/recipes
  //
  // Authenticated: `isFavorite` and "my custom recipes" are both per-user,
  // so there is no meaningful anonymous answer to give here.
  // ---------------------------------------------------------------------
  app.get("/api/recipes", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = recipesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_query", details: parsed.error.flatten() };
    }
    const userId = currentUserId(request);
    const { q, scope, maxAgeMonths, allergen, ironFocus, vitaminCHigh, ingredientFoodId } = parsed.data;

    // Unconditional, and first: every other filter narrows what this allows.
    const conditions = [visibleRecipesCondition(userId)];
    if (scope === "custom") conditions.push(eq(recipes.ownerId, userId));
    if (scope === "favorites") {
      const favoritedIds = db
        .select({ recipeId: favorites.recipeId })
        .from(favorites)
        .where(eq(favorites.userId, userId));
      conditions.push(inArray(recipes.id, favoritedIds));
    }
    if (q) conditions.push(ilike(recipes.title, `%${q}%`));
    if (maxAgeMonths !== undefined) conditions.push(lte(recipes.minAgeMonths, maxAgeMonths));
    if (ironFocus !== undefined) conditions.push(eq(recipes.ironFocus, ironFocus));
    if (vitaminCHigh !== undefined) {
      // Derived exactly like `allergen` below: ingredients -> foods whose
      // vitaminCLevel is "high". Custom foods always store "low", so a
      // custom recipe only qualifies via a catalog ingredient.
      const withHighVitaminC = db
        .select({ recipeId: recipeIngredients.recipeId })
        .from(recipeIngredients)
        .innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
        .where(eq(foods.vitaminCLevel, "high"));
      conditions.push(
        vitaminCHigh ? inArray(recipes.id, withHighVitaminC) : notInArray(recipes.id, withHighVitaminC),
      );
    }
    if (ingredientFoodId) {
      const withIngredient = db
        .select({ recipeId: recipeIngredients.recipeId })
        .from(recipeIngredients)
        .where(eq(recipeIngredients.foodId, ingredientFoodId));
      conditions.push(inArray(recipes.id, withIngredient));
    }
    if (allergen) {
      // Derived, exactly as the detail route and the favorites list derive
      // it: ingredients -> food_allergens -> allergens.
      const withAllergen = db
        .select({ recipeId: recipeIngredients.recipeId })
        .from(recipeIngredients)
        .innerJoin(foodAllergens, eq(recipeIngredients.foodId, foodAllergens.foodId))
        .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
        .where(eq(allergens.slug, allergen));
      conditions.push(inArray(recipes.id, withAllergen));
    }

    const rows = await db
      .select({
        id: recipes.id,
        slug: recipes.slug,
        title: recipes.title,
        minAgeMonths: recipes.minAgeMonths,
        ironFocus: recipes.ironFocus,
        ownerId: recipes.ownerId,
      })
      .from(recipes)
      .where(and(...conditions))
      .orderBy(asc(recipes.title));

    const recipeIds = rows.map((r) => r.id);

    // Three batch queries rather than three per recipe: allergens, ingredient
    // names, and which of these the caller has favorited.
    const allergenRows =
      recipeIds.length > 0
        ? await db
            .select({ recipeId: recipeIngredients.recipeId, slug: allergens.slug })
            .from(recipeIngredients)
            .innerJoin(foodAllergens, eq(recipeIngredients.foodId, foodAllergens.foodId))
            .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
            .where(inArray(recipeIngredients.recipeId, recipeIds))
            .orderBy(asc(allergens.slug))
        : [];
    const allergensByRecipeId = new Map<string, string[]>();
    for (const row of allergenRows) {
      const slugs = allergensByRecipeId.get(row.recipeId) ?? [];
      if (!slugs.includes(row.slug)) slugs.push(row.slug);
      allergensByRecipeId.set(row.recipeId, slugs);
    }

    const highVitaminCRows =
      recipeIds.length > 0
        ? await db
            .select({ recipeId: recipeIngredients.recipeId })
            .from(recipeIngredients)
            .innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
            .where(and(inArray(recipeIngredients.recipeId, recipeIds), eq(foods.vitaminCLevel, "high")))
        : [];
    const vitaminCHighRecipeIds = new Set(highVitaminCRows.map((row) => row.recipeId));

    const ingredientRows =
      recipeIds.length > 0
        ? await db
            .select({ recipeId: recipeIngredients.recipeId, name: foods.name })
            .from(recipeIngredients)
            .innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
            .where(inArray(recipeIngredients.recipeId, recipeIds))
            // Same ordering as the detail route's ingredient list, and for
            // the same reason — see `loadRecipeDetail`.
            .orderBy(asc(foods.name))
        : [];
    const ingredientNamesByRecipeId = new Map<string, string[]>();
    for (const row of ingredientRows) {
      const names = ingredientNamesByRecipeId.get(row.recipeId) ?? [];
      names.push(row.name);
      ingredientNamesByRecipeId.set(row.recipeId, names);
    }

    const favoriteRows =
      recipeIds.length > 0
        ? await db
            .select({ recipeId: favorites.recipeId })
            .from(favorites)
            .where(and(eq(favorites.userId, userId), inArray(favorites.recipeId, recipeIds)))
        : [];
    const favoritedIds = new Set(favoriteRows.map((row) => row.recipeId));

    const items: RecipeListItem[] = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      minAgeMonths: r.minAgeMonths,
      ironFocus: r.ironFocus,
      vitaminCHigh: vitaminCHighRecipeIds.has(r.id),
      allergens: allergensByRecipeId.get(r.id) ?? [],
      isCustom: r.ownerId !== null,
      isFavorite: favoritedIds.has(r.id),
      ingredientNames: ingredientNamesByRecipeId.get(r.id) ?? [],
    }));

    return { recipes: items } satisfies RecipesResponse;
  });

  // ---------------------------------------------------------------------
  // GET /api/recipes/:id
  //
  // Still open to anonymous callers — the seeded catalog is public content —
  // but scoped: a signed-in parent also sees their own, and nobody sees
  // anybody else's.
  // ---------------------------------------------------------------------
  app.get("/api/recipes/:id", { preHandler: app.resolveOptionalUser }, async (request, reply) => {
    const params = recipeIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, params.data.id), visibleRecipesCondition(request.user?.id ?? null)))
      .limit(1);
    if (!recipe) return notFound(reply);

    return await loadRecipeDetail(db, recipe);
  });

  // ---------------------------------------------------------------------
  // POST /api/recipes — a recipe this parent writes for themselves
  // ---------------------------------------------------------------------
  app.post("/api/recipes", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = createCustomRecipeSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    const userId = currentUserId(request);
    const ingredients = await validateIngredients(db, body.data.ingredients, userId);
    if (!ingredients.ok) return badRequest(reply, ingredients.details);

    // Retried rather than pre-checked: a SELECT-then-INSERT still races, so
    // the unique index is what actually decides and a losing insert simply
    // draws a new suffix.
    let created: RecipeRow | undefined;
    for (let attempt = 0; attempt < SLUG_ATTEMPTS && !created; attempt += 1) {
      try {
        created = await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(recipes)
            .values({
              ...CUSTOM_RECIPE_DEFAULTS,
              slug: buildCandidateSlug(body.data.title, "recipe"),
              title: body.data.title,
              minAgeMonths: body.data.minAgeMonths,
              prepMinutes: body.data.prepMinutes ?? CUSTOM_RECIPE_DEFAULTS.prepMinutes,
              extraIngredients: body.data.extraIngredients,
              notes: body.data.notes,
              ownerId: userId,
            })
            .returning();
          if (!row) throw new Error("Custom recipe insert returned no row");

          await writeRecipeIngredients(tx, row.id, ingredients.value);
          await writeRecipeVariant(tx, row.id, body.data.minAgeMonths, body.data.steps);
          return row;
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    if (!created) throw new Error("Could not find a free slug for the new custom recipe");

    reply.code(201);
    return await loadRecipeDetail(db, created);
  });

  // ---------------------------------------------------------------------
  // PATCH /api/recipes/:id
  // ---------------------------------------------------------------------
  app.patch("/api/recipes/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = recipeIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const body = updateCustomRecipeSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    const userId = currentUserId(request);
    const existing = await loadOwnedRecipe(db, params.data.id, userId);
    if (!existing) return notFound(reply);

    const ingredients = body.data.ingredients
      ? await validateIngredients(db, body.data.ingredients, userId)
      : null;
    if (ingredients && !ingredients.ok) return badRequest(reply, ingredients.details);

    // The slug is deliberately absent: renaming a recipe must not break the
    // links, pantry rows and logged meals already pointing at it.
    const columns = {
      ...(body.data.title !== undefined ? { title: body.data.title } : {}),
      ...(body.data.minAgeMonths !== undefined ? { minAgeMonths: body.data.minAgeMonths } : {}),
      ...(body.data.prepMinutes !== undefined ? { prepMinutes: body.data.prepMinutes } : {}),
      ...(body.data.extraIngredients !== undefined ? { extraIngredients: body.data.extraIngredients } : {}),
      ...(body.data.notes !== undefined ? { notes: body.data.notes } : {}),
    };

    // The variant row has to move when the age changes (the stage is derived
    // from it), and be rewritten when the steps change — so either edit
    // rebuilds it from whichever half is new plus whichever half stands.
    const nextMinAgeMonths = body.data.minAgeMonths ?? existing.minAgeMonths;
    const stageChanged = ageStageForMonths(nextMinAgeMonths) !== ageStageForMonths(existing.minAgeMonths);
    const rewriteVariant = body.data.steps !== undefined || stageChanged;
    let steps = body.data.steps;
    if (rewriteVariant && steps === undefined) {
      const [variant] = await db
        .select({ instructions: recipeVariants.instructions })
        .from(recipeVariants)
        .where(eq(recipeVariants.recipeId, existing.id))
        .limit(1);
      steps = variant?.instructions ?? [];
    }

    const updated = await db.transaction(async (tx) => {
      let row = existing;
      if (Object.keys(columns).length > 0) {
        const [next] = await tx
          .update(recipes)
          .set(columns)
          .where(and(eq(recipes.id, existing.id), eq(recipes.ownerId, userId)))
          .returning();
        if (!next) throw new Error("Custom recipe update returned no row");
        row = next;
      }
      if (ingredients?.ok) await writeRecipeIngredients(tx, existing.id, ingredients.value);
      if (rewriteVariant) await writeRecipeVariant(tx, existing.id, nextMinAgeMonths, steps ?? []);
      return row;
    });

    return await loadRecipeDetail(db, updated);
  });

  // ---------------------------------------------------------------------
  // DELETE /api/recipes/:id
  // ---------------------------------------------------------------------
  app.delete("/api/recipes/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = recipeIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const userId = currentUserId(request);
    const existing = await loadOwnedRecipe(db, params.data.id, userId);
    if (!existing) return notFound(reply);

    // A logged meal keeps its recipe attribution and a pantry container keeps
    // knowing what it was made from, so neither reference cascades — a
    // referenced recipe is a 409 the parent can act on, with the counts the
    // UI needs to say what is in the way. Favorites are NOT in this list:
    // un-favoriting is not a decision worth blocking a delete on, so the
    // caller's own row is simply removed below.
    const [mealRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(meals)
      .where(eq(meals.recipeId, existing.id));
    const [pantryRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pantryItems)
      .where(eq(pantryItems.recipeId, existing.id));

    const mealCount = mealRow?.count ?? 0;
    const pantryCount = pantryRow?.count ?? 0;
    if (mealCount > 0 || pantryCount > 0) {
      return reply.code(409).send({ error: "conflict", mealCount, pantryCount });
    }

    await db.transaction(async (tx) => {
      await tx.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.recipeId, existing.id)));
      // `recipe_ingredients` and `recipe_variants` cascade from here.
      await tx.delete(recipes).where(and(eq(recipes.id, existing.id), eq(recipes.ownerId, userId)));
    });

    return reply.code(204).send();
  });
}
