import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminMetricsResponseSchema, type MetricsRange } from "@blw/shared";
import type { Database } from "../db/index.js";
import {
  babies,
  deploys,
  meals,
  session,
  storageItems,
  symptomChecks,
  usageEvents,
  user,
} from "../db/schema.js";
import { collectMetrics, createMetricsCache } from "../metrics/collect.js";
import { renderMetricsMarkdown } from "../metrics/markdown.js";
import { parseCliArgs } from "../metrics/cli.js";
import {
  activationFunnel,
  activeUsers,
  catalogFilters,
  clientErrors,
  featureAdoption,
  learnRanking,
  metricsWindow,
  ratio,
  recentDeploys,
  retentionTriangle,
  signupsPerWeek,
  storageServeThrough,
  symptomTriage,
  tourOutcomes,
  utcWeekStart,
  weeklyLoggingParents,
} from "../metrics/queries.js";
import { createTestDb, TEST_USAGE_CONTEXT } from "./helpers.js";

/**
 * A fixed Wednesday. Every panel takes `now` rather than reading the clock,
 * which is what lets these expectations be literal dates instead of
 * arithmetic — and what stops the suite from failing on a Monday.
 */
const NOW = new Date("2026-09-16T12:00:00.000Z");
const THIS_WEEK = "2026-09-14";
const LAST_WEEK = "2026-09-07";
const TWO_WEEKS_AGO = "2026-08-31";
const THREE_WEEKS_AGO = "2026-08-24";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

function at(iso: string): Date {
  return new Date(iso);
}

let db: Database;
let close: () => Promise<void>;
let seq = 0;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});

afterEach(async () => {
  await close();
});

async function seedUser(createdAt: Date, overrides: { email?: string; name?: string } = {}): Promise<string> {
  seq += 1;
  const id = `user-${seq}-${randomUUID()}`;
  await db.insert(user).values({
    id,
    name: overrides.name ?? `Parent ${seq}`,
    email: overrides.email ?? `parent${seq}@example.com`,
    emailVerified: true,
    createdAt,
    updatedAt: createdAt,
  });
  return id;
}

async function seedBaby(userId: string, createdAt: Date): Promise<string> {
  const [row] = await db
    .insert(babies)
    .values({ userId, name: "Robin", birthDate: "2026-01-01", createdAt })
    // Whole row: the field-projection overload of `returning()` does not
    // resolve against the dual-driver `Database` union (same note as
    // routes/preferences.ts).
    .returning();
  if (!row) throw new Error("baby insert returned no row");
  return row.id;
}

async function seedMeals(babyId: string, createdAts: Date[]): Promise<void> {
  for (const createdAt of createdAts) {
    await db.insert(meals).values({ babyId, servedAt: createdAt, createdAt });
  }
}

async function seedSession(userId: string, updatedAt: Date): Promise<void> {
  seq += 1;
  await db.insert(session).values({
    id: `session-${seq}`,
    userId,
    token: `token-${seq}`,
    expiresAt: new Date(NOW.getTime() + 30 * DAY),
    createdAt: updatedAt,
    updatedAt,
  });
}

interface EventSeed {
  name: string;
  props?: Record<string, unknown>;
  route?: string | null;
  userId?: string | null;
  occurredAt?: Date;
  receivedAt?: Date;
}

async function seedEvent(seed: EventSeed): Promise<void> {
  const occurredAt = seed.occurredAt ?? ago(HOUR);
  await db.insert(usageEvents).values({
    id: randomUUID(),
    userId: seed.userId ?? null,
    name: seed.name,
    props: seed.props ?? {},
    route: seed.route ?? null,
    appVersion: TEST_USAGE_CONTEXT.app_version,
    context: TEST_USAGE_CONTEXT,
    occurredAt,
    receivedAt: seed.receivedAt ?? occurredAt,
  });
}

// ---------------------------------------------------------------------------
// Pure window arithmetic
// ---------------------------------------------------------------------------

