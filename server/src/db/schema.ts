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
// categories that drive pantry expiry math. Read-only, seeded content.
// ---------------------------------------------------------------------------

export const levelEnum = pgEnum("level", ["high", "moderate", "low"]);
export const foodCategoryEnum = pgEnum("food_category", [
  "protein",
  "veg",
  "fruit",
  "grain",
  "dairy",
  "legume",
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
  },
  (t) => [index("foods_iron_level_idx").on(t.ironLevel), index("foods_category_idx").on(t.category)],
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

export const recipes = pgTable("recipes", {
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
  extraIngredients: text("extra_ingredients").array(),
});

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
// transaction (babies -> serve_logs/symptom_checks/chat_threads;
// user -> favorites/pantry_items/chat_threads directly).
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

export const serveLogs = pgTable(
  "serve_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    babyId: uuid("baby_id")
      .notNull()
      .references(() => babies.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id),
    recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    // Stored with time (not date-only): the symptom checker computes
    // hours_before_onset over a 168h window, which needs hour precision.
    servedAt: timestamp("served_at", { withTimezone: true }).notNull(),
    reactionNote: text("reaction_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("serve_logs_baby_id_served_at_idx").on(t.babyId, t.servedAt.desc())],
);

export const pantryLocationEnum = pgEnum("pantry_location", ["fridge", "freezer", "counter"]);
export const pantryStatusEnum = pgEnum("pantry_status", ["active", "finished", "discarded"]);

export const pantryItems = pgTable(
  "pantry_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    foodId: uuid("food_id").references(() => foods.id),
    recipeId: uuid("recipe_id").references(() => recipes.id),
    label: text("label"),
    preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull(),
    location: pantryLocationEnum("location").notNull(),
    status: pantryStatusEnum("status").notNull().default("active"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    quantityNote: text("quantity_note"),
  },
  (t) => [
    index("pantry_items_user_id_idx").on(t.userId),
    index("pantry_items_active_idx")
      .on(t.userId, t.status)
      .where(sql`${t.status} = 'active'`),
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
