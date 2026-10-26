// Ledger 903 (plan SPEC §3.1-3.2, §4.2): meal planning, per baby. Every route
// sits behind requireAuth, and every baby lookup is scoped to the caller: a
// miss (wrong owner or unknown id) is 404, never 403.
//
// A day with no `planned_days` row is VIRTUAL: it shows the baby's current
// daily meals, and each meal's slot id is the daily meal's id. The first
// write to it materializes it (the day row plus one meal row per daily meal,
// in one transaction), then applies the write. Every plan write locks the
// baby row FOR NO KEY UPDATE first, which serializes plan writes without
// blocking a meal insert's foreign-key KEY SHARE (as storage serves do); the
// day's primary key is what guarantees one set of rows on its own.
//
// Past days are editable like any other (chair §12.3); only Copy targets
// will need to be today or later.
import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  DEFAULT_DAILY_MEALS,
  MEAL_FOODS_MAX,
  MEAL_RECIPES_MAX,
  PLATE_NOTHING_COUNTS,
  addPlannedMealInputSchema,
  babyIdRouteParamSchema,
  dailyMealsInputSchema,
  localDate,
  planDateParamsSchema,
  planDates,
  planQuerySchema,
  planSlotParamsSchema,
  updatePlannedMealInputSchema,
  type DailyMeal,
  type DailyMealsResponse,
  type PlanDay,
  type PlannedItem,
  type PlannedItemInput,
  type PlanResponse,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import { babies, meals, plannedDays, plannedItems, plannedMeals, recipes, storageItems } from "../db/schema.js";
import {
  loadIngredientFoodIds,
  loadPlateFoods,
  ownsBaby,
  validateFoodIds,
  validateRecipeIds,
  type Transaction,
} from "../services/meals.js";
import { loadStorageItems, notServable } from "../services/storage.js";

/** Thrown inside a plan write's transaction to roll it back with a reply. */
class PlanAborted extends Error {
  constructor(
    readonly code: 400 | 404 | 409,
    readonly body: Record<string, unknown>,
  ) {
    super("plan write aborted");
    this.name = "PlanAborted";
  }
}

const bad = (details: unknown) => new PlanAborted(400, { error: "invalid_request", details });
const missing = () => new PlanAborted(404, { error: "not_found" });
/** The slot is not on that day (any more): another device removed it, or the
 * client's copy of the day is stale. The client refetches (SPEC §3.2). */
const planChanged = () =>
  new PlanAborted(409, { error: "plan_changed", message: "This plan was changed somewhere else. Reload it and try again." });

function badRequest(reply: FastifyReply, details: unknown): FastifyReply {
  return reply.code(400).send({ error: "invalid_request", details });
}

/** Every handler behind `requireAuth` has a user; this makes that explicit. */
function currentUserId(request: FastifyRequest): string {
  const id = request.user?.id;
  if (!id) throw new Error("currentUserId called on an unauthenticated request");
  return id;
}

/** Postgres answers "HH:MM:SS"; the API speaks "HH:MM". */
const hhmm = (value: string | null) => (value === null ? null : value.slice(0, 5));

/** Locks the caller's baby (first in every plan write) and returns its daily
 * meals; a miss is 404. */
async function lockBaby(tx: Transaction, babyId: string, userId: string): Promise<readonly DailyMeal[]> {
  const [row] = await tx
    .select({ dailyMeals: babies.dailyMeals })
    .from(babies)
    .where(and(eq(babies.id, babyId), eq(babies.userId, userId)))
    .for("no key update");
  if (!row) throw missing();
  return row.dailyMeals ?? DEFAULT_DAILY_MEALS;
}

/** SPEC §3.2: the first write to a virtual day gives it one row per daily
 * meal. On a day that already has its own meals this inserts nothing. */
