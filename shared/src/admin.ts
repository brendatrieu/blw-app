import { z } from "zod";

import { triageLevelSchema } from "./symptom.js";
import { articleSlugSchema, catalogFilterKeySchema, usageCatalogSchema, USAGE_TOUR_SLIDE_MAX } from "./usage.js";

/**
 * The admin surface: `/api/admin/*` and the `/admin/metrics` dashboard.
 *
 * Two rules shape every shape in this file.
 *
 * **Aggregates only.** No panel below can carry an id, an email or a name —
 * not because the queries are careful, but because there is nowhere in these
 * types to put one. The single exception is the collaborators list, which is
 * a list of admin email addresses shown to admins: it is the one place where
 * knowing *who* is the point.
 *
 * **Invisible to everybody else.** `/api/admin/*` answers a plain 404 — the
 * app's ordinary unknown-route 404, byte for byte — to anonymous callers and
 * signed-in non-admins alike, so the dashboard cannot be discovered by
 * probing. That is a server behaviour, but it is why `adminMeResponseSchema`
 * has no `admin: false` case: the negative answer is "this route does not
 * exist".
 */

// ---------------------------------------------------------------------------
// GET /api/admin/me
// ---------------------------------------------------------------------------

/** The only successful answer. A non-admin gets a 404 instead. */
export const adminMeResponseSchema = z.object({ admin: z.literal(true) }).strict();
export type AdminMeResponse = z.infer<typeof adminMeResponseSchema>;

// ---------------------------------------------------------------------------
// Collaborators
// ---------------------------------------------------------------------------

/**
 * How somebody became an admin. `env` means their address is in
 * `ADMIN_EMAILS` — a deployment fact, revocable only by editing the
 * environment, which is what keeps the owner locked out of nothing if a
 * database row goes wrong. `database` means a `user.role` of `"admin"`,
 * granted from the Access panel and revocable there.
 */
export const adminSourceSchema = z.enum(["env", "database"]);
export type AdminSource = z.infer<typeof adminSourceSchema>;

/**
 * One person with dashboard access.
 *
 * `userId` is here so the Access panel has something to revoke; an env admin
 * who has never signed up has none, and no row to revoke either. `grantedAt`
 * and `grantedBy` come from `admin_audit` and are null for an env admin and
 * for a grant made before the audit table existed.
 */
export const adminCollaboratorSchema = z
  .object({
    userId: z.string().nullable(),
    email: z.string(),
    source: adminSourceSchema,
    grantedAt: z.string().nullable(),
    /** Email of the admin who granted access, when it is known. */
    grantedBy: z.string().nullable(),
    /** True for the caller's own entry, so the UI can say "you". */
    isSelf: z.boolean(),
    /**
     * False for env admins (revoking them means editing the environment) and
     * for the caller themselves (no self-demotion). The server enforces both
     * independently; this is only so the button can be absent rather than
     * fail.
     */
    canRevoke: z.boolean(),
  })
  .strict();
export type AdminCollaborator = z.infer<typeof adminCollaboratorSchema>;

export const adminCollaboratorsResponseSchema = z
  .object({ collaborators: z.array(adminCollaboratorSchema) })
  .strict();
export type AdminCollaboratorsResponse = z.infer<typeof adminCollaboratorsResponseSchema>;

/**
 * Grant by email. The address must already belong to an account: admin
 * access is given to somebody who signed up like any other parent, never to
 * an invitation that creates one.
 */
export const grantCollaboratorInputSchema = z
  .object({ email: z.string().trim().min(3).max(254).email() })
  .strict();
export type GrantCollaboratorInput = z.infer<typeof grantCollaboratorInputSchema>;

// ---------------------------------------------------------------------------
// GET /api/admin/metrics
// ---------------------------------------------------------------------------

/** How far back a dashboard load looks. */
export const METRICS_RANGES = ["4w", "12w", "26w"] as const;
export const metricsRangeSchema = z.enum(METRICS_RANGES);
export type MetricsRange = z.infer<typeof metricsRangeSchema>;

/** Weeks behind each range label, so client and server cannot disagree. */
export const METRICS_RANGE_WEEKS: Record<MetricsRange, number> = { "4w": 4, "12w": 12, "26w": 26 };

/** Columns in the retention triangle: W1 (days 1-7) through W8 (days 50-56). */
export const RETENTION_WEEKS = 8;

/** Trailing window for the feature-adoption panel. */
export const ADOPTION_WINDOW_DAYS = 28;

/** How long a computed payload is served from memory before the SQL runs again. */
export const METRICS_CACHE_TTL_MS = 5 * 60 * 1000;

/** Longest list any "top N" panel returns. */
export const METRICS_TOP_N = 10;

