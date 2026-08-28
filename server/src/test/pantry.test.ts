import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Baby, MealsResponse, PantryItem, PantryResponse, ServePantryItemResponse } from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import { PANTRY_FALLBACK_WINDOW } from "../routes/pantry.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

const HOUR_MS = 60 * 60 * 1000;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

// Minimal fixture content (not the real seed data, which lives in
// server/db/seeds and is out of this route file's ownership) — just enough
// to exercise every window-resolution branch: a food with a plain category
// window, a recipe whose ingredient's category is overridden on fridge but
// not freezer, and a bare label with no food/recipe at all.
async function seedFixtures(db: Database) {
  await db.insert(schema.storageGuidelines).values([
    { category: "produce_cooked_soft", fridgeHours: 72, freezerDays: 90, roomTempHours: 2, notes: "Steamed veg." },
    { category: "meat_poultry_cooked", fridgeHours: 24, freezerDays: 60, roomTempHours: 2, notes: "Cooked meat." },
  ]);

  const [banana, chicken] = await db
    .insert(schema.foods)
    .values([
      {
        slug: "banana",
        name: "Banana",
        category: "fruit",
        ironLevel: "low",
        vitaminCLevel: "moderate",
        chokingRisk: "low",
        minAgeMonths: 6,
        prep6m: "strip",
        prep9m: "chop",
        prep12m: "slice",
        storageCategory: "produce_cooked_soft",
      },
      {
        slug: "chicken",
        name: "Chicken",
        category: "protein",
        ironLevel: "high",
        vitaminCLevel: "low",
        chokingRisk: "moderate",
        minAgeMonths: 6,
        prep6m: "shred",
        prep9m: "chop",
        prep12m: "dice",
        storageCategory: "meat_poultry_cooked",
      },
    ])
    .returning();

  // fridgeHoursOverride cuts the chicken category's 24h fridge window down to
  // 6h; freezerDaysOverride is left null so the freezer window still falls
  // back to the category's 60 days.
  const [recipe] = await db
    .insert(schema.recipes)
    .values({
      slug: "chicken-puree",
      title: "Chicken Puree",
      minAgeMonths: 6,
      prepMinutes: 10,
      ironFocus: true,
      fridgeHoursOverride: 6,
      freezerDaysOverride: null,
    })
    .returning();
  await db
    .insert(schema.recipeIngredients)
    .values({ recipeId: recipe!.id, foodId: chicken!.id, quantityNote: "1 breast" });

  // Serving a recipe-sourced pantry item expands the recipe's ingredients
  // server-side, so the serve tests need a recipe with more than one — kept
  // separate from `recipe` above so the expiry tests' "first ingredient
  // category" pick stays exactly as it was.
  const [twoFoodRecipe] = await db
    .insert(schema.recipes)
    .values({ slug: "banana-chicken-mash", title: "Banana Chicken Mash", minAgeMonths: 6, prepMinutes: 8, ironFocus: true })
    .returning();
  await db.insert(schema.recipeIngredients).values([
    { recipeId: twoFoodRecipe!.id, foodId: chicken!.id, quantityNote: "1 breast" },
    { recipeId: twoFoodRecipe!.id, foodId: banana!.id, quantityNote: "half" },
  ]);

  // A recipe with no catalog-food ingredients at all: serving it has nothing
  // to log.
  const [emptyRecipe] = await db
    .insert(schema.recipes)
    .values({ slug: "olive-oil-drizzle", title: "Olive Oil Drizzle", minAgeMonths: 6, prepMinutes: 1, ironFocus: false })
    .returning();

  return {
    banana: banana!,
    chicken: chicken!,
    recipe: recipe!,
    twoFoodRecipe: twoFoodRecipe!,
    emptyRecipe: emptyRecipe!,
  };
}

/** POST /api/pantry now returns an array (one row per batched food). Most
 * existing tests exercise a single food/recipe/label, so this unwraps that
 * one row for them; batch-specific behavior gets its own tests below using
 * `postPantryItemBatch` directly. */
async function postPantryItemBatch(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: PantryItem[] }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/pantry",
    headers: { cookie },
    payload,
  });
  return { statusCode: response.statusCode, body: response.statusCode === 201 ? response.json<PantryItem[]>() : [] };
}

async function postPantryItem(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: PantryItem }> {
  const { statusCode, body } = await postPantryItemBatch(app, cookie, payload);
  return { statusCode, body: body[0] as PantryItem };
}

async function getPantry(
  app: FastifyInstance,
  cookie: string,
  view: "active" | "history" = "active",
): Promise<PantryResponse> {
  const response = await app.inject({ method: "GET", url: `/api/pantry?view=${view}`, headers: { cookie } });
  return response.json<PantryResponse>();
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

async function createBaby(app: FastifyInstance, user: TestUser, name = "Robin"): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/babies",
    headers: { cookie: user.cookie },
    payload: { name, birthDate: "2025-01-15" },
  });
  if (response.statusCode !== 200 && response.statusCode !== 201) {
    throw new Error(`baby create failed (${response.statusCode}): ${response.body}`);
  }
  return response.json<Baby>().id;
}

/**
 * A database view whose in-transaction `update` always throws, so a test can
 * prove the serve endpoint's meal insert is rolled back with it rather than
 * left behind. Methods are bound to the real object — drizzle's clients keep
 * private state that a proxy `this` would break.
 */
