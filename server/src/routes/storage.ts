// Home storage tracking: what's been prepared, where it's stored, and when it
// expires. Every item is scoped to the caller (user_id) — a miss (wrong
// owner or unknown id) is 404, never 403.
//
// Expiry is never stored. `expiresAt`/`useSoon`/`expired` are derived fresh
// on every read from `preparedAt` + a storage window, so a location or
// prepared-date edit "recomputes" automatically — there is nothing to
// invalidate.
//
// Those three are the FALLBACK, not the last word: a parent-entered
// `bestBy` beats them, and the client resolves the chip it shows from it
// (item 333). That resolution cannot happen here — `bestBy` is a plain
// calendar date and the server never learns the caller's timezone, so it
// cannot say when "the 14th" starts or ends. What the server does do is
// refuse the one combination that could only be a mis-tap: a best-by date
// before the prepared date, on create (the schema's own refine) and on
// PATCH (below, against the merged values).
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  BEST_BY_BEFORE_PREPARED_ERROR,
  createStorageItemInputSchema,
  isBestByBeforePreparedDay,
  storageItemIdParamSchema,
  storageQuerySchema,
  serveStorageItemInputSchema,
  updateStorageItemInputSchema,
  type CreateStorageItemResponse,
  type StorageItem,
  type StorageResponse,
  type ServeStorageItemResponse,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import { babies, foods, storageItemFoods, storageItems, recipeIngredients, recipes } from "../db/schema.js";
