// Every dashboard panel, as one exported function each.
//
// Rules this file holds, and why:
//
//   * **Aggregates only.** Nothing here selects an id, an email or a name.
//     Not "we filter them out later" — they are never in a result set, so
//     there is no later.
//   * **`(db, range, now)`.** Every panel takes the clock rather than reading
//     it, so a test can pin a Tuesday in March and get the same numbers
//     forever. `now` is also the "as of" instant of the whole payload.
//   * **Portable SQL.** The app runs on real Postgres in production and on
//     PGlite in development and tests, so nothing below uses an extension,
//     a server setting or a function outside core Postgres. Every count is
//     cast `::int` and every ratio `::float8` before it leaves the database:
//     `count(*)` is a bigint, which node-postgres hands back as a STRING and
//     PGlite as a number, and a metric that is a string on production and a
//     number in the tests is a bug that only production can find.
//   * **Week buckets are UTC Mondays, computed in JS.** `date_trunc('week')`
//     on a timestamptz depends on the session timezone, so every bucket is
//     taken at `... at time zone 'UTC'` and the scaffold of weeks — including
//     the empty ones, which a chart needs and a GROUP BY never returns — is
//     built here.
//   * **Which clock.** Behaviour panels read `occurred_at` (when it happened
//     on the device, clamped on arrival); volume and liveness panels read
//     `received_at` (the server clock, which a wrong device date cannot move).
import { and, asc, desc, gte, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  ADOPTION_WINDOW_DAYS,
  ARTICLE_SLUGS,
  METRICS_FEATURES,
  METRICS_RANGE_WEEKS,
  METRICS_TOP_N,
  RETENTION_WEEKS,
  USAGE_TOUR_SLIDE_MAX,
  catalogFilterKeySchema,
  triageLevelSchema,
  usageCatalogSchema,
  type ArticleSlug,
  type CatalogFilterKey,
  type MetricsActiveUsers,
  type MetricsCatalogFilters,
  type MetricsClientErrors,
  type MetricsFeature,
  type MetricsFeatureAdoption,
  type MetricsLearnRanking,
  type MetricsRange,
  type MetricsRecentDeploys,
  type MetricsSignupsPerWeek,
  type MetricsStorageServeThrough,
  type MetricsSymptomTriage,
  type MetricsTourOutcomes,
  type MetricsWeeklyLoggingParents,
  type RetentionCohort,
  type ActivationCohort,
  type TriageLevel,
} from "@blw/shared";
import type { Database } from "../db/index.js";
import { babies, deploys, meals, session, storageItems, symptomChecks, usageEvents, user } from "../db/schema.js";

// ---------------------------------------------------------------------------
// Window arithmetic (pure — pinned by tests without a database)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** The WLP bar: meals in one week that make a parent a logging parent. */
export const WLP_MEALS_PER_WEEK = 3;

/** Midnight UTC on the Monday of this instant's week. */
export function utcWeekStart(date: Date): Date {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
  // getUTCDay(): 0 = Sunday. Monday is the first day of a Postgres/ISO week,
  // so Sunday belongs to the week that started six days earlier.
  const offsetDays = (start.getUTCDay() + 6) % 7;
  return new Date(start.getTime() - offsetDays * DAY_MS);
}

/** `YYYY-MM-DD`, matching what `to_char(..., 'YYYY-MM-DD')` returns. */
export function toWeekKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface MetricsWindow {
  weeks: number;
  /** Midnight UTC on the Monday that opens the first week in range. */
  from: Date;
  /** The "as of" instant: `now`, exclusive upper bound of every query. */
  to: Date;
  /** Every week in range, oldest first, as `YYYY-MM-DD`. The last one is the
   * current, still-running week — a partial bar, deliberately shown. */
  weekKeys: string[];
}

/** The one place a range label becomes dates. */
export function metricsWindow(range: MetricsRange, now: Date): MetricsWindow {
  const weeks = METRICS_RANGE_WEEKS[range];
  const currentWeek = utcWeekStart(now);
  const from = new Date(currentWeek.getTime() - (weeks - 1) * WEEK_MS);
  const weekKeys: string[] = [];
  for (let i = 0; i < weeks; i += 1) {
    weekKeys.push(toWeekKey(new Date(from.getTime() + i * WEEK_MS)));
  }
  return { weeks, from, to: now, weekKeys };
}

