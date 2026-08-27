import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ACCOUNT_DELETE_CONFIRMATION, accountExportSchema, type AccountExport } from "@blw/shared";
import { createTestApp, insertMeals, signUpUser, type TestUser } from "./helpers.js";
import { encryptSecret, lastFour } from "../ai/crypto.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

/** Never sent anywhere real — only ever stored, then asserted absent. */
const FAKE_KEY = "sk-ant-api03-EXPORTKEYEXPORTKEYEXPORTKEYEXPORT-zQ4t";
const SECRET = "test-key-encryption-secret-0123456789-abcdef";

/**
 * Minimal catalog: meals, favorites and pantry items all reference
 * `foods`/`recipes`, so the export's name-denormalising joins need real rows
 * behind them.
 */
async function seedCatalog(db: Database) {
  await db.insert(schema.storageGuidelines).values({
    category: "produce_cooked",
    fridgeHours: 48,
    freezerDays: 60,
    roomTempHours: 2,
    notes: "Cooked produce.",
  });

  const [food, secondFood] = await db
    .insert(schema.foods)
    .values([
      {
        slug: "sweet-potato",
        name: "Sweet potato",
        category: "veg",
        ironLevel: "low",
        vitaminCLevel: "high",
        chokingRisk: "low",
        minAgeMonths: 6,
        prep6m: "strip",
        prep9m: "chop",
        prep12m: "dice",
        storageCategory: "produce_cooked",
      },
      {
        slug: "broccoli",
        name: "Broccoli",
        category: "veg",
        ironLevel: "low",
        vitaminCLevel: "high",
        chokingRisk: "low",
        minAgeMonths: 6,
        prep6m: "steam",
        prep9m: "chop",
        prep12m: "dice",
        storageCategory: "produce_cooked",
      },
    ])
    .returning();

  const [recipe] = await db
    .insert(schema.recipes)
    .values({
      slug: "sweet-potato-strips",
      title: "Sweet Potato Strips",
      minAgeMonths: 6,
      prepMinutes: 20,
      ironFocus: false,
    })
    .returning();

  return { food: food!, secondFood: secondFood!, recipe: recipe! };
}

interface SeededAccount {
  userId: string;
  babyId: string;
  threadId: string;
}

/**
 * One row in every table the account owns, so "did the export cover this?"
 * and "did the delete reach this?" are both answerable by counting.
 */
async function seedOneOfEverything(
  db: Database,
  user: TestUser,
  catalog: Awaited<ReturnType<typeof seedCatalog>>,
): Promise<SeededAccount> {
  const [row] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, user.email))
    .limit(1);
  const userId = row!.id;

  const [baby] = await db
    .insert(schema.babies)
    .values({ userId, name: "Robin", birthDate: "2025-01-15", notes: "Loves squash" })
    .returning();

  // One meal with two foods: enough for the export's nesting and for the
  // delete sweep to prove `meal_foods` goes with its parent.
  await insertMeals(db, [
    {
      babyId: baby!.id,
      foodIds: [catalog.food.id, catalog.secondFood.id],
      recipeId: catalog.recipe.id,
      servedAt: new Date("2026-03-01T09:00:00Z"),
      reactionNote: "Happy",
    },
  ]);

  await db.insert(schema.favorites).values({ userId, recipeId: catalog.recipe.id });

  // Two pantry rows: one live, one closed. The closed row is the "history"
  // half — an export that only carried active items would silently drop it.
  await db.insert(schema.pantryItems).values([
    {
      userId,
      foodId: catalog.food.id,
      preparedAt: new Date("2026-03-01T08:00:00Z"),
      location: "fridge",
      status: "active",
      quantityNote: "2 strips",
    },
    {
      userId,
      recipeId: catalog.recipe.id,
      label: "Batch from Sunday",
      preparedAt: new Date("2026-02-20T08:00:00Z"),
      location: "freezer",
      status: "finished",
    },
  ]);

  await db.insert(schema.symptomChecks).values({
    babyId: baby!.id,
    survey: { symptoms: ["rash"], severity: "mild" },
    windowHours: 168,
    foodsConsidered: [{ foodName: "Sweet potato", hoursBeforeOnset: 3 }],
    triageLevel: "monitor_at_home",
    result: { narrative: "Keep an eye on it." },
    model: "claude-opus-5",
  });

  const [thread] = await db
    .insert(schema.chatThreads)
    .values({ userId, babyId: baby!.id, kind: "blw" })
    .returning();

  await db.insert(schema.chatMessages).values([
    { threadId: thread!.id, role: "user", content: [{ type: "text", text: "Is avocado safe?" }] },
    { threadId: thread!.id, role: "assistant", content: [{ type: "text", text: "Yes, softened." }] },
  ]);

  await db.insert(schema.userAiKeys).values({
    userId,
    encryptedKey: encryptSecret(FAKE_KEY, SECRET),
    keyLast4: lastFour(FAKE_KEY),
    lastValidatedAt: new Date("2026-03-01T07:00:00Z"),
  });

  return { userId, babyId: baby!.id, threadId: thread!.id };
}

