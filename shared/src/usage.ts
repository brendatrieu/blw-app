import { z } from "zod";

import { storageLocationSchema, storageStatusSchema } from "./storage.js";

/**
 * First-party usage analytics: the whole contract, in one file.
 *
 * The app handles children's health data, so the rule is not "we try not to
 * send anything identifying" — it is "the schema makes sending it
 * impossible". Every value a client may put in an event is an enum, a
 * boolean, a small int or a bucket label. There is no free-text field
 * anywhere in the catalog below, and `usageEventEnvelopeSchema` walks the
 * whole payload afterwards rejecting any string that looks like an address
 * or is long enough to be prose (see `findPiiIssue`). Adding a careless
 * prop later fails the tests, not review.
 *
 * Never sent, by construction: names, birth dates, notes, search or chat
 * text, symptom selections, custom food/recipe names, row ids, error
 * messages or stacks, IP addresses, full user agents.
 */

// ---------------------------------------------------------------------------
// Route patterns
// ---------------------------------------------------------------------------

/**
 * Every route the app declares, as its PATTERN — `/foods/:slug`, never
 * `/foods/sweet-potato`. A path segment is the one place a real id or slug
 * could ride along into an event, so routes are a closed enum rather than a
 * string: an unmatched pathname becomes `"/*"` on the client and nothing
 * else can be sent at all.
 *
 * Mirrors `App()`'s route table (client/src/App.tsx) in declaration order;
 * the client pins the two against each other. Phase 1b's `/admin/metrics`
 * is deliberately absent — it joins this list when the route does.
 */
export const ROUTE_PATTERNS = [
  "/login",
  "/signup",
  "/",
  "/log-meal",
  "/meals",
  "/meals/:id",
  "/storage",
  "/storage/add",
  "/storage/:id/edit",
  "/storage/:id",
  "/pantry/*",
  "/fridge/*",
  "/foods",
  "/foods/new",
  "/foods/:slug/edit",
  "/foods/:slug",
  "/recipes",
  "/recipes/new",
  "/recipes/:id/edit",
  "/recipes/:id",
  "/log",
  "/babies/:id/allergens",
  "/babies/:id/allergens/:slug",
  "/favorites",
  "/safety",
  "/safety/:slug",
  "/symptom-check",
  "/chat",
  "/chat/:threadId",
  "/settings",
  "/more",
  /** Anything the table above does not match, including a typo'd URL. */
  "/*",
] as const;

export const routePatternSchema = z.enum(ROUTE_PATTERNS);
export type RoutePattern = z.infer<typeof routePatternSchema>;

/** `/safety/:slug` article slugs, from content/safety/manifest.json. */
export const ARTICLE_SLUGS = [
  "gagging-vs-choking",
  "allergic-reaction-signs",
  "unsafe-foods",
  "honey-salt-sugar",
  "allergen-introduction",
  "iron-and-nutrition-basics",
  "storage-and-reheating",
  "tummy-changes-starting-solids",
  "infant-first-aid-reference",
] as const;

export const articleSlugSchema = z.enum(ARTICLE_SLUGS);
export type ArticleSlug = z.infer<typeof articleSlugSchema>;

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------
// A count becomes a bucket label before it leaves the device. "3 foods" is a
// product fact; "7 foods at 22:14 on a Tuesday" starts to be a fingerprint,
// and no question in the plan needs the exact number.

/** Foods in one sitting. */
export const foodCountBucketSchema = z.enum(["1", "2", "3", "4-5", "6+"]);
/** How far back the "when" field was set, relative to the moment of saving. */
export const backdatedBucketSchema = z.enum(["now", "<1h", "<1d", "1d+"]);
/** Rows a catalog query came back with. */
export const resultsBucketSchema = z.enum(["0", "1-5", "6-20", "21-50", "50+"]);
/** How long a storage item had been open when its status changed. */
export const ageDaysBucketSchema = z.enum(["0", "1", "2-3", "4-7", "8-14", "15+"]);
/** Which try at saving an AI key this was, within one form session. */
export const attemptBucketSchema = z.enum(["1", "2", "3+"]);
/** HTTP status behind a `client_error`, collapsed to the codes we act on. */
export const statusBucketSchema = z.enum([
  "none",
  "400",
  "401",
  "403",
  "404",
  "409",
  "429",
  "4xx",
  "500",
  "502",
  "503",
  "504",
  "5xx",
]);
/** Months since birth of the ACTIVE baby, or none when there is no baby. */
export const babyAgeBucketSchema = z.enum(["pre6", "6-8", "9-11", "12-17", "18+", "none"]);
/** Babies on the account. */
export const babyCountBucketSchema = z.enum(["0", "1", "2+"]);