function dbWithFailingTransactionUpdate(db: Database): Database {
  const passthrough = (target: object, prop: string | symbol): unknown => {
    const value = Reflect.get(target, prop) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
  };

  const wrapTx = (tx: object): object =>
    new Proxy(tx, {
      get(target, prop) {
        if (prop === "update") {
          return () => {
            throw new Error("simulated pantry write failure");
          };
        }
        return passthrough(target, prop);
      },
    });

  return new Proxy(db, {
    get(target, prop) {
      if (prop === "transaction") {
        const run = passthrough(target, prop) as (
          callback: (tx: object) => unknown,
          ...rest: unknown[]
        ) => unknown;
        return (callback: (tx: object) => unknown, ...rest: unknown[]) =>
          run((tx) => callback(wrapTx(tx)), ...rest);
      }
      return passthrough(target, prop);
    },
  });
}

describe("pantry routes", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let fixtures: Awaited<ReturnType<typeof seedFixtures>>;
  let user: TestUser;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    fixtures = await seedFixtures(db);
    user = await signUpUser(app);
  });

  afterEach(async () => {
    await close();
  });

  describe("expiry math", () => {
    it("uses the food's storage-guideline fridge window", async () => {
      const preparedAt = hoursAgoIso(0);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        preparedAt,
      });
      expect(created.statusCode).toBe(201);
      const expectedExpiry = new Date(preparedAt).getTime() + 72 * HOUR_MS;
      expect(new Date(created.body.expiresAt).getTime()).toBe(expectedExpiry);
      expect(created.body.expired).toBe(false);
      expect(created.body.useSoon).toBe(false);
    });

    it("uses the food's storage-guideline freezer window (days -> hours)", async () => {
      const preparedAt = hoursAgoIso(0);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "freezer",
        preparedAt,
      });
      const expectedExpiry = new Date(preparedAt).getTime() + 90 * 24 * HOUR_MS;
      expect(new Date(created.body.expiresAt).getTime()).toBe(expectedExpiry);
    });

    it("uses the food's storage-guideline counter (room temp) window", async () => {
      const preparedAt = hoursAgoIso(0);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "counter",
        preparedAt,
      });
      const expectedExpiry = new Date(preparedAt).getTime() + 2 * HOUR_MS;
      expect(new Date(created.body.expiresAt).getTime()).toBe(expectedExpiry);
    });

    it("a recipe's fridgeHoursOverride wins over its ingredient's category default", async () => {
      const preparedAt = hoursAgoIso(0);
      const created = await postPantryItem(app, user.cookie, {
        recipeId: fixtures.recipe.id,
        location: "fridge",
        preparedAt,
      });
      // Category default for meat_poultry_cooked is 24h; the recipe overrides to 6h.
      const expectedExpiry = new Date(preparedAt).getTime() + 6 * HOUR_MS;
      expect(new Date(created.body.expiresAt).getTime()).toBe(expectedExpiry);
    });

    it("falls back to the ingredient's category default freezer window when the recipe has no override", async () => {
      const preparedAt = hoursAgoIso(0);
      const created = await postPantryItem(app, user.cookie, {
        recipeId: fixtures.recipe.id,
        location: "freezer",
        preparedAt,
      });
      // freezerDaysOverride is null on this recipe, so it falls back to
      // meat_poultry_cooked's 60-day category default.
      const expectedExpiry = new Date(preparedAt).getTime() + 60 * 24 * HOUR_MS;
      expect(new Date(created.body.expiresAt).getTime()).toBe(expectedExpiry);
    });

    it("a bare label with no food/recipe uses the fallback window", async () => {
      const preparedAt = hoursAgoIso(0);
      const created = await postPantryItem(app, user.cookie, {
        label: "Leftover soup",
        location: "fridge",
        preparedAt,
      });
      const expectedExpiry = new Date(preparedAt).getTime() + PANTRY_FALLBACK_WINDOW.fridgeHours * HOUR_MS;
      expect(new Date(created.body.expiresAt).getTime()).toBe(expectedExpiry);
    });

    it("flags useSoon at the 75% mark and clears it once expired", async () => {
      // banana/fridge window is 72h. 75% = 54h.
      const notYet = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        preparedAt: hoursAgoIso(53),
      });
      expect(notYet.body.useSoon).toBe(false);
      expect(notYet.body.expired).toBe(false);

      const justOver = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        preparedAt: hoursAgoIso(55),
      });
      expect(justOver.body.useSoon).toBe(true);
      expect(justOver.body.expired).toBe(false);

      const expired = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        preparedAt: hoursAgoIso(73),
      });
      expect(expired.body.expired).toBe(true);
      // Past expiry is reported as expired, not (also) useSoon.
      expect(expired.body.useSoon).toBe(false);
    });
  });

  describe("active/history sort and transitions", () => {
    it("sorts the active view soonest-expiry first, and lists finish/discard in history newest-changed first", async () => {
      const soon = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "counter", // 2h window
        preparedAt: hoursAgoIso(0),
      });
      const later = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge", // 72h window
        preparedAt: hoursAgoIso(0),
      });

      const active = await getPantry(app, user.cookie, "active");
      expect(active.items.map((i) => i.id)).toEqual([soon.body.id, later.body.id]);

      const finish = await app.inject({
        method: "PATCH",
        url: `/api/pantry/${soon.body.id}`,
        headers: { cookie: user.cookie },
        payload: { status: "finished" },
      });
      expect(finish.statusCode).toBe(200);
      expect(finish.json<PantryItem>().status).toBe("finished");

      const activeAfter = await getPantry(app, user.cookie, "active");
      expect(activeAfter.items.map((i) => i.id)).toEqual([later.body.id]);

      const history = await getPantry(app, user.cookie, "history");
      expect(history.items.map((i) => i.id)).toEqual([soon.body.id]);

      // Undo: status back to 'active' restores it to the active view.
      const undo = await app.inject({
        method: "PATCH",
        url: `/api/pantry/${soon.body.id}`,
        headers: { cookie: user.cookie },
        payload: { status: "active" },
      });
      expect(undo.statusCode).toBe(200);
      expect(undo.json<PantryItem>().status).toBe("active");

      const activeRestored = await getPantry(app, user.cookie, "active");
      expect(activeRestored.items.map((i) => i.id).sort()).toEqual([later.body.id, soon.body.id].sort());

      const historyAfterUndo = await getPantry(app, user.cookie, "history");
      expect(historyAfterUndo.items).toHaveLength(0);
    });

    it("recomputes expiry when location or preparedAt changes via PATCH", async () => {
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "counter", // 2h window
        preparedAt: hoursAgoIso(0),
      });
      expect(created.body.expired).toBe(false);

      // Move it to the fridge (72h window) — should no longer be about to expire.
      const moved = await app.inject({
        method: "PATCH",
        url: `/api/pantry/${created.body.id}`,
        headers: { cookie: user.cookie },
        payload: { location: "fridge" },
      });
      const movedBody = moved.json<PantryItem>();
      expect(movedBody.location).toBe("fridge");
      const expectedExpiry = new Date(created.body.preparedAt).getTime() + 72 * HOUR_MS;
      expect(new Date(movedBody.expiresAt).getTime()).toBe(expectedExpiry);
    });
  });

  describe("ownership", () => {
    it("404s PATCH on another account's pantry item and leaves it unchanged", async () => {
      const owner = user;
      const intruder = await signUpUser(app, "Intruder");
      const created = await postPantryItem(app, owner.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        preparedAt: hoursAgoIso(0),
      });

      const patch = await app.inject({
        method: "PATCH",
        url: `/api/pantry/${created.body.id}`,
        headers: { cookie: intruder.cookie },
        payload: { status: "finished" },
      });
      expect(patch.statusCode).toBe(404);

      const ownerActive = await getPantry(app, owner.cookie, "active");
      expect(ownerActive.items[0]?.status).toBe("active");
    });

    it("does not list another account's items", async () => {
      const owner = user;
      const other = await signUpUser(app, "Other");
      await postPantryItem(app, owner.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        preparedAt: hoursAgoIso(0),
      });

      const otherActive = await getPantry(app, other.cookie, "active");
      expect(otherActive.items).toHaveLength(0);
    });
  });

  describe("POST validation", () => {
    it("rejects a body with none of foodIds/recipeId/label", async () => {
      const response = await postPantryItem(app, user.cookie, { location: "fridge" });
      expect(response.statusCode).toBe(400);
    });

    it("accepts a free-form label alone", async () => {
      const response = await postPantryItem(app, user.cookie, { label: "Mashed sweet potato", location: "fridge" });
      expect(response.statusCode).toBe(201);
      expect(response.body.label).toBe("Mashed sweet potato");
    });

    it("rejects an unknown foodId", async () => {
      const response = await postPantryItem(app, user.cookie, {
        foodIds: ["00000000-0000-4000-8000-000000000000"],
        location: "fridge",
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects an empty foodIds array", async () => {
      const response = await postPantryItem(app, user.cookie, { foodIds: [], location: "fridge" });
      expect(response.statusCode).toBe(400);
    });

    it("rejects more than 25 foodIds", async () => {
      const tooMany = Array.from({ length: 26 }, () => fixtures.banana.id);
      const response = await postPantryItem(app, user.cookie, { foodIds: tooMany, location: "fridge" });
      expect(response.statusCode).toBe(400);
    });
  });

  describe("batch create", () => {
    it("creates one pantry row per food sharing the other fields, deduping repeated ids", async () => {
      const preparedAt = hoursAgoIso(0);
      const created = await postPantryItemBatch(app, user.cookie, {
        foodIds: [fixtures.banana.id, fixtures.chicken.id, fixtures.banana.id],
        location: "fridge",
        preparedAt,
      });
      expect(created.statusCode).toBe(201);
      expect(created.body).toHaveLength(2);
      expect(created.body.map((item) => item.foodSlug).sort()).toEqual(["banana", "chicken"]);
      expect(created.body.every((item) => item.location === "fridge")).toBe(true);

      const active = await getPantry(app, user.cookie, "active");
      expect(active.items).toHaveLength(2);
    });

    it("rejects the whole batch and persists nothing when one foodId among several is unknown", async () => {
      const created = await postPantryItemBatch(app, user.cookie, {
        foodIds: [fixtures.banana.id, "00000000-0000-4000-8000-000000000000"],
        location: "fridge",
      });
      expect(created.statusCode).toBe(400);

      const active = await getPantry(app, user.cookie, "active");
      expect(active.items).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Servings tracking + best-by
  // -------------------------------------------------------------------------

  async function patchItem(cookie: string, id: string, payload: Record<string, unknown>) {
    const response = await app.inject({ method: "PATCH", url: `/api/pantry/${id}`, headers: { cookie }, payload });
    return { statusCode: response.statusCode, body: response.statusCode === 200 ? response.json<PantryItem>() : null };
  }

  describe("servings", () => {
    it("leaves both servings fields null when the item does not track servings", async () => {
      const created = await postPantryItem(app, user.cookie, { foodIds: [fixtures.banana.id], location: "fridge" });
      expect(created.body.servingsTotal).toBeNull();
      expect(created.body.servingsLeft).toBeNull();

      const [listed] = (await getPantry(app, user.cookie, "active")).items;
      expect(listed?.servingsTotal).toBeNull();
      expect(listed?.servingsLeft).toBeNull();
    });

    it("initializes servingsLeft to servingsTotal on create, for every row of a batch", async () => {
      const created = await postPantryItemBatch(app, user.cookie, {
        foodIds: [fixtures.banana.id, fixtures.chicken.id],
        location: "fridge",
        servingsTotal: 4,
      });
      expect(created.statusCode).toBe(201);
      expect(created.body.map((item) => [item.servingsTotal, item.servingsLeft])).toEqual([
        [4, 4],
        [4, 4],
      ]);
    });

    it("rejects a servingsTotal outside 1–999 or not a whole number", async () => {
      for (const servingsTotal of [0, -1, 1000, 2.5]) {
        const response = await postPantryItem(app, user.cookie, {
          foodIds: [fixtures.banana.id],
          location: "fridge",
          servingsTotal,
        });
        expect(response.statusCode).toBe(400);
      }
    });

    it("clamps servingsLeft down when PATCH shrinks servingsTotal", async () => {
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 6,
      });

      const shrunk = await patchItem(user.cookie, created.body.id, { servingsTotal: 2 });
      expect(shrunk.statusCode).toBe(200);
      expect(shrunk.body).toMatchObject({ servingsTotal: 2, servingsLeft: 2 });
    });

    it("keeps the remaining count when PATCH grows servingsTotal, and clamps an over-large servingsLeft", async () => {
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 3,
      });
      const partlyUsed = await patchItem(user.cookie, created.body.id, { servingsLeft: 1 });
      expect(partlyUsed.body).toMatchObject({ servingsTotal: 3, servingsLeft: 1 });

      const grown = await patchItem(user.cookie, created.body.id, { servingsTotal: 8 });
      expect(grown.body).toMatchObject({ servingsTotal: 8, servingsLeft: 1 });

      const clamped = await patchItem(user.cookie, created.body.id, { servingsLeft: 99 });
      expect(clamped.body).toMatchObject({ servingsTotal: 8, servingsLeft: 8 });

      // Zero is a legal remainder; only serving finishes an item.
      const emptied = await patchItem(user.cookie, created.body.id, { servingsLeft: 0 });
      expect(emptied.body).toMatchObject({ servingsTotal: 8, servingsLeft: 0, status: "active" });
    });

    it("turns tracking on for an untracked item and off again with servingsTotal null", async () => {
      const created = await postPantryItem(app, user.cookie, { foodIds: [fixtures.banana.id], location: "fridge" });
      expect(created.body.servingsTotal).toBeNull();

      const turnedOn = await patchItem(user.cookie, created.body.id, { servingsTotal: 3 });
      expect(turnedOn.body).toMatchObject({ servingsTotal: 3, servingsLeft: 3 });

      const turnedOff = await patchItem(user.cookie, created.body.id, { servingsTotal: null });
      expect(turnedOff.body?.servingsTotal).toBeNull();
      expect(turnedOff.body?.servingsLeft).toBeNull();
    });

    it("400s a servingsLeft edit on an item that does not track servings", async () => {
      const created = await postPantryItem(app, user.cookie, { foodIds: [fixtures.banana.id], location: "fridge" });
      const response = await patchItem(user.cookie, created.body.id, { servingsLeft: 2 });
      expect(response.statusCode).toBe(400);
    });

    it("rejects a negative servingsLeft", async () => {
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 3,
      });
      const response = await patchItem(user.cookie, created.body.id, { servingsLeft: -1 });
      expect(response.statusCode).toBe(400);
    });
  });

  describe("bestBy", () => {
    it("stores a plain calendar date and returns it unchanged", async () => {
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        bestBy: "2026-12-31",
      });
      expect(created.statusCode).toBe(201);
      expect(created.body.bestBy).toBe("2026-12-31");
      expect((await getPantry(app, user.cookie, "active")).items[0]?.bestBy).toBe("2026-12-31");
    });

    it("accepts a full ISO datetime and keeps only its UTC calendar day", async () => {
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        bestBy: "2026-12-31T18:30:00.000Z",
      });
      expect(created.body.bestBy).toBe("2026-12-31");
    });

    it("defaults to null and can be set then cleared via PATCH", async () => {
      const created = await postPantryItem(app, user.cookie, { foodIds: [fixtures.banana.id], location: "fridge" });
      expect(created.body.bestBy).toBeNull();

      const set = await patchItem(user.cookie, created.body.id, { bestBy: "2027-01-05" });
      expect(set.body?.bestBy).toBe("2027-01-05");

      const cleared = await patchItem(user.cookie, created.body.id, { bestBy: null });
      expect(cleared.body?.bestBy).toBeNull();
    });

    it("rejects a date that does not exist", async () => {
      const response = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        bestBy: "2026-02-30",
      });
      expect(response.statusCode).toBe(400);
    });

    it("does not change the derived expiry window", async () => {
      const preparedAt = hoursAgoIso(0);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        preparedAt,
        bestBy: "2030-01-01",
      });
      // Still the banana/fridge 72h window, not the best-by date.
      expect(new Date(created.body.expiresAt).getTime()).toBe(new Date(preparedAt).getTime() + 72 * HOUR_MS);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/pantry/:id/serve
  // -------------------------------------------------------------------------

  describe("serve", () => {
    async function serve(
      cookie: string,
      itemId: string,
      payload?: Record<string, unknown>,
    ): Promise<{ statusCode: number; body: ServePantryItemResponse | null }> {
      const response = await app.inject({
        method: "POST",
        url: `/api/pantry/${itemId}/serve`,
        headers: { cookie },
        ...(payload === undefined ? {} : { payload }),
      });
      return {
        statusCode: response.statusCode,
        body: response.statusCode === 201 ? response.json<ServePantryItemResponse>() : null,
      };
    }

    async function listMeals(cookie: string, babyId: string): Promise<MealsResponse> {
      const response = await app.inject({ method: "GET", url: `/api/babies/${babyId}/meals`, headers: { cookie } });
      return response.json<MealsResponse>();
    }

    it("logs a meal for a food-sourced item, links it to the pantry item, and takes one serving", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 3,
      });

      const served = await serve(user.cookie, created.body.id, { babyId, reactionNote: "  loved it  " });
      expect(served.statusCode).toBe(201);
      expect(served.body?.meal).toMatchObject({ babyId, recipeId: null, recipeTitle: null, reactionNote: "loved it" });
      expect(served.body?.meal.foods).toEqual([
        {
          id: fixtures.banana.id,
          slug: "banana",
          name: "Banana",
          category: "fruit",
          pantryItemId: created.body.id,
        },
      ]);
      // Default servings is 1.
      expect(served.body?.item).toMatchObject({ id: created.body.id, servingsTotal: 3, servingsLeft: 2, status: "active" });

      // The meal is a normal meal: it shows up in the log, carrying the link.
      const meals = await listMeals(user.cookie, babyId);
      expect(meals.items).toHaveLength(1);
      expect(meals.items[0]?.foods[0]?.pantryItemId).toBe(created.body.id);
    });

    it("expands a recipe-sourced item into the recipe's ingredient foods, all linked to the item", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        recipeId: fixtures.twoFoodRecipe.id,
        location: "fridge",
      });

      const served = await serve(user.cookie, created.body.id, { babyId });
      expect(served.statusCode).toBe(201);
      expect(served.body?.meal).toMatchObject({
        recipeId: fixtures.twoFoodRecipe.id,
        recipeTitle: "Banana Chicken Mash",
      });
      // Ordered by food name, exactly like any other meal.
      expect(served.body?.meal.foods.map((food) => food.slug)).toEqual(["banana", "chicken"]);
      expect(served.body?.meal.foods.every((food) => food.pantryItemId === created.body.id)).toBe(true);
    });

    it("defaults servedAt to now and servings to 1 with no body at all", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 2,
      });

      const before = Date.now();
      const served = await serve(user.cookie, created.body.id);
      expect(served.statusCode).toBe(201);
      expect(served.body?.item.servingsLeft).toBe(1);
      const servedAtMs = new Date(served.body?.meal.servedAt ?? 0).getTime();
      expect(servedAtMs).toBeGreaterThanOrEqual(before - 1000);
      expect(servedAtMs).toBeLessThanOrEqual(Date.now() + 1000);
      expect(served.body?.meal.babyId).toBe(babyId);
    });

    it("honours an explicit servedAt and a multi-serving count", async () => {
      const babyId = await createBaby(app, user);
      const servedAt = hoursAgoIso(3);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 5,
      });

      const served = await serve(user.cookie, created.body.id, { babyId, servings: 2, servedAt });
      expect(served.body?.meal.servedAt).toBe(servedAt);
      expect(served.body?.item).toMatchObject({ servingsTotal: 5, servingsLeft: 3, status: "active" });
    });

    it("floors servingsLeft at 0 and finishes the item into History when it empties", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 2,
      });

      const served = await serve(user.cookie, created.body.id, { babyId, servings: 5 });
      expect(served.statusCode).toBe(201);
      expect(served.body?.item).toMatchObject({ servingsTotal: 2, servingsLeft: 0, status: "finished" });
      expect(new Date(served.body?.item.statusChangedAt ?? 0).getTime()).toBeGreaterThan(
        new Date(created.body.statusChangedAt).getTime() - 1,
      );

      // Finished the same way the manual flow finishes it: out of the active
      // view, into history, never deleted.
      expect((await getPantry(app, user.cookie, "active")).items).toHaveLength(0);
      expect((await getPantry(app, user.cookie, "history")).items.map((item) => item.id)).toEqual([created.body.id]);

      // And the meal it produced is still there.
      expect((await listMeals(user.cookie, babyId)).items).toHaveLength(1);
    });

    it("decrements nothing for an item that does not track servings", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, { foodIds: [fixtures.banana.id], location: "fridge" });

      const served = await serve(user.cookie, created.body.id, { babyId, servings: 4 });
      expect(served.statusCode).toBe(201);
      expect(served.body?.item.servingsTotal).toBeNull();
      expect(served.body?.item.servingsLeft).toBeNull();
      expect(served.body?.item.status).toBe("active");
      expect((await getPantry(app, user.cookie, "active")).items).toHaveLength(1);
    });

    it("400s a label-only item and persists nothing", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, { label: "Leftover soup", location: "fridge" });

      const served = await serve(user.cookie, created.body.id, { babyId });
      expect(served.statusCode).toBe(400);
      expect(await db.select().from(schema.meals)).toHaveLength(0);
    });

    it("400s a recipe-sourced item whose recipe has no ingredient foods", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        recipeId: fixtures.emptyRecipe.id,
        location: "fridge",
      });

      const served = await serve(user.cookie, created.body.id, { babyId });
      expect(served.statusCode).toBe(400);
      expect(await db.select().from(schema.meals)).toHaveLength(0);
    });

    it("404s another account's pantry item, leaving its servings and the meal log untouched", async () => {
      const intruder = await signUpUser(app, "Intruder");
      const intruderBabyId = await createBaby(app, intruder, "Sam");
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 3,
      });

      const served = await serve(intruder.cookie, created.body.id, { babyId: intruderBabyId });
      expect(served.statusCode).toBe(404);
      expect(await db.select().from(schema.meals)).toHaveLength(0);
      expect((await getPantry(app, user.cookie, "active")).items[0]?.servingsLeft).toBe(3);
    });

    it("404s an unknown pantry item id", async () => {
      const served = await serve(user.cookie, UNKNOWN_ID, {});
      expect(served.statusCode).toBe(404);
    });

    it("404s a babyId belonging to somebody else and persists nothing", async () => {
      const other = await signUpUser(app, "Other");
      const otherBabyId = await createBaby(app, other, "Sam");
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 3,
      });

      const served = await serve(user.cookie, created.body.id, { babyId: otherBabyId });
      expect(served.statusCode).toBe(404);
      expect(await db.select().from(schema.meals)).toHaveLength(0);
      expect((await getPantry(app, user.cookie, "active")).items[0]?.servingsLeft).toBe(3);
    });

    it("400s an omitted babyId when the account has no baby, or more than one", async () => {
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 3,
      });

      const noBaby = await serve(user.cookie, created.body.id, {});
      expect(noBaby.statusCode).toBe(400);

      await createBaby(app, user, "Robin");
      await createBaby(app, user, "Sam");
      const twoBabies = await serve(user.cookie, created.body.id, {});
      expect(twoBabies.statusCode).toBe(400);

      expect(await db.select().from(schema.meals)).toHaveLength(0);
      expect((await getPantry(app, user.cookie, "active")).items[0]?.servingsLeft).toBe(3);
    });

    it("rejects a servedAt more than 24h in the future, and an out-of-range servings count", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 3,
      });

      const future = await serve(user.cookie, created.body.id, {
        babyId,
        servedAt: new Date(Date.now() + 48 * HOUR_MS).toISOString(),
      });
      expect(future.statusCode).toBe(400);

      for (const servings of [0, 100, 1.5]) {
        const response = await serve(user.cookie, created.body.id, { babyId, servings });
        expect(response.statusCode).toBe(400);
      }

      expect(await db.select().from(schema.meals)).toHaveLength(0);
    });

    it("rolls the meal back when the pantry write inside the transaction fails", async () => {
      const failing = await createTestApp({}, {}, dbWithFailingTransactionUpdate);
      try {
        const localFixtures = await seedFixtures(failing.db);
        const localUser = await signUpUser(failing.app);
        const babyId = await createBaby(failing.app, localUser);
        const created = await postPantryItem(failing.app, localUser.cookie, {
          foodIds: [localFixtures.banana.id],
          location: "fridge",
          servingsTotal: 3,
        });

        const response = await failing.app.inject({
          method: "POST",
          url: `/api/pantry/${created.body.id}/serve`,
          headers: { cookie: localUser.cookie },
          payload: { babyId },
        });
        expect(response.statusCode).toBe(500);

        // The meal insert ran first — it must not have survived the failure.
        expect(await failing.db.select().from(schema.meals)).toHaveLength(0);
        expect(await failing.db.select().from(schema.mealFoods)).toHaveLength(0);
        const [item] = await failing.db.select().from(schema.pantryItems);
        expect(item?.servingsLeft).toBe(3);
        expect(item?.status).toBe("active");
      } finally {
        await failing.close();
      }
    });

    it("keeps the meal but clears the link when the pantry item row is deleted", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 2,
      });
      const served = await serve(user.cookie, created.body.id, { babyId });
      expect(served.statusCode).toBe(201);

      await db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, created.body.id));

      const rows = await db.select().from(schema.mealFoods);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.pantryItemId).toBeNull();

      const meals = await listMeals(user.cookie, babyId);
      expect(meals.items).toHaveLength(1);
      expect(meals.items[0]?.foods[0]?.pantryItemId).toBeNull();
    });

    it("logging a meal the ordinary way never touches the pantry", async () => {
      const babyId = await createBaby(app, user);
      await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 3,
      });

      const logged = await app.inject({
        method: "POST",
        url: `/api/babies/${babyId}/meals`,
        headers: { cookie: user.cookie },
        payload: { foodIds: [fixtures.banana.id] },
      });
      expect(logged.statusCode).toBe(201);

      const [item] = (await getPantry(app, user.cookie, "active")).items;
      expect(item).toMatchObject({ servingsTotal: 3, servingsLeft: 3, status: "active" });
      expect((await listMeals(user.cookie, babyId)).items[0]?.foods[0]?.pantryItemId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Serve guards: only an active item with something left in it is servable.
  //
  // The decrement itself is one guarded UPDATE ... RETURNING inside the serve
  // transaction, so the checks below are the same statement's WHERE clause
  // seen from the outside. True concurrency is not reproducible in this
  // harness (PGlite runs one connection), so these drive the guard
  // sequentially and the route comment carries the concurrency reasoning.
  // -------------------------------------------------------------------------

  describe("serve guards", () => {
    async function serveItem(
      itemId: string,
      payload: Record<string, unknown>,
    ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
      const response = await app.inject({
        method: "POST",
        url: `/api/pantry/${itemId}/serve`,
        headers: { cookie: user.cookie },
        payload,
      });
      return { statusCode: response.statusCode, body: response.json<Record<string, unknown>>() };
    }

    async function patchItem(itemId: string, payload: Record<string, unknown>): Promise<number> {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/pantry/${itemId}`,
        headers: { cookie: user.cookie },
        payload,
      });
      return response.statusCode;
    }

    /** The row as the database actually holds it — the assertions below are
     * about what was NOT written, so they read past the API. */
    async function storedItem(itemId: string) {
      const [row] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, itemId));
      return row;
    }

    it("409s the second serve of a last serving, leaving the finished item exactly as the first serve left it", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 1,
      });

      const first = await serveItem(created.body.id, { babyId });
      expect(first.statusCode).toBe(201);
      expect(await storedItem(created.body.id)).toMatchObject({ servingsLeft: 0, status: "finished" });
      const finishedAt = (await storedItem(created.body.id))?.statusChangedAt;

      // Serving the same container again is the sequential stand-in for the
      // losing side of a concurrent double-serve: the guard sees the row the
      // first serve committed and refuses.
      const second = await serveItem(created.body.id, { babyId });
      expect(second.statusCode).toBe(409);
      expect(second.body.error).toBe("conflict");
      expect(String(second.body.message)).toContain("finished");

      // Exactly one meal, and the refusal wrote nothing at all: no second
      // decrement, and statusChangedAt was not re-stamped.
      expect(await db.select().from(schema.meals)).toHaveLength(1);
      expect(await storedItem(created.body.id)).toMatchObject({ servingsLeft: 0, status: "finished" });
      expect((await storedItem(created.body.id))?.statusChangedAt).toEqual(finishedAt);
    });

    it("409s an item that is still active but has no servings left, and logs no meal", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 2,
      });
      // An emptied-by-hand container: PATCH clamps servingsLeft but does not
      // finish the item, so this state is reachable without serving at all.
      expect(await patchItem(created.body.id, { servingsLeft: 0 })).toBe(200);

      const served = await serveItem(created.body.id, { babyId });
      expect(served.statusCode).toBe(409);
      expect(String(served.body.message)).toContain("no servings left");

      expect(await db.select().from(schema.meals)).toHaveLength(0);
      expect(await db.select().from(schema.mealFoods)).toHaveLength(0);
      expect(await storedItem(created.body.id)).toMatchObject({ servingsLeft: 0, status: "active" });
    });

    it.each(["finished", "discarded"] as const)("409s a %s item and never overwrites its status", async (status) => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 3,
      });
      expect(await patchItem(created.body.id, { status })).toBe(200);
      const before = await storedItem(created.body.id);

      const served = await serveItem(created.body.id, { babyId });
      expect(served.statusCode).toBe(409);
      expect(String(served.body.message)).toContain(status);

      const after = await storedItem(created.body.id);
      expect(after?.status).toBe(status);
      expect(after?.servingsLeft).toBe(3);
      expect(after?.statusChangedAt).toEqual(before?.statusChangedAt);
      expect(await db.select().from(schema.meals)).toHaveLength(0);
    });

    it("409s a finished item that tracks no servings at all", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, { foodIds: [fixtures.banana.id], location: "fridge" });
      expect(await patchItem(created.body.id, { status: "finished" })).toBe(200);

      const served = await serveItem(created.body.id, { babyId });
      expect(served.statusCode).toBe(409);
      expect(await db.select().from(schema.meals)).toHaveLength(0);
      expect(await storedItem(created.body.id)).toMatchObject({ status: "finished", servingsLeft: null });
    });

    it("serves again after the item is put back in the pantry", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 1,
      });
      expect((await serveItem(created.body.id, { babyId })).statusCode).toBe(201);
      expect((await serveItem(created.body.id, { babyId })).statusCode).toBe(409);

      // Undo: back to active with a serving in it, and the guard opens again.
      expect(await patchItem(created.body.id, { status: "active", servingsLeft: 1 })).toBe(200);
      expect((await serveItem(created.body.id, { babyId })).statusCode).toBe(201);
      expect(await db.select().from(schema.meals)).toHaveLength(2);
      expect(await storedItem(created.body.id)).toMatchObject({ servingsLeft: 0, status: "finished" });
    });
  });

  // -------------------------------------------------------------------------
  // Pantry provenance survives meal edits (meal_foods.pantry_item_id).
  // -------------------------------------------------------------------------

  describe("serve provenance across meal edits", () => {
    async function patchMeal(mealId: string, payload: Record<string, unknown>): Promise<MealsResponse["items"][number]> {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/meals/${mealId}`,
        headers: { cookie: user.cookie },
        payload,
      });
      if (response.statusCode !== 200) {
        throw new Error(`meal patch failed (${response.statusCode}): ${response.body}`);
      }
      return response.json<MealsResponse["items"][number]>();
    }

    async function servedMeal(): Promise<{ mealId: string; pantryItemId: string }> {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 3,
      });
      const response = await app.inject({
        method: "POST",
        url: `/api/pantry/${created.body.id}/serve`,
        headers: { cookie: user.cookie },
        payload: { babyId },
      });
      expect(response.statusCode).toBe(201);
      return { mealId: response.json<ServePantryItemResponse>().meal.id, pantryItemId: created.body.id };
    }

    it("keeps the link when the edit does not touch the food list", async () => {
      const { mealId, pantryItemId } = await servedMeal();

      const patched = await patchMeal(mealId, { reactionNote: "a bit windy after" });
      expect(patched.reactionNote).toBe("a bit windy after");
      expect(patched.foods.map((food) => food.pantryItemId)).toEqual([pantryItemId]);
    });

    it("carries a surviving food's link through a food-list replacement and gives a swapped-in food none", async () => {
      const { mealId, pantryItemId } = await servedMeal();

      // Banana survives the edit (it really did come out of that container);
      // chicken is added at edit time and was never served from anywhere.
      const patched = await patchMeal(mealId, { foodIds: [fixtures.banana.id, fixtures.chicken.id] });
      expect(patched.foods.map((food) => [food.slug, food.pantryItemId])).toEqual([
        ["banana", pantryItemId],
        ["chicken", null],
      ]);

      // And it survives a second edit, so the carry-forward is not a
      // one-shot copy of the original insert.
      const again = await patchMeal(mealId, { foodIds: [fixtures.banana.id, fixtures.chicken.id], notes: "seconds" });
      expect(again.foods.map((food) => [food.slug, food.pantryItemId])).toEqual([
        ["banana", pantryItemId],
        ["chicken", null],
      ]);
    });

    it("drops the link with the food it belonged to", async () => {
      const { mealId } = await servedMeal();

      const patched = await patchMeal(mealId, { foodIds: [fixtures.chicken.id] });
      expect(patched.foods.map((food) => [food.slug, food.pantryItemId])).toEqual([["chicken", null]]);
      expect(await db.select().from(schema.mealFoods)).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // General notes (separate from reactionNote — see shared/src/tracking.ts)
  // -------------------------------------------------------------------------

  describe("notes", () => {
    it("round-trips a note on create, trims it, and clears it on edit", async () => {
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        notes: "  back of the middle shelf  ",
      });
      expect(created.body.notes).toBe("back of the middle shelf");
      expect((await getPantry(app, user.cookie)).items[0]?.notes).toBe("back of the middle shelf");

      const patch = async (payload: Record<string, unknown>): Promise<PantryItem> => {
        const response = await app.inject({
          method: "PATCH",
          url: `/api/pantry/${created.body.id}`,
          headers: { cookie: user.cookie },
          payload,
        });
        expect(response.statusCode).toBe(200);
        return response.json<PantryItem>();
      };

      // An absent key leaves it alone; "" and null clear it.
      expect((await patch({ location: "freezer" })).notes).toBe("back of the middle shelf");
      expect((await patch({ notes: "front now" })).notes).toBe("front now");
      expect((await patch({ notes: "" })).notes).toBeNull();
      expect((await patch({ notes: "again" })).notes).toBe("again");
      expect((await patch({ notes: null })).notes).toBeNull();
    });

    it("defaults to null and rejects an over-long note", async () => {
      const created = await postPantryItem(app, user.cookie, { foodIds: [fixtures.banana.id], location: "fridge" });
      expect(created.body.notes).toBeNull();

      const tooLong = await postPantryItemBatch(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        notes: "x".repeat(501),
      });
      expect(tooLong.statusCode).toBe(400);
    });

    it("puts a serve's notes on the meal it creates, alongside the reaction note", async () => {
      const babyId = await createBaby(app, user);
      const created = await postPantryItem(app, user.cookie, {
        foodIds: [fixtures.banana.id],
        location: "fridge",
        servingsTotal: 2,
        notes: "container note",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/pantry/${created.body.id}/serve`,
        headers: { cookie: user.cookie },
        payload: { babyId, reactionNote: "  hives  ", notes: "  ate the lot  " },
      });
      expect(response.statusCode).toBe(201);
      const served = response.json<ServePantryItemResponse>();
      expect(served.meal.reactionNote).toBe("hives");
      expect(served.meal.notes).toBe("ate the lot");
      // The container's own note is its own field and is untouched by serving.
      expect(served.item.notes).toBe("container note");
    });
  });
});