import { choosableFoodsCondition } from "../services/foods.js";
import { ingredientUnion, insertMeal, loadIngredientFoodIds, loadMeals, ownsBaby } from "../services/meals.js";
import { mapRecipeRequest, validateRatings } from "./meals.js";
import { visibleRecipesCondition } from "../services/recipes.js";
import {
  deriveFreshness,
  loadRecipeIngredientCategories,
  loadStorageGuidelines,
  loadStorageItemFoods,
  resolveStorageWindowHours,
} from "../services/storage.js";

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
  constructor(readonly outcome: { code: 404 } | { code: 409; message: string } | { code: 400; details: unknown }) {
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

// No foods join: what a container holds lives in `storage_item_foods` and is
// loaded per item by `loadStorageItemFoods` during hydration (item 345).
const STORAGE_SELECTION = {
  id: storageItems.id,
  label: storageItems.label,
  recipeId: storageItems.recipeId,
  recipeTitle: recipes.title,
  recipeFridgeHoursOverride: recipes.fridgeHoursOverride,
  recipeFreezerOverride: recipes.freezerDaysOverride,
  preparedAt: storageItems.preparedAt,
  location: storageItems.location,
  status: storageItems.status,
  statusChangedAt: storageItems.statusChangedAt,
  quantityNote: storageItems.quantityNote,
  servingsTotal: storageItems.servingsTotal,
  servingsLeft: storageItems.servingsLeft,
  bestBy: storageItems.bestBy,
  notes: storageItems.notes,
} as const;

type StorageRow = {
  id: string;
  label: string | null;
  recipeId: string | null;
  recipeTitle: string | null;
  recipeFridgeHoursOverride: number | null;
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
 * Loads each row's foods, resolves its storage window from them, and derives
 * `expiresAt`/`useSoon`/`expired`. Batches every lookup it needs (the foods
 * themselves, recipe-only items' food category via their first ingredient,
 * and the `storage_guidelines` rows) so a list of N items costs three extra
 * queries, not 3N.
 *
 * The window rule itself is `services/storage.ts` — shared with the AI tool,
 * which used to keep its own copy.
 */
async function hydrateStorageItems(db: Database, rows: StorageRow[]): Promise<StorageItem[]> {
  const foodsByItemId = await loadStorageItemFoods(
    db,
    rows.map((row) => row.id),
  );

  // Rows with no foods of their own but a recipe derive their category from
  // that recipe's first ingredient.
  const categoryByRecipeId = await loadRecipeIngredientCategories(db, [
    ...new Set(
      rows.filter((row) => !foodsByItemId.has(row.id) && row.recipeId).map((row) => row.recipeId as string),
    ),
  ]);

  // Every food in the container speaks: the shortest window among them is
  // what the item gets (`resolveStorageWindowHours`).
  const categoriesFor = (row: StorageRow): string[] => {
    const itemFoods = foodsByItemId.get(row.id);
    if (itemFoods && itemFoods.length > 0) return itemFoods.map((food) => food.storageCategory);
    const fromRecipe = row.recipeId ? categoryByRecipeId.get(row.recipeId) : undefined;
    return fromRecipe ? [fromRecipe] : [];
  };

  const guidelineByCategory = await loadStorageGuidelines(db, [...new Set(rows.flatMap(categoriesFor))]);

  const now = Date.now();

  return rows.map((row) => {
    const windowHours = resolveStorageWindowHours(
      {
        location: row.location,
        categories: categoriesFor(row),
        recipeOverrides: { fridgeHours: row.recipeFridgeHoursOverride, freezerDays: row.recipeFreezerOverride },
      },
      guidelineByCategory,
    );
    const freshness = deriveFreshness(row.preparedAt, windowHours, now, row.bestBy);

    const item: StorageItem = {
      id: row.id,
      label: row.label,
      // In the order the parent saved them. Empty for a recipe-sourced or
      // label-only container. `emoji` is only ever set on a custom food; the
      // client falls back to its own slug/category table when it is null.
      foods: (foodsByItemId.get(row.id) ?? []).map((food) => ({
        id: food.id,
        slug: food.slug,
        name: food.name,
        emoji: food.emoji,
        deleted: food.deleted,
      })),
      recipeId: row.recipeId,
      recipeTitle: row.recipeTitle,
      preparedAt: row.preparedAt.toISOString(),
      location: row.location,
      status: row.status,
      statusChangedAt: row.statusChangedAt.toISOString(),
      expiresAt: freshness.expiresAt,
      useSoon: freshness.useSoon,
      expired: freshness.expired,
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
async function loadStorageItem(db: Database, id: string): Promise<StorageItem> {
  const rows = await db
    .select(STORAGE_SELECTION)
    .from(storageItems)
    .leftJoin(recipes, eq(storageItems.recipeId, recipes.id))
    .where(eq(storageItems.id, id))
    .limit(1);

  const [item] = await hydrateStorageItems(db, rows);
  if (!item) {
    throw new Error("Hydration of a just-written storage item produced no item");
  }
  return item;
}

export function registerStorageRoutes(app: FastifyInstance, db: Database): void {
  // -----------------------------------------------------------------------
  // GET /api/storage
  // -----------------------------------------------------------------------
  app.get("/api/storage", { preHandler: app.requireAuth }, async (request, reply) => {
    const query = storageQuerySchema.safeParse(request.query);
    if (!query.success) return badRequest(reply, query.error.flatten());

    const statusFilter =
      query.data.view === "active" ? eq(storageItems.status, "active") : inArray(storageItems.status, ["finished", "discarded"]);

    const rows = await db
      .select(STORAGE_SELECTION)
      .from(storageItems)
      .leftJoin(recipes, eq(storageItems.recipeId, recipes.id))
      .where(and(eq(storageItems.userId, currentUserId(request)), statusFilter));

    const items = await hydrateStorageItems(db, rows);

    // Neither sort key is a DB column (expiresAt is derived), so ordering
    // happens in memory after hydration.
    items.sort((a, b) =>
      query.data.view === "active"
        ? new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
        : new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime(),
    );

    return reply.send({ items } satisfies StorageResponse);
  });

  // -----------------------------------------------------------------------
  // POST /api/storage
  // -----------------------------------------------------------------------
  app.post("/api/storage", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = createStorageItemInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    // Dedupe so the same food twice in one submission produces one row, not
    // a duplicate storage item.
    const foodIds = body.data.foodIds ? [...new Set(body.data.foodIds)] : null;

    if (foodIds) {
      // Choosable by THIS user — the catalog plus their own custom foods,
      // not deleted ones. Another account's custom food reads as an unknown
      // id, and a deleted food can only arrive from a stale picker and is
      // refused like any unknown one. PATCH applies the same rule to the foods
      // an edit ADDS (item 729).
      const foodRows = await db
        .select({ id: foods.id })
        .from(foods)
        .where(and(inArray(foods.id, foodIds), choosableFoodsCondition(currentUserId(request))));
      const knownFoodIds = new Set(foodRows.map((f) => f.id));
      const unknownFoodIds = foodIds.filter((id) => !knownFoodIds.has(id));
      if (unknownFoodIds.length > 0) return badRequest(reply, { foodIds: "unknown food", unknownFoodIds });
    }
    if (body.data.recipeId) {
      // Visible to THIS user — the catalog plus their own custom recipes.
      const [recipe] = await db
        .select({ id: recipes.id })
        .from(recipes)
        .where(and(eq(recipes.id, body.data.recipeId), visibleRecipesCondition(currentUserId(request))))
        .limit(1);
      if (!recipe) return badRequest(reply, { recipeId: "unknown recipe" });
    }

    const userId = currentUserId(request);
    const preparedAt = body.data.preparedAt ? new Date(body.data.preparedAt) : new Date();

    // What this submission becomes. A container holds the whole meal, so
    // several foods are ONE item with one join row each, in the order they
    // were submitted — unless the parent chose "Separate containers", which
    // is one single-food item per food. A recipe- or label-sourced item is
    // one item with no foods of its own, as before.
    const groups: string[][] = foodIds ? (body.data.separateItems ? foodIds.map((id) => [id]) : [foodIds]) : [[]];

    // Ids are minted here rather than read back from `returning()` so each
    // group is paired with its own item by identity, never by relying on a
    // multi-row insert handing its rows back in the order they went in.
    const insertedIds = groups.map(() => randomUUID());

    // One transaction so a submission is all-or-nothing: every item and every
    // join row lands, or none of them do.
    await db.transaction(async (tx) => {
      await tx.insert(storageItems).values(
        insertedIds.map((id) => ({
          id,
          userId,
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
      );

      const joinRows = groups.flatMap((group, groupIndex) =>
        group.map((foodId, position) => ({
          storageItemId: insertedIds[groupIndex] as string,
          foodId,
          position,
        })),
      );
      if (joinRows.length > 0) await tx.insert(storageItemFoods).values(joinRows);
    });

    const rows = await db
      .select(STORAGE_SELECTION)
      .from(storageItems)
      .leftJoin(recipes, eq(storageItems.recipeId, recipes.id))
      .where(inArray(storageItems.id, insertedIds));

    const itemById = new Map((await hydrateStorageItems(db, rows)).map((item) => [item.id, item]));
    const items = insertedIds.map((id) => {
      const item = itemById.get(id);
      if (!item) {
        throw new Error("Hydration of a just-inserted storage item produced no item");
      }
      return item;
    });
    // Always `{ items }`, whether that is one container or one per food, so a
    // caller never has to branch on what it asked for.
    return reply.code(201).send({ items } satisfies CreateStorageItemResponse);
  });

  // -----------------------------------------------------------------------
  // PATCH /api/storage/:id
  // -----------------------------------------------------------------------
  app.patch("/api/storage/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = storageItemIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const body = updateStorageItemInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    // Servings edits are relative to what the row already holds (a new total
    // keeps the servings already served), so the current row is read first.
    const [existing] = await db
      .select({
        servingsTotal: storageItems.servingsTotal,
        servingsLeft: storageItems.servingsLeft,
        preparedAt: storageItems.preparedAt,
        bestBy: storageItems.bestBy,
        recipeId: storageItems.recipeId,
      })
      .from(storageItems)
      .where(and(eq(storageItems.id, params.data.id), eq(storageItems.userId, currentUserId(request))))
      .limit(1);
    if (!existing) return notFound(reply);

    // Item 729: what a container holds is editable, but never what KIND of
    // container it is. Foods only on a food item (a recipe item keeps its
    // recipe, a label-only one stays label-only); a name only on a
    // label-only item.
    const heldFoodIds = ((await loadStorageItemFoods(db, [params.data.id])).get(params.data.id) ?? []).map(
      (food) => food.id,
    );
    const isFoodItem = heldFoodIds.length > 0 && existing.recipeId === null;
    const isLabelOnly = heldFoodIds.length === 0 && existing.recipeId === null;
    const foodIds = body.data.foodIds ? [...new Set(body.data.foodIds)] : null;
    if (foodIds && !isFoodItem) {
      return badRequest(reply, { foodIds: "only a food container's foods can be edited" });
    }
    if (body.data.label !== undefined && !isLabelOnly) {
      return badRequest(reply, { label: "only a label-only item can be renamed" });
    }
    if (foodIds) {
      // The same rule as create for anything NEW: choosable by this user
      // (catalog + their own custom foods, not deleted). A food the
      // container already holds may stay even if its owner has since deleted
      // it — the edit form resends it as a "(deleted)" chip.
      const added = foodIds.filter((id) => !heldFoodIds.includes(id));
      if (added.length > 0) {
        const foodRows = await db
          .select({ id: foods.id })
          .from(foods)
          .where(and(inArray(foods.id, added), choosableFoodsCondition(currentUserId(request))));
        const known = new Set(foodRows.map((f) => f.id));
        const unknownFoodIds = added.filter((id) => !known.has(id));
        if (unknownFoodIds.length > 0) return badRequest(reply, { foodIds: "unknown food", unknownFoodIds });
      }
    }

    // Judged on the MERGED pair, not on what this patch happens to carry:
    // moving Prepared forward past an existing best-by is the same mistake
    // as moving Best by back behind an existing prepared date, and a patch
    // that sends only one of them must not slip past because the other is
    // absent.
    const mergedPreparedAt = body.data.preparedAt !== undefined ? body.data.preparedAt : existing.preparedAt;
    const mergedBestBy = body.data.bestBy !== undefined ? body.data.bestBy : existing.bestBy;
    if (isBestByBeforePreparedDay(mergedBestBy, mergedPreparedAt)) {
      return badRequest(reply, { fieldErrors: { bestBy: [BEST_BY_BEFORE_PREPARED_ERROR] } });
    }

    const patch: Partial<typeof storageItems.$inferInsert> = {};
    if (body.data.location !== undefined) patch.location = body.data.location;
    if (body.data.preparedAt !== undefined) patch.preparedAt = new Date(body.data.preparedAt);
    if (body.data.quantityNote !== undefined) patch.quantityNote = body.data.quantityNote;
    if (body.data.bestBy !== undefined) patch.bestBy = body.data.bestBy;
    if (body.data.notes !== undefined) patch.notes = body.data.notes;
    if (body.data.label !== undefined) patch.label = body.data.label;

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
        // With no explicit remainder, a resize keeps what has been SERVED, not
        // what is left: 6 with 1 served, resized to 7, leaves 6. Turning
        // tracking on fills the container.
        const served =
          existing.servingsTotal !== null && existing.servingsLeft !== null
            ? existing.servingsTotal - existing.servingsLeft
            : 0;
        const requested = body.data.servingsLeft ?? total - served;
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

    // One transaction, and the row is locked FIRST: a serve locks the same
    // row before it reads the contents, so the two serialize and a serve
    // never logs a half-replaced container.
    const found = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: storageItems.id })
        .from(storageItems)
        .where(and(eq(storageItems.id, params.data.id), eq(storageItems.userId, currentUserId(request))))
        .for("update");
      if (!locked) return false;
      if (Object.keys(patch).length > 0) {
        await tx.update(storageItems).set(patch).where(eq(storageItems.id, locked.id));
      }
      if (foodIds) {
        await tx.delete(storageItemFoods).where(eq(storageItemFoods.storageItemId, locked.id));
        await tx
          .insert(storageItemFoods)
          .values(foodIds.map((foodId, position) => ({ storageItemId: locked.id, foodId, position })));
      }
      return true;
    });
    if (!found) return notFound(reply);

    return reply.send(await loadStorageItem(db, params.data.id));
  });

  // -----------------------------------------------------------------------
  // POST /api/storage/:id/serve
  //
  // The one explicit bridge between storage and the meal log: it writes a
  // meal whose every food row points back at this container, and takes the
  // servings it used out of the container. Logging a meal any other way
  // never decrements anything.
  //
  // Only an `active` item with something left in it can be served; anything
  // else is a 409 and leaves every row untouched.
  // -----------------------------------------------------------------------
  app.post("/api/storage/:id/serve", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = storageItemIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const body = serveStorageItemInputSchema.safeParse(request.body ?? {});
    if (!body.success) return badRequest(reply, body.error.flatten());

    const userId = currentUserId(request);

    // Only existence is checked up front. WHAT gets logged (the container's
    // contents, editable since item 729), its status and how many servings
    // are left are all read inside the transaction below, after the row is
    // locked, so nothing computed out here from a stale snapshot can reach
    // the meal or the decrement.
    const [item] = await db
      .select({ id: storageItems.id })
      .from(storageItems)
      .where(and(eq(storageItems.id, params.data.id), eq(storageItems.userId, userId)))
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

    const servedAt = body.data.servedAt ? new Date(body.data.servedAt) : new Date();
    const servings = body.data.servings;

    // One transaction: the meal, its foods, and the container it came out of
    // move together or not at all.
    let mealId: string;
    try {
      mealId = await db.transaction(async (tx) => {
        // Lock the row before reading what is in it. A contents edit (PATCH)
        // locks the same row first, so the two serialize: this serve logs
        // either the old contents or the new ones, never a mix, and never
        // contents that changed after its ratings were checked.
        const [locked] = await tx
          .select({ recipeId: storageItems.recipeId })
          .from(storageItems)
          .where(and(eq(storageItems.id, item.id), eq(storageItems.userId, userId)))
          .for("update");
        if (!locked) throw new ServeAborted({ code: 404 });

        // What was eaten. A food-sourced item is everything in it, in saved
        // order — one meal with all of them, each linked back to this
        // container; a recipe-sourced one expands to the recipe's ingredient
        // foods (the only place the server expands a recipe — hand-logged
        // meals send their own list).
        const itemFoods = (await loadStorageItemFoods(tx, [item.id])).get(item.id) ?? [];
        let foodIds: string[];
        if (itemFoods.length > 0) {
          foodIds = itemFoods.map((food) => food.id);
        } else if (locked.recipeId) {
          const ingredients = await tx
            .select({ foodId: recipeIngredients.foodId })
            .from(recipeIngredients)
            .where(eq(recipeIngredients.recipeId, locked.recipeId))
            .orderBy(asc(recipeIngredients.id));
          foodIds = [...new Set(ingredients.map((row) => row.foodId))];
          if (foodIds.length === 0) {
            throw new ServeAborted({ code: 400, details: { recipeId: "this recipe has no ingredient foods to log" } });
          }
        } else {
          throw new ServeAborted({
            code: 400,
            details: { id: "a label-only storage item has no food to log — add a food or a recipe to serve it" },
          });
        }

        // Item 718: the meal this serve writes is rated exactly as Log meal's
        // create rates one — a food item per food, a recipe item once as the
        // recipe — and a rating that does not fit (including one for a food
        // an edit just took out) is a 400 before anything is written.
        // Ledger 752: the same rule as create (no recipe was on the meal
        // before, so a food is rateable unless it is an ingredient of the
        // container's recipe), with the single `recipeRating` read the way
        // create reads an older app's.
        const recipeIds = locked.recipeId ? [locked.recipeId] : [];
        const mapped = mapRecipeRequest({ recipeRating: body.data.recipeRating ?? undefined }, recipeIds);
        if (!mapped.ok) throw new ServeAborted({ code: 400, details: mapped.details });
        const ingredients = ingredientUnion(await loadIngredientFoodIds(tx, recipeIds), recipeIds);
        const ratings = validateRatings({
          recipeIds,
          ingredientsOfFinal: ingredients,
          ingredientsOfAdded: ingredients,
          stored: new Map(),
          foodIds,
          foodRatings: body.data.foodRatings,
          recipeRatings: mapped.value.recipeRatings,
        });
        if (!ratings.ok) throw new ServeAborted({ code: 400, details: ratings.details });

        const id = await insertMeal(tx, {
          babyId,
          // Attribution follows the storage item, food-sourced or not.
          recipes: recipeIds.map((recipeId) => ({ recipeId, rating: mapped.value.recipeRatings?.[recipeId] ?? null })),
          servedAt,
          reactionNote: body.data.reactionNote,
          notes: body.data.notes,
          foods: foodIds.map((foodId) => ({
            foodId,
            storageItemId: item.id,
            rating: body.data.foodRatings?.[foodId] ?? null,
          })),
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
          .update(storageItems)
          .set({
            servingsLeft: sql`case
              when ${storageItems.servingsTotal} is null then ${storageItems.servingsLeft}
              else greatest(${storageItems.servingsLeft} - ${servings}, 0)
            end`,
          })
          .where(
            and(
              eq(storageItems.id, item.id),
              eq(storageItems.userId, userId),
              eq(storageItems.status, "active"),
              sql`(${storageItems.servingsTotal} is null or ${storageItems.servingsLeft} > 0)`,
            ),
          )
          .returning();

        if (!claimed) {
          // Nothing was claimed, so nothing was changed — status is never
          // silently overwritten on the way out. Re-read (inside the same
          // transaction) only to say WHY.
          const [current] = await tx
            .select({ status: storageItems.status })
            .from(storageItems)
            .where(and(eq(storageItems.id, item.id), eq(storageItems.userId, userId)))
            .limit(1);
          if (!current) throw new ServeAborted({ code: 404 });
          throw new ServeAborted({
            code: 409,
            message:
              current.status === "active"
                ? "This storage item has no servings left — mark it finished or edit its servings first."
                : `This storage item is ${current.status} and cannot be served. Restore it first.`,
          });
        }

        // An emptied container finishes exactly like the manual finish flow:
        // status + statusChangedAt, moved to History and never deleted. The
        // threshold is the value the database RETURNED, not one this process
        // computed, so a serve that raced another still finishes on the true
        // remaining count.
        if (claimed.servingsTotal !== null && claimed.servingsLeft === 0) {
          await tx
            .update(storageItems)
            .set({ status: "finished", statusChangedAt: new Date() })
            .where(eq(storageItems.id, item.id));
        }

        return id;
      });
    } catch (error) {
      if (error instanceof ServeAborted) {
        // The transaction rolled back, so the meal that was inserted a few
        // lines above is gone with it.
        const { outcome } = error;
        if (outcome.code === 404) return notFound(reply);
        if (outcome.code === 400) return badRequest(reply, outcome.details);
        return conflict(reply, outcome.message);
      }
      throw error;
    }

    const meal = (await loadMeals(db, [mealId])).get(mealId);
    if (!meal) throw new Error("Served meal was inserted but could not be read back");

    return reply.code(201).send({ meal, item: await loadStorageItem(db, item.id) } satisfies ServeStorageItemResponse);
  });
}
