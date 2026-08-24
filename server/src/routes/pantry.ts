// Home pantry tracking: what's been prepared, where it's stored, and when it
// expires. Every item is scoped to the caller (user_id) — a miss (wrong
// owner or unknown id) is 404, never 403.
//
// Expiry is never stored. `expiresAt`/`useSoon`/`expired` are derived fresh
// on every read from `preparedAt` + a storage window, so a location or
// prepared-date edit "recomputes" automatically — there is nothing to
// invalidate.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createPantryItemInputSchema,
  pantryItemIdParamSchema,
  pantryQuerySchema,
  updatePantryItemInputSchema,
  type PantryItem,
  type PantryResponse,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import { foods, pantryItems, recipeIngredients, recipes, storageGuidelines } from "../db/schema.js";

const HOUR_MS = 60 * 60 * 1000;
const USE_SOON_THRESHOLD = 0.75;

/**
 * Window used when an item has neither a catalog food nor a recipe to derive
 * a `storage_guidelines` category from (a pure free-form label). Mirrors the
 * seeded `soup_stew_curry` row — the closest "any cooked home meal" analog —
 * since no literal `cooked-meal` category exists in the seed data.
 */
const FALLBACK_WINDOW = { fridgeHours: 48, freezerDays: 60, roomTempHours: 2 };

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

const PANTRY_SELECTION = {
  id: pantryItems.id,
  label: pantryItems.label,
  foodId: pantryItems.foodId,
  foodSlug: foods.slug,
  foodName: foods.name,
  foodStorageCategory: foods.storageCategory,
  recipeId: pantryItems.recipeId,
  recipeTitle: recipes.title,
  recipeFridgeOverride: recipes.fridgeHoursOverride,
  recipeFreezerOverride: recipes.freezerDaysOverride,
  preparedAt: pantryItems.preparedAt,
  location: pantryItems.location,
  status: pantryItems.status,
  statusChangedAt: pantryItems.statusChangedAt,
  quantityNote: pantryItems.quantityNote,
} as const;

type PantryRow = {
  id: string;
  label: string | null;
  foodId: string | null;
  foodSlug: string | null;
  foodName: string | null;
  foodStorageCategory: string | null;
  recipeId: string | null;
  recipeTitle: string | null;
  recipeFridgeOverride: number | null;
  recipeFreezerOverride: number | null;
  preparedAt: Date;
  location: "fridge" | "freezer" | "counter";
  status: "active" | "finished" | "discarded";
  statusChangedAt: Date;
  quantityNote: string | null;
};

/**
 * Resolves each row's storage window and derives `expiresAt`/`useSoon`/
 * `expired` from it. Batches the lookups it needs (recipe-only items' food
 * category via their first ingredient, and the `storage_guidelines` rows
 * themselves) so a list of N items costs at most two extra queries, not N.
 */
async function hydratePantryItems(db: Database, rows: PantryRow[]): Promise<PantryItem[]> {
  // Rows with no direct food link but a recipe need that recipe's first
  // ingredient's food category. "First" has no explicit ordering column in
  // recipe_ingredients, so this orders by the join row's id for a
  // deterministic (if arbitrary) pick.
  const recipeIdsNeedingCategory = [
    ...new Set(rows.filter((r) => !r.foodStorageCategory && r.recipeId).map((r) => r.recipeId as string)),
  ];
  const categoryByRecipeId = new Map<string, string>();
  if (recipeIdsNeedingCategory.length > 0) {
    const ingredientRows = await db
      .select({ recipeId: recipeIngredients.recipeId, storageCategory: foods.storageCategory })
      .from(recipeIngredients)
      .innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
      .where(inArray(recipeIngredients.recipeId, recipeIdsNeedingCategory))
      .orderBy(asc(recipeIngredients.id));
    for (const row of ingredientRows) {
      if (!categoryByRecipeId.has(row.recipeId)) categoryByRecipeId.set(row.recipeId, row.storageCategory);
    }
  }

  const categoryFor = (row: PantryRow): string | undefined =>
    row.foodStorageCategory ?? (row.recipeId ? categoryByRecipeId.get(row.recipeId) : undefined);

  const categories = [...new Set(rows.map(categoryFor).filter((c): c is string => Boolean(c)))];
  const guidelineRows =
    categories.length > 0
      ? await db.select().from(storageGuidelines).where(inArray(storageGuidelines.category, categories))
      : [];
  const guidelineByCategory = new Map(guidelineRows.map((g) => [g.category, g]));

  const now = Date.now();

  return rows.map((row) => {
    const guideline = guidelineByCategory.get(categoryFor(row) ?? "");

    // Recipe overrides (fridge/freezer only — there is no room-temp override
    // column) win over the category guideline, which wins over the fallback.
    const fridgeHours = row.recipeFridgeOverride ?? guideline?.fridgeHours ?? FALLBACK_WINDOW.fridgeHours;
    const freezerDays = row.recipeFreezerOverride ?? guideline?.freezerDays ?? FALLBACK_WINDOW.freezerDays;
    const roomTempHours = guideline?.roomTempHours ?? FALLBACK_WINDOW.roomTempHours;

    const windowHours = row.location === "fridge" ? fridgeHours : row.location === "freezer" ? freezerDays * 24 : roomTempHours;

    const preparedMs = row.preparedAt.getTime();
    const expiresAtMs = preparedMs + windowHours * HOUR_MS;
    const useSoonThresholdMs = preparedMs + windowHours * HOUR_MS * USE_SOON_THRESHOLD;
    const expired = now > expiresAtMs;
    const useSoon = !expired && now >= useSoonThresholdMs;

    const item: PantryItem = {
      id: row.id,
      label: row.label,
      foodSlug: row.foodSlug,
      foodName: row.foodName,
      recipeId: row.recipeId,
      recipeTitle: row.recipeTitle,
      preparedAt: row.preparedAt.toISOString(),
      location: row.location,
      status: row.status,
      statusChangedAt: row.statusChangedAt.toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      useSoon,
      expired,
      quantityNote: row.quantityNote,
    };
    return item;
  });
}