async function materialize(tx: Transaction, babyId: string, date: string, dailyMeals: readonly DailyMeal[]): Promise<void> {
  const [fresh] = await tx.insert(plannedDays).values({ babyId, date }).onConflictDoNothing().returning();
  if (!fresh) return;
  await tx.insert(plannedMeals).values(
    dailyMeals.map((meal, position) => ({ babyId, date, dailyMealId: meal.id, name: meal.name, time: meal.time, position })),
  );
}

/** The day's meal a slot id names: its own row id, else the daily meal it was
 * made from (a client still holding the virtual day). Locked FOR UPDATE. */
async function resolveSlot(tx: Transaction, babyId: string, date: string, slotId: string) {
  const rows = await tx
    .select({ id: plannedMeals.id, servedMealId: plannedMeals.servedMealId })
    .from(plannedMeals)
    .where(
      and(
        eq(plannedMeals.babyId, babyId),
        eq(plannedMeals.date, date),
        or(eq(plannedMeals.id, slotId), eq(plannedMeals.dailyMealId, slotId)),
      ),
    )
    .for("update");
  const slot = rows.find((row) => row.id === slotId) ?? rows[0];
  if (!slot) throw planChanged();
  return slot;
}

/**
 * Replaces a planned meal's items (SPEC §3.5 "Plan PUTs apply the same
 * leave-out subset and info-food rules as plate writes", §1.4.1-2, 4), so a
 * plan never holds what Serve would refuse for a reason the plan can know.
 * What a container holds, and how much is left, is read at Serve: a plan may
 * ask for more than is left (that is the "may run out" flag, not a refusal).
 */
async function writePlannedItems(tx: Transaction, userId: string, plannedMealId: string, items: PlannedItemInput[]): Promise<void> {
  const current = await tx
    .select({ foodId: plannedItems.foodId, storageItemId: plannedItems.storageItemId })
    .from(plannedItems)
    .where(eq(plannedItems.plannedMealId, plannedMealId));

  // A custom food deleted since it was planned stays on this meal (it shows
  // "(deleted)"), but cannot be added anywhere new.
  const foodIds = items.flatMap((item) => (item.kind === "food" ? [item.foodId] : []));
  if (foodIds.length > 0) {
    const kept = new Set(current.flatMap((row) => (row.foodId ? [row.foodId] : [])));
    const check = await validateFoodIds(tx, foodIds, userId, kept);
    if (!check.ok) throw bad(check.details);
  }

  const recipeItems = items.filter((item) => item.kind === "recipe");
  const recipeIds = [...new Set(recipeItems.map((item) => item.recipeId))];
  const recipeCheck = await validateRecipeIds(tx, recipeIds, userId, "recipeIds");
  if (!recipeCheck.ok) throw bad(recipeCheck.details);
  const ingredients = await loadIngredientFoodIds(tx, recipeIds);
  const counted = new Set(foodIds);
  for (const item of recipeItems) {
    const now = ingredients.get(item.recipeId) ?? new Set<string>();
    const strays = (item.leftOutFoodIds ?? []).filter((id) => !now.has(id));
    if (strays.length > 0) throw bad({ leftOutFoodIds: "not an ingredient of this recipe", foodIds: strays });
    for (const id of now) if (!item.leftOutFoodIds?.includes(id)) counted.add(id);
  }

  const containerIds = items.flatMap((item) => (item.kind === "storage" ? [item.storageItemId] : []));
  if (containerIds.length > 0) {
    const owned = await tx
      .select({ id: storageItems.id, status: storageItems.status })
      .from(storageItems)
      .where(and(inArray(storageItems.id, containerIds), eq(storageItems.userId, userId)));
    const unknownStorageItemIds = containerIds.filter((id) => !owned.some((row) => row.id === id));
    if (unknownStorageItemIds.length > 0) throw bad({ items: "unknown storage item", unknownStorageItemIds });
    // A container new to this meal must be one Serve could take from; one
    // already planned stays (it shows its own flag once it is finished).
    const planned = new Set(current.map((row) => row.storageItemId));
    const closed = owned.find((row) => row.status !== "active" && !planned.has(row.id));
    if (closed) throw new PlanAborted(409, { error: "conflict", message: notServable(closed.status), storageItemId: closed.id });
  }

  if (items.length > 0 && containerIds.length === 0 && counted.size === 0) throw bad({ items: PLATE_NOTHING_COUNTS });
  if (counted.size > MEAL_FOODS_MAX) throw bad({ items: `at most ${MEAL_FOODS_MAX} foods per meal` });
  if (recipeIds.length > MEAL_RECIPES_MAX) throw bad({ items: `at most ${MEAL_RECIPES_MAX} recipes per meal` });

  await tx.delete(plannedItems).where(eq(plannedItems.plannedMealId, plannedMealId));
  if (items.length === 0) return;
  await tx.insert(plannedItems).values(
    items.map((item, position) => ({
      plannedMealId,
      position,
      foodId: item.kind === "food" ? item.foodId : null,
      recipeId: item.kind === "recipe" ? item.recipeId : null,
      storageItemId: item.kind === "storage" ? item.storageItemId : null,
      servings: item.kind === "storage" ? item.servings : null,
      leftOutFoodIds: item.kind === "recipe" ? [...new Set(item.leftOutFoodIds ?? [])] : [],
    })),
  );
}

