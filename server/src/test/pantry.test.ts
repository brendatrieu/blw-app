import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PantryItem, PantryResponse } from "@blw/shared";
import { createTestApp, signUpUser, type TestUser } from "./helpers.js";
import { PANTRY_FALLBACK_WINDOW } from "../routes/pantry.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

const HOUR_MS = 60 * 60 * 1000;

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

  return { banana: banana!, chicken: chicken!, recipe: recipe! };
}

async function postPantryItem(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: PantryItem }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/pantry",
    headers: { cookie },
    payload,
  });
  return { statusCode: response.statusCode, body: response.json<PantryItem>() };
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
        foodId: fixtures.banana.id,
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
        foodId: fixtures.banana.id,
        location: "freezer",
        preparedAt,
      });
      const expectedExpiry = new Date(preparedAt).getTime() + 90 * 24 * HOUR_MS;
      expect(new Date(created.body.expiresAt).getTime()).toBe(expectedExpiry);
    });

    it("uses the food's storage-guideline counter (room temp) window", async () => {
      const preparedAt = hoursAgoIso(0);
      const created = await postPantryItem(app, user.cookie, {
        foodId: fixtures.banana.id,
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
        foodId: fixtures.banana.id,
        location: "fridge",
        preparedAt: hoursAgoIso(53),
      });
      expect(notYet.body.useSoon).toBe(false);
      expect(notYet.body.expired).toBe(false);

      const justOver = await postPantryItem(app, user.cookie, {
        foodId: fixtures.banana.id,
        location: "fridge",
        preparedAt: hoursAgoIso(55),
      });
      expect(justOver.body.useSoon).toBe(true);
      expect(justOver.body.expired).toBe(false);

      const expired = await postPantryItem(app, user.cookie, {
        foodId: fixtures.banana.id,
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
        foodId: fixtures.banana.id,
        location: "counter", // 2h window
        preparedAt: hoursAgoIso(0),
      });
      const later = await postPantryItem(app, user.cookie, {
        foodId: fixtures.banana.id,
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
        foodId: fixtures.banana.id,
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
        foodId: fixtures.banana.id,
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
        foodId: fixtures.banana.id,
        location: "fridge",
        preparedAt: hoursAgoIso(0),
      });

      const otherActive = await getPantry(app, other.cookie, "active");
      expect(otherActive.items).toHaveLength(0);
    });
  });

  describe("POST validation", () => {
    it("rejects a body with none of foodId/recipeId/label", async () => {
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
        foodId: "00000000-0000-4000-8000-000000000000",
        location: "fridge",
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