// ---------------------------------------------------------------------------
// Shared prop vocabularies
// ---------------------------------------------------------------------------

/** Where a meal was logged from. Derived from the route and its query params
 * on the client, never hand-wired per button. */
export const mealViaSchema = z.enum(["log_page", "food_page", "recipe_page", "storage_serve"]);
/** Recipe attribution on a meal: none, one of the generated one-ingredient
 * basics, a curated catalog recipe, or one the parent wrote. */
export const recipeKindSchema = z.enum(["none", "basic", "catalog", "custom"]);
/** Why a write failed, at the coarsest grain that still separates "the
 * network was gone" from "we sent something wrong" from "we broke". */
export const failureKindSchema = z.enum(["network", "4xx", "5xx"]);
export const usageCatalogSchema = z.enum(["foods", "recipes"]);
export const displayModeSchema = z.enum(["standalone", "browser"]);
export const tourSourceSchema = z.enum(["first_run", "more"]);

/**
 * Filter KEYS only — which controls a parent touched, never what they typed
 * or picked. `q` is represented by the boolean `has_query`, so the search
 * text has nowhere to go.
 */
export const catalogFilterKeySchema = z.enum([
  "category",
  "allergen",
  "iron_level",
  "vitamin_c_level",
  "fiber_level",
  "max_age_months",
  "scope",
  "iron_focus",
  "vitamin_c_high",
  "fiber_high",
  "ingredient_food_id",
]);

/** Highest 0-based slide index the six-slide tour can report. The client
 * pins this against `TOUR_SLIDE_COUNT - 1`. */
export const USAGE_TOUR_SLIDE_MAX = 5;

// ---------------------------------------------------------------------------
// The P1 event catalog
// ---------------------------------------------------------------------------
// One entry per event, props `.strict()` so an extra key is a rejection
// rather than a silently stored surprise. Everything here ships in phase 1a;
// the plan's P2 events join this table after the first monthly review.

