// Foods: the seeded reference catalog, plus the foods a parent adds for
// themselves. (Recipes, which follow the same owner_id pattern, live in
// routes/recipes.ts.)
//
// Reads stay open to anonymous callers — the catalog is public content — but
// they are no longer unscoped: `foods` now holds custom rows too (owner_id
// set), and every read filters to "catalog OR mine". Another account's
// custom food is absent from the list and 404 on detail, exactly like a row
// that does not exist.
//
// The write routes (POST/PATCH/DELETE /api/foods, restore, replace) only ever
// touch custom foods: a catalog row has no owner, so it can never match the
// ownership filter and is reported as not found like anybody else's.
//
// Deleting a custom food is SOFT (`deleted_at`): choosing and browsing reads
// hide it, history keeps it. Only a replace removes a food for good, and only
// after every row naming it has moved to the replacement.
import { and, asc, eq, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createCustomFoodSchema,
  foodDetailSchema,
  foodIdParamSchema,
  foodsQuerySchema,
  replaceCustomFoodSchema,
  updateCustomFoodSchema,
  type FoodDetail,
  type FoodListItem,
  type FoodPairing,
  type FoodRecipeRef,
  type FoodsResponse,
  type FoodUsage,
  type ReplaceCustomFoodResponse,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import { choosableFoodsCondition, visibleFoodsCondition } from "../services/foods.js";
import { visibleRecipesCondition } from "../services/recipes.js";
import { buildCandidateSlug, isUniqueViolation, SLUG_ATTEMPTS } from "../services/slugs.js";
import type { Transaction } from "../services/meals.js";
import {
  allergens,
  foodAllergens,
  foodPairings,
  foods,
  mealFoods,
  storageItemFoods,
  recipeIngredients,
  recipes,
  storageGuidelines,
} from "../db/schema.js";

// Explicit iron-level ordering (the pgEnum's declaration order happens to
// match, but that isn't guaranteed by any driver — spell it out).
const IRON_LEVEL_ORDER = sql`case ${foods.ironLevel} when 'high' then 0 when 'moderate' then 1 else 2 end`;

/**
 * What a custom food puts in the curated columns. Nobody wrote iron,
 * vitamin-C, fiber, choking or prep guidance for a food a parent typed in, and
 * those columns are NOT NULL — so the row carries deliberately inert values
 * and the API's `isCustom: true` tells the client to render none of them.
 * `low` throughout rather than `moderate`: an invented level must not read
 * as a safety claim in either direction, and nothing ever shows it.
 */
const CUSTOM_FOOD_PLACEHOLDERS = {
  ironLevel: "low",
  vitaminCLevel: "low",
  fiberLevel: "low",
  chokingRisk: "low",
  minAgeMonths: 6,
  prep6m: "",
  prep9m: "",
  prep12m: "",
} as const;

/**
 * Storage window a custom food inherits, so a storage item made from one
 * still has expiry math to run. `produce_cooked_soft` is the seeds' most
 * conservative general-purpose row.
 *
 * The row is created here if it is missing rather than assumed: seeds own
 * the canonical copy (server/db/seeds/data/storage.ts), but a database that
 * has migrated without seeding — a fresh test database, a partial deploy —
 * would otherwise fail the food insert on the storage-category foreign key.
 * `on conflict do nothing` means the seeded text always wins where it exists.
 */
const DEFAULT_CUSTOM_STORAGE_CATEGORY = "produce_cooked_soft";
const DEFAULT_CUSTOM_STORAGE_GUIDELINE = {
  category: DEFAULT_CUSTOM_STORAGE_CATEGORY,
  fridgeHours: 72,
  freezerDays: 90,
  roomTempHours: 2,
  notes: "Cooked or softened food stores well chilled or frozen in an airtight container. Never refreeze after thawing.",
};

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

type Validated<T> = { ok: true; value: T } | { ok: false; details: unknown };

/**
 * Resolves allergen slugs against the seeded `allergens` table — the same
 * canonical list the allergen-override route validates against. An unknown
 * slug is a 400: it names catalog content, not anybody's data, so saying so
 * leaks nothing.
 */
async function resolveAllergenIds(db: Database, slugs: string[]): Promise<Validated<string[]>> {
  const unique = [...new Set(slugs)];
  if (unique.length === 0) return { ok: true, value: [] };

  const rows = await db
    .select({ id: allergens.id, slug: allergens.slug })
    .from(allergens)
    .where(inArray(allergens.slug, unique));

  const idBySlug = new Map(rows.map((row) => [row.slug, row.id]));
  const unknownAllergenSlugs = unique.filter((slug) => !idBySlug.has(slug));
  if (unknownAllergenSlugs.length > 0) {
    return { ok: false, details: { allergenSlugs: "unknown allergen", unknownAllergenSlugs } };
  }

  return { ok: true, value: unique.map((slug) => idBySlug.get(slug)!) };
}

/** Replaces a food's allergen set wholesale — the shape both create and edit want. */
async function writeFoodAllergens(tx: Transaction, foodId: string, allergenIds: string[]): Promise<void> {
  await tx.delete(foodAllergens).where(eq(foodAllergens.foodId, foodId));
  if (allergenIds.length === 0) return;
  await tx.insert(foodAllergens).values(allergenIds.map((allergenId) => ({ foodId, allergenId })));
}

type FoodRow = typeof foods.$inferSelect;

/**
 * Where a custom food is used: meals, containers and custom recipes naming
 * it. Only its owner can reference a custom food (every write validates food
 * ids against the visibility rule), so these counts are all theirs.
 */
async function loadFoodUsage(db: Database | Transaction, foodId: string): Promise<FoodUsage> {
  const [mealRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mealFoods)
    .where(eq(mealFoods.foodId, foodId));
  // One row per (container, food) — the join table's primary key — so this
  // counts containers, which is what the parent is told.
  const [storageRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(storageItemFoods)
    .where(eq(storageItemFoods.foodId, foodId));
  const [recipeRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recipeIngredients)
    .where(eq(recipeIngredients.foodId, foodId));
  return {
    mealCount: mealRow?.count ?? 0,
    storageCount: storageRow?.count ?? 0,
    recipeCount: recipeRow?.count ?? 0,
  };
}

/**
 * The full detail payload for one already-authorised food row. Shared by GET
 * /api/foods/:slug and the two write routes, so a food reads back the same
 * way however the caller reached it. `userId` scopes the "recipes with this
 * food" list — it now spans custom recipes, and one parent's recipe must not
 * surface on another's food page.
 */
async function loadFoodDetail(db: Database, food: FoodRow, userId: string | null): Promise<FoodDetail> {
  const allergenRows = await db
    .select({ slug: allergens.slug })
    .from(foodAllergens)
    .innerJoin(allergens, eq(foodAllergens.allergenId, allergens.id))
    .where(eq(foodAllergens.foodId, food.id))
    .orderBy(asc(allergens.slug));

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

  // Catalog recipes plus this caller's own — never another parent's, which
  // would otherwise leak a private recipe's title through a shared food.
  // `ingredientCount` is the recipe's TOTAL ingredient count (a correlated
  // subquery, not the joined row), so the client can mark a single-ingredient
  // "Simple <food>" basic without another round trip and without a stored
  // flag.
  const recipeRows: FoodRecipeRef[] = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      minAgeMonths: recipes.minAgeMonths,
      ingredientCount: sql<number>`(
        select count(*)::int
        from ${recipeIngredients} as all_ingredients
        where all_ingredients.recipe_id = ${recipes.id}
      )`,
    })
    .from(recipeIngredients)
    .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
    .where(and(eq(recipeIngredients.foodId, food.id), visibleRecipesCondition(userId)))
    .orderBy(asc(recipes.title));

  const detail: FoodDetail = {
    id: food.id,
    slug: food.slug,
    name: food.name,
    category: food.category,
    ironLevel: food.ironLevel,
    vitaminCLevel: food.vitaminCLevel,
    fiberLevel: food.fiberLevel,
    chokingRisk: food.chokingRisk,
    minAgeMonths: food.minAgeMonths,
    allergens: allergenRows.map((a) => a.slug),
    isCustom: food.ownerId !== null,
    emoji: food.emoji,
    prep6m: food.prep6m,
    prep9m: food.prep9m,
    prep12m: food.prep12m,
    chokingNotes: food.chokingNotes,
    notes: food.notes,
    imageUrl: food.imageUrl,
    pairings,
    recipes: recipeRows,
    deletedAt: food.deletedAt?.toISOString() ?? null,
    // The owner's own food only: what the delete prompt names.
    ...(userId !== null && food.ownerId === userId ? { usage: await loadFoodUsage(db, food.id) } : {}),
  };

  return foodDetailSchema.parse(detail);
}