/** Each planned meal's items, hydrated, in plan order. */
async function loadPlannedItems(db: Database, plannedMealIds: string[]): Promise<Map<string, PlannedItem[]>> {
  if (plannedMealIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: plannedItems.id,
      plannedMealId: plannedItems.plannedMealId,
      foodId: plannedItems.foodId,
      recipeId: plannedItems.recipeId,
      recipeTitle: recipes.title,
      storageItemId: plannedItems.storageItemId,
      servings: plannedItems.servings,
      leftOutFoodIds: plannedItems.leftOutFoodIds,
    })
    .from(plannedItems)
    .leftJoin(recipes, eq(plannedItems.recipeId, recipes.id))
    .where(inArray(plannedItems.plannedMealId, plannedMealIds))
    .orderBy(asc(plannedItems.plannedMealId), asc(plannedItems.position), asc(plannedItems.id));

  // A leave-out the recipe has since lost is not shown (and Serve drops it).
  const ingredients = await loadIngredientFoodIds(db, [...new Set(rows.flatMap((row) => (row.recipeId ? [row.recipeId] : [])))]);
  const leftOutOf = (row: (typeof rows)[number]) =>
    row.recipeId ? row.leftOutFoodIds.filter((id) => ingredients.get(row.recipeId!)?.has(id)) : [];
  const foodById = await loadPlateFoods(db, [...new Set(rows.flatMap((row) => (row.foodId ? [row.foodId] : leftOutOf(row))))]);
  const containerById = new Map(
    (await loadStorageItems(db, [...new Set(rows.flatMap((row) => (row.storageItemId ? [row.storageItemId] : [])))])).map(
      (item) => [item.id, item],
    ),
  );
  const food = (id: string) => {
    const found = foodById.get(id);
    if (!found) throw new Error(`planned food ${id} not found`);
    return found;
  };

  const byMeal = new Map<string, PlannedItem[]>();
  for (const row of rows) {
    const list = byMeal.get(row.plannedMealId) ?? [];
    byMeal.set(row.plannedMealId, list);
    if (row.storageItemId) {
      const container = containerById.get(row.storageItemId);
      if (!container) throw new Error(`planned container ${row.storageItemId} not found`);
      list.push({ kind: "storage", id: row.id, servings: row.servings!, container });
    } else if (row.recipeId) {
      list.push({
        kind: "recipe",
        id: row.id,
        recipe: { id: row.recipeId, title: row.recipeTitle ?? "" },
        leftOut: leftOutOf(row).map(food),
      });
    } else {
      list.push({ kind: "food", id: row.id, food: food(row.foodId!) });
    }
  }
  return byMeal;
}

/** The baby's days from `from` to `to`: its own meals where it has them, the
 * current daily meals where it is virtual. Ownership is the caller's. */
