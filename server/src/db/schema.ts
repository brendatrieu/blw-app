// Full Drizzle schema for blw-app, in one file by design: drizzle-kit's
// config-loading bundler (esbuild) does not resolve TypeScript-NodeNext
// style relative imports ("./foo.js" pointing at "./foo.ts") the way tsc/tsx
// do, so a split schema/*.ts barrel breaks `drizzle-kit generate`. Keeping
// every table in this single entry point (imported only from node_modules)
// sidesteps that without touching tsconfig.
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// better-auth core tables
// ---------------------------------------------------------------------------
// Hand-written to match the shape the Drizzle adapter expects (see
// https://www.better-auth.com/docs/concepts/database and
// https://www.better-auth.com/docs/adapters/drizzle). Columns verified
// against better-auth's `getAuthTables()` core schema, including the
// `issuer` column on `account` (compound-unique with `accountId` — the
// trusted authority that issued the provider account identifier, or a
// synthetic `local:oauth:<providerId>` / `local:credential` namespace, used
// to prevent duplicate provider-account links).
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // OURS, not better-auth's: the admin plugin is deliberately not enabled,
  // because the only thing this flag gates is the read-only metrics
  // dashboard (phase 1b), and wiring a whole permission system into the
  // session for one boolean would put a new attack surface in front of every
  // request. better-auth never writes or reads this column; it has a DEFAULT
  // precisely so better-auth's own INSERTs, which do not know about it, keep
  // working unchanged. Values: "parent" (everyone) | "admin".
  role: text("role").notNull().default("parent"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("account_issuer_account_id_idx").on(t.issuer, t.accountId),
    index("account_user_id_idx").on(t.userId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Catalog: allergens, foods, food<->allergen links, iron/vitamin-C
// pairings, the top-9 allergen introduction ladder, and storage-guideline
// categories that drive storage expiry math. Read-only, seeded content.
// ---------------------------------------------------------------------------

export const levelEnum = pgEnum("level", ["high", "moderate", "low"]);
export const foodCategoryEnum = pgEnum("food_category", [
  "protein",
  "veg",
  "fruit",
  "grain",
  "dairy",
  "legume",
  // Added by migration 0014 (item 329). Spices and herbs are catalog foods
  // like any other — they carry prep guidance ("how to use this by age")
  // rather than a serving shape, and they are the one category with no
  // "Simple <food>" basic recipe.
  "spice",
]);

// Category is the natural key seeds upsert on ("on conflict category do
// update") and is what foods.storage_category references.
export const storageGuidelines = pgTable("storage_guidelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull().unique(),
  fridgeHours: integer("fridge_hours").notNull(),
  freezerDays: integer("freezer_days"),
  roomTempHours: integer("room_temp_hours").notNull(),
  notes: text("notes").notNull(),
});

export const allergens = pgTable("allergens", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  introGuidance: text("intro_guidance").notNull(),
});

export const foods = pgTable(
  "foods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: foodCategoryEnum("category").notNull(),
    ironLevel: levelEnum("iron_level").notNull(),
    vitaminCLevel: levelEnum("vitamin_c_level").notNull(),
    // Added after the catalog had rows, so unlike its iron/vitamin-C siblings
    // it carries a DEFAULT: `low` is what migration 0008 backfills existing
    // foods with, and what a custom food keeps (see CUSTOM_FOOD_PLACEHOLDERS).
    fiberLevel: levelEnum("fiber_level").notNull().default("low"),
    chokingRisk: levelEnum("choking_risk").notNull(),
    minAgeMonths: integer("min_age_months").notNull(),
    prep6m: text("prep_6m").notNull(),
    prep9m: text("prep_9m").notNull(),
    prep12m: text("prep_12m").notNull(),
    chokingNotes: text("choking_notes"),
    notes: text("notes"),
    imageUrl: text("image_url"),
    // References storage_guidelines.category (a unique natural key), not its id.
    storageCategory: text("storage_category")
      .notNull()
      .references(() => storageGuidelines.category),
    // NULL for the seeded catalog (visible to everyone), set for a food a
    // parent added for themselves — every read filters on
    // `owner_id IS NULL OR owner_id = <caller>`. Cascades so deleting an
    // account takes its own foods with it, exactly like its other rows.
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    // Parent-picked emoji on a custom food. Catalog rows leave it null and
    // keep resolving their emoji from the client's slug/category table.
    emoji: text("emoji"),
  },
  (t) => [
    index("foods_iron_level_idx").on(t.ironLevel),
    index("foods_category_idx").on(t.category),
    index("foods_owner_id_idx").on(t.ownerId),
  ],
);

