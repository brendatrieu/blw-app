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
  serveStorageInputSchema,
  serveStorageItemInputSchema,
  updateStorageItemInputSchema,
  MEAL_FOODS_MAX,
  MEAL_RECIPES_MAX,
  type CreateStorageItemResponse,
  type StorageItem,
  type StorageResponse,
  type ServeStorageItemResponse,
  type ServeStorageResponse,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import {
  babies,
  foods,
  mealStorageItems,
  storageItemFoods,
  storageItemRecipes,
  storageItems,
  recipes,
} from "../db/schema.js";
import { choosableFoodsCondition } from "../services/foods.js";
import {
  INFO_FOOD_ALONE,
  ingredientUnion,
  insertMeal,
  loadIngredientFoodIds,
  loadMeals,
  looseInfoFoodIds,
  ownsBaby,
} from "../services/meals.js";
import { mapRecipeRequest, validateFoodIds, validateRatings, validateRecipeIds } from "./meals.js";
import {
  containerWindowHours,
  deriveFreshness,
  loadContainerRecipes,
  loadStorageItemFoods,
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
  constructor(
    readonly outcome:
      | { code: 404 }
      | { code: 409; message: string; storageItemId: string }
      | { code: 400; details: unknown },
  ) {
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
  const recipesByItemId = await loadContainerRecipes(db, rows);
  // Every food (or recipe) in the container speaks: the shortest window
  // among them is what the item gets.
  const windowByItemId = await containerWindowHours(db, rows, foodsByItemId, recipesByItemId);

  const now = Date.now();

  return rows.map((row) => {
    const freshness = deriveFreshness(row.preparedAt, windowByItemId.get(row.id) as number, now, row.bestBy);

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
      // Ledger 753: every recipe, in order (one container can hold the
      // leftovers of several); `recipeId`/`recipeTitle` stay the first.
      recipes: (recipesByItemId.get(row.id) ?? []).map((recipe) => ({ id: recipe.id, title: recipe.title })),
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

/**
 * Which baby ate it. An explicit babyId is ownership-checked like any other
 * id (a miss is 404); omitted, the account's single active baby is the only
 * unambiguous answer.
 */
async function resolveBabyId(
  db: Database,
  userId: string,
  babyId: string | undefined,
): Promise<{ ok: true; babyId: string } | { ok: false; code: 404 } | { ok: false; code: 400; details: unknown }> {
  if (babyId) return (await ownsBaby(db, babyId, userId)) ? { ok: true, babyId } : { ok: false, code: 404 };
  const owned = await db
    .select({ id: babies.id })
    .from(babies)
    .where(and(eq(babies.userId, userId), isNull(babies.archivedAt)))
    .orderBy(asc(babies.birthDate), asc(babies.createdAt))
    .limit(2);
  const only = owned.length === 1 ? owned[0] : undefined;
  if (only) return { ok: true, babyId: only.id };
  return {
    ok: false,
    code: 400,
    details: {
      babyId:
        owned.length === 0
          ? "no baby profile to log this meal against"
          : "babyId is required when the account has more than one baby",
    },
  };
}

interface ServeRequest {
  userId: string;
  babyId: string;
  /** Containers in the parent's order; each at most once. */
  parts: { storageItemId: string; servings: number }[];
  /** Fresh, not from storage. */
  freshFoodIds: string[];
  freshRecipeIds: string[];
  servedAt: Date;
  reactionNote: string | null;
  notes: string | null;
  foodRatings: Record<string, number | null> | undefined;
  /** The new shape, or the single-item route's legacy `recipeRating`, which is
   * read as the rating of the container's recipe exactly as before. */
  ratings: { recipeRatings: Record<string, number | null> | undefined } | { legacyRecipeRating: number | undefined };
}

const NO_SERVINGS_LEFT = "This storage item has no servings left — mark it finished or edit its servings first.";
const notServable = (status: string) => `This storage item is ${status} and cannot be served. Restore it first.`;

/**
 * The one serve (ledger 753, DESIGN-B §5), behind both serve routes. In ONE
 * transaction: lock every container in id order (so two multi-serves can
 * never deadlock), refuse the whole serve if any is not servable, read what
 * each holds UNDER the lock (contents are editable, item 729), write one meal,
 * take each container's servings, and record what was really taken in
 * `meal_storage_items` so deleting the meal can give it back (ledger 751).
 * Any failure throws ServeAborted and nothing is written. Returns the meal id.
 */
async function serveParts(db: Database, req: ServeRequest): Promise<string> {
  const { userId } = req;
  return db.transaction(async (tx) => {
    // FOR NO KEY UPDATE, not FOR UPDATE: it still queues behind another serve
    // and the storage PATCH lock, but not behind the FOR KEY SHARE a
    // meal_foods insert's foreign-key check takes on a container (a meal edit
    // re-inserting its foods), so the two cannot deadlock.
    const lockedRows = await tx
      .select({
        id: storageItems.id,
        recipeId: storageItems.recipeId,
        status: storageItems.status,
        servingsLeft: storageItems.servingsLeft,
        servingsTotal: storageItems.servingsTotal,
      })
      .from(storageItems)
      .where(
        and(
          inArray(
            storageItems.id,
            req.parts.map((part) => part.storageItemId),
          ),
          eq(storageItems.userId, userId),
        ),
      )
      .orderBy(asc(storageItems.id))
      .for("no key update");
    const lockedById = new Map(lockedRows.map((row) => [row.id, row]));
    const locked = req.parts.map((part) => {
      const row = lockedById.get(part.storageItemId);
      if (!row) throw new ServeAborted({ code: 404 });
      return row;
    });

    // Only an active container with something left in it can be served.
    for (const row of locked) {
      if (row.status !== "active") {
        throw new ServeAborted({ code: 409, message: notServable(row.status), storageItemId: row.id });
      }
      if (row.servingsTotal !== null && (row.servingsLeft ?? 0) <= 0) {
        throw new ServeAborted({ code: 409, message: NO_SERVINGS_LEFT, storageItemId: row.id });
      }
    }

    if (req.freshFoodIds.length > 0) {
      const fresh = await validateFoodIds(tx, req.freshFoodIds, userId);
      if (!fresh.ok) throw new ServeAborted({ code: 400, details: fresh.details });
    }
    const freshRecipeIds = [...new Set(req.freshRecipeIds)];
    const recipeCheck = await validateRecipeIds(tx, freshRecipeIds, userId, "recipeIds");
    if (!recipeCheck.ok) throw new ServeAborted({ code: 400, details: recipeCheck.details });

    // Each container's recipes: a several-recipe container's rows in order
    // (ledger 753), else its one recipe.
    const severalRows = await tx
      .select({ storageItemId: storageItemRecipes.storageItemId, recipeId: storageItemRecipes.recipeId })
      .from(storageItemRecipes)
      .where(
        inArray(
          storageItemRecipes.storageItemId,
          locked.map((row) => row.id),
        ),
      )
      .orderBy(asc(storageItemRecipes.position), asc(storageItemRecipes.recipeId));
    const recipesOf = (row: (typeof locked)[number]): string[] => {
      const several = severalRows.filter((entry) => entry.storageItemId === row.id).map((entry) => entry.recipeId);
      return several.length > 0 ? several : row.recipeId ? [row.recipeId] : [];
    };

    // The meal's recipes: each container's in `parts` order, then the fresh
    // ones. Two containers of one recipe, or a fresh recipe that is also in
    // storage, are ONE recipe on the meal (one star row).
    const recipeIds = [...new Set([...locked.flatMap(recipesOf), ...freshRecipeIds])];
    if (recipeIds.length > MEAL_RECIPES_MAX) {
      throw new ServeAborted({ code: 400, details: { recipeIds: `at most ${MEAL_RECIPES_MAX} recipes per meal` } });
    }
    const ingredientsByRecipe = await loadIngredientFoodIds(tx, recipeIds);

    // What each container holds, exactly today's single-serve rule: its own
    // foods when it has any (a recipe container holding foods keeps both), or
    // else its recipe's current ingredients. A food in two parts keeps the
    // FIRST part's link; fresh foods and fresh recipes' foods have none.
    const itemFoods = await loadStorageItemFoods(
      tx,
      locked.map((row) => row.id),
    );
    const linkByFoodId = new Map<string, string | null>();
    for (const row of locked) {
      const held = itemFoods.get(row.id)?.map((food) => food.id);
      const partRecipes = recipesOf(row);
      if (!held?.length && partRecipes.length === 0) {
        throw new ServeAborted({
          code: 400,
          details: { id: "a label-only storage item has no food to log — add a food or a recipe to serve it" },
        });
      }
      for (const foodId of held?.length ? held : ingredientUnion(ingredientsByRecipe, partRecipes)) {
        if (!linkByFoodId.has(foodId)) linkByFoodId.set(foodId, row.id);
      }
    }
    for (const recipeId of freshRecipeIds) {
      for (const foodId of ingredientsByRecipe.get(recipeId) ?? []) {
        if (!linkByFoodId.has(foodId)) linkByFoodId.set(foodId, null);
      }
    }
    for (const foodId of req.freshFoodIds) {
      if (!linkByFoodId.has(foodId)) linkByFoodId.set(foodId, null);
    }
    // A recipe with no ingredient foods is fine beside other foods; it is
    // today's 400 only when the meal would have no food at all.
    if (linkByFoodId.size === 0) {
      throw new ServeAborted({ code: 400, details: { recipeId: "this recipe has no ingredient foods to log" } });
    }
    if (linkByFoodId.size > MEAL_FOODS_MAX) {
      throw new ServeAborted({ code: 400, details: { foodIds: `at most ${MEAL_FOODS_MAX} foods per meal` } });
    }
    const foodIds = [...linkByFoodId.keys()];

    // Rated exactly as Log meal's create rates a meal (DESIGN-B §2, nothing
    // was on the meal before): a food is rateable unless it is an ingredient
    // of a served recipe. The single-item route's legacy `recipeRating` is
    // read the way create reads an older app's.
    let recipeRatings: Record<string, number | null> | undefined;
    if ("legacyRecipeRating" in req.ratings) {
      const mapped = mapRecipeRequest({ recipeRating: req.ratings.legacyRecipeRating }, recipeIds);
      if (!mapped.ok) throw new ServeAborted({ code: 400, details: mapped.details });
      recipeRatings = mapped.value.recipeRatings;
    } else {
      recipeRatings = req.ratings.recipeRatings;
    }
    const ingredients = ingredientUnion(ingredientsByRecipe, recipeIds);
    // Fresh foods only: a container's own foods were checked when it was
    // filled, and its recipes' ingredients are `ingredients` themselves.
    const looseInfo = await looseInfoFoodIds(tx, req.freshFoodIds, ingredients);
    if (looseInfo.length > 0) {
      throw new ServeAborted({ code: 400, details: { foodIds: INFO_FOOD_ALONE, infoFoodIds: looseInfo } });
    }
    const ratings = validateRatings({
      recipeIds,
      ingredientsOfFinal: ingredients,
      ingredientsOfAdded: ingredients,
      stored: new Map(),
      foodIds,
      foodRatings: req.foodRatings,
      recipeRatings,
    });
    if (!ratings.ok) throw new ServeAborted({ code: 400, details: ratings.details });

    const mealId = await insertMeal(tx, {
      babyId: req.babyId,
      recipes: recipeIds.map((recipeId) => ({ recipeId, rating: recipeRatings?.[recipeId] ?? null })),
      servedAt: req.servedAt,
      reactionNote: req.reactionNote,
      notes: req.notes,
      foods: foodIds.map((foodId) => ({
        foodId,
        storageItemId: linkByFoodId.get(foodId) ?? null,
        rating: req.foodRatings?.[foodId] ?? null,
      })),
    });

    const taken: { mealId: string; storageItemId: string; servings: number }[] = [];
    for (const [index, part] of req.parts.entries()) {
      const before = locked[index]!;
      // The claim: ONE guarded, self-referential UPDATE that is both the
      // status check and the decrement. The rows are already locked and
      // checked above, so this cannot miss today; it stays as the safety net
      // it always was, computing the new count from the row's own value.
      //   status = 'active'      → finished/discarded never serve
      //   servings_total is null → untracked items pass, decrementing nothing
      //   or servings_left > 0   → a tracked item must have something left
      const [claimed] = await tx
        .update(storageItems)
        .set({
          servingsLeft: sql`case
            when ${storageItems.servingsTotal} is null then ${storageItems.servingsLeft}
            else greatest(${storageItems.servingsLeft} - ${part.servings}, 0)
          end`,
        })
        .where(
          and(
            eq(storageItems.id, part.storageItemId),
            eq(storageItems.userId, userId),
            eq(storageItems.status, "active"),
            sql`(${storageItems.servingsTotal} is null or ${storageItems.servingsLeft} > 0)`,
          ),
        )
        .returning();
      if (!claimed) throw new ServeAborted({ code: 409, message: NO_SERVINGS_LEFT, storageItemId: part.storageItemId });

      // An emptied container finishes exactly like the manual finish flow,
      // on the count the database RETURNED.
      if (claimed.servingsTotal !== null && claimed.servingsLeft === 0) {
        await tx
          .update(storageItems)
          .set({ status: "finished", statusChangedAt: new Date() })
          .where(eq(storageItems.id, part.storageItemId));
      }

      // What this serve really took: min(asked, left) on a tracked container,
      // 0 on an untracked one (there is nothing to give back).
      taken.push({
        mealId,
        storageItemId: part.storageItemId,
        servings:
          claimed.servingsTotal !== null && before.servingsLeft !== null && claimed.servingsLeft !== null
            ? before.servingsLeft - claimed.servingsLeft
            : 0,
      });
    }
    await tx.insert(mealStorageItems).values(taken);

    return mealId;
  });
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
      // Ledger 838: a container of foods has no recipe to bring whole milk in.
      const infoFoodIds = await looseInfoFoodIds(db, foodIds, new Set());
      if (infoFoodIds.length > 0) return badRequest(reply, { foodIds: INFO_FOOD_ALONE, infoFoodIds });
    }
    // Visible to THIS user — the catalog plus their own custom recipes. One
    // query for a single `recipeId` or a several-recipe list (ledger 753).
    const recipeIdList = body.data.recipeIds
      ? [...new Set(body.data.recipeIds)]
      : body.data.recipeId
        ? [body.data.recipeId]
        : [];
    const recipeCheck = await validateRecipeIds(
      db,
      recipeIdList,
      currentUserId(request),
      body.data.recipeIds ? "recipeIds" : "recipeId",
    );
    if (!recipeCheck.ok) return badRequest(reply, recipeCheck.details);

    const userId = currentUserId(request);
    const preparedAt = body.data.preparedAt ? new Date(body.data.preparedAt) : new Date();

    // What this submission becomes. A container holds the whole meal, so
    // several foods are ONE item with one join row each, in the order they
    // were submitted — unless the parent chose "Separate containers", which
    // is one single-food item per food. Several recipes work the same way
    // (ledger 753): one container naming them all, or one per recipe. A
    // recipe- or label-sourced item has no foods of its own, as before.
    type Group = { foodIds: string[]; recipeIds: string[] };
    const groups: Group[] = foodIds
      ? body.data.separateItems
        ? foodIds.map((id) => ({ foodIds: [id], recipeIds: [] }))
        : [{ foodIds, recipeIds: [] }]
      : body.data.separateItems && recipeIdList.length > 0
        ? recipeIdList.map((id) => ({ foodIds: [], recipeIds: [id] }))
        : [{ foodIds: [], recipeIds: recipeIdList }];

    // Ids are minted here rather than read back from `returning()` so each
    // group is paired with its own item by identity, never by relying on a
    // multi-row insert handing its rows back in the order they went in.
    const insertedIds = groups.map(() => randomUUID());

    // One transaction so a submission is all-or-nothing: every item and every
    // join row lands, or none of them do.
    await db.transaction(async (tx) => {
      await tx.insert(storageItems).values(
        insertedIds.map((id, index) => ({
          id,
          userId,
          // The first recipe; on a several-recipe container this mirrors
          // `storage_item_recipes` position 0.
          recipeId: groups[index]!.recipeIds[0] ?? null,
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
        group.foodIds.map((foodId, position) => ({
          storageItemId: insertedIds[groupIndex] as string,
          foodId,
          position,
        })),
      );
      if (joinRows.length > 0) await tx.insert(storageItemFoods).values(joinRows);
      const recipeRows = groups.flatMap((group, groupIndex) =>
        group.recipeIds.length < 2
          ? []
          : group.recipeIds.map((recipeId, position) => ({
              storageItemId: insertedIds[groupIndex] as string,
              recipeId,
              position,
            })),
      );
      if (recipeRows.length > 0) await tx.insert(storageItemRecipes).values(recipeRows);
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
        const infoFoodIds = await looseInfoFoodIds(db, added, new Set());
        if (infoFoodIds.length > 0) return badRequest(reply, { foodIds: INFO_FOOD_ALONE, infoFoodIds });
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
  // The single-container serve the shipped app calls. Since ledger 753 it is
  // a one-part call into the same `serveParts` as the multi-part route below,
  // so it also records what it took (meal_storage_items) and a later delete
  // of the meal gives that back. Request and response are unchanged.
  // -----------------------------------------------------------------------
  app.post("/api/storage/:id/serve", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = storageItemIdParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);

    const body = serveStorageItemInputSchema.safeParse(request.body ?? {});
    if (!body.success) return badRequest(reply, body.error.flatten());

    const userId = currentUserId(request);

    // Existence first, as it always was: an unknown item is a 404 before the
    // baby is even looked at. Everything else is read under the lock.
    const [item] = await db
      .select({ id: storageItems.id })
      .from(storageItems)
      .where(and(eq(storageItems.id, params.data.id), eq(storageItems.userId, userId)))
      .limit(1);
    if (!item) return notFound(reply);

    const baby = await resolveBabyId(db, userId, body.data.babyId);
    if (!baby.ok) return baby.code === 404 ? notFound(reply) : badRequest(reply, baby.details);

    let mealId: string;
    try {
      mealId = await serveParts(db, {
        userId,
        babyId: baby.babyId,
        parts: [{ storageItemId: item.id, servings: body.data.servings }],
        freshFoodIds: [],
        freshRecipeIds: [],
        servedAt: body.data.servedAt ? new Date(body.data.servedAt) : new Date(),
        reactionNote: body.data.reactionNote,
        notes: body.data.notes,
        foodRatings: body.data.foodRatings,
        ratings: { legacyRecipeRating: body.data.recipeRating ?? undefined },
      });
    } catch (error) {
      if (error instanceof ServeAborted) {
        const { outcome } = error;
        if (outcome.code === 404) return notFound(reply);
        if (outcome.code === 400) return badRequest(reply, outcome.details);
        // Byte for byte what this route always answered.
        return conflict(reply, outcome.message);
      }
      throw error;
    }

    const meal = (await loadMeals(db, [mealId])).get(mealId);
    if (!meal) throw new Error("Served meal was inserted but could not be read back");

    return reply.code(201).send({ meal, item: await loadStorageItem(db, item.id) } satisfies ServeStorageItemResponse);
  });

  // -----------------------------------------------------------------------
  // POST /api/storage/serve (ledger 753)
  //
  // One sitting from several containers, plus fresh foods and fresh recipes.
  // One meal, all or nothing: a 409 names the container that could not be
  // served and nothing is written. Undo is DELETE /api/meals/:id.
  // -----------------------------------------------------------------------
  app.post("/api/storage/serve", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = serveStorageInputSchema.safeParse(request.body ?? {});
    if (!body.success) return badRequest(reply, body.error.flatten());

    const userId = currentUserId(request);
    const baby = await resolveBabyId(db, userId, body.data.babyId);
    if (!baby.ok) return baby.code === 404 ? notFound(reply) : badRequest(reply, baby.details);

    let mealId: string;
    try {
      mealId = await serveParts(db, {
        userId,
        babyId: baby.babyId,
        parts: body.data.parts,
        freshFoodIds: body.data.foodIds ?? [],
        freshRecipeIds: body.data.recipeIds ?? [],
        servedAt: body.data.servedAt ? new Date(body.data.servedAt) : new Date(),
        reactionNote: body.data.reactionNote,
        notes: body.data.notes,
        foodRatings: body.data.foodRatings,
        ratings: { recipeRatings: body.data.recipeRatings },
      });
    } catch (error) {
      if (error instanceof ServeAborted) {
        const { outcome } = error;
        if (outcome.code === 404) return notFound(reply);
        if (outcome.code === 400) return badRequest(reply, outcome.details);
        return reply
          .code(409)
          .send({ error: "conflict", message: outcome.message, storageItemId: outcome.storageItemId });
      }
      throw error;
    }

    const meal = (await loadMeals(db, [mealId])).get(mealId);
    if (!meal) throw new Error("Served meal was inserted but could not be read back");
    const items = await Promise.all(body.data.parts.map((part) => loadStorageItem(db, part.storageItemId)));

    return reply.code(201).send({ meal, items } satisfies ServeStorageResponse);
  });
}