async function loadPlan(db: Database, babyId: string, from: string, to: string): Promise<Omit<PlanResponse, "today">> {
  const [baby] = await db.select({ dailyMeals: babies.dailyMeals }).from(babies).where(eq(babies.id, babyId));
  const dailyMeals = [...(baby?.dailyMeals ?? DEFAULT_DAILY_MEALS)];
  const planned = new Set(
    (
      await db
        .select({ date: plannedDays.date })
        .from(plannedDays)
        .where(and(eq(plannedDays.babyId, babyId), gte(plannedDays.date, from), lte(plannedDays.date, to)))
    ).map((row) => row.date),
  );
  const mealRows = await db
    .select({
      id: plannedMeals.id,
      date: plannedMeals.date,
      name: plannedMeals.name,
      time: plannedMeals.time,
      position: plannedMeals.position,
      servedMealId: plannedMeals.servedMealId,
      servedAt: meals.servedAt,
    })
    .from(plannedMeals)
    .leftJoin(meals, eq(plannedMeals.servedMealId, meals.id))
    .where(and(eq(plannedMeals.babyId, babyId), gte(plannedMeals.date, from), lte(plannedMeals.date, to)))
    .orderBy(asc(plannedMeals.date), asc(plannedMeals.position), asc(plannedMeals.id));
  const itemsByMeal = await loadPlannedItems(
    db,
    mealRows.map((row) => row.id),
  );

  const days = planDates(from, to).map(
    (date): PlanDay =>
      planned.has(date)
        ? {
            date,
            planned: true,
            meals: mealRows
              .filter((row) => row.date === date)
              .map((row) => ({
                slotId: row.id,
                name: row.name,
                time: hhmm(row.time),
                position: row.position,
                served: row.servedMealId && row.servedAt ? { mealId: row.servedMealId, servedAt: row.servedAt.toISOString() } : null,
                items: itemsByMeal.get(row.id) ?? [],
              })),
          }
        : {
            date,
            planned: false,
            meals: dailyMeals.map((meal, position) => ({ slotId: meal.id, name: meal.name, time: meal.time, position, served: null, items: [] })),
          },
  );
  return { dailyMeals, days };
}

async function loadDay(db: Database, babyId: string, date: string): Promise<PlanDay> {
  const [day] = (await loadPlan(db, babyId, date, date)).days;
  if (!day) throw new Error("A plan day could not be read back");
  return day;
}