/** Every table the account owns, counted for this user specifically. */
async function ownedRowCounts(db: Database, seeded: SeededAccount) {
  const [babies, favorites, pantry, threads, aiKeys, users, sessions, accounts, meals, mealFoods, symptomChecks, messages] =
    await Promise.all([
      db.select().from(schema.babies).where(eq(schema.babies.userId, seeded.userId)),
      db.select().from(schema.favorites).where(eq(schema.favorites.userId, seeded.userId)),
      db.select().from(schema.pantryItems).where(eq(schema.pantryItems.userId, seeded.userId)),
      db.select().from(schema.chatThreads).where(eq(schema.chatThreads.userId, seeded.userId)),
      db.select().from(schema.userAiKeys).where(eq(schema.userAiKeys.userId, seeded.userId)),
      db.select().from(schema.user).where(eq(schema.user.id, seeded.userId)),
      db.select().from(schema.session).where(eq(schema.session.userId, seeded.userId)),
      db.select().from(schema.account).where(eq(schema.account.userId, seeded.userId)),
      // Reached through babies / threads, so these are counted by the id
      // seeded above rather than by user.
      db.select().from(schema.meals).where(eq(schema.meals.babyId, seeded.babyId)),
      // Grandchildren of the baby: counted through the meal ids seeded above.
      db
        .select()
        .from(schema.mealFoods)
        .innerJoin(schema.meals, eq(schema.mealFoods.mealId, schema.meals.id))
        .where(eq(schema.meals.babyId, seeded.babyId)),
      db.select().from(schema.symptomChecks).where(eq(schema.symptomChecks.babyId, seeded.babyId)),
      db.select().from(schema.chatMessages).where(eq(schema.chatMessages.threadId, seeded.threadId)),
    ]);

  return {
    user: users.length,
    babies: babies.length,
    meals: meals.length,
    mealFoods: mealFoods.length,
    favorites: favorites.length,
    pantryItems: pantry.length,
    symptomChecks: symptomChecks.length,
    chatThreads: threads.length,
    chatMessages: messages.length,
    userAiKeys: aiKeys.length,
    sessions: sessions.length,
    accounts: accounts.length,
  };
}

const FULL_COUNTS = {
  user: 1,
  babies: 1,
  meals: 1,
  mealFoods: 2,
  favorites: 1,
  pantryItems: 2,
  symptomChecks: 1,
  chatThreads: 1,
  chatMessages: 2,
  userAiKeys: 1,
  sessions: 1,
  accounts: 1,
};

const EMPTY_COUNTS = {
  user: 0,
  babies: 0,
  meals: 0,
  mealFoods: 0,
  favorites: 0,
  pantryItems: 0,
  symptomChecks: 0,
  chatThreads: 0,
  chatMessages: 0,
  userAiKeys: 0,
  sessions: 0,
  accounts: 0,
};

function deletePayload(password: string | undefined, confirm: string = ACCOUNT_DELETE_CONFIRMATION) {
  return password === undefined ? { confirm } : { confirm, password };
}

