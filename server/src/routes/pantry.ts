// Home pantry tracking: what's been prepared, where it's stored, and when it
// expires. Every item is scoped to the caller (user_id) — a miss (wrong
// owner or unknown id) is 404, never 403.
//
// Expiry is never stored. `expiresAt`/`useSoon`/`expired` are derived fresh
// on every read from `preparedAt` + a storage window, so a location or
// prepared-date edit "recomputes" automatically — there is nothing to
// invalidate.
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createPantryItemInputSchema,
  pantryItemIdParamSchema,
  pantryQuerySchema,
  servePantryItemInputSchema,
  updatePantryItemInputSchema,
  type PantryItem,
  type PantryResponse,
  type ServePantryItemResponse,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import { babies, foods, pantryItems, recipeIngredients, recipes, storageGuidelines } from "../db/schema.js";
import { insertMealWithFoods, loadMeals, ownsBaby } from "../services/meals.js";

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

function conflict(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(409).send({ error: "conflict", message });
}

/**
 * Thrown inside the serve transaction to unwind it without committing. The
 * guard that rejects a serve lives in SQL (see the claim UPDATE below), so by
 * the time we know the serve is not allowed the meal rows are already
 * written — throwing is how they are taken back.
 */
class ServeAborted extends Error {
  constructor(readonly outcome: { code: 404 } | { code: 409; message: string }) {
    super("serve aborted");
    this.name = "ServeAborted";
  }
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
  servingsTotal: pantryItems.servingsTotal,
  servingsLeft: pantryItems.servingsLeft,
  bestBy: pantryItems.bestBy,
  notes: pantryItems.notes,
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
  servingsTotal: number | null;
  servingsLeft: number | null;
  /** `date` columns come back as `YYYY-MM-DD` strings, not Dates. */
  bestBy: string | null;
  notes: string | null;
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
      // Servings and best-by are stored, not derived: an untracked item
      // reports nulls, exactly as it did before these columns existed.
      servingsTotal: row.servingsTotal,
      servingsLeft: row.servingsLeft,
      bestBy: row.bestBy,
      notes: row.notes,
    };
    return item;
  });
}