export const foodAllergens = pgTable(
  "food_allergens",
  {
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    allergenId: uuid("allergen_id")
      .notNull()
      .references(() => allergens.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.foodId, t.allergenId] })],
);

export const foodPairings = pgTable(
  "food_pairings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ironFoodId: uuid("iron_food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    vitCFoodId: uuid("vit_c_food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
  },
  (t) => [uniqueIndex("food_pairings_iron_vitc_idx").on(t.ironFoodId, t.vitCFoodId)],
);

// Top-9 allergen introduction ladder (order + starter food + protocol per
// step). Not explicitly enumerated as a table in the plan's Data model
// section, but required to store the seeded `LadderStepSeed` content; `step`
// is the natural key seeds upsert on.
export const allergenLadderSteps = pgTable("allergen_ladder_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  step: integer("step").notNull().unique(),
  allergenId: uuid("allergen_id")
    .notNull()
    .references(() => allergens.id, { onDelete: "cascade" }),
  starterFoodId: uuid("starter_food_id")
    .notNull()
    .references(() => foods.id),
  howTo: text("how_to").notNull(),
  waitDays: integer("wait_days").notNull(),
});

// ---------------------------------------------------------------------------
// Recipes: standalone + multi-ingredient, with 6/9/12-month variants.
// ---------------------------------------------------------------------------

export const ageStageEnum = pgEnum("age_stage", ["6", "9", "12"]);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Natural key seeds upsert on ("on conflict slug do update").
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    minAgeMonths: integer("min_age_months").notNull(),
    prepMinutes: integer("prep_minutes").notNull(),
    ironFocus: boolean("iron_focus").notNull().default(false),
    imageUrl: text("image_url"),
    // Optional per-recipe overrides of the food-category storage guideline.
    fridgeHoursOverride: integer("fridge_hours_override"),
    freezerDaysOverride: integer("freezer_days_override"),
    // Free-text ingredients not tied to a catalog food row (e.g. "olive oil"),
    // from RecipeSeed.extraIngredients. Not itemized in the plan's Data model
    // table list; added so seed content has a home without a join table.
    // jsonb since migration 0011 (item 298): each entry carries its own
    // optional quantity, and `quantityNote: ""` means none was given. The type
    // is spelled out rather than imported from @blw/shared because drizzle-kit
    // bundles this file on its own (see the header note).
    extraIngredients: jsonb("extra_ingredients").$type<{ name: string; quantityNote: string }[]>(),
    // NULL for the seeded catalog (everyone's), set for a recipe a parent
    // wrote for themselves — every read filters on
    // `owner_id IS NULL OR owner_id = <caller>`, exactly like `foods`.
    // Cascades so deleting an account takes its own recipes with it.
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    // Free-text note on a custom recipe ("Robin likes it with yoghurt").
    // Catalog rows leave it null.
    notes: text("notes"),
  },
  (t) => [index("recipes_owner_id_idx").on(t.ownerId)],
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id),
    quantityNote: text("quantity_note").notNull(),
  },
  (t) => [uniqueIndex("recipe_ingredients_recipe_food_idx").on(t.recipeId, t.foodId)],
);

export const recipeVariants = pgTable(
  "recipe_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ageStage: ageStageEnum("age_stage").notNull(),
    textureNote: text("texture_note").notNull(),
    instructions: jsonb("instructions").$type<string[]>().notNull(),
  },
  (t) => [uniqueIndex("recipe_variants_recipe_stage_idx").on(t.recipeId, t.ageStage)],
);

// ---------------------------------------------------------------------------
// Per-user / per-baby tracking data. Everything here sits in the
// ON DELETE CASCADE chain rooted at `user`, so account deletion is one
// transaction (babies -> meals -> meal_foods, babies -> symptom_checks;
// user -> favorites/storage_items/chat_threads directly).
// ---------------------------------------------------------------------------

