import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  ACCOUNT_DELETE_CONFIRMATION,
  ACCOUNT_EXPORT_VERSION,
  accountExportSchema,
  type AccountExport,
} from "@blw/shared";
import { createTestApp, insertMeals, signUpUser, type TestUser } from "./helpers.js";
import { encryptSecret, lastFour } from "../ai/crypto.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

/** Never sent anywhere real — only ever stored, then asserted absent. */
const FAKE_KEY = "sk-ant-api03-EXPORTKEYEXPORTKEYEXPORTKEYEXPORT-zQ4t";
const SECRET = "test-key-encryption-secret-0123456789-abcdef";

/**
 * Minimal catalog: meals, favorites and storage items all reference
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

  // Catalog allergens exist for the custom food's tags to point at.
  const [peanut] = await db
    .insert(schema.allergens)
    .values({ slug: "peanut", name: "Peanut", introGuidance: "Thinned smooth peanut butter only." })
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

  return { food: food!, secondFood: secondFood!, recipe: recipe!, peanut: peanut! };
}

interface SeededAccount {
  userId: string;
  customFoodId: string;
  customRecipeId: string;
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

  // Two storage rows: one live, one closed. The closed row is the "history"
  // half — an export that only carried active items would silently drop it.
  const [activeStorageItem] = await db
    .insert(schema.storageItems)
    .values([
      {
        userId,
        foodId: catalog.food.id,
        preparedAt: new Date("2026-03-01T08:00:00Z"),
        location: "fridge",
        status: "active",
        quantityNote: "2 strips",
        servingsTotal: 4,
        servingsLeft: 3,
        bestBy: "2026-03-10",
        notes: "Steamed extra soft.",
      },
      {
        userId,
        recipeId: catalog.recipe.id,
        label: "Batch from Sunday",
        preparedAt: new Date("2026-02-20T08:00:00Z"),
        location: "freezer",
        status: "finished",
      },
    ])
    .returning();

  // One meal with two foods: enough for the export's nesting and for the
  // delete sweep to prove `meal_foods` goes with its parent. Served from the
  // active storage item and carrying a meal note, so the export round-trips
  // both `storageItemId` and both notes fields with real, non-null values.
  await insertMeals(db, [
    {
      babyId: baby!.id,
      foodIds: [catalog.food.id, catalog.secondFood.id],
      recipeId: catalog.recipe.id,
      servedAt: new Date("2026-03-01T09:00:00Z"),
      reactionNote: "Happy",
      notes: "Ate it all.",
      storageItemId: activeStorageItem!.id,
    },
  ]);

  // A parent's manual "established before we started using the app" mark.
  // Non-empty on purpose: an export test where the array is [] either way
  // cannot tell "covered" from "always empty".
  await db.insert(schema.allergenOverrides).values({ babyId: baby!.id, allergenKey: "egg" });

  await db.insert(schema.favorites).values({ userId, recipeId: catalog.recipe.id });

  // A food this account added itself (v5). Owned rows, so the export has to
  // carry them and the delete has to take them.
  const [customFood] = await db
    .insert(schema.foods)
    .values({
      slug: `satay-sauce-${userId.slice(0, 6)}`,
      name: "Satay sauce",
      category: "protein",
      emoji: "🥜",
      ironLevel: "low",
      vitaminCLevel: "low",
      chokingRisk: "low",
      minAgeMonths: 6,
      prep6m: "",
      prep9m: "",
      prep12m: "",
      notes: "Half a spoon, thinned.",
      storageCategory: "produce_cooked",
      ownerId: userId,
    })
    .returning();

  await db.insert(schema.foodAllergens).values({ foodId: customFood!.id, allergenId: catalog.peanut.id });

  // A recipe this account wrote itself (v6), built on its own custom food so
  // the delete sweep has to clear `recipe_ingredients` before either row can
  // go. Steps live in one variant row, as every custom recipe's do.
  const [customRecipe] = await db
    .insert(schema.recipes)
    .values({
      slug: `satay-noodles-${userId.slice(0, 6)}`,
      title: "Satay noodles",
      minAgeMonths: 9,
      prepMinutes: 15,
      ironFocus: false,
      extraIngredients: ["sesame oil"],
      notes: "Robin likes it cold.",
      ownerId: userId,
    })
    .returning();

  await db.insert(schema.recipeIngredients).values([
    { recipeId: customRecipe!.id, foodId: customFood!.id, quantityNote: "1 tbsp" },
    { recipeId: customRecipe!.id, foodId: catalog.food.id, quantityNote: "" },
  ]);
  await db.insert(schema.recipeVariants).values({
    recipeId: customRecipe!.id,
    ageStage: "9",
    textureNote: "",
    instructions: ["Thin the sauce.", "Toss through the noodles."],
  });

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

  return {
    userId,
    babyId: baby!.id,
    threadId: thread!.id,
    customFoodId: customFood!.id,
    customRecipeId: customRecipe!.id,
  };
}

/** Every table the account owns, counted for this user specifically. */
async function ownedRowCounts(db: Database, seeded: SeededAccount) {
  const [
    babies,
    favorites,
    storage,
    threads,
    aiKeys,
    users,
    sessions,
    accounts,
    meals,
    mealFoods,
    symptomChecks,
    messages,
    overrides,
    customFoods,
    customRecipes,
  ] = await Promise.all([
      db.select().from(schema.babies).where(eq(schema.babies.userId, seeded.userId)),
      db.select().from(schema.favorites).where(eq(schema.favorites.userId, seeded.userId)),
      db.select().from(schema.storageItems).where(eq(schema.storageItems.userId, seeded.userId)),
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
      db.select().from(schema.allergenOverrides).where(eq(schema.allergenOverrides.babyId, seeded.babyId)),
      // By id, not by owner: an implementation that merely NULLed owner_id
      // (publishing a deleted user's foods to everyone) would also read 0.
      db.select().from(schema.foods).where(eq(schema.foods.id, seeded.customFoodId)),
      db.select().from(schema.recipes).where(eq(schema.recipes.id, seeded.customRecipeId)),
    ]);

  return {
    user: users.length,
    babies: babies.length,
    meals: meals.length,
    mealFoods: mealFoods.length,
    favorites: favorites.length,
    storageItems: storage.length,
    symptomChecks: symptomChecks.length,
    allergenOverrides: overrides.length,
    customFoods: customFoods.length,
    customRecipes: customRecipes.length,
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
  storageItems: 2,
  symptomChecks: 1,
  allergenOverrides: 1,
  customFoods: 1,
  customRecipes: 1,
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
  storageItems: 0,
  symptomChecks: 0,
  allergenOverrides: 0,
  customFoods: 0,
  customRecipes: 0,
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
        "allergenOverrides",
        "babies",
        "chatThreads",
        "customFoods",
        "customRecipes",
        "exportVersion",
        "exportedAt",
        "favorites",
        "storageItems",
        "profile",
        "meals",
        "symptomChecks",
      ].sort(),
    );

    expect(bundle.exportVersion).toBe(8);
    expect(bundle.exportVersion).toBe(ACCOUNT_EXPORT_VERSION);

    expect(bundle.profile.email).toBe(user.email);
    expect(bundle.profile.name).toBe("Test Parent");
    expect(bundle.profile.createdAt).toBeTruthy();

    expect(bundle.babies).toHaveLength(1);
    expect(bundle.babies[0]?.name).toBe("Robin");

    expect(bundle.meals).toHaveLength(1);
    expect(bundle.favorites).toHaveLength(1);
    // Closed storage rows are history, not noise — both must be present.
    expect(bundle.storageItems).toHaveLength(2);
    expect(bundle.storageItems.map((item) => item.status).sort()).toEqual(["active", "finished"]);
    expect(bundle.symptomChecks).toHaveLength(1);
    expect(bundle.allergenOverrides).toHaveLength(1);
    expect(bundle.customFoods).toHaveLength(1);
    expect(bundle.customRecipes).toHaveLength(1);
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

    const active = bundle.storageItems.find((item) => item.status === "active");
    const finished = bundle.storageItems.find((item) => item.status === "finished");
    expect(active?.foodName).toBe("Sweet potato");
    expect(finished?.recipeTitle).toBe("Sweet Potato Strips");
  });

  it("carries meal notes, storage provenance, and the servings/bestBy/notes fields added in v3", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: user.cookie },
    });
    const bundle = response.json<AccountExport>();

    // The meal's own note (distinct from reactionNote) round-trips.
    expect(bundle.meals[0]?.notes).toBe("Ate it all.");

    // Both foods in this meal were served out of the same storage item; the
    // nested meal-food entries must carry that provenance through, non-null.
    const servedSweetPotato = bundle.meals[0]?.foods.find((food) => food.slug === "sweet-potato");
    const activeStorageItem = bundle.storageItems.find((item) => item.status === "active");
    expect(servedSweetPotato?.storageItemId).toBe(activeStorageItem?.id);
    expect(servedSweetPotato?.storageItemId).not.toBeNull();

    expect(activeStorageItem).toMatchObject({
      servingsTotal: 4,
      servingsLeft: 3,
      bestBy: "2026-03-10",
      notes: "Steamed extra soft.",
    });

    const finishedStorageItem = bundle.storageItems.find((item) => item.status === "finished");
    expect(finishedStorageItem).toMatchObject({
      servingsTotal: null,
      servingsLeft: null,
      bestBy: null,
      notes: null,
    });
  });

  it("round-trips the allergen overrides added in v4", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: user.cookie },
    });
    const bundle = accountExportSchema.parse(response.json());

    expect(bundle.allergenOverrides).toHaveLength(1);
    expect(bundle.allergenOverrides[0]).toMatchObject({
      babyId: seeded.babyId,
      allergenKey: "egg",
    });
    expect(bundle.allergenOverrides[0]?.createdAt).toBeTruthy();
    // The status is the whole payload — an override carries no served date.
    expect(Object.keys(bundle.allergenOverrides[0]!).sort()).toEqual(
      ["allergenKey", "babyId", "createdAt"].sort(),
    );

  });

  it("round-trips the custom foods added in v5", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: user.cookie },
    });
    const bundle = accountExportSchema.parse(response.json());

    expect(bundle.customFoods).toHaveLength(1);
    expect(bundle.customFoods[0]).toMatchObject({
      name: "Satay sauce",
      category: "protein",
      emoji: "🥜",
      allergenSlugs: ["peanut"],
      notes: "Half a spoon, thinned.",
    });
    expect(bundle.customFoods[0]?.slug).toMatch(/^satay-sauce-/);
    // The parent's own answers only — the stored iron/prep/choking columns on
    // a custom row are inert placeholders and have no business in an export.
    expect(Object.keys(bundle.customFoods[0]!).sort()).toEqual(
      ["allergenSlugs", "category", "emoji", "id", "name", "notes", "slug"].sort(),
    );

    // Seeded catalog foods are nobody's export.
    expect(bundle.customFoods.map((food) => food.name)).not.toContain("Sweet potato");
  });

  it("round-trips the custom recipes added in v6", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/account/export",
      headers: { cookie: user.cookie },
    });
    const bundle = accountExportSchema.parse(response.json());

    expect(bundle.customRecipes).toHaveLength(1);
    const recipe = bundle.customRecipes[0]!;
    expect(recipe).toMatchObject({
      title: "Satay noodles",
      minAgeMonths: 9,
      prepMinutes: 15,
      notes: "Robin likes it cold.",
      extraIngredients: ["sesame oil"],
      steps: ["Thin the sauce.", "Toss through the noodles."],
    });
    expect(recipe.slug).toMatch(/^satay-noodles-/);
    // Food names are denormalised in so the file reads on its own, and the
    // parent's own custom food is one of them.
    expect(recipe.ingredients.map((i) => i.foodName)).toEqual(["Satay sauce", "Sweet potato"]);
    expect(recipe.ingredients[0]).toMatchObject({ foodId: seeded.customFoodId, quantityNote: "1 tbsp" });
    // The parent's own answers only — no image, iron-focus flag or storage
    // overrides, which a custom row never carries a real value for.
    expect(Object.keys(recipe).sort()).toEqual(
      [
        "extraIngredients",
        "id",
        "ingredients",
        "minAgeMonths",
        "notes",
        "prepMinutes",
        "slug",
        "steps",
        "title",
      ].sort(),
    );

    // Seeded catalog recipes are nobody's export.
    expect(bundle.customRecipes.map((r) => r.title)).not.toContain("Sweet Potato Strips");
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
    expect(bundle.storageItems).toHaveLength(0);
    expect(bundle.symptomChecks).toHaveLength(0);
    // Not merely "empty because the array is always empty": the seeded
    // account next door has one, so an unscoped query would surface it here.
    expect(bundle.allergenOverrides).toHaveLength(0);
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
