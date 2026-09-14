import type { Env } from "../config.js";
import type { Database } from "../db/index.js";
import { recordDeploy } from "./deploys.js";
import { USAGE_RETENTION_INTERVAL_MS, purgeExpiredUsageEvents } from "./retention.js";

/** The subset of Fastify's logger these jobs use. */
export interface JobLogger {
  info: (payload: Record<string, unknown>, message: string) => void;
  error: (payload: Record<string, unknown>, message: string) => void;
}

export interface UsageBackgroundJobOptions {
  db: Database;
  env: Env;
  log: JobLogger;
  /** Test seam: the timer factory, so the schedule can be driven with fake
   * timers without waiting a day. */
  setIntervalFn?: typeof setInterval;
}

/**
 * Starts the two background jobs analytics needs, and hands back a stop
 * function.
 *
 * Called from `index.ts` rather than from `buildApp()` deliberately: every
 * test in the suite builds an app, and neither a data-deleting purge nor a
 * write to `deploys` belongs in that. The real process is the only place a
 * boot actually happens.
 *
 * Both jobs are best-effort. A failing purge or a failing deploy insert is
 * logged and the server keeps serving — analytics is never allowed to be the
 * reason a parent cannot log a meal.
 */
export function startUsageBackgroundJobs({
  db,
  env,
  log,
  setIntervalFn = setInterval,
}: UsageBackgroundJobOptions): () => void {
  void recordDeploy(db, env.APP_VERSION)
    .then((recorded) => {
      if (recorded) log.info({ sha: env.APP_VERSION }, "recorded deploy");
    })
    .catch((err: unknown) => {
      log.error({ err }, "failed to record deploy");
    });

  const purge = () => {
    void purgeExpiredUsageEvents(db, env.USAGE_RETENTION_DAYS)
      .then((deleted) => {
        if (deleted > 0) {
          log.info({ deleted, retentionDays: env.USAGE_RETENTION_DAYS }, "purged expired usage events");
        }
      })
      .catch((err: unknown) => {
        log.error({ err }, "usage retention purge failed");
      });
  };

  purge();
  const timer = setIntervalFn(purge, USAGE_RETENTION_INTERVAL_MS);
  // Never the reason the process stays alive.
  timer.unref?.();

  return () => {
    clearInterval(timer);
  };
}