export const babies = pgTable(
  "babies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    birthDate: date("birth_date").notNull(),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("babies_user_id_idx").on(t.userId)],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.recipeId] })],
);

// A meal is one sitting: a timestamp, an optional note about how it went,
// optional attribution to a recipe, and one or more foods through
// `meal_foods`. Every exposure query (allergen progress, times served, the
// symptom-checker snapshot) reads meal_foods JOIN meals, where one
// (meal, food) pair is exactly one exposure — the unique index below is what
// makes that count trustworthy.
export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    babyId: uuid("baby_id")
      .notNull()
      .references(() => babies.id, { onDelete: "cascade" }),
    // Attribution only: the foods actually eaten always come from
    // `meal_foods`, never from the recipe's ingredient list at read time.
    recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    // Stored with time (not date-only): the symptom checker computes
    // hours_before_onset over a 168h window, which needs hour precision.
    servedAt: timestamp("served_at", { withTimezone: true }).notNull(),
    reactionNote: text("reaction_note"),
    // General, non-clinical note ("ate it all", "second time trying this").
    // Deliberately SEPARATE from reaction_note: the AI symptom/snapshot
    // pipeline treats reaction_note — and only reaction_note — as a reaction
    // signal, so writing here can never make a food look reactive.
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("meals_baby_id_served_at_idx").on(t.babyId, t.servedAt.desc())],
);

export const mealFoods = pgTable(
  "meal_foods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealId: uuid("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id),
    // Provenance: set only when this food row was created by serving a
    // storage item (POST /api/storage/:id/serve). ON DELETE SET NULL so
    // deleting the storage item never removes eaten-food history — the meal
    // simply loses its link back to the container it came from.
    storageItemId: uuid("storage_item_id").references(() => storageItems.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("meal_foods_meal_food_idx").on(t.mealId, t.foodId),
    index("meal_foods_food_id_idx").on(t.foodId),
  ],
);

// Parent-declared "this allergen was already established before we started
// using the app". Purely ADDITIVE to the derived ladder: allergen progress is
// still counted from `meal_foods` JOIN `meals`, and a row here can only ever
// promote an allergen to "established" — it never blocks, downgrades or
// rewrites the derived exposure count. `allergen_key` is `allergens.slug`
// (validated against that table by the route) rather than a foreign key to
// `allergens.id`, so an override survives a catalog reseed that hands the
// same allergen a new uuid. UNIQUE(baby_id, allergen_key) is what makes the
// PUT idempotent.
export const allergenOverrides = pgTable(
  "allergen_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    babyId: uuid("baby_id")
      .notNull()
      .references(() => babies.id, { onDelete: "cascade" }),
    allergenKey: text("allergen_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("allergen_overrides_baby_key_idx").on(t.babyId, t.allergenKey)],
);

export const storageLocationEnum = pgEnum("storage_location", ["fridge", "freezer", "counter"]);
export const storageStatusEnum = pgEnum("storage_status", ["active", "finished", "discarded"]);

export const storageItems = pgTable(
  "storage_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The foods are in `storage_item_foods` — a container holds a whole meal
    // (item 345), so there is no single `food_id` here any more. Migration
    // 0015 moved every existing value into that table before dropping the
    // column.
    recipeId: uuid("recipe_id").references(() => recipes.id),
    label: text("label"),
    preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull(),
    location: storageLocationEnum("location").notNull(),
    status: storageStatusEnum("status").notNull().default("active"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    quantityNote: text("quantity_note"),
    // Optional servings tracking. Both columns are null together (tracking
    // off) or both set (tracking on): servings_total is what the container
    // held when it was prepared, servings_left what is still in it. Serving
    // decrements servings_left and finishes the item when it hits 0.
    servingsTotal: integer("servings_total"),
    servingsLeft: integer("servings_left"),
    // Parent-declared date on the packaging/container, and the authority on
    // freshness whenever it is set: the client derives its Use soon /
    // Expired chip from THIS, falling back to the prepared_at + storage
    // window derivation only when it is null (item 333). The derived window
    // is still computed server-side and sent alongside — the server has no
    // timezone, so it cannot resolve a calendar date into a local day.
    bestBy: date("best_by"),
    // Free-form note about the container itself, separate from the
    // measurement-flavoured quantity_note ("half a portion", "3 cubes").
    notes: text("notes"),
  },
  (t) => [
    index("storage_items_user_id_idx").on(t.userId),
    index("storage_items_active_idx")
      .on(t.userId, t.status)
      .where(sql`${t.status} = 'active'`),
  ],
);

// What is actually in a container. One storage item holds a whole prepared
// meal, so "leftovers of chicken, carrot and rice" is ONE row in
// `storage_items` with three rows here (item 345).
//
// `position` is the order the parent picked them in, and is what every read
// orders by — the card's title and emoji cluster read left to right in the
// order the meal was built. The PK makes the same food twice in one container
// impossible, which is the same thing `meal_foods`' unique index does.
//
// `food_id` deliberately does NOT cascade, exactly like `meal_foods.food_id`:
// a custom food being deleted must not silently empty a container. Account
// delete clears these rows itself (see routes/account.ts).
export const storageItemFoods = pgTable(
  "storage_item_foods",
  {
    storageItemId: uuid("storage_item_id")
      .notNull()
      .references(() => storageItems.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.storageItemId, t.foodId] }),
    index("storage_item_foods_food_id_idx").on(t.foodId),
  ],
);