describe("account export", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let catalog: Awaited<ReturnType<typeof seedCatalog>>;
  let user: TestUser;
  let seeded: SeededAccount;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    catalog = await seedCatalog(db);
    user = await signUpUser(app);
    seeded = await seedOneOfEverything(db, user, catalog);
  });

  afterEach(async () => {
    await close();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await app.inject({ method: "GET", url: "/api/account/export" });
    expect(response.statusCode).toBe(401);
  });

  it("serves a downloadable attachment named for today", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: user.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-disposition"]).toMatch(
      /^attachment; filename="blw-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("represents every table the account owns", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: user.cookie },
    });

    const bundle = accountExportSchema.parse(response.json());

    expect(Object.keys(bundle).sort()).toEqual(
      [
        "aiKey",
        "babies",
        "chatThreads",
        "exportVersion",
        "exportedAt",
        "favorites",
        "pantryItems",
        "profile",
        "meals",
        "symptomChecks",
      ].sort(),
    );

    expect(bundle.profile.email).toBe(user.email);
    expect(bundle.profile.name).toBe("Test Parent");
    expect(bundle.profile.createdAt).toBeTruthy();

    expect(bundle.babies).toHaveLength(1);
    expect(bundle.babies[0]?.name).toBe("Robin");

    expect(bundle.meals).toHaveLength(1);
    expect(bundle.favorites).toHaveLength(1);
    // Closed pantry rows are history, not noise — both must be present.
    expect(bundle.pantryItems).toHaveLength(2);
    expect(bundle.pantryItems.map((item) => item.status).sort()).toEqual(["active", "finished"]);
    expect(bundle.symptomChecks).toHaveLength(1);
    expect(bundle.chatThreads).toHaveLength(1);
    expect(bundle.chatThreads[0]?.messages).toHaveLength(2);
  });

  it("resolves food and recipe names rather than bare ids", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: user.cookie },
    });
    const bundle = response.json<AccountExport>();

    expect(bundle.meals[0]?.foods.map((food) => food.name)).toEqual(["Broccoli", "Sweet potato"]);
    expect(bundle.meals[0]?.foods.map((food) => food.slug)).toEqual(["broccoli", "sweet-potato"]);
    expect(bundle.meals[0]?.recipeTitle).toBe("Sweet Potato Strips");
    expect(bundle.favorites[0]?.recipeTitle).toBe("Sweet Potato Strips");

    const active = bundle.pantryItems.find((item) => item.status === "active");
    const finished = bundle.pantryItems.find((item) => item.status === "finished");
    expect(active?.foodName).toBe("Sweet potato");
    expect(finished?.recipeTitle).toBe("Sweet Potato Strips");
  });

  it("carries the AI key status but no key material anywhere in the bundle", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: user.cookie },
    });

    const bundle = response.json<AccountExport>();
    expect(bundle.aiKey).toEqual({
      configured: true,
      last4: lastFour(FAKE_KEY),
      lastValidatedAt: "2026-03-01T07:00:00.000Z",
    });

    // Scan the raw payload, not the parsed object: a stray field anywhere in
    // the tree would still show up here.
    const raw = response.body;
    expect(raw).not.toContain(FAKE_KEY);
    expect(raw).not.toContain("sk-ant-");
    // A slice long enough that it cannot collide by chance.
    expect(raw).not.toContain(FAKE_KEY.slice(0, 24));

    // And the ciphertext must not have been shipped either.
    const [stored] = await db
      .select()
      .from(schema.userAiKeys)
      .where(eq(schema.userAiKeys.userId, seeded.userId));
    expect(raw).not.toContain(stored!.encryptedKey);
  });

  it("reports an unconfigured key as such", async () => {
    await db.delete(schema.userAiKeys).where(eq(schema.userAiKeys.userId, seeded.userId));

    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: user.cookie },
    });

    expect(response.json<AccountExport>().aiKey).toEqual({
      configured: false,
      last4: null,
      lastValidatedAt: null,
    });
  });

  it("never includes another account's data", async () => {
    const other = await signUpUser(app, "Other Parent");

    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: other.cookie },
    });

    const bundle = accountExportSchema.parse(response.json());

    expect(bundle.profile.email).toBe(other.email);
    expect(bundle.babies).toHaveLength(0);
    expect(bundle.meals).toHaveLength(0);
    expect(bundle.favorites).toHaveLength(0);
    expect(bundle.pantryItems).toHaveLength(0);
    expect(bundle.symptomChecks).toHaveLength(0);
    expect(bundle.chatThreads).toHaveLength(0);
    expect(bundle.aiKey.configured).toBe(false);

    // Nothing belonging to the first account leaked in by id either.
    expect(response.body).not.toContain(seeded.babyId);
    expect(response.body).not.toContain(seeded.userId);
  });
});

