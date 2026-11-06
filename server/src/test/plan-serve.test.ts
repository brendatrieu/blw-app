// Ledger 903, step 3.2 (plan SPEC §3.3-3.5, §7, §8 row 3): the plan's flags
// (computed with the caller's tz, across babies), Copy to… with Keep it /
// Replace it and a dry run, the one-tap Serve (today only, exactly as
// planned or a 409 that writes nothing), the plate's own Serve of a planned
// meal, and the plan in the account export.
//
// The clock is pinned (Date only) to 2026-10-31 19:00 UTC: noon in Los
// Angeles the day before it leaves PDT, 19:00 in London, and already
// 1 November in Kiritimati (UTC+14).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import {
  DEFAULT_DAILY_MEALS,
  accountExportSchema,
  copyPlanResponseSchema,
  planDaySchema,
  planResponseSchema,
  plannedServedAt,
  type Baby,
  type CreateStorageItemResponse,
  type MealItem,
  type PlanDay,
  type PlannedItemInput,
} from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

const NOW = new Date("2026-10-31T19:00:00.000Z");
const TZ = "America/Los_Angeles";
const TODAY = "2026-10-31";
const [BREAKFAST, LUNCH, DINNER, SNACK] = DEFAULT_DAILY_MEALS.map((meal) => meal.id) as [string, string, string, string];

async function seedFixtures(db: Database) {
  // Cooked produce keeps 48 hours in the fridge: a container prepared at NOW
  // is good until 2026-11-02 19:00 UTC, 11:00 PST in Los Angeles.
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
  const recipe = async (slug: string, title: string, foodIds: string[]) => {
    const [row] = await db.insert(schema.recipes).values({ slug, title, minAgeMonths: 6, prepMinutes: 5 }).returning();
    await db.insert(schema.recipeIngredients).values(foodIds.map((foodId) => ({ recipeId: row!.id, foodId, quantityNote: "1" })));
    return row!;
  };
  const muffins = await recipe("muffins", "Egg Muffins", [egg!.id, banana!.id]);
  const porridge = await recipe("porridge", "Porridge", [oats!.id, banana!.id]);
  return { egg: egg!, banana: banana!, oats: oats!, pear: pear!, muffins, porridge };
}

