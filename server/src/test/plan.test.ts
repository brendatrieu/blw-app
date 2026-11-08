// Ledger 903, step 3.1 (plan SPEC §3.1-3.2, §4.2, §8 row 3): plan days,
// daily meals and planned items. A day is virtual until its first write,
// which materializes it exactly once, even when two writes race; every route
// is the caller's own (a miss is 404); deletes cascade.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import {
  ACCOUNT_DELETE_CONFIRMATION,
  DEFAULT_DAILY_MEALS,
  PLATE_NOTHING_COUNTS,
  dailyMealsResponseSchema,
  localDate,
  planDaySchema,
  planResponseSchema,
  type Baby,
  type CreateStorageItemResponse,
  type PlanDay,
  type PlannedItemInput,
} from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

async function seedFixtures(db: Database) {
  await db
    .insert(schema.storageGuidelines)
    .values({ category: "produce_cooked", fridgeHours: 48, freezerDays: 60, roomTempHours: 2, notes: "Cooked." });
  const food = (slug: string, name: string) => ({
    slug,
    name,
    category: "fruit" as const,
    ironLevel: "low" as const,
    vitaminCLevel: "moderate" as const,
    chokingRisk: "low" as const,
    minAgeMonths: 6,
    prep6m: "strip",
    prep9m: "chop",
    prep12m: "slice",
    storageCategory: "produce_cooked",
  });
  const [egg, banana, oats, pear] = await db
    .insert(schema.foods)
    .values([food("egg", "Egg"), food("banana", "Banana"), food("oats", "Oats"), food("pear", "Pear")])
    .returning();
  const recipe = async (slug: string, title: string, foodIds: string[], ownerId: string | null = null) => {
    const [row] = await db.insert(schema.recipes).values({ slug, title, minAgeMonths: 6, prepMinutes: 5, ownerId }).returning();
    if (foodIds.length > 0) {
      await db.insert(schema.recipeIngredients).values(foodIds.map((foodId) => ({ recipeId: row!.id, foodId, quantityNote: "1" })));
    }
    return row!;
  };
  const muffins = await recipe("muffins", "Egg Muffins", [egg!.id, banana!.id]);
  const porridge = await recipe("porridge", "Porridge", [oats!.id, banana!.id]);
  const drizzle = await recipe("oil-drizzle", "Oil Drizzle", []);
  return { egg: egg!, banana: banana!, oats: oats!, pear: pear!, muffins, porridge, drizzle, recipe };
}

const [BREAKFAST, LUNCH, DINNER, SNACK] = DEFAULT_DAILY_MEALS.map((meal) => meal.id) as [string, string, string, string];
const DAY = "2026-11-02";
const TZ = "Europe/London";
const MISSING = "00000000-0000-4000-8000-000000000999";