/**
 * A week bucket. `weekStart` is the Monday of the week as `YYYY-MM-DD` in
 * **UTC** — deliberately a date string rather than a timestamp, because the
 * bucket edges are computed once, in UTC, and must not be re-floated through
 * a browser's local timezone on the way to a chart axis.
 */
const weekStart = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const metricsMetaSchema = z
  .object({
    range: metricsRangeSchema,
    weeks: z.number().int().positive(),
    /** Start of the first week bucket (UTC Monday, ISO instant). */
    from: z.string(),
    /** The "as of" instant the whole payload was computed against. */
    to: z.string(),
    /** When this payload was built — older than `to` for a cached hit. */
    generatedAt: z.string(),
  })
  .strict();
export type MetricsMeta = z.infer<typeof metricsMetaSchema>;

/** New accounts per signup week. Weeks with none are present as zero. */
export const signupsPerWeekSchema = z.array(
  z.object({ weekStart, signups: z.number().int() }).strict(),
);

/**
 * Distinct accounts seen in the trailing day / week / month, counted from the
 * union of `session.updated_at` and `usage_events.received_at` — the server
 * clock on both sides, so a wrong device date cannot move them.
 */
export const activeUsersSchema = z
  .object({
    dau: z.number().int(),
    wau: z.number().int(),
    mau: z.number().int(),
  })
  .strict();

/**
 * The north star. One entry per week: accounts that created at least three
 * meals inside that week (Monday to Monday, UTC).
 */
export const weeklyLoggingParentsSchema = z.array(
  z.object({ weekStart, parents: z.number().int() }).strict(),
);

/**
 * Activation, per signup-week cohort. Every step is measured from each
 * account's own signup instant, so a Sunday signup is judged on the same
 * 24/48 hours as a Monday one.
 */
export const activationCohortSchema = z
  .object({
    weekStart,
    signups: z.number().int(),
    /** Added a baby within 24 hours of signing up. Each later stage counts only parents who also cleared this one — the funnel can only narrow. */
    withBaby: z.number().int(),
    /** Also logged a first meal within 48 hours of signing up. */
    loggedMeal: z.number().int(),
    /** Logged meals on three or more distinct days within 28 days. */
    threeLoggingDays: z.number().int(),
  })
  .strict();
export const activationFunnelSchema = z.array(activationCohortSchema);
export type ActivationCohort = z.infer<typeof activationCohortSchema>;

/**
 * One row of the retention triangle. `retained[k]` is how many of the cohort
 * logged a meal in week k+1 after signup (W1 = days 1-7), or **null** when
 * that window has not finished yet for the whole cohort — an unfinished week
 * is not a zero, and a heat table that paints it as one would read as a
 * collapse.
 */
export const retentionCohortSchema = z
  .object({
    weekStart,
    size: z.number().int(),
    retained: z.array(z.number().int().nullable()).length(RETENTION_WEEKS),
  })
  .strict();
export const retentionTriangleSchema = z.array(retentionCohortSchema);
export type RetentionCohort = z.infer<typeof retentionCohortSchema>;

/** Features the adoption panel tracks, in display order. */
export const METRICS_FEATURES = [
  "storage",
  "allergens",
  "learn",
  "symptom_check",
  "chat",
  "favorites",
  "custom_items",
] as const;
export const metricsFeatureSchema = z.enum(METRICS_FEATURES);
export type MetricsFeature = z.infer<typeof metricsFeatureSchema>;

/**
 * Feature adoption over the trailing 28 days.
 *
 * `denominator` is the number of weekly logging parents in the window — an
 * account that hit the WLP bar (3+ meals) in at least one of the four
 * trailing 7-day windows. Shares are of that set, not of everybody who ever
 * signed up, because "do the people who use the app use this part of it" is
 * the question the panel is for. `users` counts only members of that set.
 */
export const featureAdoptionSchema = z
  .object({
    windowDays: z.number().int(),
    denominator: z.number().int(),
    features: z.array(
      z
        .object({
          feature: metricsFeatureSchema,
          users: z.number().int(),
          /** 0..1, or 0 when the denominator is 0. */
          share: z.number(),
        })
        .strict(),
    ),
  })
  .strict();

/** Tour outcomes, and where the skips cluster. All slides are present. */
export const tourOutcomesSchema = z
  .object({
    opened: z.number().int(),
    completed: z.number().int(),
    skipped: z.number().int(),
    /** completed / (completed + skipped), or 0 when neither happened. */
    completionRate: z.number(),
    skipsBySlide: z.array(
      z.object({ slide: z.number().int().min(0).max(USAGE_TOUR_SLIDE_MAX), skips: z.number().int() }).strict(),
    ),
  })
  .strict();