describe("window arithmetic", () => {
  it("buckets to UTC Mondays, whatever day it is asked on", () => {
    // Monday itself, mid-week, and the Sunday that belongs to the week before.
    expect(utcWeekStart(at("2026-09-14T00:00:00.000Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(utcWeekStart(at("2026-09-16T12:00:00.000Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(utcWeekStart(at("2026-09-20T23:59:59.000Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(utcWeekStart(at("2026-09-21T00:00:00.000Z")).toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("lays out one bucket per week, oldest first, ending in the current week", () => {
    const window = metricsWindow("4w", NOW);
    expect(window.weeks).toBe(4);
    expect(window.weekKeys).toEqual([THREE_WEEKS_AGO, TWO_WEEKS_AGO, LAST_WEEK, THIS_WEEK]);
    expect(window.from.toISOString()).toBe("2026-08-24T00:00:00.000Z");
    expect(window.to).toBe(NOW);
    expect(metricsWindow("12w", NOW).weekKeys).toHaveLength(12);
    expect(metricsWindow("26w", NOW).weekKeys).toHaveLength(26);
  });

  it("never divides by zero", () => {
    expect(ratio(3, 0)).toBe(0);
    expect(ratio(0, 0, 100)).toBe(0);
    expect(ratio(1, 3)).toBe(0.3333);
    expect(ratio(1, 8, 100)).toBe(12.5);
  });
});

// ---------------------------------------------------------------------------
// Empty database — every panel, before anybody has done anything
// ---------------------------------------------------------------------------

describe("an empty database", () => {
  it("answers every panel with a well-formed zero", async () => {
    const payload = await collectMetrics(db, "4w", NOW);

    // The contract itself: if a panel returned a shape the dashboard cannot
    // render, this is where it fails.
    expect(() => adminMetricsResponseSchema.parse(payload)).not.toThrow();

    expect(payload.meta).toEqual({
      range: "4w",
      weeks: 4,
      from: "2026-08-24T00:00:00.000Z",
      to: NOW.toISOString(),
      generatedAt: NOW.toISOString(),
    });

    // Weeks with nothing in them are present as zeros — a GROUP BY returns
    // no row for them, and a chart with four weeks must draw four bars.
    expect(payload.signupsPerWeek).toEqual([
      { weekStart: THREE_WEEKS_AGO, signups: 0 },
      { weekStart: TWO_WEEKS_AGO, signups: 0 },
      { weekStart: LAST_WEEK, signups: 0 },
      { weekStart: THIS_WEEK, signups: 0 },
    ]);
    expect(payload.weeklyLoggingParents.map((row) => row.parents)).toEqual([0, 0, 0, 0]);
    expect(payload.activeUsers).toEqual({ dau: 0, wau: 0, mau: 0 });
    expect(payload.activationFunnel).toHaveLength(4);
    // The oldest week's 24- and 48-hour windows have closed for everybody who
    // could have been in it; 28 days have not, so that stage is null rather
    // than a zero.
    expect(payload.activationFunnel[0]).toEqual({
      weekStart: THREE_WEEKS_AGO,
      signups: 0,
      withBaby: 0,
      loggedMeal: 0,
      threeLoggingDays: null,
    });
    expect(payload.activationFunnel.at(-1)).toEqual({
      weekStart: THIS_WEEK,
      signups: 0,
      withBaby: null,
      loggedMeal: null,
      threeLoggingDays: null,
    });

    // The oldest cohort's first two weeks have finished; the rest have not,
    // and an unfinished window is null rather than a zero.
    expect(payload.retentionTriangle[0]).toEqual({
      weekStart: THREE_WEEKS_AGO,
      size: 0,
      retained: [0, 0, null, null, null, null, null, null],
    });
    expect(payload.retentionTriangle.at(-1)?.retained).toEqual(Array(8).fill(null));

    expect(payload.featureAdoption.denominator).toBe(0);
    expect(payload.featureAdoption.features).toHaveLength(7);
    expect(payload.featureAdoption.features.every((row) => row.users === 0 && row.share === 0)).toBe(true);
    expect(payload.tourOutcomes.skipsBySlide.map((row) => row.slide)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(payload.tourOutcomes.completionRate).toBe(0);
    expect(payload.catalogFilters.byFilter).toHaveLength(11);
    expect(payload.catalogFilters.zeroResultCombos).toEqual([]);
    expect(payload.storageServeThrough).toEqual({
      added: 0,
      finished: 0,
      discarded: 0,
      stillActive: 0,
      serveThrough: 0,
    });
    expect(payload.learnRanking).toHaveLength(9);
    expect(payload.symptomTriage.byLevel).toHaveLength(4);
    expect(payload.clientErrors).toEqual({
      sessions: 0,
      errors: 0,
      perHundredSessions: 0,
      topRoutes: [],
    });
    expect(payload.recentDeploys).toEqual([]);
  });

  it("returns numbers, not the strings a bigint count would give", async () => {
    // node-postgres hands `count(*)` back as a STRING; PGlite as a number.
    // Every count is cast to int for exactly this reason, and this is the
    // assertion that would have caught it in production.
    const payload = await collectMetrics(db, "4w", NOW);
    expect(typeof payload.signupsPerWeek[0]?.signups).toBe("number");
    expect(typeof payload.activeUsers.mau).toBe("number");
    expect(typeof payload.clientErrors.perHundredSessions).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Panels, one at a time
// ---------------------------------------------------------------------------

describe("signupsPerWeek", () => {
  it("counts accounts into the week they signed up in, and ignores older ones", async () => {
    await seedUser(at("2026-09-14T09:00:00.000Z"));
    await seedUser(at("2026-09-16T08:00:00.000Z"));
    await seedUser(at("2026-09-20T23:00:00.000Z")); // still this week (Sunday)
    await seedUser(at("2026-09-09T09:00:00.000Z"));
    await seedUser(at("2026-06-01T09:00:00.000Z")); // before the range

    expect(await signupsPerWeek(db, "4w", NOW)).toEqual([
      { weekStart: THREE_WEEKS_AGO, signups: 0 },
      { weekStart: TWO_WEEKS_AGO, signups: 0 },
      { weekStart: LAST_WEEK, signups: 1 },
      // The Sunday signup is in the future relative to `now`, so it is not
      // counted: every query stops at the "as of" instant.
      { weekStart: THIS_WEEK, signups: 2 },
    ]);
  });
});

describe("activeUsers", () => {
  it("unions sessions and events, and ignores anonymous ones", async () => {
    const today = await seedUser(ago(40 * DAY));
    const thisWeek = await seedUser(ago(40 * DAY));
    const thisMonth = await seedUser(ago(40 * DAY));
    const eventOnly = await seedUser(ago(40 * DAY));
    const dormant = await seedUser(ago(60 * DAY));

    await seedSession(today, ago(2 * HOUR));
    await seedSession(thisWeek, ago(3 * DAY));
    await seedSession(thisMonth, ago(20 * DAY));
    await seedSession(dormant, ago(45 * DAY));
    // A signed-in event with no session touch still counts as activity.
    await seedEvent({ name: "session_started", userId: eventOnly, receivedAt: ago(3 * HOUR) });
    // Anonymous events (the sign-in screen) belong to nobody and must not
    // inflate a user count.
    await seedEvent({ name: "session_started", userId: null, receivedAt: ago(HOUR) });

    expect(await activeUsers(db, "4w", NOW)).toEqual({ dau: 2, wau: 3, mau: 4 });
  });
});

describe("weeklyLoggingParents", () => {
  it("counts a parent only in a week where they logged three meals", async () => {
    const regular = await seedUser(ago(60 * DAY));
    const occasional = await seedUser(ago(60 * DAY));
    const spread = await seedUser(ago(60 * DAY));

    const regularBaby = await seedBaby(regular, ago(60 * DAY));
    const occasionalBaby = await seedBaby(occasional, ago(60 * DAY));
    const spreadBaby = await seedBaby(spread, ago(60 * DAY));

    await seedMeals(regularBaby, [
      at("2026-09-14T08:00:00.000Z"),
      at("2026-09-15T08:00:00.000Z"),
      at("2026-09-16T08:00:00.000Z"),
    ]);
    await seedMeals(occasionalBaby, [at("2026-09-14T08:00:00.000Z"), at("2026-09-15T08:00:00.000Z")]);
    // Three meals, but across a week boundary: three is a weekly bar, not a
    // lifetime one.
    await seedMeals(spreadBaby, [
      at("2026-09-11T08:00:00.000Z"),
      at("2026-09-12T08:00:00.000Z"),
      at("2026-09-14T08:00:00.000Z"),
    ]);

    expect(await weeklyLoggingParents(db, "4w", NOW)).toEqual([
      { weekStart: THREE_WEEKS_AGO, parents: 0 },
      { weekStart: TWO_WEEKS_AGO, parents: 0 },
      { weekStart: LAST_WEEK, parents: 0 },
      { weekStart: THIS_WEEK, parents: 1 },
    ]);
  });
});

describe("activationFunnel", () => {
  // Weeks old enough that all three windows have closed for the LAST person in
  // them — the only weeks that can carry counts rather than nulls. A "4w" range
  // reaches back three weeks, which is inside the 28-day window by
  // construction, so these read the 12-week range.
  const MATURE_WEEK = "2026-06-29";
  const NEXT_WEEK = "2026-07-06";

  it("measures each step from that account's own signup instant", async () => {
    const activated = await seedUser(at("2026-06-29T09:00:00.000Z"));
    const babyId = await seedBaby(activated, at("2026-06-29T11:00:00.000Z")); // +2h
    await seedMeals(babyId, [
      at("2026-06-29T19:00:00.000Z"), // +10h -> first meal inside 48h
      at("2026-06-30T19:00:00.000Z"),
      at("2026-07-01T09:00:00.000Z"), // third distinct day
    ]);

    const slow = await seedUser(at("2026-07-06T09:00:00.000Z"));
    const slowBaby = await seedBaby(slow, at("2026-07-07T21:00:00.000Z")); // +36h
    await seedMeals(slowBaby, [at("2026-07-09T09:00:00.000Z")]); // +72h

    const funnel = await activationFunnel(db, "12w", NOW);
    expect(funnel.find((row) => row.weekStart === MATURE_WEEK)).toEqual({
      weekStart: MATURE_WEEK,
      signups: 1,
      withBaby: 1,
      loggedMeal: 1,
      threeLoggingDays: 1,
    });
    expect(funnel.find((row) => row.weekStart === NEXT_WEEK)).toEqual({
      weekStart: NEXT_WEEK,
      signups: 1,
      withBaby: 0,
      loggedMeal: 0,
      threeLoggingDays: 0,
    });
  });

  it("reports nothing for a week whose windows are still open, and a zero is not that", async () => {
    // Somebody who signed up an hour ago can still add a baby, so counting
    // them as a miss would draw the newest week as a cliff every single week.
    const fresh = await seedUser(at("2026-09-16T09:00:00.000Z"));
    await seedBaby(fresh, at("2026-09-16T10:00:00.000Z"));

    const funnel = await activationFunnel(db, "4w", NOW);
    expect(funnel.find((row) => row.weekStart === THIS_WEEK)).toEqual({
      weekStart: THIS_WEEK,
      signups: 1,
      withBaby: null,
      loggedMeal: null,
      threeLoggingDays: null,
    });

    // Two weeks back the 24- and 48-hour windows HAVE closed — an empty week
    // is a real zero there — while 28 days still have not.
    expect(funnel.find((row) => row.weekStart === TWO_WEEKS_AGO)).toEqual({
      weekStart: TWO_WEEKS_AGO,
      signups: 0,
      withBaby: 0,
      loggedMeal: 0,
      threeLoggingDays: null,
    });
  });
});

describe("activationFunnel (stages are cumulative)", () => {
  it("does not count a first meal for a parent whose baby missed the 24-hour step", async () => {
    // Baby at +30h, first meal at +40h, three logging days: the later stages
    // are met on their own, but the funnel can only narrow, so none count.
    const user = await seedUser(at("2026-06-29T09:00:00.000Z"));
    const babyId = await seedBaby(user, at("2026-06-30T15:00:00.000Z")); // +30h
    await seedMeals(babyId, [
      at("2026-07-01T01:00:00.000Z"), // +40h
      at("2026-07-02T01:00:00.000Z"),
      at("2026-07-03T01:00:00.000Z"),
    ]);

    const funnel = await activationFunnel(db, "12w", NOW);
    expect(funnel.find((row) => row.weekStart === "2026-06-29")).toEqual({
      weekStart: "2026-06-29",
      signups: 1,
      withBaby: 0,
      loggedMeal: 0,
      threeLoggingDays: 0,
    });
  });
});

describe("retentionTriangle", () => {
  it("places a return in the right week and leaves unfinished weeks null", async () => {
    // Ten weeks back, so W1..W8 have all closed for this cohort.
    const signedUp = at("2026-06-29T10:00:00.000Z");
    const userId = await seedUser(signedUp);
    const babyId = await seedBaby(userId, signedUp);
    await seedMeals(babyId, [
      at("2026-07-02T10:00:00.000Z"), // day 3 -> W1
      at("2026-07-24T10:00:00.000Z"), // day 25 -> W4
    ]);

    const triangle = await retentionTriangle(db, "12w", NOW);
    const cohort = triangle.find((row) => row.weekStart === "2026-06-29");
    expect(cohort?.size).toBe(1);
    expect(cohort?.retained).toEqual([1, 0, 0, 1, 0, 0, 0, 0]);

    // The newest cohort has nothing finished at all.
    expect(triangle.at(-1)?.retained).toEqual(Array(8).fill(null));
  });
});

describe("featureAdoption", () => {
  it("counts weekly logging parents who touched each feature, and nobody else", async () => {
    const logger = await seedUser(ago(60 * DAY));
    const babyId = await seedBaby(logger, ago(60 * DAY));
    await seedMeals(babyId, [ago(DAY), ago(2 * DAY), ago(3 * DAY)]);

    const lurker = await seedUser(ago(60 * DAY));

    await seedEvent({ name: "screen_viewed", route: "/storage", userId: logger, occurredAt: ago(2 * DAY) });
    await seedEvent({ name: "article_viewed", route: "/safety/:slug", userId: logger, occurredAt: ago(2 * DAY) });
    await seedEvent({ name: "screen_viewed", route: "/favorites", userId: logger, occurredAt: ago(40 * DAY) });
    // Not a logging parent: their taps must not move the adoption bars.
    await seedEvent({ name: "screen_viewed", route: "/chat", userId: lurker, occurredAt: ago(DAY) });

    const adoption = await featureAdoption(db, "4w", NOW);
    expect(adoption.windowDays).toBe(28);
    expect(adoption.denominator).toBe(1);

    const byFeature = new Map(adoption.features.map((row) => [row.feature, row.users]));
    expect(byFeature.get("storage")).toBe(1);
    expect(byFeature.get("learn")).toBe(1);
    // Older than the 28-day window.
    expect(byFeature.get("favorites")).toBe(0);
    // A non-WLP user's visit.
    expect(byFeature.get("chat")).toBe(0);
    expect(adoption.features.find((row) => row.feature === "storage")?.share).toBe(1);
  });
});

describe("tourOutcomes", () => {
  it("splits completions from skips and shows every slide", async () => {
    await seedEvent({ name: "tour_opened", props: { source: "first_run" }, occurredAt: ago(DAY) });
    await seedEvent({ name: "tour_opened", props: { source: "more" }, occurredAt: ago(DAY) });
    await seedEvent({ name: "tour_completed", props: { source: "first_run" }, occurredAt: ago(DAY) });
    await seedEvent({
      name: "tour_skipped",
      props: { source: "first_run", slide: 1, via: "skip" },
      occurredAt: ago(DAY),
    });
    await seedEvent({
      name: "tour_skipped",
      props: { source: "first_run", slide: 4, via: "escape" },
      occurredAt: ago(2 * DAY),
    });
    // Outside the range: it must not count.
    await seedEvent({
      name: "tour_skipped",
      props: { source: "more", slide: 1, via: "skip" },
      occurredAt: at("2026-05-01T10:00:00.000Z"),
    });

    const outcomes = await tourOutcomes(db, "4w", NOW);
    expect(outcomes.opened).toBe(2);
    expect(outcomes.completed).toBe(1);
    expect(outcomes.skipped).toBe(2);
    expect(outcomes.completionRate).toBe(0.3333);
    expect(outcomes.skipsBySlide).toEqual([
      { slide: 0, skips: 0 },
      { slide: 1, skips: 1 },
      { slide: 2, skips: 0 },
      { slide: 3, skips: 0 },
      { slide: 4, skips: 1 },
      { slide: 5, skips: 0 },
    ]);
  });
});

describe("catalogFilters", () => {
  it("counts filter keys and merges a zero-result combination however it was ordered", async () => {
    const filtered = (props: Record<string, unknown>) =>
      seedEvent({ name: "catalog_filtered", props, route: "/foods", occurredAt: ago(DAY) });

    await filtered({
      catalog: "foods",
      filters: ["iron_level", "category"],
      has_query: false,
      results: "0",
      zero_results: true,
    });
    await filtered({
      catalog: "foods",
      // Same SET of filters, opposite order — one combination, not two.
      filters: ["category", "iron_level"],
      has_query: false,
      results: "0",
      zero_results: true,
    });
    await filtered({
      catalog: "recipes",
      filters: ["allergen"],
      has_query: true,
      results: "6-20",
      zero_results: false,
    });

    const panel = await catalogFilters(db, "4w", NOW);
    expect(panel.events).toBe(3);
    expect(panel.zeroResults).toBe(2);
    expect(panel.zeroResultRate).toBe(0.6667);

    const uses = new Map(panel.byFilter.map((row) => [row.filter, row.uses]));
    expect(uses.get("category")).toBe(2);
    expect(uses.get("iron_level")).toBe(2);
    expect(uses.get("allergen")).toBe(1);
    expect(uses.get("fiber_level")).toBe(0);

    expect(panel.zeroResultCombos).toEqual([
      { catalog: "foods", filters: ["category", "iron_level"], hasQuery: false, count: 2 },
    ]);
  });
});

describe("storageServeThrough", () => {
  it("reads the storage table rather than events", async () => {
    const owner = await seedUser(ago(60 * DAY));
    const prepared = ago(10 * DAY);
    const rows = [
      { status: "finished" as const, statusChangedAt: ago(2 * DAY) },
      { status: "finished" as const, statusChangedAt: ago(3 * DAY) },
      { status: "finished" as const, statusChangedAt: ago(4 * DAY) },
      { status: "discarded" as const, statusChangedAt: ago(5 * DAY) },
      { status: "active" as const, statusChangedAt: prepared },
    ];
    for (const row of rows) {
      await db.insert(storageItems).values({
        userId: owner,
        label: "Leftovers",
        preparedAt: prepared,
        location: "fridge",
        status: row.status,
        statusChangedAt: row.statusChangedAt,
      });
    }

    expect(await storageServeThrough(db, "4w", NOW)).toEqual({
      added: 5,
      finished: 3,
      discarded: 1,
      stillActive: 1,
      serveThrough: 0.75,
    });
  });
});

describe("learnRanking", () => {
  it("ranks articles and keeps the unread ones visible", async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedEvent({
        name: "article_viewed",
        props: { article: "gagging-vs-choking", from_route: null },
        occurredAt: ago(DAY),
      });
    }
    await seedEvent({
      name: "article_viewed",
      props: { article: "unsafe-foods", from_route: null },
      occurredAt: ago(DAY),
    });

    const ranking = await learnRanking(db, "4w", NOW);
    expect(ranking).toHaveLength(9);
    expect(ranking[0]).toEqual({ article: "gagging-vs-choking", views: 3, share: 0.75 });
    expect(ranking[1]).toEqual({ article: "unsafe-foods", views: 1, share: 0.25 });
    expect(ranking.at(-1)?.views).toBe(0);
  });
});

describe("symptomTriage", () => {
  it("shares out completed checks by level and shows the drop from started", async () => {
    const owner = await seedUser(ago(60 * DAY));
    const babyId = await seedBaby(owner, ago(60 * DAY));

    for (const level of ["monitor_at_home", "monitor_at_home", "emergency"] as const) {
      await db.insert(symptomChecks).values({
        babyId,
        survey: {},
        windowHours: 24,
        foodsConsidered: [],
        triageLevel: level,
        result: {},
        createdAt: ago(2 * DAY),
      });
    }
    for (let i = 0; i < 4; i += 1) {
      await seedEvent({ name: "symptom_check_started", occurredAt: ago(2 * DAY) });
    }

    const panel = await symptomTriage(db, "4w", NOW);
    expect(panel.started).toBe(4);
    expect(panel.completed).toBe(3);
    expect(panel.completionRate).toBe(0.75);
    expect(panel.byLevel).toEqual([
      { level: "monitor_at_home", checks: 2, share: 0.6667 },
      { level: "contact_doctor_24h", checks: 0, share: 0 },
      { level: "urgent_care", checks: 0, share: 0 },
      { level: "emergency", checks: 1, share: 0.3333 },
    ]);
  });
});

describe("clientErrors", () => {
  it("rates errors against sessions and ranks the routes they happen on", async () => {
    for (let i = 0; i < 20; i += 1) {
      await seedEvent({ name: "session_started", occurredAt: ago(DAY) });
    }
    for (const occurredAt of [ago(3 * DAY), ago(2 * DAY), ago(DAY)]) {
      await seedEvent({
        name: "client_error",
        props: { route_pattern: "/log-meal", kind: "api_5xx", status: "500" },
        occurredAt,
      });
    }
    // Same route, same kind, a different status: a 503 is a different failure
    // from a 500 and reads as one, so it is its own row rather than folded in.
    await seedEvent({
      name: "client_error",
      props: { route_pattern: "/log-meal", kind: "api_5xx", status: "503" },
      occurredAt: ago(2 * HOUR),
    });
    await seedEvent({
      name: "client_error",
      props: { route_pattern: "/foods/:slug", kind: "render_crash", status: "none" },
      occurredAt: ago(DAY),
    });

    const panel = await clientErrors(db, "4w", NOW);
    expect(panel.sessions).toBe(20);
    expect(panel.errors).toBe(5);
    expect(panel.perHundredSessions).toBe(25);
    expect(panel.topRoutes).toEqual([
      {
        route: "/log-meal",
        kind: "api_5xx",
        status: "500",
        count: 3,
        share: 0.6,
        lastAt: ago(DAY).toISOString(),
      },
      {
        route: "/foods/:slug",
        kind: "render_crash",
        status: "none",
        count: 1,
        share: 0.2,
        lastAt: ago(DAY).toISOString(),
      },
      {
        route: "/log-meal",
        kind: "api_5xx",
        status: "503",
        count: 1,
        share: 0.2,
        lastAt: ago(2 * HOUR).toISOString(),
      },
    ]);
  });
});

describe("recentDeploys", () => {
  it("returns the builds inside the range, newest first", async () => {
    await db.insert(deploys).values([
      { sha: "aaaaaaaaaaaa", deployedAt: ago(2 * DAY), note: "tour copy" },
      { sha: "bbbbbbbbbbbb", deployedAt: ago(9 * DAY), note: null },
      { sha: "cccccccccccc", deployedAt: at("2026-01-01T00:00:00.000Z"), note: "old" },
    ]);

    const result = await recentDeploys(db, "4w", NOW);
    expect(result.map((row) => row.sha)).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
    expect(result[0]?.note).toBe("tour copy");
    expect(result[0]?.deployedAt).toBe(ago(2 * DAY).toISOString());
  });
});

// ---------------------------------------------------------------------------
// The privacy invariant, as a test rather than a habit
// ---------------------------------------------------------------------------

describe("the payload as a whole", () => {
  it("carries no id, email or name from a seeded database", async () => {
    const email = "identifiable@example.com";
    const name = "Very Identifiable Parent";
    const userId = await seedUser(ago(20 * DAY), { email, name });
    const babyId = await seedBaby(userId, ago(20 * DAY));
    await seedMeals(babyId, [ago(DAY), ago(2 * DAY), ago(3 * DAY)]);
    await seedSession(userId, ago(HOUR));
    await seedEvent({ name: "screen_viewed", route: "/storage", userId, occurredAt: ago(DAY) });
    await db.insert(storageItems).values({
      userId,
      label: "Secret label",
      preparedAt: ago(5 * DAY),
      location: "fridge",
      status: "finished",
      statusChangedAt: ago(2 * DAY),
    });

    const serialised = JSON.stringify(await collectMetrics(db, "12w", NOW));
    for (const secret of [email, name, userId, babyId, "Secret label", "Robin"]) {
      expect(serialised).not.toContain(secret);
    }
    // And the numbers did arrive, so the absence above is not an empty answer.
    expect(serialised).toContain('{"feature":"storage","users":1,"share":1}');
    expect(serialised).toContain('"dau":1');
  });

  it("runs every range", async () => {
    for (const range of ["4w", "12w", "26w"] as MetricsRange[]) {
      const payload = await collectMetrics(db, range, NOW);
      expect(adminMetricsResponseSchema.parse(payload).meta.range).toBe(range);
    }
  });
});

// ---------------------------------------------------------------------------
// The cache
// ---------------------------------------------------------------------------

describe("the metrics cache", () => {
  /** Counts the statements a cache miss costs, so a hit can be proved free. */
  function countingDb(target: Database): { db: Database; queries: () => number } {
    let queries = 0;
    const proxy = new Proxy(target, {
      get(source, property, receiver) {
        const value = Reflect.get(source, property, receiver);
        if ((property === "execute" || property === "select") && typeof value === "function") {
          return (...args: unknown[]) => {
            queries += 1;
            return (value as (...rest: unknown[]) => unknown).apply(source, args);
          };
        }
        return value;
      },
    }) as Database;
    return { db: proxy, queries: () => queries };
  }

  it("does not touch the database again within the window", async () => {
    const counted = countingDb(db);
    const cache = createMetricsCache();

    await cache.read(counted.db, "4w", NOW);
    const afterFirst = counted.queries();
    expect(afterFirst).toBeGreaterThan(0);

    await cache.read(counted.db, "4w", new Date(NOW.getTime() + 60_000));
    expect(counted.queries()).toBe(afterFirst);
  });

  it("keeps the 'as of' instant of the run that filled it", async () => {
    const cache = createMetricsCache();
    const first = await cache.read(db, "4w", NOW);
    const second = await cache.read(db, "4w", new Date(NOW.getTime() + 60_000));
    // A cached answer is honest about its age rather than restamping itself.
    expect(second.meta.generatedAt).toBe(first.meta.generatedAt);
  });

  it("caches each range separately", async () => {
    const counted = countingDb(db);
    const cache = createMetricsCache();

    await cache.read(counted.db, "4w", NOW);
    const afterFirst = counted.queries();
    await cache.read(counted.db, "12w", NOW);
    expect(counted.queries()).toBeGreaterThan(afterFirst);
  });

  it("recomputes once the window has passed", async () => {
    let clock = 1_000_000;
    const counted = countingDb(db);
    const cache = createMetricsCache({ clock: () => clock });

    await cache.read(counted.db, "4w", NOW);
    const afterFirst = counted.queries();

    clock += 5 * 60 * 1000 - 1;
    await cache.read(counted.db, "4w", NOW);
    expect(counted.queries()).toBe(afterFirst);

    clock += 2;
    await cache.read(counted.db, "4w", NOW);
    expect(counted.queries()).toBeGreaterThan(afterFirst);
  });
});

// ---------------------------------------------------------------------------
// The CLI
// ---------------------------------------------------------------------------

describe("the report CLI", () => {
  it("parses its arguments and refuses an unknown range", () => {
    expect(parseCliArgs([])).toEqual({ range: "12w", json: false });
    expect(parseCliArgs(["--range", "4w"])).toEqual({ range: "4w", json: false });
    expect(parseCliArgs(["--range=26w", "--json"])).toEqual({ range: "26w", json: true });
    expect(() => parseCliArgs(["--range", "3w"])).toThrow(/4w, 12w, 26w/);
    expect(() => parseCliArgs(["--range"])).toThrow(/4w, 12w, 26w/);
    expect(() => parseCliArgs(["--everything"])).toThrow(/Unknown argument/);
  });

  it("renders the same payload as Markdown", async () => {
    await seedEvent({
      name: "client_error",
      props: { route_pattern: "/log-meal", kind: "api_5xx", status: "500" },
      occurredAt: ago(DAY),
    });
    const payload = await collectMetrics(db, "4w", NOW);
    const markdown = renderMetricsMarkdown(payload);

    expect(markdown).toContain("# Little Meals metrics — 4w");
    expect(markdown).toContain(`As of ${NOW.toISOString()}`);
    for (const heading of [
      "## Headline",
      "## Weekly logging parents and signups",
      "## Activation funnel",
      "## Retention triangle",
      "## Feature adoption",
      "## Tour",
      "## Catalog filters",
      "## Storage",
      "## Learn",
      "## Symptom checks",
      "## Client errors",
      "## Deploys in range",
    ]) {
      expect(markdown).toContain(heading);
    }
    // An unfinished retention window is a dash, not a 0.0%.
    expect(markdown).toContain("| — |");
    // And an activation window that has not closed for the whole week says so
    // in words rather than printing a count nobody could act on.
    expect(markdown).toContain("not yet");
    expect(markdown).toContain("| Route | Kind | Status | Count | Share | Last seen |");
  });
});