export function registerPantryRoutes(app: FastifyInstance, db: Database): void {
  // -----------------------------------------------------------------------
  // GET /api/pantry
  // -----------------------------------------------------------------------
  app.get("/api/pantry", { preHandler: app.requireAuth }, async (request, reply) => {
    const query = pantryQuerySchema.safeParse(request.query);
    if (!query.success) return badRequest(reply, query.error.flatten());

    const statusFilter =
      query.data.view === "active" ? eq(pantryItems.status, "active") : inArray(pantryItems.status, ["finished", "discarded"]);

    const rows = await db
      .select(PANTRY_SELECTION)
      .from(pantryItems)
      .leftJoin(foods, eq(pantryItems.foodId, foods.id))
      .leftJoin(recipes, eq(pantryItems.recipeId, recipes.id))
      .where(and(eq(pantryItems.userId, currentUserId(request)), statusFilter));

    const items = await hydratePantryItems(db, rows);

    // Neither sort key is a DB column (expiresAt is derived), so ordering
    // happens in memory after hydration.
    items.sort((a, b) =>
      query.data.view === "active"
        ? new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
        : new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime(),
    );

    return reply.send({ items } satisfies PantryResponse);
  });

  // -----------------------------------------------------------------------
  // POST /api/pantry
  // -----------------------------------------------------------------------
  app.post("/api/pantry", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = createPantryItemInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    if (body.data.foodId) {
      const [food] = await db.select({ id: foods.id }).from(foods).where(eq(foods.id, body.data.foodId)).limit(1);
      if (!food) return badRequest(reply, { foodId: "unknown food" });
    }
    if (body.data.recipeId) {
      const [recipe] = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, body.data.recipeId)).limit(1);
      if (!recipe) return badRequest(reply, { recipeId: "unknown recipe" });
    }

    const inserted = await db
      .insert(pantryItems)
      .values({
        userId: currentUserId(request),
        foodId: body.data.foodId,
        recipeId: body.data.recipeId,
        label: body.data.label,
        preparedAt: body.data.preparedAt ? new Date(body.data.preparedAt) : new Date(),
        location: body.data.location,
        quantityNote: body.data.quantityNote,
      })
      .returning();

    const row = inserted[0];
    if (!row) {
      throw new Error("Insert of pantry item returned no row");
    }

    const rows = await db
      .select(PANTRY_SELECTION)
      .from(pantryItems)
      .leftJoin(foods, eq(pantryItems.foodId, foods.id))
      .leftJoin(recipes, eq(pantryItems.recipeId, recipes.id))
      .where(eq(pantryItems.id, row.id))
      .limit(1);

    const [item] = await hydratePantryItems(db, rows);
    if (!item) {
      throw new Error("Hydration of a just-inserted pantry item produced no item");
    }
    return reply.code(201).send(item);
  });

  // -----------------------------------------------------------------------
  // PATCH /api/pantry/:id
  // -----------------------------------------------------------------------
  app.patch("/api/pantry/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = pantryItemIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const body = updatePantryItemInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    const patch: Partial<typeof pantryItems.$inferInsert> = {};
    if (body.data.location !== undefined) patch.location = body.data.location;
    if (body.data.preparedAt !== undefined) patch.preparedAt = new Date(body.data.preparedAt);
    if (body.data.quantityNote !== undefined) patch.quantityNote = body.data.quantityNote;
    if (body.data.status !== undefined) {
      patch.status = body.data.status;
      // Setting status:'active' on a finished/discarded row is an undo, and
      // any other status change is a fresh transition — either way "when did
      // this status take effect" moves to now.
      patch.statusChangedAt = new Date();
    }

    const updated = await db
      .update(pantryItems)
      .set(patch)
      .where(and(eq(pantryItems.id, params.data.id), eq(pantryItems.userId, currentUserId(request))))
      .returning();

    const row = updated[0];
    if (!row) return notFound(reply);

    const rows = await db
      .select(PANTRY_SELECTION)
      .from(pantryItems)
      .leftJoin(foods, eq(pantryItems.foodId, foods.id))
      .leftJoin(recipes, eq(pantryItems.recipeId, recipes.id))
      .where(eq(pantryItems.id, row.id))
      .limit(1);

    const [item] = await hydratePantryItems(db, rows);
    if (!item) {
      throw new Error("Hydration of a just-updated pantry item produced no item");
    }
    return reply.send(item);
  });
}

/** Exported for the test suite to assert against without duplicating the
 * fallback numbers. */
export const PANTRY_FALLBACK_WINDOW = FALLBACK_WINDOW;
