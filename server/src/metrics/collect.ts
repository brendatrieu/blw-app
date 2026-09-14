// One dashboard payload, and the small cache in front of it.
import {
  METRICS_CACHE_TTL_MS,
  METRICS_RANGE_WEEKS,
  type AdminMetricsResponse,
  type MetricsRange,
} from "@blw/shared";
import type { Database } from "../db/index.js";
import {
  activationFunnel,
  activeUsers,
  catalogFilters,
  clientErrors,
  featureAdoption,
  learnRanking,
  metricsWindow,
  recentDeploys,
  retentionTriangle,
  signupsPerWeek,
  storageServeThrough,
  symptomTriage,
  tourOutcomes,
  weeklyLoggingParents,
} from "./queries.js";

/**
 * Runs every panel and assembles the response.
 *
 * Sequential on purpose. PGlite is a single connection and the production
 * pool is small, so firing fourteen analytical queries at once would trade a
 * few hundred milliseconds on a request that is cached for five minutes
 * against contention on the connection every parent's requests share.
 */
export async function collectMetrics(
  db: Database,
  range: MetricsRange,
  now: Date = new Date(),
): Promise<AdminMetricsResponse> {
  const { from } = metricsWindow(range, now);

  return {
    meta: {
      range,
      weeks: METRICS_RANGE_WEEKS[range],
      from: from.toISOString(),
      to: now.toISOString(),
      generatedAt: now.toISOString(),
    },
    signupsPerWeek: await signupsPerWeek(db, range, now),
    activeUsers: await activeUsers(db, range, now),
    weeklyLoggingParents: await weeklyLoggingParents(db, range, now),
    activationFunnel: await activationFunnel(db, range, now),
    retentionTriangle: await retentionTriangle(db, range, now),
    featureAdoption: await featureAdoption(db, range, now),
    tourOutcomes: await tourOutcomes(db, range, now),
    catalogFilters: await catalogFilters(db, range, now),
    storageServeThrough: await storageServeThrough(db, range, now),
    learnRanking: await learnRanking(db, range, now),
    symptomTriage: await symptomTriage(db, range, now),
    clientErrors: await clientErrors(db, range, now),
    recentDeploys: await recentDeploys(db, range, now),
  };
}

export interface MetricsCache {
  /** The payload for this range, computed or remembered. */
  read(db: Database, range: MetricsRange, now: Date): Promise<AdminMetricsResponse>;
  /** Drops everything. Only tests need it. */
  clear(): void;
}

export interface MetricsCacheOptions {
  ttlMs?: number;
  /** Injectable so a test can move time without waiting for it. */
  clock?: () => number;
}

/**
 * Five minutes of memory per range.
 *
 * The panels are a dozen sequential aggregate scans over every event ever
 * received, on a two-core VM that is also serving parents. A dashboard that
 * is refreshed, resized, or reopened in a second tab must not run them
 * again; the "as of" timestamp in `meta` is what tells the reader how old
 * the answer is, so a cached response is honest rather than stale.
 *
 * Per range, because the ranges are independent questions — and in memory,
 * because the app is a single process and a cache that outlives it would
 * outlive the numbers' usefulness too.
 */
export function createMetricsCache(options: MetricsCacheOptions = {}): MetricsCache {
  const ttlMs = options.ttlMs ?? METRICS_CACHE_TTL_MS;
  const clock = options.clock ?? Date.now;
  const entries = new Map<MetricsRange, { at: number; payload: AdminMetricsResponse }>();

  return {
    async read(db, range, now) {
      const at = clock();
      const cached = entries.get(range);
      if (cached && at - cached.at < ttlMs) {
        return cached.payload;
      }

      const payload = await collectMetrics(db, range, now);
      entries.set(range, { at, payload });
      return payload;
    },
    clear() {
      entries.clear();
    },
  };
}