describe("planning: flags, Copy, Serve, export (ledger 903, step 3.2)", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let fx: Awaited<ReturnType<typeof seedFixtures>>;
  let parent: TestUser;
  let parentId: string;
  let babyId: string;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    ({ app, db, close } = await createTestApp());
    fx = await seedFixtures(db);
    parent = await signUpUser(app);
    parentId = (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, parent.email)))[0]!.id;
    babyId = await newBaby("Robin");
  });

  afterEach(async () => {
    await close();
    vi.useRealTimers();
  });

  const inject = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, user: TestUser = parent) =>
    app.inject({ method, url, headers: { cookie: user.cookie }, ...(payload === undefined ? {} : { payload: payload as object }) });
  async function newBaby(name: string, user: TestUser = parent): Promise<string> {
    return (await inject("POST", "/api/babies", { name, birthDate: "2025-01-15" }, user)).json<Baby>().id;
  }
  async function day(date: string, tz = TZ, baby = babyId): Promise<PlanDay> {
    const response = await inject("GET", `/api/babies/${baby}/plan?from=${date}&to=${date}&tz=${encodeURIComponent(tz)}`);
    expect(response.statusCode, response.body).toBe(200);
    return planResponseSchema.parse(response.json()).days[0]!;
  }
  const put = (date: string, slotId: string, body: Record<string, unknown>, baby = babyId) =>
    inject("PUT", `/api/babies/${baby}/plan/${date}/meals/${slotId}`, body);
  async function planned(date: string, slotId: string, items: PlannedItemInput[], baby = babyId, time?: string): Promise<PlanDay> {
    const response = await put(date, slotId, { items, ...(time ? { time } : {}) }, baby);
    expect(response.statusCode, response.body).toBe(200);
    return planDaySchema.parse(response.json());
  }
  const slotOf = (d: PlanDay, name: string) => d.meals.find((entry) => entry.name === name)!;
  const copy = (body: Record<string, unknown>, baby = babyId, user: TestUser = parent) =>
    inject("POST", `/api/babies/${baby}/plan/copy`, { tz: TZ, ...body }, user);
  const serve = (date: string, slotId: string, tz = TZ, baby = babyId) =>
    inject("POST", `/api/babies/${baby}/plan/${date}/meals/${slotId}/serve`, { tz });
  async function container(payload: Record<string, unknown>): Promise<string> {
    const response = await inject("POST", "/api/storage", { location: "fridge", ...payload });
    if (response.statusCode !== 201) throw new Error(`storage create failed: ${response.body}`);
    return response.json<CreateStorageItemResponse>().items[0]!.id;
  }
  const stored = async (id: string) =>
    (await db.select().from(schema.storageItems).where(eq(schema.storageItems.id, id)))[0]!;
  const mealCount = async () => (await db.select({ id: schema.meals.id }).from(schema.meals)).length;
  const flagsOf = (d: PlanDay, name: string) =>
    slotOf(d, name).items.map((item) => (item.kind === "storage" ? item.flags : undefined));
  async function customFood(name: string) {
    const [pear] = await db.select().from(schema.foods).where(eq(schema.foods.id, fx.pear.id));
    const [row] = await db
      .insert(schema.foods)
      .values({ ...pear!, id: undefined, slug: name.toLowerCase().replace(/ /g, "-"), name, ownerId: parentId })
      .returning();
    return row!;
  }

  describe("flags on the plan (SPEC §3.4)", () => {
    it("may run out counts every baby's unserved meals from today on, in plan order; past and served ones do not", async () => {
      const sibling = await newBaby("Wren");
      const muffins = await container({ recipeId: fx.muffins.id, servingsTotal: 3 });
      const use = (servings: number): PlannedItemInput[] => [{ kind: "storage", storageItemId: muffins, servings }];
      await planned("2026-10-30", LUNCH, use(9)); // yesterday: not counted
      const lunch = slotOf(await planned(TODAY, LUNCH, use(2)), "Lunch");
      await planned("2026-11-01", BREAKFAST, use(2), sibling);

      expect(flagsOf(await day(TODAY), "Lunch")).toEqual([[]]);
      expect(flagsOf(await day("2026-11-01", TZ, sibling), "Breakfast")).toEqual([[{ kind: "may_run_out" }]]);
      expect(flagsOf(await day("2026-10-30"), "Lunch")).toEqual([[]]);

      // Serving today's Lunch takes 2 of 3: the 2 planned tomorrow still
      // exceed the 1 left; 1 planned does not.
      expect((await serve(TODAY, lunch.slotId)).statusCode).toBe(201);
      expect((await stored(muffins)).servingsLeft).toBe(1);
      expect(flagsOf(await day("2026-11-01", TZ, sibling), "Breakfast")).toEqual([[{ kind: "may_run_out" }]]);
      await planned("2026-11-01", BREAKFAST, use(1), sibling);
      expect(flagsOf(await day("2026-11-01", TZ, sibling), "Breakfast")).toEqual([[]]);
      expect(flagsOf(await day(TODAY), "Lunch")).toEqual([[]]); // served: no flags
    });

    it("a finished or discarded container gets its own flag instead of may run out", async () => {
      const finished = await container({ foodIds: [fx.egg.id], servingsTotal: 1 });
      const discarded = await container({ foodIds: [fx.pear.id], servingsTotal: 1 });
      await planned("2026-11-01", LUNCH, [
        { kind: "storage", storageItemId: finished, servings: 3 },
        { kind: "storage", storageItemId: discarded, servings: 3 },
      ]);
      expect(flagsOf(await day("2026-11-01"), "Lunch")).toEqual([[{ kind: "may_run_out" }], [{ kind: "may_run_out" }]]);
      expect((await inject("PATCH", `/api/storage/${finished}`, { status: "finished" })).statusCode).toBe(200);
      expect((await inject("PATCH", `/api/storage/${discarded}`, { status: "discarded" })).statusCode).toBe(200);
      expect(flagsOf(await day("2026-11-01"), "Lunch")).toEqual([
        [{ kind: "container_gone", status: "finished" }],
        [{ kind: "container_gone", status: "discarded" }],
      ]);
    });

    it("Best by is calendar days and beats the window; use within is checked at the meal's time in the caller's zone (DST)", async () => {
      const pear = await container({ foodIds: [fx.pear.id], bestBy: "2026-11-02" });
      const soup = await container({ foodIds: [fx.oats.id] }); // window ends 2026-11-02 19:00 UTC
      const item = (id: string): PlannedItemInput[] => [{ kind: "storage", storageItemId: id, servings: 1 }];
      await planned("2026-11-02", BREAKFAST, item(soup), babyId, "10:59");
      await planned("2026-11-02", LUNCH, item(soup), babyId, "11:00");
      await planned("2026-11-02", DINNER, item(pear), babyId, "23:30");
      await planned("2026-11-02", SNACK, item(soup)); // untimed: the start of the day
      await planned("2026-11-03", BREAKFAST, item(pear));

      // Los Angeles left PDT on 1 November: 11:00 on the 2nd is 19:00 UTC.
      const la = await day("2026-11-02");
      expect(flagsOf(la, "Breakfast")).toEqual([[]]);
      expect(flagsOf(la, "Lunch")).toEqual([[{ kind: "past_use_within" }]]);
      expect(flagsOf(la, "Snack")).toEqual([[]]);
      expect(flagsOf(la, "Dinner")).toEqual([[]]); // the Best by day itself is fine
      expect(flagsOf(await day("2026-11-03"), "Breakfast")).toEqual([[{ kind: "past_best_by" }]]);
      // In London 11:00 is 11:00 UTC, well inside the window.
      expect(flagsOf(await day("2026-11-02", "Europe/London"), "Lunch")).toEqual([[]]);
    });

    it("a plain write's echo carries no flags (it sends no tz); the read does", async () => {
      const box = await container({ foodIds: [fx.egg.id], servingsTotal: 1 });
      const echo = await planned("2026-11-01", LUNCH, [{ kind: "storage", storageItemId: box, servings: 2 }]);
      expect(slotOf(echo, "Lunch").items[0]).not.toHaveProperty("flags");
      expect(flagsOf(await day("2026-11-01"), "Lunch")).toEqual([[{ kind: "may_run_out" }]]);
    });
  });

  describe("Copy to… (SPEC §3.3)", () => {
    async function setUpWeek() {
      const source = slotOf(await planned("2026-11-01", LUNCH, [{ kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.banana.id] }, { kind: "food", foodId: fx.pear.id }]), "Lunch");
      await planned("2026-11-03", BREAKFAST, [{ kind: "food", foodId: fx.oats.id }]);
      await planned("2026-11-03", LUNCH, [{ kind: "food", foodId: fx.banana.id }]);
      const today = slotOf(await planned(TODAY, DINNER, [{ kind: "food", foodId: fx.egg.id }]), "Dinner");
      expect((await serve(TODAY, today.slotId)).statusCode).toBe(201);
      return {
        source,
        body: {
          source: { date: "2026-11-01", slotId: source.slotId },
          targets: [
            { date: "2026-11-02", slotId: LUNCH, onClash: "keep" }, // a virtual day…
            { date: "2026-11-02", slotId: DINNER, onClash: "keep" }, // …twice (814)
            { date: "2026-11-03", slotId: BREAKFAST, onClash: "keep" },
            { date: "2026-11-03", slotId: LUNCH, onClash: "replace" },
            { date: TODAY, slotId: DINNER, onClash: "replace" },
          ],
        },
      };
    }
    const kinds = (d: PlanDay, name: string) =>
      slotOf(d, name).items.map((item) => (item.kind === "food" ? item.food.name : item.kind === "recipe" ? `${item.recipe.title} -${item.leftOut.map((f) => f.name)}` : "box"));

    it("fills empty meals, keeps or replaces a planned one as asked, never touches a served one", async () => {
      const { body } = await setUpWeek();
      const response = await copy(body);
      expect(response.statusCode, response.body).toBe(200);
      const result = copyPlanResponseSchema.parse(response.json());
      expect(result.filled).toBe(3);
      expect(result.skipped).toEqual([
        { date: "2026-11-03", slotId: BREAKFAST, reason: "kept" },
        { date: TODAY, slotId: DINNER, reason: "served" },
      ]);
      expect(result.warnings).toEqual([]);
      expect(result.days.map((d) => d.date)).toEqual([TODAY, "2026-11-02", "2026-11-03"]);

      const copied = ["Egg Muffins -Banana", "Pear"];
      const tuesday = await day("2026-11-02");
      expect(tuesday.planned).toBe(true);
      expect(kinds(tuesday, "Lunch")).toEqual(copied);
      expect(kinds(tuesday, "Dinner")).toEqual(copied);
      expect(kinds(tuesday, "Breakfast")).toEqual([]);
      const wednesday = await day("2026-11-03");
      expect(kinds(wednesday, "Breakfast")).toEqual(["Oats"]);
      expect(kinds(wednesday, "Lunch")).toEqual(copied);
      expect(kinds(await day(TODAY), "Dinner")).toEqual(["Egg"]);
      expect(result.days[1]).toEqual(tuesday);
    });

    it("a dry run answers the same and writes nothing: virtual days stay virtual", async () => {
      const { body } = await setUpWeek();
      const before = await db.select().from(schema.plannedItems);
      const response = await copy({ ...body, dryRun: true });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({ filled: 3, skipped: [{ reason: "kept" }, { reason: "served" }], warnings: [], days: [] });
      expect(await db.select().from(schema.plannedItems)).toEqual(before);
      expect((await day("2026-11-02")).planned).toBe(false);
    });

    it("refuses a target more than 7 days back, the source as a target and a stale meal, writing nothing (one transaction)", async () => {
      const { source, body } = await setUpWeek();
      const before = await db.select().from(schema.plannedItems);
      // Ledger 936: today-8 is out of reach (today-7 is in, see below).
      const eightBack = await copy({ ...body, dryRun: true, targets: [{ date: "2026-10-23", slotId: LUNCH, onClash: "keep" }] });
      expect(eightBack.statusCode).toBe(400);
      expect(eightBack.json()).toMatchObject({ details: { targets: "Copy to the past 7 days, today or a later day" } });
      // The source by its daily meal's id is the source.
      const itself = await copy({ ...body, targets: [{ date: "2026-11-02", slotId: LUNCH, onClash: "keep" }, { date: "2026-11-01", slotId: LUNCH, onClash: "replace" }] });
      expect(itself.statusCode).toBe(400);
      // A removed meal as the LAST target rolls back the targets before it.
      const removed = await planned("2026-11-04", SNACK, []);
      expect((await inject("DELETE", `/api/babies/${babyId}/plan/2026-11-04/meals/${slotOf(removed, "Snack").slotId}`)).statusCode).toBe(200);
      const stale = await copy({ ...body, targets: [...body.targets, { date: "2026-11-04", slotId: SNACK, onClash: "keep" }] });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ error: "plan_changed" });
      expect(await db.select().from(schema.plannedItems)).toEqual(before);
      expect((await day("2026-11-02")).planned).toBe(false);
      // An empty or virtual source is stale too.
      expect((await copy({ ...body, source: { date: "2026-11-05", slotId: LUNCH } })).statusCode).toBe(409);
      expect((await copy({ ...body, source: { date: "2026-11-03", slotId: DINNER } })).statusCode).toBe(409);
      // tz is required; a stranger's baby is 404.
      expect((await inject("POST", `/api/babies/${babyId}/plan/copy`, body)).statusCode).toBe(400);
      const stranger = await signUpUser(app, "Stranger");
      expect((await copy(body, babyId, stranger)).statusCode).toBe(404);
      expect(source.items).toHaveLength(2);
    });

    it("also copies to the past 7 days, in the baby's zone, keeping or replacing as asked, with no storage warnings for those days (ledger 936)", async () => {
      // Containers that would warn on a day from today on: one serving (planned
      // more than once), a Best by of 1 November, one finished.
      const two = await container({ recipeId: fx.porridge.id, servingsTotal: 1, location: "freezer" });
      const pear = await container({ foodIds: [fx.pear.id], bestBy: "2026-11-01" });
      const gone = await container({ foodIds: [fx.egg.id], servingsTotal: 1, location: "freezer" });
      const source = slotOf(
        await planned("2026-11-01", LUNCH, [two, pear, gone].map((id) => ({ kind: "storage", storageItemId: id, servings: 1 }))),
        "Lunch",
      );
      expect((await inject("PATCH", `/api/storage/${gone}`, { status: "finished" })).statusCode).toBe(200);
      await planned("2026-10-30", BREAKFAST, [{ kind: "food", foodId: fx.oats.id }]);
      await planned("2026-10-29", BREAKFAST, [{ kind: "food", foodId: fx.oats.id }]);
      const past = [
        { date: "2026-10-24", slotId: LUNCH, onClash: "keep" }, // today-7 in Los Angeles
        { date: "2026-10-30", slotId: BREAKFAST, onClash: "keep" },
        { date: "2026-10-29", slotId: BREAKFAST, onClash: "replace" },
      ];
      const from = { date: "2026-11-01", slotId: source.slotId };
      const dry = await copy({ source: from, targets: past, dryRun: true });
      expect(dry.statusCode, dry.body).toBe(200);
      expect(copyPlanResponseSchema.parse(dry.json())).toMatchObject({ filled: 2, skipped: [{ date: "2026-10-30", reason: "kept" }], warnings: [] });
      const real = copyPlanResponseSchema.parse((await copy({ source: from, targets: past })).json());
      expect(real).toMatchObject({ filled: 2, warnings: [] });
      const boxes = (d: PlanDay, name: string) => slotOf(d, name).items.map((item) => (item.kind === "storage" ? item.container.id : item.kind));
      expect(boxes(await day("2026-10-24"), "Lunch")).toEqual([two, pear, gone]);
      expect(boxes(await day("2026-10-30"), "Breakfast")).toEqual(["food"]);
      expect(boxes(await day("2026-10-29"), "Breakfast")).toEqual([two, pear, gone]);
      expect(flagsOf(await day("2026-10-24"), "Lunch")).toEqual([[], [], []]);
      // A copy to a past day AND a later one warns for the later one only.
      const mixed = copyPlanResponseSchema.parse(
        (await copy({ source: from, targets: [{ date: "2026-10-28", slotId: DINNER, onClash: "keep" }, { date: "2026-11-02", slotId: DINNER, onClash: "keep" }], dryRun: true })).json(),
      );
      expect(mixed.warnings.map((warning) => [warning.kind, "date" in warning ? warning.date : null])).toEqual([
        ["may_run_out", "2026-11-02"], // the 1 Nov source uses the one serving; the 2 Nov copy runs out
        ["past_best_by", "2026-11-02"],
        ["container_gone", null],
      ]);
      // The window is the baby's day in the caller's zone: in Kiritimati it is
      // already 1 November, so 24 October is 8 days back there.
      const far = await copy({ source: from, targets: [{ date: "2026-10-24", slotId: DINNER, onClash: "keep" }], tz: "Pacific/Kiritimati", dryRun: true });
      expect(far.statusCode).toBe(400);
      const near = await copy({ source: from, targets: [{ date: "2026-10-25", slotId: DINNER, onClash: "keep" }], tz: "Pacific/Kiritimati", dryRun: true });
      expect(near.statusCode, near.body).toBe(200);
    });

    it("warns about running out, Best by, use within at each target's time, and a container that is gone", async () => {
      // The freezer keeps 60 days, so only the fridge soup's window ends.
      const two = await container({ recipeId: fx.porridge.id, servingsTotal: 2, location: "freezer" });
      const pear = await container({ foodIds: [fx.pear.id], bestBy: "2026-11-02" });
      const soup = await container({ foodIds: [fx.oats.id] }); // until 2026-11-02 19:00 UTC
      const gone = await container({ foodIds: [fx.egg.id], servingsTotal: 1, location: "freezer" });
      const source = slotOf(
        await planned("2026-11-01", LUNCH, [two, pear, soup, gone].map((id) => ({ kind: "storage", storageItemId: id, servings: 1 }))),
        "Lunch",
      );
      expect((await inject("PATCH", `/api/storage/${gone}`, { status: "finished" })).statusCode).toBe(200);
      await put("2026-11-02", DINNER, { time: "17:30" });
      await put("2026-11-02", BREAKFAST, { time: "08:00" });
      const targets = [
        { date: "2026-11-02", slotId: BREAKFAST, onClash: "keep" },
        { date: "2026-11-02", slotId: DINNER, onClash: "keep" },
        { date: "2026-11-03", slotId: LUNCH, onClash: "keep" },
      ];
      const dry = copyPlanResponseSchema.parse((await copy({ source: { date: "2026-11-01", slotId: source.slotId }, targets, dryRun: true })).json());
      expect(dry.warnings).toEqual([
        { kind: "may_run_out", storageItemId: two, servingsLeft: 2, plannedTimes: 4, date: "2026-11-02" },
        { kind: "past_best_by", storageItemId: pear, date: "2026-11-03" },
        // 08:00 PST is before the window ends; 17:30 is after.
        { kind: "past_use_within", storageItemId: soup, date: "2026-11-02" },
        { kind: "container_gone", storageItemId: gone, status: "finished" },
      ]);
      // The real copy warns the same, and the flags show on the plan.
      const real = copyPlanResponseSchema.parse((await copy({ source: { date: "2026-11-01", slotId: source.slotId }, targets })).json());
      expect(real.warnings).toEqual(dry.warnings);
      expect(flagsOf(await day("2026-11-02"), "Dinner")).toEqual([
        [{ kind: "may_run_out" }],
        [],
        [{ kind: "past_use_within" }],
        [{ kind: "container_gone", status: "finished" }],
      ]);
    });
  });

  describe("one-tap Serve (SPEC §3.5)", () => {
    it("serves today's meal exactly as planned, at now, and the day shows it served", async () => {
      const box = await container({ recipeId: fx.porridge.id, servingsTotal: 3 });
      const lunch = slotOf(
        await planned(TODAY, LUNCH, [
          { kind: "food", foodId: fx.pear.id },
          { kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.banana.id] },
          { kind: "storage", storageItemId: box, servings: 2 },
        ]),
        "Lunch",
      );
      const response = await serve(TODAY, lunch.slotId);
      expect(response.statusCode, response.body).toBe(201);
      const { meal, day: served } = response.json<{ meal: MealItem; day: PlanDay }>();
      expect(meal.servedAt).toBe(NOW.toISOString());
      expect(meal.items?.map((item) => item.kind)).toEqual(["food", "recipe", "storage"]);
      expect(meal.items?.[1]).toMatchObject({ kind: "recipe", leftOut: [{ name: "Banana" }] });
      expect(meal.items?.[2]).toMatchObject({ kind: "storage", storageItemId: box, servings: 2 });
      expect(meal.foods.map((food) => food.name).sort()).toEqual(["Banana", "Egg", "Oats", "Pear"]); // the container's porridge counts banana
      expect(slotOf(planDaySchema.parse(served), "Lunch").served).toEqual({ mealId: meal.id, servedAt: NOW.toISOString() });
      expect((await stored(box)).servingsLeft).toBe(1);
    });

    it("a double tap serves once: the second gets already_served with the meal", async () => {
      const box = await container({ foodIds: [fx.egg.id], servingsTotal: 5 });
      const lunch = slotOf(await planned(TODAY, LUNCH, [{ kind: "storage", storageItemId: box, servings: 1 }]), "Lunch");
      const [first, second] = await Promise.all([serve(TODAY, LUNCH), serve(TODAY, lunch.slotId)]);
      const codes = [first!.statusCode, second!.statusCode].sort();
      expect(codes).toEqual([201, 409]);
      const winner = [first!, second!].find((r) => r.statusCode === 201)!.json<{ meal: MealItem }>().meal;
      expect([first!, second!].find((r) => r.statusCode === 409)!.json()).toEqual({ error: "already_served", mealId: winner.id });
      expect(await mealCount()).toBe(1);
      expect((await stored(box)).servingsLeft).toBe(4);
    });

    it("is today's only, in the caller's zone: a past or future day is 400 not_today", async () => {
      await planned("2026-10-30", LUNCH, [{ kind: "food", foodId: fx.egg.id }]);
      await planned("2026-11-01", LUNCH, [{ kind: "food", foodId: fx.egg.id }]);
      await planned(TODAY, LUNCH, [{ kind: "food", foodId: fx.egg.id }]);
      for (const date of ["2026-10-30", "2026-11-01"]) {
        const response = await serve(date, LUNCH);
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ error: "not_today", today: TODAY });
      }
      // In Kiritimati it is already 1 November.
      expect((await serve(TODAY, LUNCH, "Pacific/Kiritimati")).json()).toEqual({ error: "not_today", today: "2026-11-01" });
      expect((await serve("2026-11-01", LUNCH, "Pacific/Kiritimati")).statusCode).toBe(201);
      expect((await inject("POST", `/api/babies/${babyId}/plan/${TODAY}/meals/${LUNCH}/serve`, {})).statusCode).toBe(400);
      expect(await mealCount()).toBe(1);
    });

    it("anything that can't be served as planned is a 409 listing all of it, and nothing is written", async () => {
      const short = await container({ recipeId: fx.porridge.id, servingsTotal: 1 });
      const finished = await container({ foodIds: [fx.oats.id], servingsTotal: 2 });
      const discarded = await container({ foodIds: [fx.pear.id], servingsTotal: 2 });
      const mash = await customFood("My mash");
      const dinner = slotOf(
        await planned(TODAY, DINNER, [
          { kind: "food", foodId: fx.egg.id },
          { kind: "storage", storageItemId: short, servings: 2 },
          { kind: "storage", storageItemId: finished, servings: 1 },
          { kind: "storage", storageItemId: discarded, servings: 1 },
          { kind: "food", foodId: mash.id },
        ]),
        "Dinner",
      );
      await inject("PATCH", `/api/storage/${finished}`, { status: "finished" });
      await inject("PATCH", `/api/storage/${discarded}`, { status: "discarded" });
      expect((await inject("DELETE", `/api/foods/${mash.id}`)).statusCode).toBe(204);
      const before = await db.select().from(schema.storageItems);

      const response = await serve(TODAY, DINNER);
      expect(response.statusCode).toBe(409);
      const ids = slotOf(await day(TODAY), "Dinner").items.map((item) => item.id);
      expect(response.json()).toEqual({
        error: "cannot_serve_as_planned",
        message: expect.any(String),
        blocked: [
          { plannedItemId: ids[1], reason: "short", servingsLeft: 1 },
          { plannedItemId: ids[2], reason: "finished", servingsLeft: 2 },
          { plannedItemId: ids[3], reason: "discarded", servingsLeft: 2 },
          { plannedItemId: ids[4], reason: "deleted", servingsLeft: null },
        ],
      });
      expect(await mealCount()).toBe(0);
      expect(await db.select().from(schema.storageItems)).toEqual(before);
      expect(slotOf(await day(TODAY), "Dinner")).toMatchObject({ slotId: dinner.slotId, served: null });
      expect(slotOf(await day(TODAY), "Dinner").items).toHaveLength(5); // nothing leaves the plan
    });

    it("a recipe changed since planning: a lost leave-out is dropped, and nothing left to count is blocked", async () => {
      await planned(TODAY, LUNCH, [{ kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.banana.id] }]);
      await planned(TODAY, DINNER, [{ kind: "recipe", recipeId: fx.porridge.id, leftOutFoodIds: [fx.oats.id] }]);
      // Banana leaves both recipes.
      await db.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.foodId, fx.banana.id));

      const lunch = await serve(TODAY, LUNCH);
      expect(lunch.statusCode, lunch.body).toBe(201);
      expect(lunch.json<{ meal: MealItem }>().meal.foods.map((food) => food.name)).toEqual(["Egg"]);

      const dinner = await serve(TODAY, DINNER);
      expect(dinner.statusCode).toBe(409);
      expect(dinner.json()).toMatchObject({ error: "cannot_serve_as_planned", blocked: [{ reason: "nothing_counts", servingsLeft: null }] });
      expect(await mealCount()).toBe(1);
    });

    it("locks the baby, then the planned meal, then its containers before checking them (no check-then-claim race)", async () => {
      // PGlite runs one transaction at a time, so the race itself cannot
      // happen here; the lock order is what makes the check hold on Postgres.
      const box = await container({ foodIds: [fx.egg.id], servingsTotal: 3 });
      await planned(TODAY, LUNCH, [{ kind: "storage", storageItemId: box, servings: 2 }]);
      await planned("2026-10-30", LUNCH, [{ kind: "storage", storageItemId: box, servings: 1 }]);
      const plannedId = slotOf(await day("2026-10-30"), "Lunch").slotId;
      const writes = [
        () => serve(TODAY, LUNCH),
        () =>
          inject("POST", `/api/babies/${babyId}/meals`, {
            items: [{ kind: "storage", storageItemId: box, servings: 1 }],
            plannedMealId: plannedId,
            tz: TZ,
          }),
      ];
      for (const write of writes) {
        const seen: string[] = [];
        const original = PgDialect.prototype.sqlToQuery;
        const spy = vi.spyOn(PgDialect.prototype, "sqlToQuery").mockImplementation(function (this: PgDialect, ...args) {
          const query = original.apply(this, args);
          seen.push(query.sql.toLowerCase());
          return query;
        });
        let status = 0;
        try {
          status = (await write()).statusCode;
        } finally {
          spy.mockRestore();
        }
        expect(status).toBeLessThan(300);
        const locks = seen.filter((sql) => / for (update|no key update)$/.test(sql));
        expect(locks[0], seen.join("\n")).toMatch(/^select .* from "babies" .* for no key update$/);
        expect(locks[1]).toMatch(/^select .* from "planned_meals" .* for update$/);
        const firstContainerRead = seen.find((sql) => /^select .* from "storage_items"/.test(sql));
        expect(firstContainerRead).toMatch(/ for no key update$/);
      }
    });

    it("a virtual day or an empty meal is stale (409 plan_changed); deleting the meal un-serves the slot", async () => {
      expect((await serve(TODAY, SNACK)).json()).toMatchObject({ error: "plan_changed" });
      await planned(TODAY, BREAKFAST, []);
      expect((await serve(TODAY, BREAKFAST)).statusCode).toBe(409);

      await planned(TODAY, LUNCH, [{ kind: "food", foodId: fx.egg.id }]);
      const first = (await serve(TODAY, LUNCH)).json<{ meal: MealItem }>().meal;
      expect((await inject("DELETE", `/api/meals/${first.id}`)).statusCode).toBe(204);
      expect(slotOf(await day(TODAY), "Lunch").served).toBeNull();
      const again = await serve(TODAY, LUNCH);
      expect(again.statusCode).toBe(201);
      expect(again.json<{ meal: MealItem }>().meal.id).not.toBe(first.id);
    });
  });

  describe("the plate's Serve of a planned meal (SPEC §3.5, §4.1)", () => {
    const plate = (body: Record<string, unknown>) => inject("POST", `/api/babies/${babyId}/meals`, body);
    const items = (): PlannedItemInput[] => [{ kind: "food", foodId: fx.egg.id }];

    it("serves a past day's meal at the planned time (or noon) and links it once", async () => {
      const lunch = slotOf(await planned("2026-10-29", LUNCH, items(), babyId, "12:15"), "Lunch");
      const servedAt = plannedServedAt("2026-10-29", "12:15", TZ).toISOString();
      expect(servedAt).toBe("2026-10-29T19:15:00.000Z");
      const response = await plate({ items: items(), plannedMealId: lunch.slotId, tz: TZ, servedAt });
      expect(response.statusCode, response.body).toBe(201);
      const meal = response.json<MealItem>();
      expect(meal.servedAt).toBe(servedAt);
      expect(slotOf(await day("2026-10-29"), "Lunch").served).toEqual({ mealId: meal.id, servedAt });

      const twice = await plate({ items: items(), plannedMealId: lunch.slotId, tz: TZ });
      expect(twice.statusCode).toBe(409);
      expect(twice.json()).toEqual({ error: "already_served", mealId: meal.id });
      expect(await mealCount()).toBe(1);
    });

    it("never serves a future day's meal (400 future_plan); needs tz; a meal not on this baby's plan is 409", async () => {
      const tomorrow = slotOf(await planned("2026-11-01", LUNCH, items()), "Lunch");
      const future = await plate({ items: items(), plannedMealId: tomorrow.slotId, tz: TZ });
      expect(future.statusCode).toBe(400);
      expect(future.json()).toMatchObject({ error: "future_plan" });
      expect((await plate({ items: items(), plannedMealId: tomorrow.slotId })).statusCode).toBe(400); // no tz
      const sibling = await newBaby("Wren");
      const theirs = slotOf(await planned(TODAY, LUNCH, items(), sibling), "Lunch");
      expect((await plate({ items: items(), plannedMealId: theirs.slotId, tz: TZ })).json()).toMatchObject({ error: "plan_changed" });
      expect(await mealCount()).toBe(0);
      // In Kiritimati the 1st is already today.
      expect((await plate({ items: items(), plannedMealId: tomorrow.slotId, tz: "Pacific/Kiritimati" })).statusCode).toBe(201);
    });

    it("the race: a one tap and the plate's Serve of one meal give one meal", async () => {
      const box = await container({ foodIds: [fx.oats.id], servingsTotal: 4 });
      const lunch = slotOf(await planned(TODAY, LUNCH, [{ kind: "storage", storageItemId: box, servings: 1 }]), "Lunch");
      const responses = await Promise.all([
        serve(TODAY, lunch.slotId),
        plate({ items: [{ kind: "storage", storageItemId: box, servings: 1 }], plannedMealId: lunch.slotId, tz: TZ }),
      ]);
      expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
      expect(await mealCount()).toBe(1);
      expect((await stored(box)).servingsLeft).toBe(3);
      const [link] = await db.select().from(schema.plannedMeals).where(and(eq(schema.plannedMeals.id, lunch.slotId)));
      expect(link!.servedMealId).not.toBeNull();
    });
  });

  it("the account export (v20) carries daily meals, plan days and planned meals", async () => {
    const box = await container({ foodIds: [fx.oats.id], servingsTotal: 4 });
    await inject("PUT", `/api/babies/${babyId}/daily-meals`, { meals: [{ name: "Brekkie", time: "07:30" }, { name: "Tea" }] });
    await planned("2026-11-01", (await day("2026-11-01")).meals[0]!.slotId, [
      { kind: "recipe", recipeId: fx.muffins.id, leftOutFoodIds: [fx.banana.id] },
      { kind: "storage", storageItemId: box, servings: 2 },
    ]);
    const emptied = await planned("2026-11-02", (await day("2026-11-02")).meals[1]!.slotId, []);
    for (const meal of emptied.meals) await inject("DELETE", `/api/babies/${babyId}/plan/2026-11-02/meals/${meal.slotId}`);
    const lunch = slotOf(await planned(TODAY, (await day(TODAY)).meals[1]!.slotId, [{ kind: "food", foodId: fx.egg.id }]), "Tea");
    const served = (await serve(TODAY, lunch.slotId)).json<{ meal: MealItem }>().meal;

    const bundle = accountExportSchema.parse((await inject("GET", "/api/account/export")).json());
    expect(bundle.exportVersion).toBe(20);
    expect(bundle.babies[0]!.dailyMeals).toEqual([
      { id: expect.any(String), name: "Brekkie", time: "07:30" },
      { id: expect.any(String), name: "Tea", time: null },
    ]);
    expect(bundle.plannedDays.map((d) => d.date)).toEqual([TODAY, "2026-11-01", "2026-11-02"]);
    expect(bundle.plannedMeals.map((m) => [m.date, m.name, m.time, m.servedMealId, m.items.length])).toEqual([
      [TODAY, "Brekkie", "07:30", null, 0],
      [TODAY, "Tea", null, served.id, 1],
      ["2026-11-01", "Brekkie", "07:30", null, 2],
      ["2026-11-01", "Tea", null, null, 0],
    ]);
    expect(bundle.plannedMeals[2]!.items).toEqual([
      { foodId: null, recipeId: fx.muffins.id, storageItemId: null, servings: null, leftOutFoodIds: [fx.banana.id] },
      { foodId: null, recipeId: null, storageItemId: box, servings: 2, leftOutFoodIds: [] },
    ]);
    const stranger = await signUpUser(app, "Stranger");
    const theirs = accountExportSchema.parse((await inject("GET", "/api/account/export", undefined, stranger)).json());
    expect([theirs.plannedDays, theirs.plannedMeals]).toEqual([[], []]);
    expect(theirs.babies).toEqual([]);
    expect((await stored(box)).servingsLeft).toBe(4);
  });
});