// ---------------------------------------------------------------------------
// AI layer: BYO Anthropic key storage, symptom-check history, and the two
// chat surfaces (recipe assistant + ask-anything BLW chat).
// ---------------------------------------------------------------------------

// Write-only via the API: encrypted_key is never returned, UI shows
// key_last4 only. userId doubles as the PK (one key per account).
export const userAiKeys = pgTable("user_ai_keys", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  encryptedKey: text("encrypted_key").notNull(),
  keyLast4: text("key_last4").notNull(),
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
});

/**
 * Per-user app preferences, created lazily: an account that has never
 * written one has no row here at all, and the API answers with the same
 * defaults it would have had. Keyed by user (one row per account) and
 * cascaded from it, so a deleted account takes its preferences with it.
 */
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // Null until the first-run tour is finished or skipped — both count as
  // "seen". A timestamp rather than a boolean so a future "what's new"
  // tour has a date to compare against.
  tourCompletedAt: timestamp("tour_completed_at", { withTimezone: true }),
  // Anonymous usage sharing, on unless the parent turns it off in Settings.
  // NOT NULL with a default rather than nullable-means-default: "no row" is
  // already the lazy-creation state, and a second way to say "unset" would
  // give the consent check two paths to get wrong. Turning this off deletes
  // every `usage_events` row for the account in the same transaction.
  shareUsageData: boolean("share_usage_data").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const triageLevelEnum = pgEnum("triage_level", [
  "monitor_at_home",
  "contact_doctor_24h",
  "urgent_care",
  "emergency",
]);

export const symptomChecks = pgTable(
  "symptom_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    babyId: uuid("baby_id")
      .notNull()
      .references(() => babies.id, { onDelete: "cascade" }),
    survey: jsonb("survey").notNull(),
    windowHours: integer("window_hours").notNull(),
    foodsConsidered: jsonb("foods_considered").notNull(),
    triageLevel: triageLevelEnum("triage_level").notNull(),
    result: jsonb("result").notNull(),
    // Null when Step 1 red-flag triage short-circuits the model call, or
    // when the no-key rule-based fallback runs instead of Opus.
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("symptom_checks_baby_id_idx").on(t.babyId)],
);

export const chatKindEnum = pgEnum("chat_kind", ["recipe", "blw"]);
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    babyId: uuid("baby_id").references(() => babies.id, { onDelete: "set null" }),
    kind: chatKindEnum("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_threads_user_id_idx").on(t.userId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    // Full Anthropic content-block array, stored and echoed back unchanged
    // on continuation.
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_thread_id_idx").on(t.threadId)],
);

// ---------------------------------------------------------------------------
// Parent feedback (item 358)
// ---------------------------------------------------------------------------

export const feedbackStatusEnum = pgEnum("feedback_status", ["new", "read", "resolved"]);