export function registerPlanRoutes(app: FastifyInstance, db: Database): void {
  /** Runs one plan write; a PlanAborted rolls it back and comes back as the
   * refusal to send. (Not the sent reply: a FastifyReply is a thenable, so an
   * async function returning one resolves to undefined.) */
  async function planWrite(write: (tx: Transaction) => Promise<void>): Promise<PlanAborted | null> {
    try {
      await db.transaction(write);
      return null;
    } catch (error) {
      if (error instanceof PlanAborted) return error;
      throw error;
    }
  }
  const refuse = (reply: FastifyReply, refused: PlanAborted) => reply.code(refused.code).send(refused.body);

  // -----------------------------------------------------------------------
  // GET /api/babies/:babyId/plan?from&to&tz
  // -----------------------------------------------------------------------
  app.get("/api/babies/:babyId/plan", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    if (!(await ownsBaby(db, params.data.babyId, currentUserId(request)))) return notFound(reply);
    const query = planQuerySchema.safeParse(request.query);
    if (!query.success) return badRequest(reply, query.error.flatten());

    const plan = await loadPlan(db, params.data.babyId, query.data.from, query.data.to);
    return reply.send({ today: localDate(new Date(), query.data.tz), ...plan } satisfies PlanResponse);
  });

  // -----------------------------------------------------------------------
  // PUT /api/babies/:babyId/daily-meals
  // -----------------------------------------------------------------------
  // Only virtual days read the list, so planned and past days keep their own
  // meals (804). Ledger 811 (should planned days pick up a new one?) waits.
  app.put("/api/babies/:babyId/daily-meals", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdRouteParamSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    const body = dailyMealsInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());

    const dailyMeals = body.data.meals.map((meal) => ({ id: meal.id ?? randomUUID(), name: meal.name, time: meal.time ?? null }));
    const refused = await planWrite(async (tx) => {
      await lockBaby(tx, params.data.babyId, currentUserId(request));
      await tx.update(babies).set({ dailyMeals }).where(eq(babies.id, params.data.babyId));
    });
    if (refused) return refuse(reply, refused);
    return reply.send({ dailyMeals } satisfies DailyMealsResponse);
  });

  // -----------------------------------------------------------------------
  // POST /api/babies/:babyId/plan/:date/meals ("+ Add a meal")
  // -----------------------------------------------------------------------
  app.post("/api/babies/:babyId/plan/:date/meals", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = planDateParamsSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    const body = addPlannedMealInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());
    const { babyId, date } = params.data;

    const refused = await planWrite(async (tx) => {
      await materialize(tx, babyId, date, await lockBaby(tx, babyId, currentUserId(request)));
      const [last] = await tx
        .select({ position: sql<number>`coalesce(max(${plannedMeals.position}), -1)::int` })
        .from(plannedMeals)
        .where(and(eq(plannedMeals.babyId, babyId), eq(plannedMeals.date, date)));
      await tx
        .insert(plannedMeals)
        .values({ babyId, date, name: body.data.name, time: body.data.time ?? null, position: (last?.position ?? -1) + 1 });
    });
    if (refused) return refuse(reply, refused);
    return reply.code(201).send(await loadDay(db, babyId, date));
  });

  // -----------------------------------------------------------------------
  // PUT /api/babies/:babyId/plan/:date/meals/:slotId
  // -----------------------------------------------------------------------
  app.put("/api/babies/:babyId/plan/:date/meals/:slotId", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = planSlotParamsSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    const body = updatePlannedMealInputSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.flatten());
    const { babyId, date, slotId } = params.data;
    const userId = currentUserId(request);

    const refused = await planWrite(async (tx) => {
      await materialize(tx, babyId, date, await lockBaby(tx, babyId, userId));
      const slot = await resolveSlot(tx, babyId, date, slotId);
      // What was served is on the logged meal; the plan cannot change it.
      if (body.data.items !== undefined && slot.servedMealId) {
        throw new PlanAborted(409, { error: "already_served", mealId: slot.servedMealId });
      }
      const columns: { name?: string; time?: string | null } = {};
      if (body.data.name !== undefined) columns.name = body.data.name;
      if (body.data.time !== undefined) columns.time = body.data.time;
      if (Object.keys(columns).length > 0) await tx.update(plannedMeals).set(columns).where(eq(plannedMeals.id, slot.id));
      if (body.data.items !== undefined) await writePlannedItems(tx, userId, slot.id, body.data.items);
    });
    if (refused) return refuse(reply, refused);
    return reply.send(await loadDay(db, babyId, date));
  });

  // -----------------------------------------------------------------------
  // DELETE /api/babies/:babyId/plan/:date/meals/:slotId (⋮ Remove)
  // -----------------------------------------------------------------------
  // The day keeps its other meals; a meal logged from this one stays logged.
  app.delete("/api/babies/:babyId/plan/:date/meals/:slotId", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = planSlotParamsSchema.safeParse(request.params);
    if (!params.success) return notFound(reply);
    const { babyId, date, slotId } = params.data;

    const refused = await planWrite(async (tx) => {
      await materialize(tx, babyId, date, await lockBaby(tx, babyId, currentUserId(request)));
      const slot = await resolveSlot(tx, babyId, date, slotId);
      await tx.delete(plannedMeals).where(eq(plannedMeals.id, slot.id));
    });
    if (refused) return refuse(reply, refused);
    return reply.send(await loadDay(db, babyId, date));
  });
}