/** n / d, or 0 — never NaN, never Infinity — rounded so the JSON is stable. */
export function ratio(numerator: number, denominator: number, scale = 1): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * scale * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

/**
 * `db.execute` resolves to a driver-shaped result (`QueryResult` on
 * node-postgres, `Results` on PGlite). Both carry `.rows`; this is the one
 * place that knows it.
 */
async function rows<T>(db: Database, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

/** A week bucket, taken in UTC so the answer does not depend on the server. */
function weekOf(column: SQL | unknown): SQL {
  return sql`to_char(date_trunc('week', ${column} at time zone 'UTC'), 'YYYY-MM-DD')`;
}

/** Fills the weeks a GROUP BY never returned, which are exactly the zeros. */
function scaffoldWeeks<T>(
  weekKeys: string[],
  found: Map<string, T>,
  empty: (weekStart: string) => T,
): T[] {
  return weekKeys.map((week) => found.get(week) ?? empty(week));
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

/** New accounts per signup week. */
export async function signupsPerWeek(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<MetricsSignupsPerWeek> {
  const { from, to, weekKeys } = metricsWindow(range, now);

  const result = await rows<{ week: string; signups: number }>(
    db,
    sql`
      select ${weekOf(user.createdAt)} as week, count(*)::int as signups
      from ${user}
      where ${user.createdAt} >= ${from} and ${user.createdAt} < ${to}
      group by 1
    `,
  );

  const found = new Map(result.map((row) => [row.week, { weekStart: row.week, signups: row.signups }]));
  return scaffoldWeeks(weekKeys, found, (weekStart) => ({ weekStart, signups: 0 }));
}

/**
 * Daily / weekly / monthly active accounts.
 *
 * "Active" is the union of two server-clock facts: a session touched
 * (better-auth refreshes `updated_at` at most daily) and a usage event
 * received. Neither alone is enough — a parent with sharing switched off
 * still has sessions, and a signed-in PWA can send events for a while
 * without the session row moving.
 */
export async function activeUsers(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<MetricsActiveUsers> {
  // Deliberately NOT range-dependent: DAU/WAU/MAU are "right now" tiles, and
  // a 4-week range must not quietly change what MAU means.
  const monthFrom = new Date(now.getTime() - 30 * DAY_MS);
  const weekFrom = new Date(now.getTime() - 7 * DAY_MS);
  const dayFrom = new Date(now.getTime() - DAY_MS);

  const [result] = await rows<{ dau: number; wau: number; mau: number }>(
    db,
    sql`
      with activity as (
        select ${session.userId} as uid, ${session.updatedAt} as at
        from ${session}
        where ${session.updatedAt} >= ${monthFrom} and ${session.updatedAt} < ${now}
        union all
        select ${usageEvents.userId}, ${usageEvents.receivedAt}
        from ${usageEvents}
        where ${usageEvents.receivedAt} >= ${monthFrom}
          and ${usageEvents.receivedAt} < ${now}
          and ${usageEvents.userId} is not null
      )
      select
        (count(distinct uid) filter (where at >= ${dayFrom}))::int as dau,
        (count(distinct uid) filter (where at >= ${weekFrom}))::int as wau,
        (count(distinct uid))::int as mau
      from activity
    `,
  );

  return { dau: result?.dau ?? 0, wau: result?.wau ?? 0, mau: result?.mau ?? 0 };
}

/**
 * The north star: accounts that created at least three meals inside a week.
 *
 * Counted on `meals.created_at` — when the meal was WRITTEN — rather than
 * `served_at`, because the metric is about the habit of logging, and a
 * backdated entry belongs to the week the parent did the work.
 */
export async function weeklyLoggingParents(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<MetricsWeeklyLoggingParents> {
  const { from, to, weekKeys } = metricsWindow(range, now);

  const result = await rows<{ week: string; parents: number }>(
    db,
    sql`
      with per_week as (
        select ${weekOf(meals.createdAt)} as week, ${babies.userId} as uid, count(*)::int as logged
        from ${meals}
        join ${babies} on ${babies.id} = ${meals.babyId}
        where ${meals.createdAt} >= ${from} and ${meals.createdAt} < ${to}
        group by 1, 2
      )
      select week, count(*)::int as parents
      from per_week
      where logged >= ${WLP_MEALS_PER_WEEK}
      group by 1
    `,
  );

  const found = new Map(result.map((row) => [row.week, { weekStart: row.week, parents: row.parents }]));
  return scaffoldWeeks(weekKeys, found, (weekStart) => ({ weekStart, parents: 0 }));
}

/**
 * Activation per signup-week cohort.
 *
 * Every step is measured from each account's own signup instant, not from
 * the start of its week — a Sunday-night signup gets the same 24 and 48
 * hours as a Monday-morning one. The last step ("three logging days") is
 * counted over the first 28 days, so a cohort's answer stops changing a
 * month after it closes rather than drifting forever.
 */
export async function activationFunnel(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<ActivationCohort[]> {
  const { from, to, weekKeys } = metricsWindow(range, now);

  const result = await rows<{
    week: string;
    signups: number;
    with_baby: number;
    logged_meal: number;
    three_days: number;
  }>(
    db,
    sql`
      with cohort as (
        select ${user.id} as uid, ${user.createdAt} as signed_up, ${weekOf(user.createdAt)} as week
        from ${user}
        where ${user.createdAt} >= ${from} and ${user.createdAt} < ${to}
      ),
      first_baby as (
        select c.uid, min(${babies.createdAt}) as at
        from cohort c
        join ${babies} on ${babies.userId} = c.uid
        group by c.uid
      ),
      meal_facts as (
        select c.uid,
          min(${meals.createdAt}) as first_meal,
          count(distinct (${meals.createdAt} at time zone 'UTC')::date)
            filter (where ${meals.createdAt} < c.signed_up + interval '28 days') as logging_days
        from cohort c
        join ${babies} on ${babies.userId} = c.uid
        join ${meals} on ${meals.babyId} = ${babies.id}
        group by c.uid
      )
      select c.week,
        count(*)::int as signups,
        (count(*) filter (where first_baby.at <= c.signed_up + interval '24 hours'))::int as with_baby,
        (count(*) filter (where first_baby.at <= c.signed_up + interval '24 hours'
                            and meal_facts.first_meal <= c.signed_up + interval '48 hours'))::int as logged_meal,
        (count(*) filter (where first_baby.at <= c.signed_up + interval '24 hours'
                            and meal_facts.first_meal <= c.signed_up + interval '48 hours'
                            and coalesce(meal_facts.logging_days, 0) >= 3))::int as three_days
      from cohort c
      left join first_baby on first_baby.uid = c.uid
      left join meal_facts on meal_facts.uid = c.uid
      group by c.week
    `,
  );

  const found = new Map<string, ActivationCohort>(
    result.map((row) => [
      row.week,
      {
        weekStart: row.week,
        signups: row.signups,
        withBaby: row.with_baby,
        loggedMeal: row.logged_meal,
        threeLoggingDays: row.three_days,
      },
    ]),
  );

  return scaffoldWeeks(weekKeys, found, (weekStart) => ({
    weekStart,
    signups: 0,
    withBaby: 0,
    loggedMeal: 0,
    threeLoggingDays: 0,
  }));
}

/**
 * W1..W8 retention by signup cohort. W1 is days 1-7 after each account's own
 * signup instant, W2 days 8-14, and so on.
 *
 * A window that has not finished for the whole cohort comes back **null**
 * rather than a partial count: an unfinished week rendered as a zero reads
 * as a collapse, which is the one mistake a retention triangle must not make.
 */
export async function retentionTriangle(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<RetentionCohort[]> {
  const { from, to, weekKeys } = metricsWindow(range, now);

  const result = await rows<{ week: string; k: number; size: number; retained: number }>(
    db,
    sql`
      with cohort as (
        select ${user.id} as uid, ${user.createdAt} as signed_up, ${weekOf(user.createdAt)} as week
        from ${user}
        where ${user.createdAt} >= ${from} and ${user.createdAt} < ${to}
      ),
      week_numbers as (select generate_series(1, ${sql.raw(String(RETENTION_WEEKS))}) as k),
      per_user as (
        select c.week, c.uid, w.k,
          bool_or(
            ${meals.createdAt} > c.signed_up + (w.k - 1) * interval '7 days'
            and ${meals.createdAt} <= c.signed_up + w.k * interval '7 days'
          ) as came_back
        from cohort c
        cross join week_numbers w
        left join ${babies} on ${babies.userId} = c.uid
        left join ${meals} on ${meals.babyId} = ${babies.id}
        group by c.week, c.uid, w.k
      )
      select week, k,
        count(*)::int as size,
        (count(*) filter (where came_back))::int as retained
      from per_user
      group by week, k
    `,
  );

  const byWeek = new Map<string, { size: number; retained: (number | null)[] }>();
  for (const row of result) {
    const entry = byWeek.get(row.week) ?? { size: row.size, retained: Array(RETENTION_WEEKS).fill(null) };
    entry.size = row.size;
    if (row.k >= 1 && row.k <= RETENTION_WEEKS) entry.retained[row.k - 1] = row.retained;
    byWeek.set(row.week, entry);
  }

  return weekKeys.map((weekStart) => {
    const found = byWeek.get(weekStart);
    const cohortEnd = new Date(weekStart + "T00:00:00.000Z").getTime() + WEEK_MS;
    const retained = Array.from({ length: RETENTION_WEEKS }, (_, index) => {
      // The window is only reportable once it has closed for the LAST person
      // in the cohort, i.e. for somebody who signed up at the end of the week.
      const windowClosesAt = cohortEnd + (index + 1) * WEEK_MS;
      if (windowClosesAt > now.getTime()) return null;
      return found?.retained[index] ?? 0;
    });
    return { weekStart, size: found?.size ?? 0, retained };
  });
}

/**
 * Feature adoption over the trailing 28 days, among weekly logging parents.
 *
 * The denominator is the set of accounts that cleared the WLP bar in at
 * least one of the four trailing 7-day windows; the numerators count members
 * of that set who touched each feature. "Do the people who use the app use
 * this part of it" is the question, so the denominator is users, not visits.
 *
 * Touch is read from usage events — route views plus the events that only a
 * real action produces. `custom_items` is the weak one: P1 has no
 * `custom_item_created` event yet, so it counts parents who OPENED a custom
 * food/recipe editor. Noted in docs/analytics.md; it tightens in P2.
 */
export async function featureAdoption(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<MetricsFeatureAdoption> {
  const windowFrom = new Date(now.getTime() - ADOPTION_WINDOW_DAYS * DAY_MS);

  // One CTE shared by both halves, spelled once.
  const wlpCte = sql`
    with windows as (select generate_series(0, ${sql.raw(String(ADOPTION_WINDOW_DAYS / 7 - 1))}) as k),
    weekly as (
      select ${babies.userId} as uid, w.k, count(*)::int as logged
      from ${meals}
      join ${babies} on ${babies.id} = ${meals.babyId}
      cross join windows w
      where ${meals.createdAt} >= ${now}::timestamptz - (w.k + 1) * interval '7 days'
        and ${meals.createdAt} < ${now}::timestamptz - w.k * interval '7 days'
      group by 1, 2
    ),
    wlp as (select distinct uid from weekly where logged >= ${WLP_MEALS_PER_WEEK})
  `;

  const [denominatorRow] = await rows<{ denominator: number }>(
    db,
    sql`${wlpCte} select count(*)::int as denominator from wlp`,
  );
  const denominator = denominatorRow?.denominator ?? 0;

  const touched = await rows<{ feature: MetricsFeature; users: number }>(
    db,
    sql`
      ${wlpCte},
      touches as (
        select ${usageEvents.userId} as uid,
          case
            when ${usageEvents.name} in ('storage_item_added', 'storage_item_closed') then 'storage'
            when ${usageEvents.route} in ('/storage', '/storage/add', '/storage/:id', '/storage/:id/edit')
              then 'storage'
            when ${usageEvents.route} in ('/babies/:id/allergens', '/babies/:id/allergens/:slug')
              then 'allergens'
            when ${usageEvents.name} = 'article_viewed' or ${usageEvents.route} in ('/safety', '/safety/:slug')
              then 'learn'
            when ${usageEvents.name} = 'symptom_check_started' or ${usageEvents.route} = '/symptom-check'
              then 'symptom_check'
            when ${usageEvents.route} in ('/chat', '/chat/:threadId') then 'chat'
            when ${usageEvents.route} = '/favorites' then 'favorites'
            when ${usageEvents.route} in ('/foods/new', '/recipes/new', '/foods/:slug/edit', '/recipes/:id/edit')
              then 'custom_items'
          end as feature
        from ${usageEvents}
        where ${usageEvents.occurredAt} >= ${windowFrom}
          and ${usageEvents.occurredAt} < ${now}
          and ${usageEvents.userId} is not null
      )
      select feature, count(distinct touches.uid)::int as users
      from touches
      join wlp on wlp.uid = touches.uid
      where feature is not null
      group by 1
    `,
  );

  const counts = new Map(touched.map((row) => [row.feature, row.users]));
  return {
    windowDays: ADOPTION_WINDOW_DAYS,
    denominator,
    features: METRICS_FEATURES.map((feature) => {
      const users = counts.get(feature) ?? 0;
      return { feature, users, share: ratio(users, denominator) };
    }),
  };
}

/** Tour outcomes, and the slide the skips cluster on. */
export async function tourOutcomes(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<MetricsTourOutcomes> {
  const { from, to } = metricsWindow(range, now);
  const inRange = sql`${usageEvents.occurredAt} >= ${from} and ${usageEvents.occurredAt} < ${to}`;

  const [totals] = await rows<{ opened: number; completed: number; skipped: number }>(
    db,
    sql`
      select
        (count(*) filter (where ${usageEvents.name} = 'tour_opened'))::int as opened,
        (count(*) filter (where ${usageEvents.name} = 'tour_completed'))::int as completed,
        (count(*) filter (where ${usageEvents.name} = 'tour_skipped'))::int as skipped
      from ${usageEvents}
      where ${inRange}
    `,
  );

  const bySlide = await rows<{ slide: number; skips: number }>(
    db,
    sql`
      select (${usageEvents.props}->>'slide')::int as slide, count(*)::int as skips
      from ${usageEvents}
      where ${usageEvents.name} = 'tour_skipped' and ${inRange}
      group by 1
    `,
  );

  const skips = new Map(bySlide.map((row) => [row.slide, row.skips]));
  const completed = totals?.completed ?? 0;
  const skipped = totals?.skipped ?? 0;

  return {
    opened: totals?.opened ?? 0,
    completed,
    skipped,
    completionRate: ratio(completed, completed + skipped),
    // Every slide, including the ones nobody left on — a gap in the bars is
    // a slide that works, and it has to be visible as such.
    skipsBySlide: Array.from({ length: USAGE_TOUR_SLIDE_MAX + 1 }, (_, slide) => ({
      slide,
      skips: skips.get(slide) ?? 0,
    })),
  };
}

/**
 * Which catalog filters get used, and which combinations come back empty.
 *
 * A combination is the SET of filter keys — sorted in SQL, so the same
 * combination is one row however the client happened to order it — plus
 * whether a search box was in play. Never what was typed in it: the catalog
 * carries `has_query`, and there is no field anywhere that could carry the
 * text.
 */
export async function catalogFilters(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<MetricsCatalogFilters> {
  const { from, to } = metricsWindow(range, now);
  const filtered = sql`${usageEvents.name} = 'catalog_filtered'
    and ${usageEvents.occurredAt} >= ${from} and ${usageEvents.occurredAt} < ${to}`;

  const [totals] = await rows<{ events: number; zero_results: number }>(
    db,
    sql`
      select count(*)::int as events,
        (count(*) filter (where (${usageEvents.props}->>'zero_results')::boolean))::int as zero_results
      from ${usageEvents}
      where ${filtered}
    `,
  );

  const byFilter = await rows<{ filter: string; uses: number }>(
    db,
    sql`
      select fkey as filter, count(*)::int as uses
      from ${usageEvents}, jsonb_array_elements_text(${usageEvents.props}->'filters') as fkey
      where ${filtered}
      group by 1
    `,
  );

  const combos = await rows<{
    catalog: "foods" | "recipes";
    has_query: boolean;
    filters: CatalogFilterKey[];
    hits: number;
  }>(
    db,
    sql`
      with empty as (
        select ${usageEvents.props}->>'catalog' as catalog,
          (${usageEvents.props}->>'has_query')::boolean as has_query,
          (
            select coalesce(jsonb_agg(fkey order by fkey), '[]'::jsonb)
            from jsonb_array_elements_text(${usageEvents.props}->'filters') as fkey
          ) as filters
        from ${usageEvents}
        where ${filtered} and (${usageEvents.props}->>'zero_results')::boolean
      )
      select catalog, has_query, filters, count(*)::int as hits
      from empty
      group by 1, 2, 3
      order by hits desc, catalog asc, filters::text asc
      limit ${METRICS_TOP_N}
    `,
  );

  const events = totals?.events ?? 0;
  const zeroResults = totals?.zero_results ?? 0;
  const uses = new Map(byFilter.map((row) => [row.filter, row.uses]));

  return {
    events,
    zeroResults,
    zeroResultRate: ratio(zeroResults, events),
    // Every filter key, so "nobody has ever touched the fiber filter" is a
    // visible zero rather than a missing bar.
    byFilter: catalogFilterKeySchema.options.map((filter) => {
      const count = uses.get(filter) ?? 0;
      return { filter, uses: count, share: ratio(count, events) };
    }),
    // Stored rows outlive the vocabulary that wrote them: a filter key
    // retired in a later release would still be sitting in `props`, and the
    // response contract says these are the keys this build knows. A combo
    // built from a word we no longer speak is dropped rather than smuggled
    // through as a string the client cannot render.
    zeroResultCombos: combos.flatMap((row) => {
      const catalog = usageCatalogSchema.safeParse(row.catalog);
      const filters = z.array(catalogFilterKeySchema).safeParse(row.filters);
      if (!catalog.success || !filters.success) return [];
      return [{ catalog: catalog.data, filters: filters.data, hasQuery: row.has_query, count: row.hits }];
    }),
  };
}

/**
 * Storage, read from the storage table rather than from events.
 *
 * The table is the ground truth and it covers parents who switched sharing
 * off, which matters for the one question this panel exists to answer — is
 * food actually being eaten, or quietly thrown away.
 */
export async function storageServeThrough(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<MetricsStorageServeThrough> {
  const { from, to } = metricsWindow(range, now);
  const preparedInRange = sql`${storageItems.preparedAt} >= ${from} and ${storageItems.preparedAt} < ${to}`;
  const closedInRange = sql`${storageItems.statusChangedAt} >= ${from} and ${storageItems.statusChangedAt} < ${to}`;

  const [totals] = await rows<{
    added: number;
    finished: number;
    discarded: number;
    still_active: number;
  }>(
    db,
    sql`
      select
        (count(*) filter (where ${preparedInRange}))::int as added,
        (count(*) filter (where ${storageItems.status} = 'finished' and ${closedInRange}))::int as finished,
        (count(*) filter (where ${storageItems.status} = 'discarded' and ${closedInRange}))::int as discarded,
        (count(*) filter (where ${storageItems.status} = 'active' and ${preparedInRange}))::int as still_active
      from ${storageItems}
    `,
  );

  const finished = totals?.finished ?? 0;
  const discarded = totals?.discarded ?? 0;

  return {
    added: totals?.added ?? 0,
    finished,
    discarded,
    stillActive: totals?.still_active ?? 0,
    serveThrough: ratio(finished, finished + discarded),
  };
}

/** Learn articles by views. Every article is present, unread ones as zero. */
export async function learnRanking(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<MetricsLearnRanking> {
  const { from, to } = metricsWindow(range, now);

  const result = await rows<{ article: string; views: number }>(
    db,
    sql`
      select ${usageEvents.props}->>'article' as article, count(*)::int as views
      from ${usageEvents}
      where ${usageEvents.name} = 'article_viewed'
        and ${usageEvents.occurredAt} >= ${from} and ${usageEvents.occurredAt} < ${to}
      group by 1
    `,
  );

  const views = new Map(result.map((row) => [row.article, row.views]));
  const total = result.reduce((sum, row) => sum + row.views, 0);

  return ARTICLE_SLUGS.map((article: ArticleSlug) => {
    const count = views.get(article) ?? 0;
    return { article, views: count, share: ratio(count, total) };
  }).sort((a, b) => b.views - a.views || a.article.localeCompare(b.article));
}

/**
 * Symptom checks by triage level, plus the drop between opening the survey
 * and finishing it.
 *
 * Completions come from the `symptom_checks` table — a row exists only when
 * a check ran — while starts come from the event, because nothing is written
 * until the survey is submitted. Only the triage LEVEL is read: the survey
 * answers and the model's text are never aggregated, here or anywhere.
 */
export async function symptomTriage(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<MetricsSymptomTriage> {
  const { from, to } = metricsWindow(range, now);

  const byLevel = await rows<{ level: TriageLevel; checks: number }>(
    db,
    sql`
      select ${symptomChecks.triageLevel}::text as level, count(*)::int as checks
      from ${symptomChecks}
      where ${symptomChecks.createdAt} >= ${from} and ${symptomChecks.createdAt} < ${to}
      group by 1
    `,
  );

  const [startedRow] = await rows<{ started: number }>(
    db,
    sql`
      select count(*)::int as started
      from ${usageEvents}
      where ${usageEvents.name} = 'symptom_check_started'
        and ${usageEvents.occurredAt} >= ${from} and ${usageEvents.occurredAt} < ${to}
    `,
  );

  const counts = new Map(byLevel.map((row) => [row.level, row.checks]));
  const completed = byLevel.reduce((sum, row) => sum + row.checks, 0);
  const started = startedRow?.started ?? 0;

  return {
    started,
    completed,
    completionRate: ratio(completed, started),
    byLevel: triageLevelSchema.options.map((level) => {
      const checks = counts.get(level) ?? 0;
      return { level, checks, share: ratio(checks, completed) };
    }),
  };
}

/**
 * The quality gate: client errors per 100 sessions, and where they land.
 *
 * A "session" is a `session_started` event, which is the same unit the plan's
 * threshold (>2 per 100 sessions stops feature work) was written against.
 */
export async function clientErrors(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<MetricsClientErrors> {
  const { from, to } = metricsWindow(range, now);
  const inRange = sql`${usageEvents.occurredAt} >= ${from} and ${usageEvents.occurredAt} < ${to}`;

  const [totals] = await rows<{ sessions: number; errors: number }>(
    db,
    sql`
      select
        (count(*) filter (where ${usageEvents.name} = 'session_started'))::int as sessions,
        (count(*) filter (where ${usageEvents.name} = 'client_error'))::int as errors
      from ${usageEvents}
      where ${inRange}
    `,
  );

  const topRoutes = await rows<{ route: string; kind: string; hits: number }>(
    db,
    sql`
      select coalesce(${usageEvents.props}->>'route_pattern', '/*') as route,
        coalesce(${usageEvents.props}->>'kind', 'unknown') as kind,
        count(*)::int as hits
      from ${usageEvents}
      where ${usageEvents.name} = 'client_error' and ${inRange}
      group by 1, 2
      order by hits desc, route asc, kind asc
      limit ${METRICS_TOP_N}
    `,
  );

  const sessions = totals?.sessions ?? 0;
  const errors = totals?.errors ?? 0;

  return {
    sessions,
    errors,
    perHundredSessions: ratio(errors, sessions, 100),
    topRoutes: topRoutes.map((row) => ({
      route: row.route,
      kind: row.kind,
      count: row.hits,
      share: ratio(row.hits, errors),
    })),
  };
}

/** Cap on the deploy markers a range can carry, so a busy month cannot turn
 * the WLP chart into a picket fence (or the payload into a list of every
 * build ever made). */
const DEPLOY_LIMIT = 50;

/** Deploys inside the range, newest first — the markers on the WLP line. */
export async function recentDeploys(
  db: Database,
  range: MetricsRange,
  now: Date,
): Promise<MetricsRecentDeploys> {
  const { from, to } = metricsWindow(range, now);

  const result = await db
    .select({ sha: deploys.sha, deployedAt: deploys.deployedAt, note: deploys.note })
    .from(deploys)
    .where(and(gte(deploys.deployedAt, from), lt(deploys.deployedAt, to)))
    .orderBy(desc(deploys.deployedAt), asc(deploys.sha))
    .limit(DEPLOY_LIMIT);

  return result.map((row) => ({
    sha: row.sha,
    deployedAt: row.deployedAt.toISOString(),
    note: row.note,
  }));
}