const eventProps = {
  /** Boot, or the first event after 30 minutes idle. The session context
   * carries everything worth knowing, so there are no props. */
  session_started: z.object({}).strict(),

  /** Route change. `from_route` is null on the first view of a session. */
  screen_viewed: z
    .object({
      route_pattern: routePatternSchema,
      from_route: routePatternSchema.nullable(),
    })
    .strict(),

  /** A meal that actually persisted — once, on success, never per network
   * attempt, so a retried save cannot double-count. */
  meal_logged: z
    .object({
      food_count: foodCountBucketSchema,
      recipe_kind: recipeKindSchema,
      from_storage: z.boolean(),
      via: mealViaSchema,
      leftovers_saved: z.boolean(),
      /** Whether a note was written. Never the note. */
      has_notes: z.boolean(),
      is_first_meal: z.boolean(),
      backdated: backdatedBucketSchema,
      offline: z.boolean(),
    })
    .strict(),

  /** A meal mutation that failed. `kind` only — the error message and stack
   * go to `console.error`, never into an event. */
  meal_save_failed: z
    .object({
      via: mealViaSchema,
      kind: failureKindSchema,
      offline: z.boolean(),
    })
    .strict(),

  storage_item_added: z
    .object({
      location: storageLocationSchema,
      /** What the container holds: a catalog/custom food, a recipe, or a
       * free-text label (whose text is never sent). */
      source: z.enum(["food", "recipe", "label"]),
      via: z.enum(["storage_page", "home", "food_page", "recipe_page", "log_leftovers"]),
      has_servings: z.boolean(),
      has_best_by: z.boolean(),
    })
    .strict(),

  /** A status change on a storage item, including restore and undo — which
   * is why `to` can be `active` as well as the two closed states. */
  storage_item_closed: z
    .object({
      /** The product's own status enum, reused rather than restated so the
       * two can never drift: `active` is what a restore or an undo lands on. */
      to: storageStatusSchema,
      via: z.enum(["serve_depleted", "remove", "restore", "undo"]),
      freshness_at_change: z.enum(["fresh", "use_soon", "expired"]),
      age_days_bucket: ageDaysBucketSchema,
    })
    .strict(),

  /** A foods/recipes query that resolved after a filter or search change
   * (debounced, so a typed query is one event rather than one per keystroke). */
  catalog_filtered: z
    .object({
      catalog: usageCatalogSchema,
      /** Which filters were active, as keys. Capped well above the number of
       * controls that exist, so a malformed client cannot pad a payload. */
      filters: z.array(catalogFilterKeySchema).max(12),
      has_query: z.boolean(),
      results: resultsBucketSchema,
      zero_results: z.boolean(),
    })
    .strict(),

  article_viewed: z
    .object({
      article: articleSlugSchema,
      from_route: routePatternSchema.nullable(),
    })
    .strict(),

  /** First change on the survey. Completion is a `symptom_checks` row, so
   * nothing about the answers needs to be — and never is — sent here. */
  symptom_check_started: z.object({}).strict(),

  ai_key_saved: z
    .object({
      outcome: z.enum(["ok", "invalid_key", "validation_unavailable", "rate_limited", "network_error"]),
      attempt: attemptBucketSchema,
    })
    .strict(),

  tour_opened: z.object({ source: tourSourceSchema }).strict(),
  tour_completed: z.object({ source: tourSourceSchema }).strict(),
  tour_skipped: z
    .object({
      source: tourSourceSchema,
      /** 0-based index of the slide the parent was on when they left. */
      slide: z.number().int().min(0).max(USAGE_TOUR_SLIDE_MAX),
      via: z.enum(["skip", "overlay", "escape"]),
    })
    .strict(),

  pwa_installed: z.object({ display: displayModeSchema }).strict(),
  pwa_launch: z.object({ display: displayModeSchema }).strict(),

  offline_entered: z.object({ route_pattern: routePatternSchema }).strict(),

  /** An ErrorBoundary catch, a window `error`/`unhandledrejection`, or a
   * non-2xx API response. `kind` and a status bucket only. */
  client_error: z
    .object({
      route_pattern: routePatternSchema,
      kind: z.enum(["render_crash", "unhandled", "api_5xx", "api_network", "chunk_load"]),
      status: statusBucketSchema,
    })
    .strict(),

  /** The Privacy switch moved. The event for turning sharing OFF is sent
   * before the PATCH, since the PATCH wipes everything collected. */
  usage_sharing_changed: z.object({ enabled: z.boolean() }).strict(),
} as const;

/** Every P1 event name, in catalog order. Pinned against the union below. */
export const USAGE_EVENT_NAMES = [
  "session_started",
  "screen_viewed",
  "meal_logged",
  "meal_save_failed",
  "storage_item_added",
  "storage_item_closed",
  "catalog_filtered",
  "article_viewed",
  "symptom_check_started",
  "ai_key_saved",
  "tour_opened",
  "tour_completed",
  "tour_skipped",
  "pwa_installed",
  "pwa_launch",
  "offline_entered",
  "client_error",
  "usage_sharing_changed",
] as const;

export type UsageEventName = (typeof USAGE_EVENT_NAMES)[number];

// ---------------------------------------------------------------------------
// Session context
// ---------------------------------------------------------------------------

/**
 * Sent with every event so no panel in the dashboard has to join back to a
 * user row to answer "on what". Buckets and enums only: `baby_age_bucket` is
 * the one field derived from a birth date, and a six-way bucket is as much
 * as it can ever carry.
 *
 * Keys are snake_case like the props above, because both land in `jsonb` and
 * are read by hand-written SQL (`context->>'platform'`) rather than by the
 * camelCase API layer.
 */