describe("planning (ledger 903, step 3.1)", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let fx: Awaited<ReturnType<typeof seedFixtures>>;
  let parent: TestUser;
  let parentId: string;
  let babyId: string;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    fx = await seedFixtures(db);
    parent = await signUpUser(app);
    parentId = (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, parent.email)))[0]!.id;
    babyId = await newBaby(parent);
  });

  afterEach(async () => {
    await close();
  });

  const inject = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, user: TestUser | null = parent) =>
    app.inject({
      method,
      url,
      headers: user ? { cookie: user.cookie } : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  async function newBaby(user: TestUser, name = "Robin"): Promise<string> {
    const response = await inject("POST", "/api/babies", { name, birthDate: "2025-01-15" }, user);
    return response.json<Baby>().id;
  }
  const getPlan = (from: string, to = from, tz = TZ, baby = babyId, user: TestUser | null = parent) =>
    inject("GET", `/api/babies/${baby}/plan?from=${from}&to=${to}&tz=${encodeURIComponent(tz)}`, undefined, user);
  async function day(date = DAY): Promise<PlanDay> {
    const response = await getPlan(date);
    expect(response.statusCode, response.body).toBe(200);
    return planResponseSchema.parse(response.json()).days[0]!;
  }
  const put = (date: string, slotId: string, body: Record<string, unknown>, baby = babyId, user = parent) =>
    inject("PUT", `/api/babies/${baby}/plan/${date}/meals/${slotId}`, body, user);
  const add = (date: string, body: Record<string, unknown>, baby = babyId, user = parent) =>
    inject("POST", `/api/babies/${baby}/plan/${date}/meals`, body, user);
  const remove = (date: string, slotId: string, baby = babyId, user = parent) =>
    inject("DELETE", `/api/babies/${baby}/plan/${date}/meals/${slotId}`, undefined, user);
  const reorder = (date: string, slotIds: string[], baby = babyId, user: TestUser | null = parent) =>
    inject("PUT", `/api/babies/${baby}/plan/${date}/order`, { slotIds }, user);
  async function planned(date: string, slotId: string, items: PlannedItemInput[]): Promise<PlanDay> {
    const response = await put(date, slotId, { items });
    expect(response.statusCode, response.body).toBe(200);
    return planDaySchema.parse(response.json());
  }
  async function container(payload: Record<string, unknown>): Promise<string> {
    const response = await inject("POST", "/api/storage", { location: "fridge", ...payload });
    if (response.statusCode !== 201) throw new Error(`storage create failed: ${response.body}`);
    return response.json<CreateStorageItemResponse>().items[0]!.id;
  }
  const rows = async (date = DAY) =>
    db
      .select()
      .from(schema.plannedMeals)
      .where(and(eq(schema.plannedMeals.babyId, babyId), eq(schema.plannedMeals.date, date)))
      .orderBy(asc(schema.plannedMeals.position));
  const meal = (d: PlanDay, name: string) => d.meals.find((entry) => entry.name === name)!;

  describe("reading a plan", () => {
    it("a virtual day is the default daily meals, with their fixed ids as slots, and nothing stored", async () => {
      const response = await getPlan("2026-10-31", "2026-11-02", "Pacific/Kiritimati");
      expect(response.statusCode).toBe(200);
      const body = planResponseSchema.parse(response.json());
      expect(body.today).toBe(localDate(new Date(), "Pacific/Kiritimati"));
      expect(body.dailyMeals).toEqual(DEFAULT_DAILY_MEALS);
      expect(body.days.map((entry) => entry.date)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
      for (const entry of body.days) {
        expect(entry.planned).toBe(false);
        expect(entry.meals).toEqual(
          DEFAULT_DAILY_MEALS.map((daily, position) => ({ slotId: daily.id, name: daily.name, time: null, position, served: null, items: [] })),
        );
      }
      expect(await db.select().from(schema.plannedDays)).toEqual([]);
      expect(await db.select().from(schema.plannedMeals)).toEqual([]);
    });

    it("needs a tz and a range of 1 to 31 days (400), on a baby the caller owns (404), signed in (401)", async () => {
      expect((await inject("GET", `/api/babies/${babyId}/plan?from=${DAY}&to=${DAY}`)).statusCode).toBe(400);
      expect((await getPlan(DAY, DAY, "Not/AZone")).statusCode).toBe(400);
      expect((await getPlan("2026-10-01", "2026-11-01")).statusCode).toBe(400);
      expect((await getPlan("2026-10-01", "2026-10-31")).statusCode).toBe(200);
      expect((await getPlan(DAY, "2026-11-01")).statusCode).toBe(400);
      const stranger = await signUpUser(app, "Stranger");
      expect((await getPlan(DAY, DAY, TZ, babyId, stranger)).statusCode).toBe(404);
      expect((await getPlan(DAY, DAY, TZ, MISSING)).statusCode).toBe(404);
      expect((await getPlan(DAY, DAY, TZ, "not-a-uuid")).statusCode).toBe(404);
      expect((await getPlan(DAY, DAY, TZ, babyId, null)).statusCode).toBe(401);
    });
  });

  describe("materializing a day", () => {
    it("the first write gives the day one row per daily meal; the daily meal's id keeps finding its row", async () => {
      const after = await planned(DAY, LUNCH, [{ kind: "food", foodId: fx.egg.id }]);
      expect(after.planned).toBe(true);
      expect(after.meals.map((entry) => entry.name)).toEqual(["Breakfast", "Lunch", "Dinner", "Snack"]);
      const lunch = meal(after, "Lunch");
      expect(lunch.slotId).not.toBe(LUNCH);
      expect(lunch.items).toMatchObject([{ kind: "food", food: { id: fx.egg.id, name: "Egg" } }]);
      const stored = await rows();
      expect(stored.map((row) => [row.name, row.dailyMealId, row.position])).toEqual([
        ["Breakfast", BREAKFAST, 0],
        ["Lunch", LUNCH, 1],
        ["Dinner", DINNER, 2],
        ["Snack", SNACK, 3],
      ]);

      // A client still holding the virtual day (Copy to Lunch AND Dinner,
      // SPEC §3.2) writes by daily-meal id and lands on the same rows.
      const again = await planned(DAY, LUNCH, [{ kind: "food", foodId: fx.pear.id }]);
      expect(meal(again, "Lunch").slotId).toBe(lunch.slotId);
      expect(meal(again, "Lunch").items).toMatchObject([{ kind: "food", food: { id: fx.pear.id } }]);
      const byRowId = await planned(DAY, meal(again, "Dinner").slotId, [{ kind: "food", foodId: fx.oats.id }]);
      expect(meal(byRowId, "Dinner").items).toHaveLength(1);
      expect(await rows()).toHaveLength(4);
      expect(await db.select().from(schema.plannedDays)).toEqual([{ babyId, date: DAY }]);
      // The other days are still virtual.
      expect((await day("2026-11-03")).planned).toBe(false);
    });

    it("two writes racing on a virtual day give ONE set of rows, and both land", async () => {
      const responses = await Promise.all([
        put(DAY, LUNCH, { items: [{ kind: "food", foodId: fx.egg.id }] }),
        put(DAY, DINNER, { items: [{ kind: "food", foodId: fx.pear.id }] }),
        add(DAY, { name: "Supper" }),
        put(DAY, BREAKFAST, { name: "Brekkie" }),
      ]);
      expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 201, 200]);
      const stored = await rows();
      expect(stored.map((row) => row.name)).toEqual(["Brekkie", "Lunch", "Dinner", "Snack", "Supper"]);
      expect(stored.map((row) => row.position)).toEqual([0, 1, 2, 3, 4]);
      const after = await day();
      expect(meal(after, "Lunch").items).toHaveLength(1);
      expect(meal(after, "Dinner").items).toHaveLength(1);
    });

    it("the day's primary key refuses a second materialization outright", async () => {
      await planned(DAY, LUNCH, [{ kind: "food", foodId: fx.egg.id }]);
      await expect(db.insert(schema.plannedDays).values({ babyId, date: DAY })).rejects.toThrow();
    });

    it("every plan write locks the baby row FOR NO KEY UPDATE before any other lock or write", async () => {
      const writes = [
        () => put(DAY, LUNCH, { items: [{ kind: "food", foodId: fx.egg.id }] }),
        () => reorder(DAY, [SNACK, BREAKFAST, LUNCH, DINNER]),
        () => add(DAY, { name: "Supper" }),
        () => remove(DAY, SNACK),
        () => inject("PUT", `/api/babies/${babyId}/daily-meals`, { meals: [{ name: "Tea" }] }),
      ];
      for (const write of writes) {
        const seen: string[] = [];
        const original = PgDialect.prototype.sqlToQuery;
        const handle = vi.spyOn(PgDialect.prototype, "sqlToQuery").mockImplementation(function (this: PgDialect, ...args) {
          const query = original.apply(this, args);
          seen.push(query.sql.toLowerCase());
          return query;
        });
        try {
          expect((await write()).statusCode).toBeLessThan(300);
        } finally {
          handle.mockRestore();
        }
        const firstLock = seen.findIndex((sql) => / for (update|no key update|share|key share)$/.test(sql));
        const firstWrite = seen.findIndex((sql) => /^(insert|update|delete)/.test(sql));
        expect(seen[firstLock], seen.join("\n")).toMatch(/^select .* from "babies" .* for no key update$/);
        expect(firstWrite).toBeGreaterThan(firstLock);
      }
    });
  });

  it("a refused write answers once and reads nothing back (the live stack's double send)", async () => {
    await planned(DAY, LUNCH, [{ kind: "food", foodId: fx.egg.id }]);
    const stranger = await signUpUser(app, "Stranger");
    const readBack = async (write: () => Promise<{ statusCode: number }>) => {
      const seen: string[] = [];
      const original = PgDialect.prototype.sqlToQuery;
      const handle = vi.spyOn(PgDialect.prototype, "sqlToQuery").mockImplementation(function (this: PgDialect, ...args) {
        const query = original.apply(this, args);
        seen.push(query.sql.toLowerCase());
        return query;
      });
      try {
        return { status: (await write()).statusCode, read: seen.some((sql) => /^select .* from "planned_days"/.test(sql)) };
      } finally {
        handle.mockRestore();
      }
    };
    expect(await readBack(() => put(DAY, MISSING, { name: "Tea" }))).toEqual({ status: 409, read: false });
    expect(await readBack(() => remove(DAY, MISSING))).toEqual({ status: 409, read: false });
    expect(await readBack(() => add(DAY, { name: "Tea" }, babyId, stranger))).toEqual({ status: 404, read: false });
    expect(await readBack(() => put(DAY, LUNCH, { items: [{ kind: "food", foodId: MISSING }] }))).toEqual({ status: 400, read: false });
    // The probe is real: a write that lands reads its day back.
    expect(await readBack(() => put(DAY, LUNCH, { name: "Picnic" }))).toEqual({ status: 200, read: true });
  });

  describe("daily meals", () => {
    it("editing them changes virtual days only: planned and past days keep their own meals (804)", async () => {
      const past = "2026-09-30";
      await planned(past, BREAKFAST, [{ kind: "food", foodId: fx.egg.id }]);
      await planned(DAY, DINNER, [{ kind: "food", foodId: fx.pear.id }]);

      const response = await inject("PUT", `/api/babies/${babyId}/daily-meals`, {
        meals: [
          { id: BREAKFAST, name: "Breakfast", time: "07:30" },
          { name: "Morning snack", time: "10:00" },
          { id: LUNCH, name: "Lunch" },
        ],
      });
      expect(response.statusCode, response.body).toBe(200);
      const { dailyMeals } = dailyMealsResponseSchema.parse(response.json());
      expect(dailyMeals.map((entry) => [entry.name, entry.time])).toEqual([
        ["Breakfast", "07:30"],
        ["Morning snack", "10:00"],
        ["Lunch", null],
      ]);
      expect(dailyMeals[0]!.id).toBe(BREAKFAST);
      expect(dailyMeals[2]!.id).toBe(LUNCH);
      expect(dailyMeals[1]!.id).not.toBe(BREAKFAST);

      for (const date of [past, DAY]) {
        expect((await day(date)).meals.map((entry) => [entry.name, entry.time])).toEqual([
          ["Breakfast", null],
          ["Lunch", null],
          ["Dinner", null],
          ["Snack", null],
        ]);
      }
      const virtual = await day("2026-11-05");
      expect(virtual.planned).toBe(false);
      expect(virtual.meals.map((entry) => [entry.slotId, entry.name, entry.time])).toEqual(
        dailyMeals.map((entry) => [entry.id, entry.name, entry.time]),
      );
      // A new day materializes from the edited list.
      const fresh = await planned("2026-11-05", dailyMeals[1]!.id, [{ kind: "food", foodId: fx.oats.id }]);
      expect(fresh.meals.map((entry) => [entry.name, entry.time])).toEqual([
        ["Breakfast", "07:30"],
        ["Morning snack", "10:00"],
        ["Lunch", null],
      ]);
      expect(planResponseSchema.parse((await getPlan(DAY)).json()).dailyMeals).toEqual(dailyMeals);
    });

    it("holds 1 to 12 named meals with HH:MM times, on the caller's baby only", async () => {
      const send = (meals: unknown, baby = babyId, user = parent) => inject("PUT", `/api/babies/${baby}/daily-meals`, { meals }, user);
      expect((await send([])).statusCode).toBe(400);
      expect((await send(Array.from({ length: 13 }, (_, i) => ({ name: `Meal ${i}` })))).statusCode).toBe(400);
      expect((await send([{ name: "" }])).statusCode).toBe(400);
      expect((await send([{ name: "Tea", time: "25:00" }])).statusCode).toBe(400);
      const stranger = await signUpUser(app, "Stranger");
      expect((await send([{ name: "Tea" }], babyId, stranger)).statusCode).toBe(404);
      expect((await send([{ name: "Tea" }], MISSING)).statusCode).toBe(404);
      expect((await send(Array.from({ length: 12 }, (_, i) => ({ name: `Meal ${i}` })))).statusCode).toBe(200);
    });
  });

  describe("planned meals", () => {
    it("+ Add a meal appends one; a rename and a time change touch that day's meal only (810)", async () => {
      const added = await add(DAY, { name: "Supper", time: "19:45" });
      expect(added.statusCode, added.body).toBe(201);
      const supper = meal(planDaySchema.parse(added.json()), "Supper");
      expect(supper).toMatchObject({ time: "19:45", position: 4, served: null, items: [] });
      expect((await rows()).at(-1)?.dailyMealId).toBeNull();

      const renamed = await put(DAY, LUNCH, { name: "Picnic", time: "12:15" });
      expect(renamed.statusCode, renamed.body).toBe(200);
      // Already before Supper 19:45, so its new time keeps it there (925).
      expect(meal(planDaySchema.parse(renamed.json()), "Picnic")).toMatchObject({ time: "12:15", position: 1 });
      const cleared = planDaySchema.parse((await put(DAY, LUNCH, { time: null })).json());
      expect(meal(cleared, "Picnic").time).toBeNull();
      // The next day still says Lunch; so do Daily meals.
      expect(meal(await day("2026-11-03"), "Lunch")).toBeTruthy();
      expect((await add(DAY, { name: "x".repeat(41) })).statusCode).toBe(400);
      expect((await add(DAY, { name: "Tea", time: "7pm" })).statusCode).toBe(400);
      expect((await put(DAY, LUNCH, {})).statusCode).toBe(400);
    });

    describe("a time places the meal by the clock (ledger 925)", () => {
      const order = async (date = DAY) => (await day(date)).meals.map((entry) => `${entry.name}${entry.time ? ` ${entry.time}` : ""}`);
      // The review copy's Daily meals (2026-11-03), already out of time order.
      async function reviewCopyDailyMeals() {
        const response = await inject("PUT", `/api/babies/${babyId}/daily-meals`, {
          meals: [
            { name: "Breakfast", time: "09:39" },
            { name: "Snack", time: "08:39" },
            { name: "Lunch", time: "11:39" },
            { name: "Dinner", time: "14:39" },
            { name: "Late snack", time: "21:45" },
          ],
        });
        expect(response.statusCode, response.body).toBe(200);
      }

      it("+ Add a meal with a time lands before the first later meal, not last; the day keeps Daily meals' order otherwise", async () => {
        await reviewCopyDailyMeals();
        const added = await add(DAY, { name: "Brunch", time: "11:41" });
        expect(added.statusCode, added.body).toBe(201);
        const echo = planDaySchema.parse(added.json());
        expect(echo.meals.map((entry) => [entry.name, entry.position])).toEqual([
          ["Breakfast", 0],
          ["Snack", 1], // materializing keeps Daily meals' order, 08:39 after 09:39
          ["Lunch", 2],
          ["Brunch", 3],
          ["Dinner", 4],
          ["Late snack", 5],
        ]);
        expect((await rows()).map((row) => [row.name, row.position])).toEqual(echo.meals.map((entry) => [entry.name, entry.position]));
        // With items in the same write, too; equal times go after the existing one.
        await add(DAY, { name: "Tea", time: "14:39", items: [{ kind: "food", foodId: fx.pear.id }] });
        // No time: appended, as before.
        await add(DAY, { name: "Whenever" });
        expect(await order()).toEqual([
          "Breakfast 09:39",
          "Snack 08:39",
          "Lunch 11:39",
          "Brunch 11:41",
          "Dinner 14:39",
          "Tea 14:39",
          "Late snack 21:45",
          "Whenever",
        ]);
      });

      it("a time set or changed on a planned meal places it; the same time again, a rename or a cleared time moves nothing", async () => {
        await reviewCopyDailyMeals();
        const ids = Object.fromEntries((await day()).meals.map((entry) => [entry.name, entry.slotId]));
        // A virtual day, by the daily meal's id: it materializes, then moves.
        expect((await put(DAY, ids["Late snack"]!, { time: "10:00" })).statusCode).toBe(200);
        expect(await order()).toEqual(["Breakfast 09:39", "Snack 08:39", "Late snack 10:00", "Lunch 11:39", "Dinner 14:39"]);
        // Later than every other: after the last timed meal.
        const latest = await put(DAY, ids.Breakfast!, { time: "22:00" });
        expect(planDaySchema.parse(latest.json()).meals.map((entry) => entry.name)).toEqual(["Snack", "Late snack", "Lunch", "Dinner", "Breakfast"]);

        // Move up / Move down still win: re-sending the same time (Plan a
        // meal always sends it) with items, a rename, or clearing it keeps them.
        const now = await day();
        const slot = (name: string) => now.meals.find((entry) => entry.name === name)!.slotId;
        expect((await reorder(DAY, ["Dinner", "Snack", "Late snack", "Lunch", "Breakfast"].map(slot))).statusCode).toBe(200);
        expect((await put(DAY, slot("Dinner"), { name: "Dinner", time: "14:39", items: [{ kind: "food", foodId: fx.egg.id }] })).statusCode).toBe(200);
        expect((await put(DAY, slot("Lunch"), { name: "Picnic" })).statusCode).toBe(200);
        expect((await put(DAY, slot("Snack"), { time: null })).statusCode).toBe(200);
        expect(await order()).toEqual(["Dinner 14:39", "Snack", "Late snack 10:00", "Picnic 11:39", "Breakfast 22:00"]);
        // Then a changed time places it again; the untimed Snack stays put.
        expect((await put(DAY, slot("Dinner"), { time: "14:40" })).statusCode).toBe(200);
        expect(await order()).toEqual(["Snack", "Late snack 10:00", "Picnic 11:39", "Dinner 14:40", "Breakfast 22:00"]);
        expect((await rows()).map((row) => row.position)).toEqual([0, 1, 2, 3, 4]);
        // Daily meals and the next day keep their own order.
        expect(await order("2026-11-03")).toEqual(["Breakfast 09:39", "Snack 08:39", "Lunch 11:39", "Dinner 14:39", "Late snack 21:45"]);
      });

      it("with no other timed meal, or already in clock order, a time keeps its place; untimed meals never move", async () => {
        await add(DAY, { name: "Supper", time: "06:00" }); // the default meals have no times
        expect(await order()).toEqual(["Breakfast", "Lunch", "Dinner", "Snack", "Supper 06:00"]);
        // Already before Supper 06:00: stays, never hopping the untimed meals.
        expect((await put(DAY, LUNCH, { time: "05:00" })).statusCode).toBe(200);
        expect(await order()).toEqual(["Breakfast", "Lunch 05:00", "Dinner", "Snack", "Supper 06:00"]);
        // After it now: before Lunch, the first later one.
        expect((await put(DAY, DINNER, { time: "04:00" })).statusCode).toBe(200);
        expect(await order()).toEqual(["Breakfast", "Dinner 04:00", "Lunch 05:00", "Snack", "Supper 06:00"]);
      });
    });

    it("+ Add a meal can bring its items in the same write; a refused item adds no meal and leaves the day virtual (4.2)", async () => {
      const added = await add(DAY, { name: "Supper", items: [{ kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.banana.id] }] });
      expect(added.statusCode, added.body).toBe(201);
      expect(meal(planDaySchema.parse(added.json()), "Supper").items).toMatchObject([
        { kind: "recipe", recipe: { id: fx.muffins.id }, leftOut: [{ id: fx.banana.id }] },
      ]);
      // An empty list is a meal with nothing planned yet, as without `items`.
      const empty = await add(DAY, { name: "Tea", items: [] });
      expect(meal(planDaySchema.parse(empty.json()), "Tea").items).toEqual([]);

      const other = "2026-11-10";
      for (const items of [
        [{ kind: "recipe", recipeId: fx.drizzle.id }],
        [{ kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.oats.id] }],
        [{ kind: "storage", storageItemId: MISSING, servings: 1 }],
      ]) {
        const refused = await add(other, { name: "Supper", items });
        expect(refused.statusCode, refused.body).toBe(400);
      }
      expect((await day(other)).planned).toBe(false);
      expect(await rows(other)).toEqual([]);
    });

    it("Remove takes the meal off its day; a removed or unknown slot is 409 plan_changed; an emptied day stays empty", async () => {
      const response = await remove(DAY, SNACK);
      expect(response.statusCode, response.body).toBe(200);
      expect(planDaySchema.parse(response.json()).meals.map((entry) => entry.name)).toEqual(["Breakfast", "Lunch", "Dinner"]);

      for (const attempt of [remove(DAY, SNACK), put(DAY, SNACK, { name: "Tea" }), put(DAY, MISSING, { name: "Tea" })]) {
        const refused = await attempt;
        expect(refused.statusCode).toBe(409);
        expect(refused.json()).toMatchObject({ error: "plan_changed" });
      }
      // A slot of another day does not resolve here either.
      const other = meal(await planned("2026-11-03", LUNCH, [{ kind: "food", foodId: fx.egg.id }]), "Lunch");
      expect((await put(DAY, other.slotId, { name: "Tea" })).statusCode).toBe(409);
      // A refused write on a virtual day leaves it virtual.
      expect((await put("2026-11-09", MISSING, { name: "Tea" })).statusCode).toBe(409);
      expect((await day("2026-11-09")).planned).toBe(false);

      for (const slot of [BREAKFAST, LUNCH, DINNER]) expect((await remove(DAY, slot)).statusCode).toBe(200);
      const emptied = await day();
      expect(emptied).toEqual({ date: DAY, planned: true, meals: [] });
      const readded = planDaySchema.parse((await add(DAY, { name: "Tea" })).json());
      expect(readded.meals.map((entry) => [entry.name, entry.position])).toEqual([["Tea", 0]]);
    });

    it("Move up / Move down (909): the day's meals in a new order, that day only; a virtual day materializes; Daily meals stay", async () => {
      // A virtual day, by the daily meals' ids: it materializes, then moves.
      const moved = await reorder(DAY, [BREAKFAST, DINNER, LUNCH, SNACK]);
      expect(moved.statusCode, moved.body).toBe(200);
      const echo = planDaySchema.parse(moved.json());
      expect(echo.planned).toBe(true);
      expect(echo.meals.map((entry) => [entry.name, entry.position])).toEqual([
        ["Breakfast", 0],
        ["Dinner", 1],
        ["Lunch", 2],
        ["Snack", 3],
      ]);
      expect((await day()).meals.map((entry) => entry.name)).toEqual(["Breakfast", "Dinner", "Lunch", "Snack"]);
      expect((await rows()).map((row) => row.name)).toEqual(["Breakfast", "Dinner", "Lunch", "Snack"]);
      // The next day and Daily meals keep their order.
      expect((await day("2026-11-03")).meals.map((entry) => entry.name)).toEqual(["Breakfast", "Lunch", "Dinner", "Snack"]);
      const plan = planResponseSchema.parse((await getPlan(DAY)).json());
      expect(plan.dailyMeals.map((entry) => entry.name)).toEqual(["Breakfast", "Lunch", "Dinner", "Snack"]);

      // Now by row ids, mixed with a daily meal's id; an added meal moves too.
      const supper = meal(planDaySchema.parse((await add(DAY, { name: "Supper" })).json()), "Supper");
      const ids = Object.fromEntries((await day()).meals.map((entry) => [entry.name, entry.slotId]));
      const again = await reorder(DAY, [supper.slotId, ids.Breakfast!, LUNCH, ids.Dinner!, ids.Snack!]);
      expect(again.statusCode, again.body).toBe(200);
      expect((await day()).meals.map((entry) => entry.name)).toEqual(["Supper", "Breakfast", "Lunch", "Dinner", "Snack"]);
    });

    it("a served meal moves like any other (909)", async () => {
      const lunch = meal(await planned(DAY, LUNCH, [{ kind: "food", foodId: fx.egg.id }]), "Lunch");
      const logged = await inject("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "food", foodId: fx.egg.id }] });
      const mealId = logged.json<{ id: string }>().id;
      await db.update(schema.plannedMeals).set({ servedMealId: mealId }).where(eq(schema.plannedMeals.id, lunch.slotId));
      expect((await reorder(DAY, [LUNCH, BREAKFAST, DINNER, SNACK])).statusCode).toBe(200);
      const first = (await day()).meals[0]!;
      expect(first).toMatchObject({ name: "Lunch", position: 0, served: { mealId } });
    });

    it("a stale set of meals is 409 plan_changed and writes nothing; a bad body is 400 (909)", async () => {
      await planned(DAY, LUNCH, [{ kind: "food", foodId: fx.egg.id }]);
      const before = (await rows()).map((row) => [row.id, row.position]);
      for (const slotIds of [
        [BREAKFAST, LUNCH, DINNER], // one missing (another device added or kept one)
        [BREAKFAST, LUNCH, DINNER, SNACK, MISSING], // one too many
        [BREAKFAST, LUNCH, DINNER, MISSING], // an unknown one
      ]) {
        const refused = await reorder(DAY, slotIds);
        expect(refused.statusCode, refused.body).toBe(409);
        expect(refused.json()).toMatchObject({ error: "plan_changed" });
      }
      // A daily meal's id and its row's id name one meal: sent both, it is stale.
      const lunchRow = (await rows()).find((row) => row.name === "Lunch")!;
      expect((await reorder(DAY, [BREAKFAST, LUNCH, lunchRow.id, DINNER])).statusCode).toBe(409);
      // Every meal once plus one named twice (5 ids for 4 meals) is stale too, not a gap in positions.
      expect((await reorder(DAY, [BREAKFAST, LUNCH, lunchRow.id, DINNER, SNACK])).statusCode).toBe(409);
      expect((await rows()).map((row) => [row.id, row.position])).toEqual(before);
      // A refused write on a virtual day leaves it virtual.
      expect((await reorder("2026-11-09", [BREAKFAST, LUNCH])).statusCode).toBe(409);
      expect((await day("2026-11-09")).planned).toBe(false);
      expect((await reorder(DAY, [])).statusCode).toBe(400);
      expect((await reorder(DAY, [LUNCH, LUNCH, DINNER, SNACK])).statusCode).toBe(400);
    });

    it("every write is the caller's own baby: 404 for a stranger or an unknown baby, and nothing is written", async () => {
      const stranger = await signUpUser(app, "Stranger");
      const attempts = [
        put(DAY, LUNCH, { name: "Tea" }, babyId, stranger),
        add(DAY, { name: "Tea" }, babyId, stranger),
        remove(DAY, LUNCH, babyId, stranger),
        reorder(DAY, [BREAKFAST, LUNCH, DINNER, SNACK], babyId, stranger),
        reorder(DAY, [BREAKFAST, LUNCH, DINNER, SNACK], MISSING),
        put(DAY, LUNCH, { name: "Tea" }, MISSING),
        add(DAY, { name: "Tea" }, "not-a-uuid"),
        put("2026-02-30", LUNCH, { name: "Tea" }),
      ];
      for (const attempt of attempts) expect((await attempt).statusCode).toBe(404);
      expect(await db.select().from(schema.plannedDays)).toEqual([]);
      expect((await inject("PUT", `/api/babies/${babyId}/plan/${DAY}/meals/${LUNCH}`, { name: "Tea" }, null)).statusCode).toBe(401);
      expect((await reorder(DAY, [BREAKFAST, LUNCH, DINNER, SNACK], babyId, null)).statusCode).toBe(401);
    });
  });

  describe("planned items", () => {
    it("holds foods, recipes with leave-outs and containers, hydrated like the plate", async () => {
      // Prepared on a fixed day: this test runs on the real clock, and a Best by
      // before the prepared day is refused (it started failing on 2026-11-05).
      const box = await container({ foodIds: [fx.pear.id, fx.oats.id], servingsTotal: 3, bestBy: "2026-11-04", preparedAt: "2026-11-01T12:00:00.000Z" });
      const after = await planned(DAY, LUNCH, [
        { kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.banana.id, fx.banana.id] },
        { kind: "food", foodId: fx.egg.id },
        { kind: "storage", storageItemId: box, servings: 2 },
      ]);
      expect(meal(after, "Lunch").items).toMatchObject([
        { kind: "recipe", recipe: { id: fx.muffins.id, title: "Egg Muffins" }, leftOut: [{ id: fx.banana.id, name: "Banana" }] },
        { kind: "food", food: { id: fx.egg.id, name: "Egg", slug: "egg" } },
        {
          kind: "storage",
          servings: 2,
          container: { id: box, status: "active", servingsLeft: 3, servingsTotal: 3, bestBy: "2026-11-04", location: "fridge" },
        },
      ]);
      const [recipeRow] = await db.select().from(schema.plannedItems).where(eq(schema.plannedItems.recipeId, fx.muffins.id));
      expect(recipeRow!.leftOutFoodIds).toEqual([fx.banana.id]);

      // A PUT replaces the list; [] clears it.
      const swapped = await planned(DAY, LUNCH, [{ kind: "food", foodId: fx.oats.id }]);
      expect(meal(swapped, "Lunch").items).toMatchObject([{ kind: "food", food: { id: fx.oats.id } }]);
      expect(await db.select().from(schema.plannedItems)).toHaveLength(1);
      expect(meal(await planned(DAY, LUNCH, []), "Lunch").items).toEqual([]);
      expect(await db.select().from(schema.plannedItems)).toEqual([]);
    });

    it("a leave-out the recipe has lost since is not shown, and the same plate saves again", async () => {
      await planned(DAY, LUNCH, [{ kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.banana.id] }]);
      await db
        .delete(schema.recipeIngredients)
        .where(and(eq(schema.recipeIngredients.recipeId, fx.muffins.id), eq(schema.recipeIngredients.foodId, fx.banana.id)));
      const item = meal(await day(), "Lunch").items[0]!;
      expect(item).toMatchObject({ kind: "recipe", leftOut: [] });
      // The client echoes what it was shown: no stale id, so no 400.
      await planned(DAY, LUNCH, [{ kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [] }]);
    });

    it("refuses what Serve would refuse, writing nothing", async () => {
      await planned(DAY, LUNCH, [{ kind: "food", foodId: fx.egg.id }]);
      const stranger = await signUpUser(app, "Stranger");
      const [theirs] = await db
        .insert(schema.foods)
        .values({ ...(await db.select().from(schema.foods).where(eq(schema.foods.id, fx.pear.id)))[0]!, id: undefined, slug: "theirs", ownerId: (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, stranger.email)))[0]!.id })
        .returning();
      const theirBox = (
        await inject("POST", "/api/storage", { location: "fridge", foodIds: [fx.pear.id] }, stranger)
      ).json<CreateStorageItemResponse>().items[0]!.id;
      const cases: [PlannedItemInput[], number, unknown][] = [
        [[{ kind: "food", foodId: theirs!.id }], 400, { foodIds: "unknown food" }],
        [[{ kind: "food", foodId: MISSING }], 400, { foodIds: "unknown food" }],
        [[{ kind: "recipe", recipeId: MISSING }], 400, { recipeIds: "unknown recipe" }],
        [[{ kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.oats.id] }], 400, { leftOutFoodIds: "not an ingredient of this recipe", recipeId: fx.muffins.id, foodIds: [fx.oats.id] }],
        [[{ kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.egg.id, fx.banana.id] }], 400, { items: PLATE_NOTHING_COUNTS }],
        [[{ kind: "recipe", recipeId: fx.drizzle.id }], 400, { items: PLATE_NOTHING_COUNTS }],
        [[{ kind: "storage", storageItemId: theirBox, servings: 1 }], 400, { items: "unknown storage item" }],
      ];
      for (const [items, status, details] of cases) {
        const response = await put(DAY, LUNCH, { items });
        expect(response.statusCode, JSON.stringify(items)).toBe(status);
        expect(response.json().details).toMatchObject(details as object);
      }
      // Zod: a container needs servings; each item once.
      expect((await put(DAY, LUNCH, { items: [{ kind: "storage", storageItemId: theirBox }] })).statusCode).toBe(400);
      expect(
        (await put(DAY, LUNCH, { items: [{ kind: "food", foodId: fx.egg.id }, { kind: "food", foodId: fx.egg.id }] })).statusCode,
      ).toBe(400);
      // Nothing changed.
      expect(meal(await day(), "Lunch").items).toMatchObject([{ kind: "food", food: { id: fx.egg.id } }]);
      // An ingredient-less recipe beside a food is fine: something counts.
      await planned(DAY, LUNCH, [{ kind: "recipe", recipeId: fx.drizzle.id }, { kind: "food", foodId: fx.egg.id }]);
    });

    it("a finished container cannot be added (409), but one already planned stays", async () => {
      const box = await container({ foodIds: [fx.pear.id], servingsTotal: 2 });
      await planned(DAY, LUNCH, [{ kind: "storage", storageItemId: box, servings: 2 }]);
      expect((await inject("PATCH", `/api/storage/${box}`, { status: "finished" })).statusCode).toBe(200);

      const kept = await planned(DAY, LUNCH, [
        { kind: "storage", storageItemId: box, servings: 1 },
        { kind: "food", foodId: fx.egg.id },
      ]);
      expect(meal(kept, "Lunch").items[0]).toMatchObject({ kind: "storage", servings: 1, container: { status: "finished" } });
      const refused = await put(DAY, DINNER, { items: [{ kind: "storage", storageItemId: box, servings: 1 }] });
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ error: "conflict", storageItemId: box });
      // A plan may ask for more than is left: that is a flag, not a refusal.
      const small = await container({ foodIds: [fx.oats.id], servingsTotal: 1 });
      await planned(DAY, DINNER, [{ kind: "storage", storageItemId: small, servings: 3 }]);
    });

    it("a custom food deleted since it was planned stays on that meal, shown as deleted, and cannot be added elsewhere", async () => {
      const [custom] = await db
        .insert(schema.foods)
        .values({ ...(await db.select().from(schema.foods).where(eq(schema.foods.id, fx.pear.id)))[0]!, id: undefined, slug: "my-mash", name: "My mash", ownerId: parentId })
        .returning();
      await planned(DAY, LUNCH, [{ kind: "food", foodId: custom!.id }]);
      expect((await inject("DELETE", `/api/foods/${custom!.id}`)).statusCode).toBe(204);
      expect(meal(await day(), "Lunch").items).toMatchObject([{ kind: "food", food: { id: custom!.id, deleted: true } }]);
      await planned(DAY, LUNCH, [{ kind: "food", foodId: custom!.id }, { kind: "food", foodId: fx.egg.id }]);
      expect((await put(DAY, DINNER, { items: [{ kind: "food", foodId: custom!.id }] })).statusCode).toBe(400);
    });

    it("a served meal keeps its items (409 already_served), may still be renamed, and un-serves when its meal is deleted", async () => {
      const lunch = meal(await planned(DAY, LUNCH, [{ kind: "food", foodId: fx.egg.id }]), "Lunch");
      const logged = await inject("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "food", foodId: fx.egg.id }] });
      expect(logged.statusCode).toBe(201);
      const mealId = logged.json<{ id: string }>().id;
      // Linking is the serve step's job (SPEC §3.5); stand it in directly.
      await db.update(schema.plannedMeals).set({ servedMealId: mealId }).where(eq(schema.plannedMeals.id, lunch.slotId));

      const served = meal(await day(), "Lunch").served;
      expect(served?.mealId).toBe(mealId);
      expect(Date.parse(served!.servedAt)).not.toBeNaN();
      const refused = await put(DAY, LUNCH, { items: [] });
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toEqual({ error: "already_served", mealId });
      expect((await put(DAY, LUNCH, { name: "Picnic" })).statusCode).toBe(200);

      expect((await inject("DELETE", `/api/meals/${mealId}`)).statusCode).toBe(204);
      expect(meal(await day(), "Picnic")).toMatchObject({ served: null, items: [{ kind: "food" }] });
      // Removing a served planned meal leaves the logged meal alone.
      const again = await inject("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "food", foodId: fx.egg.id }] });
      const againId = again.json<{ id: string }>().id;
      await db.update(schema.plannedMeals).set({ servedMealId: againId }).where(eq(schema.plannedMeals.id, lunch.slotId));
      expect((await remove(DAY, lunch.slotId)).statusCode).toBe(200);
      expect((await inject("GET", `/api/meals/${againId}`)).statusCode).toBe(200);
    });
  });

  describe("cascades", () => {
    async function planEverything(date = DAY) {
      const custom = await fx.recipe(`mine-${date}`, "My Bake", [fx.egg.id, fx.oats.id], parentId);
      const box = await container({ foodIds: [fx.pear.id], servingsTotal: 2 });
      await planned(date, LUNCH, [
        { kind: "recipe", recipeId: custom.id, leftOutFoodIds: [fx.oats.id] },
        { kind: "food", foodId: fx.egg.id },
        { kind: "storage", storageItemId: box, servings: 1 },
      ]);
      return { custom, box };
    }
    const count = async () => ({
      days: (await db.select().from(schema.plannedDays)).length,
      meals: (await db.select().from(schema.plannedMeals)).length,
      items: (await db.select().from(schema.plannedItems)).length,
    });

    it("deleting a custom recipe drops it from plans silently (chair §10.5); the rest of the meal stays", async () => {
      const { custom } = await planEverything();
      expect((await inject("DELETE", `/api/recipes/${custom.id}`)).statusCode).toBe(204);
      expect(meal(await day(), "Lunch").items.map((item) => item.kind)).toEqual(["food", "storage"]);
    });

    it("the delete question's count: every planned meal holding the recipe, any day, any of the owner's babies (ledger 937)", async () => {
      const countOf = async (id: string, user: TestUser | null = parent) => inject("GET", `/api/recipes/${id}/plan-count`, undefined, user);
      const { custom } = await planEverything();
      // A meal is counted, not items; a past day and a sibling's plan count.
      await planned(DAY, DINNER, [{ kind: "recipe", recipeId: custom.id }, { kind: "food", foodId: fx.pear.id }]);
      await planned("2026-10-20", BREAKFAST, [{ kind: "recipe", recipeId: custom.id }]);
      const sibling = await newBaby(parent, "Sam");
      expect((await put(DAY, SNACK, { items: [{ kind: "recipe", recipeId: custom.id }] }, sibling)).statusCode).toBe(200);
      const response = await countOf(custom.id);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual({ plannedMealCount: 4, mealCount: 0, storageCount: 0 });

      // Not planned anywhere: 0. Someone else's, a catalog recipe, or no session: no count.
      const unplanned = await fx.recipe("mine-unplanned", "Spare", [fx.egg.id], parentId);
      expect((await countOf(unplanned.id)).json()).toEqual({ plannedMealCount: 0, mealCount: 0, storageCount: 0 });
      expect((await countOf(custom.id, await signUpUser(app))).statusCode).toBe(404);
      expect((await countOf(fx.muffins.id)).statusCode).toBe(404);
      expect((await countOf(custom.id, null)).statusCode).toBe(401);

      // The delete takes it off all four, as the question says.
      expect((await inject("DELETE", `/api/recipes/${custom.id}`)).statusCode).toBe(204);
      expect(await db.select().from(schema.plannedItems).where(eq(schema.plannedItems.recipeId, custom.id))).toEqual([]);
    });

    it("deleting a baby takes its plan and daily meals, and leaves a sibling's alone", async () => {
      const sibling = await newBaby(parent, "Sam");
      await planEverything();
      await put(DAY, LUNCH, { items: [{ kind: "food", foodId: fx.egg.id }] }, sibling);
      await inject("PUT", `/api/babies/${babyId}/daily-meals`, { meals: [{ name: "Tea" }] });
      expect(await count()).toEqual({ days: 2, meals: 8, items: 4 });
      expect((await inject("DELETE", `/api/babies/${babyId}`)).statusCode).toBe(204);
      expect(await count()).toEqual({ days: 1, meals: 4, items: 1 });
    });

    it("deleting the account takes every plan row, served meals included", async () => {
      const { box } = await planEverything();
      await planEverything("2026-11-03");
      const logged = await inject("POST", `/api/babies/${babyId}/meals`, { items: [{ kind: "storage", storageItemId: box, servings: 1 }] });
      expect(logged.statusCode, logged.body).toBe(201);
      await db
        .update(schema.plannedMeals)
        .set({ servedMealId: logged.json<{ id: string }>().id })
        .where(and(eq(schema.plannedMeals.date, DAY), eq(schema.plannedMeals.dailyMealId, LUNCH)));
      const response = await inject("DELETE", "/api/account", { confirm: ACCOUNT_DELETE_CONFIRMATION, password: parent.password });
      expect(response.statusCode, response.body).toBe(204);
      expect(await count()).toEqual({ days: 0, meals: 0, items: 0 });
    });

    it("Replace moves a custom food's planned uses and leave-outs onto the replacement, merging a duplicate", async () => {
      const values = (await db.select().from(schema.foods).where(eq(schema.foods.id, fx.pear.id)))[0]!;
      const [custom] = await db.insert(schema.foods).values({ ...values, id: undefined, slug: "my-egg", name: "My egg", ownerId: parentId }).returning();
      const bake = await fx.recipe("my-bake", "My Bake", [custom!.id, fx.oats.id], parentId);
      await planned(DAY, LUNCH, [{ kind: "food", foodId: custom!.id }, { kind: "food", foodId: fx.egg.id }]);
      await planned(DAY, DINNER, [
        { kind: "food", foodId: custom!.id },
        { kind: "recipe", recipeId: bake.id, leftOutFoodIds: [custom!.id] },
      ]);
      const response = await inject("POST", `/api/foods/${custom!.id}/replace`, { replacementId: fx.egg.id });
      expect(response.statusCode, response.body).toBe(200);

      const after = await day();
      expect(meal(after, "Lunch").items).toMatchObject([{ kind: "food", food: { id: fx.egg.id } }]);
      expect(meal(after, "Lunch").items).toHaveLength(1);
      expect(meal(after, "Dinner").items).toMatchObject([
        { kind: "food", food: { id: fx.egg.id } },
        { kind: "recipe", recipe: { id: bake.id }, leftOut: [{ id: fx.egg.id }] },
      ]);
      expect(await count()).toEqual({ days: 1, meals: 4, items: 3 });
    });
  });
});