/** One item, joined and hydrated the same way the list route does it. */
async function loadPantryItem(db: Database, id: string): Promise<PantryItem> {
  const rows = await db
    .select(PANTRY_SELECTION)
    .from(pantryItems)
    .leftJoin(foods, eq(pantryItems.foodId, foods.id))
    .leftJoin(recipes, eq(pantryItems.recipeId, recipes.id))
    .where(eq(pantryItems.id, id))
    .limit(1);

  const [item] = await hydratePantryItems(db, rows);
  if (!item) {
    throw new Error("Hydration of a just-written pantry item produced no item");
  }
  return item;
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

    // Dedupe so the same food twice in one submission produces one row, not
    // a duplicate pantry item.
    const foodIds = body.data.foodIds ? [...new Set(body.data.foodIds)] : null;

    if (foodIds) {
      const foodRows = await db.select({ id: foods.id }).from(foods).where(inArray(foods.id, foodIds));
      const knownFoodIds = new Set(foodRows.map((f) => f.id));
      const unknownFoodIds = foodIds.filter((id) => !knownFoodIds.has(id));
      if (unknownFoodIds.length > 0) return badRequest(reply, { foodIds: "unknown food", unknownFoodIds });
    }
    if (body.data.recipeId) {
      const [recipe] = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, body.data.recipeId)).limit(1);
      if (!recipe) return badRequest(reply, { recipeId: "unknown recipe" });
    }

    const userId = currentUserId(request);
    const preparedAt = body.data.preparedAt ? new Date(body.data.preparedAt) : new Date();

    // One transaction so a batch is all-or-nothing: either every food gets a
    // pantry row, or none do. A non-food (recipe- or label-sourced) item is
    // still exactly one row.
    const insertedIds = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(pantryItems)
        .values(
          (foodIds ?? [null]).map((foodId) => ({
            userId,
            foodId,
            recipeId: body.data.recipeId,
            label: body.data.label,
            preparedAt,
            location: body.data.location,
            quantityNote: body.data.quantityNote,
            // A brand new container is full: servingsLeft starts at the
            // total, and both stay null when tracking is off.
            servingsTotal: body.data.servingsTotal,
            servingsLeft: body.data.servingsTotal,
            bestBy: body.data.bestBy,
            notes: body.data.notes,
          })),
        )
        .returning();
      return rows.map((r) => r.id);
    });

    const rows = await db
      .select(PANTRY_SELECTION)
      .from(pantryItems)
      .leftJoin(foods, eq(pantryItems.foodId, foods.id))
      .leftJoin(recipes, eq(pantryItems.recipeId, recipes.id))
      .where(inArray(pantryItems.id, insertedIds));

    const itemById = new Map((await hydratePantryItems(db, rows)).map((item) => [item.id, item]));
    const items = insertedIds.map((id) => {
      const item = itemById.get(id);
      if (!item) {
        throw new Error("Hydration of a just-inserted pantry item produced no item");
      }
      return item;
    });
    return reply.code(201).send(items);
  });

  // -----------------------------------------------------------------------
  // PATCH /api/pantry/:id
  // -----------------------------------------------------------------------
  app.patch("/api/pantry/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = pantryItemIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const body = updatePantryItemInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    // Servings edits are relative to what the row already holds (a new total
    // re-clamps the existing remainder), so the current row is read first.
    const [existing] = await db
      .select({ servingsTotal: pantryItems.servingsTotal, servingsLeft: pantryItems.servingsLeft })
      .from(pantryItems)
      .where(and(eq(pantryItems.id, params.data.id), eq(pantryItems.userId, currentUserId(request))))
      .limit(1);
    if (!existing) return notFound(reply);

    const patch: Partial<typeof pantryItems.$inferInsert> = {};
    if (body.data.location !== undefined) patch.location = body.data.location;
    if (body.data.preparedAt !== undefined) patch.preparedAt = new Date(body.data.preparedAt);
    if (body.data.quantityNote !== undefined) patch.quantityNote = body.data.quantityNote;
    if (body.data.bestBy !== undefined) patch.bestBy = body.data.bestBy;
    if (body.data.notes !== undefined) patch.notes = body.data.notes;

    if (body.data.servingsTotal !== undefined || body.data.servingsLeft !== undefined) {
      const total = body.data.servingsTotal !== undefined ? body.data.servingsTotal : existing.servingsTotal;
      if (total === null) {
        if (body.data.servingsLeft !== undefined) {
          return badRequest(reply, {
            servingsLeft: "servingsLeft needs servingsTotal — set a total to turn servings tracking on",
          });
        }
        // Tracking off: the remainder goes with the total.
        patch.servingsTotal = null;
        patch.servingsLeft = null;
      } else {
        // Turning tracking on with no explicit remainder fills the container.
        const requested = body.data.servingsLeft ?? existing.servingsLeft ?? total;
        patch.servingsTotal = total;
        patch.servingsLeft = Math.min(Math.max(requested, 0), total);
      }
    }

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

    return reply.send(await loadPantryItem(db, row.id));
  });

  // -----------------------------------------------------------------------
  // POST /api/pantry/:id/serve
  //
  // The one explicit bridge between the pantry and the meal log: it writes a
  // meal whose every food row points back at this container, and takes the
  // servings it used out of the container. Logging a meal any other way
  // never decrements anything.
  //
  // Only an `active` item with something left in it can be served; anything
  // else is a 409 and leaves every row untouched.
  // -----------------------------------------------------------------------
  app.post("/api/pantry/:id/serve", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = pantryItemIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const body = servePantryItemInputSchema.safeParse(request.body ?? {});
    if (!body.success) return badRequest(reply, body.error.flatten());

    const userId = currentUserId(request);

    // Only the things that decide WHAT gets logged are read up front (a
    // pantry item's food/recipe can never be edited). Everything the serve
    // is allowed to depend on — status, and how many servings are left — is
    // read and written inside the transaction below, so nothing computed out
    // here from a stale snapshot can reach the decrement.
    const [item] = await db
      .select({ id: pantryItems.id, foodId: pantryItems.foodId, recipeId: pantryItems.recipeId })
      .from(pantryItems)
      .where(and(eq(pantryItems.id, params.data.id), eq(pantryItems.userId, userId)))
      .limit(1);
    if (!item) return notFound(reply);

    // Which baby ate it. An explicit babyId is ownership-checked like any
    // other id (a miss is 404); omitted, the account's single active baby is
    // the only unambiguous answer.
    let babyId: string;
    if (body.data.babyId) {
      if (!(await ownsBaby(db, body.data.babyId, userId))) return notFound(reply);
      babyId = body.data.babyId;
    } else {
      const owned = await db
        .select({ id: babies.id })
        .from(babies)
        .where(and(eq(babies.userId, userId), isNull(babies.archivedAt)))
        .orderBy(asc(babies.birthDate), asc(babies.createdAt))
        .limit(2);
      const only = owned.length === 1 ? owned[0] : undefined;
      if (!only) {
        return badRequest(reply, {
          babyId:
            owned.length === 0
              ? "no baby profile to log this meal against"
              : "babyId is required when the account has more than one baby",
        });
      }
      babyId = only.id;
    }

    // What was eaten. A food-sourced item is its own food; a recipe-sourced
    // one expands to the recipe's ingredient foods (the only place the
    // server expands a recipe — hand-logged meals send their own list).
    let foodIds: string[];
    if (item.foodId) {
      foodIds = [item.foodId];
    } else if (item.recipeId) {
      const ingredients = await db
        .select({ foodId: recipeIngredients.foodId })
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, item.recipeId))
        .orderBy(asc(recipeIngredients.id));
      foodIds = [...new Set(ingredients.map((row) => row.foodId))];
      if (foodIds.length === 0) {
        return badRequest(reply, { recipeId: "this recipe has no ingredient foods to log" });
      }
    } else {
      return badRequest(reply, {
        id: "a label-only pantry item has no food to log — add a food or a recipe to serve it",
      });
    }

    const servedAt = body.data.servedAt ? new Date(body.data.servedAt) : new Date();
    const servings = body.data.servings;

    // One transaction: the meal, its foods, and the container it came out of
    // move together or not at all.
    let mealId: string;
    try {
      mealId = await db.transaction(async (tx) => {
        const id = await insertMealWithFoods(tx, {
          babyId,
          // Attribution follows the pantry item, food-sourced or not.
          recipeId: item.recipeId,
          servedAt,
          reactionNote: body.data.reactionNote,
          notes: body.data.notes,
          foods: foodIds.map((foodId) => ({ foodId, pantryItemId: item.id })),
        });

        // The claim: ONE guarded, self-referential UPDATE that is both the
        // status check and the decrement, so there is no read-then-write gap
        // for a concurrent serve to slip into. The new value is computed by
        // the database from the row's own current value — never from a
        // number this process read earlier — which is what makes two
        // simultaneous serves of the last serving impossible to lose. Under
        // READ COMMITTED the second UPDATE blocks on the first's row lock,
        // then re-evaluates its WHERE against the just-committed row: it
        // either sees servings_left = 0 (or status = 'finished') and matches
        // nothing — 409 — or decrements from the real remaining count.
        //
        // The WHERE is the whole guard:
        //   status = 'active'                 → items 106: finished/discarded never serve
        //   servings_total is null            → untracked items pass, decrementing nothing
        //   or servings_left > 0              → a tracked item must have something left
        const [claimed] = await tx
          .update(pantryItems)
          .set({
            servingsLeft: sql`case
              when ${pantryItems.servingsTotal} is null then ${pantryItems.servingsLeft}
              else greatest(${pantryItems.servingsLeft} - ${servings}, 0)
            end`,
          })
          .where(
            and(
              eq(pantryItems.id, item.id),
              eq(pantryItems.userId, userId),
              eq(pantryItems.status, "active"),
              sql`(${pantryItems.servingsTotal} is null or ${pantryItems.servingsLeft} > 0)`,
            ),
          )
          .returning();

        if (!claimed) {
          // Nothing was claimed, so nothing was changed — status is never
          // silently overwritten on the way out. Re-read (inside the same
          // transaction) only to say WHY.
          const [current] = await tx
            .select({ status: pantryItems.status })
            .from(pantryItems)
            .where(and(eq(pantryItems.id, item.id), eq(pantryItems.userId, userId)))
            .limit(1);
          if (!current) throw new ServeAborted({ code: 404 });
          throw new ServeAborted({
            code: 409,
            message:
              current.status === "active"
                ? "This pantry item has no servings left — mark it finished or edit its servings first."
                : `This pantry item is ${current.status} and cannot be served. Move it back to the pantry first.`,
          });
        }

        // An emptied container finishes exactly like the manual finish flow:
        // status + statusChangedAt, moved to History and never deleted. The
        // threshold is the value the database RETURNED, not one this process
        // computed, so a serve that raced another still finishes on the true
        // remaining count.
        if (claimed.servingsTotal !== null && claimed.servingsLeft === 0) {
          await tx
            .update(pantryItems)
            .set({ status: "finished", statusChangedAt: new Date() })
            .where(eq(pantryItems.id, item.id));
        }

        return id;
      });
    } catch (error) {
      if (error instanceof ServeAborted) {
        // The transaction rolled back, so the meal that was inserted a few
        // lines above is gone with it.
        return error.outcome.code === 404 ? notFound(reply) : conflict(reply, error.outcome.message);
      }
      throw error;
    }

    const meal = (await loadMeals(db, [mealId])).get(mealId);
    if (!meal) throw new Error("Served meal was inserted but could not be read back");

    return reply.code(201).send({ meal, item: await loadPantryItem(db, item.id) } satisfies ServePantryItemResponse);
  });
}

/** Exported for the test suite to assert against without duplicating the
 * fallback numbers. */
export const PANTRY_FALLBACK_WINDOW = FALLBACK_WINDOW;