/**
 * A build id (the 12-char deploy SHA, or `<semver>-dev` locally): a closed
 * alphabet so the last free-form string in the payload is gone.
 */
export const appVersionSchema = z.string().regex(/^[A-Za-z0-9.-]{1,32}$/, "appVersion must be a build id");

export const usageContextSchema = z
  .object({
    /** Deploy SHA (first 12 chars) or `<pkg version>-dev` locally. Length is
     * left to `findPiiIssue` rather than a `.max()` here, so the guard that
     * protects every other string protects this one too. */
    app_version: appVersionSchema,
    standalone: z.boolean(),
    theme: z.enum(["light", "dark", "system"]),
    platform: z.enum(["ios", "android", "desktop", "other"]),
    online: z.boolean(),
    baby_age_bucket: babyAgeBucketSchema,
    baby_count: babyCountBucketSchema,
    has_ai_key: z.boolean(),
  })
  .strict();

export type UsageContext = z.infer<typeof usageContextSchema>;

// ---------------------------------------------------------------------------
// The PII guard
// ---------------------------------------------------------------------------

/** Longest string any field in an event may carry. Everything legitimate is
 * an enum label, a route pattern, a slug or a version — all far shorter. */
export const USAGE_MAX_STRING_LENGTH = 64;

export interface PiiIssue {
  /** Dotted path to the offending value, e.g. `props.route_pattern`. */
  path: string;
  reason: "email_shaped" | "too_long";
}

/**
 * Walks any value and reports the first string that could be carrying
 * something personal: one containing `@` (an address, a handle), or one
 * longer than `USAGE_MAX_STRING_LENGTH` (prose — a note, a search, a stack).
 *
 * Deliberately a blunt instrument applied to the WHOLE payload rather than a
 * per-field rule. Every field in the catalog is already a closed set, so this
 * can only ever fire on a mistake — which is exactly what it is for.
 */
export function findPiiIssue(value: unknown, path = ""): PiiIssue | null {
  if (typeof value === "string") {
    if (value.includes("@")) return { path, reason: "email_shaped" };
    if (value.length > USAGE_MAX_STRING_LENGTH) return { path, reason: "too_long" };
    return null;
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      const issue = findPiiIssue(entry, path ? `${path}.${index}` : String(index));
      if (issue) return issue;
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const issue = findPiiIssue(entry, path ? `${path}.${key}` : key);
      if (issue) return issue;
    }
    return null;
  }
  return null;
}

function rejectPii(value: unknown, ctx: z.RefinementCtx): void {
  const issue = findPiiIssue(value);
  if (!issue) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: issue.path ? issue.path.split(".") : [],
    message:
      issue.reason === "email_shaped"
        ? "usage events must not contain address-shaped strings"
        : `usage events must not contain strings longer than ${USAGE_MAX_STRING_LENGTH} characters`,
  });
}

// ---------------------------------------------------------------------------
// Events and envelopes
// ---------------------------------------------------------------------------

const event = <N extends UsageEventName>(name: N) =>
  z.object({ name: z.literal(name), props: eventProps[name] }).strict();

/**
 * Name + props, with nothing around them. The client's `buildEvent` validates
 * against this before it ever reaches a queue, so a bad call site fails at
 * the point of the mistake rather than at flush time.
 */
export const usageEventSchema = z
  .discriminatedUnion("name", [
    event("session_started"),
    event("screen_viewed"),
    event("meal_logged"),
    event("meal_save_failed"),
    event("storage_item_added"),
    event("storage_item_closed"),
    event("catalog_filtered"),
    event("article_viewed"),
    event("symptom_check_started"),
    event("ai_key_saved"),
    event("tour_opened"),
    event("tour_completed"),
    event("tour_skipped"),
    event("pwa_installed"),
    event("pwa_launch"),
    event("offline_entered"),
    event("client_error"),
    event("usage_sharing_changed"),
  ])
  .superRefine(rejectPii);

export type UsageEvent = z.infer<typeof usageEventSchema>;