/**
 * One message a parent sent the admins from Send feedback.
 *
 * `message` is the one place a parent's own prose leaves their account, so
 * the rules around it are narrow on purpose: it never enters a usage event
 * (`feedback_sent` carries no props at all), only an admin behind
 * `requireAdmin` can read it, and the account's own export gives it back.
 *
 * Nothing here is ever deleted by the product. "Clear" in the inbox writes
 * `archived_at`, which is a tab rather than a bin — the only delete is the
 * account's own cascade from `user`.
 *
 * `resolved_by` is SET NULL for the same reason `admin_audit`'s references
 * are: deleting the admin who handled a message must not take the parent's
 * message with it.
 */
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // 1–2000 characters, enforced by shared/src/feedback.ts.
    message: text("message").notNull(),
    // Route PATTERN ("/foods/:slug"), never a real path — same rule as
    // `usage_events.route`. Null when the sender's client had none.
    routePattern: text("route_pattern"),
    appVersion: text("app_version").notNull(),
    status: feedbackStatusEnum("status").notNull().default("new"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    // The two shapes anything reads this table by: the inbox's filtered,
    // newest-first list, and one account's own messages (export, cascade).
    index("feedback_status_created_at_idx").on(t.status, t.createdAt),
    index("feedback_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Analytics: anonymous usage events, the deploy log they are compared across,
// and the audit trail for admin access grants.
// ---------------------------------------------------------------------------

/**
 * One anonymous usage event (shared/src/usage.ts owns the catalog).
 *
 * `user_id` is taken from the caller's session and NEVER from the request
 * body — the client has no way to write somebody else's id here — and it is
 * nullable because the sign-in and sign-up screens are worth measuring too.
 * It cascades from `user`, so deleting an account really does take its
 * events with it rather than leaving orphaned behaviour behind.
 *
 * `id` is generated by the CLIENT and is the primary key. That is what makes
 * a replayed batch — a flush whose 204 the browser never saw — insert
 * nothing the second time, so a flaky connection cannot inflate a metric.
 * Deliberately no `defaultRandom()`: a row with a server-assigned id would
 * be a row that dedupes against nothing.
 *
 * `props` and `context` are jsonb holding only the closed sets the shared
 * schema allows. Nothing in either can identify a person or a child.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    props: jsonb("props").notNull(),
    // Route PATTERN ("/foods/:slug"), never a real path.
    route: text("route"),
    appVersion: text("app_version").notNull(),
    context: jsonb("context").notNull(),
    // Client clock, clamped into a sane window on arrival — use it for
    // behaviour questions.
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    // Server clock — use it for volume questions and for the retention purge,
    // since it is the one timestamp a wrong device clock cannot move.
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The two shapes every dashboard panel reads: "this event over time" and
    // "everything one account did" (export, and the opt-out wipe).
    index("usage_events_name_occurred_at_idx").on(t.name, t.occurredAt),
    index("usage_events_user_id_occurred_at_idx").on(t.userId, t.occurredAt),
  ],
);

/**
 * One row per deployed build, written on boot when the app version is new.
 * With one product change per deploy, this is what turns "the line moved" into
 * "the line moved after this change" without an A/B framework.
 */
export const deploys = pgTable("deploys", {
  // The commit SHA the image was built from, truncated the same way the
  // client's __APP_VERSION__ is, so events join to deploys on equality.
  sha: text("sha").primaryKey(),
  deployedAt: timestamp("deployed_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
});

/**
 * Admin grants and revocations (phase 1b writes these; the table ships now so
 * there is exactly one analytics migration). Both user references SET NULL
 * rather than cascade: the record that access was granted must survive the
 * deletion of either account, while the deleted person's id must not.
 */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetUserId: text("target_user_id").references(() => user.id, { onDelete: "set null" }),
    /**
     * What the action was about when it was about a row rather than an
     * account: the feedback id for every `feedback_*` action (item 358).
     * Plain text with no foreign key on purpose — the audit trail has to
     * outlive the row it names, and both a cascade and a SET NULL would take
     * away the one fact this column carries.
     */
    targetRef: text("target_ref"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_audit_at_idx").on(t.at)],
);
