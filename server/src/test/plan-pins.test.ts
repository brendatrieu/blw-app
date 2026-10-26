// Verifier p3-c1 (ledger 903): pins for planning rules no existing test holds. Each one passed on f2b5afd and
// failed with the named mutant (VERIFY-p3-c1.md). Same harness as plan-serve.test.ts: the clock is pinned (Date
// only) to 2026-10-31 19:00 UTC, noon in Los Angeles. The last describe holds the 903b follow-ups (plan step 4.0).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  DEFAULT_DAILY_MEALS,
  PLATE_NOT_AN_INGREDIENT,
  accountExportSchema,
  copyPlanResponseSchema,
  planResponseSchema,
  type Baby,
  type CreateStorageItemResponse,
  type PlanDay,
  type PlannedItemInput,
} from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import { PLATE_LABEL_ONLY } from "../services/plate.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

const NOW = new Date("2026-10-31T19:00:00.000Z");
const TZ = "America/Los_Angeles";
const TODAY = "2026-10-31";
const [BREAKFAST, LUNCH, DINNER] = DEFAULT_DAILY_MEALS.map((meal) => meal.id) as [string, string, string];

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
  const [egg, oats, pear] = await db
    .insert(schema.foods)
    .values([food("egg", "Egg"), food("oats", "Oats"), food("pear", "Pear")])
    .returning();
  return { egg: egg!, oats: oats!, pear: pear! };
}