/** Fields every envelope carries alongside its name and props. */
const envelopeFields = {
  /**
   * Client-generated uuid, and the table's primary key: a replayed batch
   * (a flush that got a response the browser never saw) inserts nothing the
   * second time, so nothing is ever counted twice.
   */
  id: z.string().uuid(),
  /** The route the event happened on, or null for one that has no screen. */
  route: routePatternSchema.nullable(),
  /** Same value as `context.app_version`; see the cross-check below. */
  appVersion: appVersionSchema,
  /** Client clock, so it can lie — the server clamps it on arrival. */
  occurredAt: z.string().datetime(),
  context: usageContextSchema,
} as const;

const envelope = <N extends UsageEventName>(name: N) =>
  z.object({ ...envelopeFields, name: z.literal(name), props: eventProps[name] }).strict();

/**
 * One event as it travels: envelope fields in camelCase (this is our API,
 * like every other schema in `shared`), props and context in snake_case
 * (they are stored as `jsonb` and read by SQL).
 *
 * Two refinements run after the shape matches: the PII walk over everything,
 * and a cross-check that `appVersion` agrees with `context.app_version` —
 * they are stored in two places (a column for indexing, the context blob for
 * completeness) and two copies that can disagree are a bug waiting to be
 * queried, so the schema makes disagreement impossible.
 */
export const usageEventEnvelopeSchema = z
  .discriminatedUnion("name", [
    envelope("session_started"),
    envelope("screen_viewed"),
    envelope("meal_logged"),
    envelope("meal_save_failed"),
    envelope("storage_item_added"),
    envelope("storage_item_closed"),
    envelope("catalog_filtered"),
    envelope("article_viewed"),
    envelope("symptom_check_started"),
    envelope("ai_key_saved"),
    envelope("tour_opened"),
    envelope("tour_completed"),
    envelope("tour_skipped"),
    envelope("pwa_installed"),
    envelope("pwa_launch"),
    envelope("offline_entered"),
    envelope("client_error"),
    envelope("usage_sharing_changed"),
  ])
  .superRefine((value, ctx) => {
    rejectPii(value, ctx);
    if (value.appVersion !== value.context.app_version) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["context", "app_version"],
        message: "context.app_version must match appVersion",
      });
    }
  });

export type UsageEventEnvelope = z.infer<typeof usageEventEnvelopeSchema>;

// ---------------------------------------------------------------------------
// POST /api/usage
// ---------------------------------------------------------------------------

/**
 * Batch ceiling. Sized against the 64 KB limit a `keepalive` fetch is allowed
 * on page hide: 50 envelopes of this shape is a few KB, so the batch that
 * matters most — the one sent as the tab closes — always fits.
 */
export const USAGE_BATCH_MAX = 50;

export const ingestUsageInputSchema = z
  .object({
    events: z.array(usageEventEnvelopeSchema).min(1).max(USAGE_BATCH_MAX),
  })
  .strict();

export type IngestUsageInput = z.infer<typeof ingestUsageInputSchema>;

/** How far in the past a client clock may claim an event happened. */
export const USAGE_OCCURRED_AT_MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000;
/** And how far into the future, for a clock that is merely a little fast. */
export const USAGE_OCCURRED_AT_MAX_FUTURE_MS = 5 * 60 * 1000;

/**
 * Clamps a client-reported timestamp into `[received - 7d, received + 5m]`.
 *
 * A phone with a wrong clock would otherwise put events in 2019 or 2031 and
 * quietly bend every cohort chart. Volume questions are answered from
 * `received_at`, which this cannot touch; behaviour questions use the clamped
 * `occurred_at`, which is at worst wrong by the width of the window.
 */
export function clampOccurredAt(occurredAt: Date, receivedAt: Date): Date {
  const min = receivedAt.getTime() - USAGE_OCCURRED_AT_MAX_PAST_MS;
  const max = receivedAt.getTime() + USAGE_OCCURRED_AT_MAX_FUTURE_MS;
  const value = occurredAt.getTime();
  if (value < min) return new Date(min);
  if (value > max) return new Date(max);
  return occurredAt;
}