/**
 * Which catalog filters get touched, and which combinations come back empty.
 *
 * A combo is the SET of filter keys that were active (sorted, so the same
 * combination is one row however the client ordered it) plus whether a search
 * box was in play — never what was typed in it.
 */
export const catalogFiltersSchema = z
  .object({
    events: z.number().int(),
    zeroResults: z.number().int(),
    /** zeroResults / events, or 0 when there were none. */
    zeroResultRate: z.number(),
    byFilter: z.array(
      z
        .object({ filter: catalogFilterKeySchema, uses: z.number().int(), share: z.number() })
        .strict(),
    ),
    zeroResultCombos: z.array(
      z
        .object({
          catalog: usageCatalogSchema,
          filters: z.array(catalogFilterKeySchema),
          hasQuery: z.boolean(),
          count: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Storage, read from the storage table rather than from events: it is the
 * ground truth, and it covers parents who switched sharing off.
 * `serveThrough` = finished / (finished + discarded) over closes in range.
 */
export const storageServeThroughSchema = z
  .object({
    added: z.number().int(),
    finished: z.number().int(),
    discarded: z.number().int(),
    stillActive: z.number().int(),
    serveThrough: z.number(),
  })
  .strict();

/** Learn articles by views, most read first. Every article is present. */
export const learnRankingSchema = z.array(
  z.object({ article: articleSlugSchema, views: z.number().int(), share: z.number() }).strict(),
);

/**
 * Symptom checks by triage level, from the `symptom_checks` table (a
 * completed check), alongside the `symptom_check_started` event so the drop
 * between opening the survey and finishing it is visible.
 */
export const symptomTriageSchema = z
  .object({
    started: z.number().int(),
    completed: z.number().int(),
    /** completed / started, or 0 when nothing was started. */
    completionRate: z.number(),
    byLevel: z.array(
      z.object({ level: triageLevelSchema, checks: z.number().int(), share: z.number() }).strict(),
    ),
  })
  .strict();

/** The quality gate: client errors against sessions, and where they land. */
export const clientErrorsSchema = z
  .object({
    sessions: z.number().int(),
    errors: z.number().int(),
    /** errors / sessions * 100, or 0 when there were no sessions. */
    perHundredSessions: z.number(),
    topRoutes: z.array(
      z
        .object({
          route: z.string(),
          kind: z.string(),
          count: z.number().int(),
          /** Of all errors in range. */
          share: z.number(),
        })
        .strict(),
    ),
  })
  .strict();

/** Deploys inside the range, newest first — the markers on the WLP line. */
export const recentDeploysSchema = z.array(
  z.object({ sha: z.string(), deployedAt: z.string(), note: z.string().nullable() }).strict(),
);

/**
 * The whole dashboard in one response. One key per panel, in the order the
 * page renders them.
 */
export const adminMetricsResponseSchema = z
  .object({
    meta: metricsMetaSchema,
    signupsPerWeek: signupsPerWeekSchema,
    activeUsers: activeUsersSchema,
    weeklyLoggingParents: weeklyLoggingParentsSchema,
    activationFunnel: activationFunnelSchema,
    retentionTriangle: retentionTriangleSchema,
    featureAdoption: featureAdoptionSchema,
    tourOutcomes: tourOutcomesSchema,
    catalogFilters: catalogFiltersSchema,
    storageServeThrough: storageServeThroughSchema,
    learnRanking: learnRankingSchema,
    symptomTriage: symptomTriageSchema,
    clientErrors: clientErrorsSchema,
    recentDeploys: recentDeploysSchema,
  })
  .strict();

export type AdminMetricsResponse = z.infer<typeof adminMetricsResponseSchema>;
export type MetricsSignupsPerWeek = z.infer<typeof signupsPerWeekSchema>;
export type MetricsActiveUsers = z.infer<typeof activeUsersSchema>;
export type MetricsWeeklyLoggingParents = z.infer<typeof weeklyLoggingParentsSchema>;
export type MetricsFeatureAdoption = z.infer<typeof featureAdoptionSchema>;
export type MetricsTourOutcomes = z.infer<typeof tourOutcomesSchema>;
export type MetricsCatalogFilters = z.infer<typeof catalogFiltersSchema>;
export type MetricsStorageServeThrough = z.infer<typeof storageServeThroughSchema>;
export type MetricsLearnRanking = z.infer<typeof learnRankingSchema>;
export type MetricsSymptomTriage = z.infer<typeof symptomTriageSchema>;
export type MetricsClientErrors = z.infer<typeof clientErrorsSchema>;
export type MetricsRecentDeploys = z.infer<typeof recentDeploysSchema>;