/** This user's own food by id, or undefined — a catalog row (no owner) can
 * never match, which is what makes editing one a 404 rather than a 403.
 * Deleted foods DO match: restore and a repeat delete need them. */
async function loadOwnedFood(db: Database, id: string, userId: string): Promise<FoodRow | undefined> {
  const [row] = await db
    .select()
    .from(foods)
    .where(and(eq(foods.id, id), eq(foods.ownerId, userId)))
    .limit(1);
  return row;
}

export function registerCatalogRoutes(app: FastifyInstance, db: Database): void {
  // ---------------------------------------------------------------------
  // GET /api/foods
  // ---------------------------------------------------------------------
  app.get("/api/foods", { preHandler: app.resolveOptionalUser }, async (request, reply) => {
    const parsed = foodsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_query", details: parsed.error.flatten() };
    }
    const { category, allergen, ironLevel, vitaminCLevel, fiberLevel, q, maxAgeMonths, deleted } = parsed.data;
    const userId = request.user?.id ?? null;
    // Anonymous callers own nothing, so they have nothing deleted either.
    if (deleted && !userId) return { foods: [] } satisfies FoodsResponse;

    // Unconditional, and first: every other filter narrows what this allows.
    // This list feeds browsing, search and every food picker, so a deleted
    // food is hidden — unless the caller asked for exactly their deleted ones.
    const conditions = [
      deleted && userId
        ? and(eq(foods.ownerId, userId), isNotNull(foods.deletedAt))
        : choosableFoodsCondition(userId),
    ];
    if (category) conditions.push(eq(foods.category, category));
    if (ironLevel) conditions.push(eq(foods.ironLevel, ironLevel));
    if (vitaminCLevel) conditions.push(eq(foods.vitaminCLevel, vitaminCLevel));
    if (fiberLevel) conditions.push(eq(foods.fiberLevel, fiberLevel));
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
      .where(and(...conditions))
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
      id: f.id,
      slug: f.slug,
      name: f.name,
      category: f.category,
      ironLevel: f.ironLevel,
      vitaminCLevel: f.vitaminCLevel,
      fiberLevel: f.fiberLevel,
      chokingRisk: f.chokingRisk,
      minAgeMonths: f.minAgeMonths,
      allergens: allergensByFoodId.get(f.id) ?? [],
      isCustom: f.ownerId !== null,
      emoji: f.emoji,
    }));

    return { foods: items } satisfies FoodsResponse;
  });

  // ---------------------------------------------------------------------
  // GET /api/foods/:slug
  // ---------------------------------------------------------------------
  app.get("/api/foods/:slug", { preHandler: app.resolveOptionalUser }, async (request, reply) => {
    const { slug } = request.params as { slug: string };

    // Deleted foods still load here (read-only page with Restore): meals,
    // storage items and recipes keep linking to them.
    const [food] = await db
      .select()
      .from(foods)
      .where(and(eq(foods.slug, slug), visibleFoodsCondition(request.user?.id ?? null)))
      .limit(1);
    if (!food) {
      reply.code(404);
      return { error: "not_found" };
    }

    return await loadFoodDetail(db, food, request.user?.id ?? null);
  });

  // ---------------------------------------------------------------------
  // POST /api/foods — a food this parent adds for themselves
  // ---------------------------------------------------------------------
  app.post("/api/foods", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = createCustomFoodSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    const userId = currentUserId(request);
    const allergenIds = await resolveAllergenIds(db, body.data.allergenSlugs);
    if (!allergenIds.ok) return badRequest(reply, allergenIds.details);

    // Retried rather than pre-checked: a SELECT-then-INSERT still races, so
    // the unique index is what actually decides and a losing insert simply
    // draws a new suffix.
    let created: FoodRow | undefined;
    for (let attempt = 0; attempt < SLUG_ATTEMPTS && !created; attempt += 1) {
      try {
        created = await db.transaction(async (tx) => {
          await tx
            .insert(storageGuidelines)
            .values(DEFAULT_CUSTOM_STORAGE_GUIDELINE)
            .onConflictDoNothing({ target: storageGuidelines.category });

          const [row] = await tx
            .insert(foods)
            .values({
              ...CUSTOM_FOOD_PLACEHOLDERS,
              slug: buildCandidateSlug(body.data.name, "food"),
              name: body.data.name,
              category: body.data.category,
              emoji: body.data.emoji,
              notes: body.data.notes,
              storageCategory: DEFAULT_CUSTOM_STORAGE_CATEGORY,
              ownerId: userId,
            })
            .returning();
          if (!row) throw new Error("Custom food insert returned no row");

          await writeFoodAllergens(tx, row.id, allergenIds.value);
          return row;
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    if (!created) throw new Error("Could not find a free slug for the new custom food");

    reply.code(201);
    return await loadFoodDetail(db, created, userId);
  });

  // ---------------------------------------------------------------------
  // PATCH /api/foods/:id
  // ---------------------------------------------------------------------
  app.patch("/api/foods/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = foodIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const body = updateCustomFoodSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    const userId = currentUserId(request);
    const existing = await loadOwnedFood(db, params.data.id, userId);
    if (!existing) return notFound(reply);
    // A deleted food's page is read-only: restore it first.
    if (existing.deletedAt) return reply.code(409).send({ error: "deleted" });

    const allergenIds = body.data.allergenSlugs
      ? await resolveAllergenIds(db, body.data.allergenSlugs)
      : null;
    if (allergenIds && !allergenIds.ok) return badRequest(reply, allergenIds.details);

    // The slug is deliberately absent: renaming a food must not break the
    // links and bookmarks already pointing at it.
    const columns = {
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.category !== undefined ? { category: body.data.category } : {}),
      ...(body.data.emoji !== undefined ? { emoji: body.data.emoji } : {}),
      ...(body.data.notes !== undefined ? { notes: body.data.notes } : {}),
    };

    const updated = await db.transaction(async (tx) => {
      let row = existing;
      if (Object.keys(columns).length > 0) {
        const [next] = await tx
          .update(foods)
          .set(columns)
          .where(and(eq(foods.id, existing.id), eq(foods.ownerId, userId)))
          .returning();
        if (!next) throw new Error("Custom food update returned no row");
        row = next;
      }
      if (allergenIds?.ok) await writeFoodAllergens(tx, existing.id, allergenIds.value);
      return row;
    });

    return await loadFoodDetail(db, updated, userId);
  });

  // ---------------------------------------------------------------------
  // DELETE /api/foods/:id
  // ---------------------------------------------------------------------
  app.delete("/api/foods/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = foodIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const userId = currentUserId(request);
    const existing = await loadOwnedFood(db, params.data.id, userId);
    if (!existing) return notFound(reply);

    // Soft, whether or not anything uses it: meal and storage rows reference
    // foods without a cascade on purpose (eaten history must not disappear,
    // a container must not silently empty itself), so the row stays and
    // history marks it "(deleted)". Repeating the delete keeps the first time.
    if (!existing.deletedAt) {
      await db
        .update(foods)
        .set({ deletedAt: new Date() })
        .where(and(eq(foods.id, existing.id), eq(foods.ownerId, userId)));
    }
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------------
  // POST /api/foods/:id/restore
  // ---------------------------------------------------------------------
  app.post("/api/foods/:id/restore", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = foodIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const userId = currentUserId(request);
    const existing = await loadOwnedFood(db, params.data.id, userId);
    if (!existing) return notFound(reply);

    const [row] = await db
      .update(foods)
      .set({ deletedAt: null })
      .where(and(eq(foods.id, existing.id), eq(foods.ownerId, userId)))
      .returning();
    if (!row) throw new Error("Custom food restore returned no row");
    return await loadFoodDetail(db, row, userId);
  });

  // ---------------------------------------------------------------------
  // POST /api/foods/:id/replace — move every use onto another food, then
  // delete this one for good
  // ---------------------------------------------------------------------
  app.post("/api/foods/:id/replace", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = foodIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const body = replaceCustomFoodSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    const userId = currentUserId(request);
    // The checks run INSIDE the transaction, and lock both rows, so neither
    // food can be deleted, restored or replaced between the check and the
    // move (a concurrent replace of the same food waits, then 404s).
    const result = await db.transaction(async (tx) => {
      // Deleted or not: "Replace" is offered on an in-use food either way.
      const [existing] = await tx
        .select({ id: foods.id })
        .from(foods)
        .where(and(eq(foods.id, params.data.id), eq(foods.ownerId, userId)))
        .limit(1)
        .for("update");
      if (!existing) return { status: 404 } as const;
      if (body.data.replacementId === existing.id) return { status: 400 } as const;
      // Something the parent could pick: the catalog or their own, not deleted.
      const [replacement] = await tx
        .select({ id: foods.id, slug: foods.slug, name: foods.name })
        .from(foods)
        .where(and(eq(foods.id, body.data.replacementId), choosableFoodsCondition(userId)))
        .limit(1)
        .for("update");
      if (!replacement) return { status: 404 } as const;

      // Counted first: every one of these ends up on the replacement, either
      // re-pointed or merged into a row that already held it.
      const usage = await loadFoodUsage(tx, existing.id);

      // A meal that already holds the replacement keeps that row; if only
      // this food's row said which storage item it was served from, the kept
      // row inherits that, so the serve provenance survives the merge.
      const servedFrom = await tx
        .select({ mealId: mealFoods.mealId, storageItemId: mealFoods.storageItemId })
        .from(mealFoods)
        .where(and(eq(mealFoods.foodId, existing.id), isNotNull(mealFoods.storageItemId)));
      for (const row of servedFrom) {
        await tx
          .update(mealFoods)
          .set({ storageItemId: row.storageItemId })
          .where(
            and(
              eq(mealFoods.mealId, row.mealId),
              eq(mealFoods.foodId, replacement.id),
              isNull(mealFoods.storageItemId),
            ),
          );
      }

      // Each table has a unique (parent, food) key, so where the parent row
      // already holds the replacement the old row is dropped rather than
      // re-pointed. Every statement is keyed on this food's id, and only its
      // owner can reference it, so nobody else's rows are touched.
      await tx
        .delete(mealFoods)
        .where(
          and(
            eq(mealFoods.foodId, existing.id),
            inArray(
              mealFoods.mealId,
              tx.select({ id: mealFoods.mealId }).from(mealFoods).where(eq(mealFoods.foodId, replacement.id)),
            ),
          ),
        );
      await tx.update(mealFoods).set({ foodId: replacement.id }).where(eq(mealFoods.foodId, existing.id));

      // A merged container keeps the replacement where it already sat; a
      // re-pointed one keeps this food's position, so the order is unchanged.
      await tx
        .delete(storageItemFoods)
        .where(
          and(
            eq(storageItemFoods.foodId, existing.id),
            inArray(
              storageItemFoods.storageItemId,
              tx
                .select({ id: storageItemFoods.storageItemId })
                .from(storageItemFoods)
                .where(eq(storageItemFoods.foodId, replacement.id)),
            ),
          ),
        );
      await tx
        .update(storageItemFoods)
        .set({ foodId: replacement.id })
        .where(eq(storageItemFoods.foodId, existing.id));

      await tx
        .delete(recipeIngredients)
        .where(
          and(
            eq(recipeIngredients.foodId, existing.id),
            inArray(
              recipeIngredients.recipeId,
              tx
                .select({ id: recipeIngredients.recipeId })
                .from(recipeIngredients)
                .where(eq(recipeIngredients.foodId, replacement.id)),
            ),
          ),
        );
      await tx
        .update(recipeIngredients)
        .set({ foodId: replacement.id })
        .where(eq(recipeIngredients.foodId, existing.id));

      // Nothing names it any more; `food_allergens` cascades with it.
      await tx.delete(foods).where(and(eq(foods.id, existing.id), eq(foods.ownerId, userId)));
      return { status: 200, replacement, moved: usage } as const;
    });

    if (result.status === 404) return notFound(reply);
    if (result.status === 400) return badRequest(reply, { replacementId: "must be a different food" });
    return { replacement: result.replacement, moved: result.moved } satisfies ReplaceCustomFoodResponse;
  });
}