describe("verifier p3-c1 pins (ledger 903)", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let fx: Awaited<ReturnType<typeof seedFixtures>>;
  let parent: TestUser;
  let babyId: string;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    ({ app, db, close } = await createTestApp());
    fx = await seedFixtures(db);
    parent = await signUpUser(app);
    babyId = await newBaby("Robin", parent);
  });

  afterEach(async () => {
    await close();
    vi.useRealTimers();
  });

  const inject = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, user: TestUser = parent) =>
    app.inject({ method, url, headers: { cookie: user.cookie }, ...(payload === undefined ? {} : { payload: payload as object }) });
  async function newBaby(name: string, user: TestUser): Promise<string> {
    return (await inject("POST", "/api/babies", { name, birthDate: "2025-01-15" }, user)).json<Baby>().id;
  }
  async function day(date: string, baby = babyId, user = parent): Promise<PlanDay> {
    const response = await inject("GET", `/api/babies/${baby}/plan?from=${date}&to=${date}&tz=${encodeURIComponent(TZ)}`, undefined, user);
    expect(response.statusCode, response.body).toBe(200);
    return planResponseSchema.parse(response.json()).days[0]!;
  }
  async function planned(date: string, slotId: string, items: PlannedItemInput[], baby = babyId, user = parent) {
    const response = await inject("PUT", `/api/babies/${baby}/plan/${date}/meals/${slotId}`, { items }, user);
    expect(response.statusCode, response.body).toBe(200);
  }
  async function container(payload: Record<string, unknown>, user = parent): Promise<string> {
    const response = await inject("POST", "/api/storage", { location: "fridge", ...payload }, user);
    if (response.statusCode !== 201) throw new Error(`storage create failed: ${response.body}`);
    return response.json<CreateStorageItemResponse>().items[0]!.id;
  }
  const lunchOf = (d: PlanDay) => d.meals.find((meal) => meal.name === "Lunch")!;

  // Mutant v6 (copied servings forced to 1) survives the suite: every copied container there plans 1 serving.
  it("Copy duplicates a container's servings (SPEC §3.3), not just its ref", async () => {
    const box = await container({ foodIds: [fx.oats.id], servingsTotal: 9 });
    await planned("2026-11-01", LUNCH, [{ kind: "storage", storageItemId: box, servings: 3 }]);
    const source = lunchOf(await day("2026-11-01"));
    const response = await inject("POST", `/api/babies/${babyId}/plan/copy`, {
      tz: TZ,
      source: { date: "2026-11-01", slotId: source.slotId },
      targets: [{ date: "2026-11-02", slotId: DINNER, onClash: "keep" }],
    });
    expect(copyPlanResponseSchema.parse(response.json()).filled).toBe(1);
    const dinner = (await day("2026-11-02")).meals.find((meal) => meal.name === "Dinner")!;
    expect(dinner.items).toMatchObject([{ kind: "storage", servings: 3, container: { id: box } }]);
  });

  // Mutant v7 (`<` → `<=`) survives: no one-tap test plans exactly what is left.
  it("one tap serves a container planned for exactly the servings left, and finishes it", async () => {
    const box = await container({ foodIds: [fx.egg.id], servingsTotal: 2 });
    await planned(TODAY, LUNCH, [{ kind: "storage", storageItemId: box, servings: 2 }]);
    const response = await inject("POST", `/api/babies/${babyId}/plan/${TODAY}/meals/${LUNCH}/serve`, { tz: TZ });
    expect(response.statusCode, response.body).toBe(201);
    const [row] = await db.select().from(schema.storageItems).where(eq(schema.storageItems.id, box));
    expect([row!.servingsLeft, row!.status]).toEqual([0, "finished"]);
  });

  // Mutant v8 (an untracked container read as short) survives: every one-tap test uses tracked containers.
  it("one tap serves an untracked container (it never runs short)", async () => {
    const box = await container({ foodIds: [fx.pear.id] });
    await planned(TODAY, LUNCH, [{ kind: "storage", storageItemId: box, servings: 2 }]);
    const response = await inject("POST", `/api/babies/${babyId}/plan/${TODAY}/meals/${LUNCH}/serve`, { tz: TZ });
    expect(response.statusCode, response.body).toBe(201);
    expect(lunchOf(await day(TODAY)).served).not.toBeNull();
  });

  // Mutant v2 (resolveSlot without the baby) is killed today only by the sibling-cascade count; this holds the
  // cross-ACCOUNT case directly: their own baby's path never reaches my planned meal.
  it("another account naming my planned meal through their own baby gets 409 plan_changed and changes nothing", async () => {
    await planned("2026-11-02", LUNCH, [{ kind: "food", foodId: fx.egg.id }]);
    const mine = lunchOf(await day("2026-11-02"));
    const stranger = await signUpUser(app, "Stranger");
    const theirBaby = await newBaby("Sam", stranger);
    const base = `/api/babies/${theirBaby}/plan/2026-11-02/meals/${mine.slotId}`;
    for (const [method, url, body] of [
      ["PUT", base, { name: "Theirs", items: [] }],
      ["DELETE", base, undefined],
    ] as const) {
      const response = await inject(method, url, body, stranger);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: "plan_changed" });
    }
    expect(lunchOf(await day("2026-11-02"))).toEqual(mine);
  });

  // Mutant v9 (export not scoped to the caller's babies) survives: the suite's stranger has no baby, so the
  // export's `babyIds.length ? … : []` short-circuits before the scope matters.
  it("the export holds only the caller's plan when another account plans too", async () => {
    await planned("2026-11-01", LUNCH, [{ kind: "food", foodId: fx.egg.id }]);
    const stranger = await signUpUser(app, "Stranger");
    const theirBaby = await newBaby("Sam", stranger);
    await planned("2026-11-01", BREAKFAST, [{ kind: "food", foodId: fx.pear.id }], theirBaby, stranger);
    const mine = accountExportSchema.parse((await inject("GET", "/api/account/export")).json());
    const theirs = accountExportSchema.parse((await inject("GET", "/api/account/export", undefined, stranger)).json());
    expect(new Set(mine.plannedMeals.map((meal) => meal.babyId))).toEqual(new Set([babyId]));
    expect(new Set(theirs.plannedMeals.map((meal) => meal.babyId))).toEqual(new Set([theirBaby]));
    expect(new Set(mine.plannedDays.map((d) => d.babyId))).toEqual(new Set([babyId]));
  });

  // Mutant v10 (no 50-food limit on a plan) survives: a plan could hold what Serve refuses (SPEC §3.5).
  it("a planned meal holds at most 50 foods, like the plate (400)", async () => {
    const values = (await db.select().from(schema.foods).where(eq(schema.foods.id, fx.pear.id)))[0]!;
    const many = await db
      .insert(schema.foods)
      .values(Array.from({ length: 51 }, (_, i) => ({ ...values, id: undefined, slug: `extra-${i}`, name: `Extra ${i}` })))
      .returning();
    const response = await inject("PUT", `/api/babies/${babyId}/plan/2026-11-01/meals/${LUNCH}`, {
      items: many.map((food) => ({ kind: "food", foodId: food.id })),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().details).toEqual({ items: "at most 50 foods per meal" });
    expect((await day("2026-11-01")).planned).toBe(false);
  });
  // Mutant v11 (Replace's planned leave-outs not deduped) survives: the suite's Replace case leaves out the old
  // food alone, so array_replace never makes a duplicate.
  it("Replace leaves a planned recipe's leave-outs holding the replacement once", async () => {
    const parentId = (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, parent.email)))[0]!.id;
    const values = (await db.select().from(schema.foods).where(eq(schema.foods.id, fx.pear.id)))[0]!;
    const [custom] = await db.insert(schema.foods).values({ ...values, id: undefined, slug: "my-egg", name: "My egg", ownerId: parentId }).returning();
    const [bake] = await db.insert(schema.recipes).values({ slug: "my-bake", title: "My Bake", minAgeMonths: 6, prepMinutes: 5, ownerId: parentId }).returning();
    await db.insert(schema.recipeIngredients).values(
      [custom!.id, fx.egg.id, fx.oats.id].map((foodId) => ({ recipeId: bake!.id, foodId, quantityNote: "1" })),
    );
    await planned("2026-11-01", LUNCH, [{ kind: "recipe", recipeId: bake!.id, leftOutFoodIds: [custom!.id, fx.egg.id] }]);
    const replaced = await inject("POST", `/api/foods/${custom!.id}/replace`, { replacementId: fx.egg.id });
    expect(replaced.statusCode, replaced.body).toBe(200);
    const [row] = await db.select().from(schema.plannedItems).where(eq(schema.plannedItems.recipeId, bake!.id));
    expect(row!.leftOutFoodIds).toEqual([fx.egg.id]);
    expect(lunchOf(await day("2026-11-01")).items).toMatchObject([{ kind: "recipe", leftOut: [{ id: fx.egg.id }] }]);
    expect((lunchOf(await day("2026-11-01")).items[0] as { leftOut: unknown[] }).leftOut).toHaveLength(1);
  });

  describe("Phase 3 follow-ups (903b)", () => {
    const parentId = async () =>
      (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, parent.email)))[0]!.id;

    // (2) A plan never holds what Serve would refuse: a label-only container is the plate's own 400.
    it("refuses a label-only container new to a planned meal (400, the plate's words) and writes nothing", async () => {
      const made = await inject("POST", "/api/storage", { location: "fridge", label: "Mystery soup", servingsTotal: 3 });
      expect(made.statusCode, made.body).toBe(201);
      const box = made.json<CreateStorageItemResponse>().items[0]!.id;
      const response = await inject("PUT", `/api/babies/${babyId}/plan/2026-11-01/meals/${LUNCH}`, {
        items: [{ kind: "food", foodId: fx.egg.id }, { kind: "storage", storageItemId: box, servings: 1 }],
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().details).toEqual({ items: PLATE_LABEL_ONLY });
      expect((await day("2026-11-01")).planned).toBe(false);
      // A container that holds a food is fine.
      const pears = await container({ foodIds: [fx.pear.id] });
      await planned("2026-11-01", LUNCH, [{ kind: "storage", storageItemId: pears, servings: 1 }]);
    });

    // (4) Copy warns about a deleted custom food, ids only; nothing copied, no warning.
    it("Copy warns food_deleted for a deleted custom food it copies, and still copies it", async () => {
      const values = (await db.select().from(schema.foods).where(eq(schema.foods.id, fx.pear.id)))[0]!;
      const [mash] = await db
        .insert(schema.foods)
        .values({ ...values, id: undefined, slug: "my-mash", name: "My mash", ownerId: await parentId() })
        .returning();
      await planned("2026-11-01", LUNCH, [{ kind: "food", foodId: mash!.id }, { kind: "food", foodId: fx.egg.id }]);
      expect((await inject("DELETE", `/api/foods/${mash!.id}`)).statusCode).toBe(204);
      const source = { date: "2026-11-01", slotId: lunchOf(await day("2026-11-01")).slotId };
      await planned("2026-11-02", DINNER, [{ kind: "food", foodId: fx.oats.id }]);
      const copy = (targets: { date: string; slotId: string; onClash: "keep" | "replace" }[], dryRun = false) =>
        inject("POST", `/api/babies/${babyId}/plan/copy`, { tz: TZ, source, targets, dryRun });

      // Only a kept target: nothing copied, nothing to warn about.
      const kept = copyPlanResponseSchema.parse((await copy([{ date: "2026-11-02", slotId: DINNER, onClash: "keep" }], true)).json());
      expect([kept.filled, kept.warnings]).toEqual([0, []]);

      const targets = [{ date: "2026-11-02", slotId: BREAKFAST, onClash: "keep" as const }];
      const dry = copyPlanResponseSchema.parse((await copy(targets, true)).json());
      expect(dry.warnings).toEqual([{ kind: "food_deleted", foodId: mash!.id }]);
      const real = copyPlanResponseSchema.parse((await copy(targets)).json());
      expect(real.warnings).toEqual(dry.warnings);
      const breakfast = (await day("2026-11-02")).meals.find((meal) => meal.name === "Breakfast")!;
      expect(breakfast.items.map((item) => (item.kind === "food" ? item.food.id : null))).toEqual([mash!.id, fx.egg.id]);
    });

    // (5) The stale leave-out 400 names its recipe, so the client can drop it and refetch that recipe.
    it("a leave-out the recipe no longer has is a 400 naming the recipe and the strays (plate and plan)", async () => {
      const [bake] = await db
        .insert(schema.recipes)
        .values({ slug: "my-bake", title: "My Bake", minAgeMonths: 6, prepMinutes: 5, ownerId: await parentId() })
        .returning();
      await db.insert(schema.recipeIngredients).values(
        [fx.egg.id, fx.oats.id].map((foodId) => ({ recipeId: bake!.id, foodId, quantityNote: "1" })),
      );
      const items = [{ kind: "recipe", recipeId: bake!.id, leftOutFoodIds: [fx.pear.id] }];
      const expected = { leftOutFoodIds: PLATE_NOT_AN_INGREDIENT, recipeId: bake!.id, foodIds: [fx.pear.id] };
      const plate = await inject("POST", `/api/babies/${babyId}/meals`, { items });
      expect(plate.statusCode).toBe(400);
      expect(plate.json().details).toEqual(expected);
      const plan = await inject("PUT", `/api/babies/${babyId}/plan/2026-11-01/meals/${LUNCH}`, { items });
      expect(plan.statusCode).toBe(400);
      expect(plan.json().details).toEqual(expected);
    });
  });
});