describe("account deletion", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let catalog: Awaited<ReturnType<typeof seedCatalog>>;
  let user: TestUser;
  let seeded: SeededAccount;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    catalog = await seedCatalog(db);
    user = await signUpUser(app);
    seeded = await seedOneOfEverything(db, user, catalog);
  });

  afterEach(async () => {
    await close();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      payload: deletePayload(user.password),
    });

    expect(response.statusCode).toBe(401);
    expect(await ownedRowCounts(db, seeded)).toEqual(FULL_COUNTS);
  });

  it("refuses a wrong password and deletes nothing", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      headers: { cookie: user.cookie },
      payload: deletePayload("not-the-right-password"),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_password" });
    expect(await ownedRowCounts(db, seeded)).toEqual(FULL_COUNTS);

    // The session survives a failed attempt — a wrong password must not log
    // the user out either.
    const stillIn = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: user.cookie },
    });
    expect(stillIn.statusCode).toBe(200);
  });

  it("refuses a missing password on a credential account", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      headers: { cookie: user.cookie },
      payload: deletePayload(undefined),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "reauth_required" });
    expect(await ownedRowCounts(db, seeded)).toEqual(FULL_COUNTS);
  });

  it("refuses a wrong confirmation phrase before checking the password", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      headers: { cookie: user.cookie },
      payload: deletePayload(user.password, "delete my account"),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe("invalid_request");
    expect(await ownedRowCounts(db, seeded)).toEqual(FULL_COUNTS);
  });

  it("deletes the user and every owned row on a correct password", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      headers: { cookie: user.cookie },
      payload: deletePayload(user.password),
    });

    expect(response.statusCode).toBe(204);
    expect(await ownedRowCounts(db, seeded)).toEqual(EMPTY_COUNTS);
  });

  it("clears the session cookie and invalidates the session", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      headers: { cookie: user.cookie },
      payload: deletePayload(user.password),
    });

    const setCookie = response.headers["set-cookie"];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ""];
    expect(cookies.join("; ")).toContain("session_token=");

    // The old cookie is now worthless against any authenticated route.
    for (const url of ["/api/account/export", "/api/babies"]) {
      const replay = await app.inject({ method: "GET", url, headers: { cookie: user.cookie } });
      expect(replay.statusCode).toBe(401);
    }
  });

  it("leaves other accounts untouched", async () => {
    const other = await signUpUser(app, "Other Parent");
    const otherSeeded = await seedOneOfEverything(db, other, catalog);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      headers: { cookie: user.cookie },
      payload: deletePayload(user.password),
    });

    expect(response.statusCode).toBe(204);
    expect(await ownedRowCounts(db, seeded)).toEqual(EMPTY_COUNTS);
    expect(await ownedRowCounts(db, otherSeeded)).toEqual(FULL_COUNTS);

    const stillWorks = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: other.cookie },
    });
    expect(stillWorks.statusCode).toBe(200);
  });

  it("throttles repeated password guesses", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/account",
        headers: { cookie: user.cookie },
        payload: deletePayload(`guess-${attempt}`),
      });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await app.inject({
      method: "DELETE",
      url: "/api/account",
      headers: { cookie: user.cookie },
      payload: deletePayload(user.password),
    });

    expect(blocked.statusCode).toBe(429);
    // The budget runs out before the correct password is even looked at, so
    // the account is still there.
    expect(await ownedRowCounts(db, seeded)).toEqual(FULL_COUNTS);
  });
});
