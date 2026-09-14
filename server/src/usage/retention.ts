import { lt, sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { usageEvents } from "../db/schema.js";

/** How often the purge runs after the one at boot. */
export const USAGE_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The oldest `received_at` a row may have and still be kept. */
export function retentionCutoff(retentionDays: number, now: Date): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/**
 * Deletes usage events older than the retention window and answers how many
 * went.
 *
 * Cut on `received_at`, never `occurred_at`: the client clock is the one
 * value here a device can get wrong, and a purge that trusted it would either
 * keep rows forever (a clock set far in the future) or delete today's data (a
 * clock set to 2019). `received_at` is ours.
 *
 * Deleting is the whole mechanism — there is no soft delete and no archive.
 * A retention promise that leaves the rows somewhere is not a retention
 * promise.
 */
export async function purgeExpiredUsageEvents(
  db: Database,
  retentionDays: number,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = retentionCutoff(retentionDays, now);

  // Counted rather than `returning()`-ed: the rows carry two jsonb columns
  // each, and dragging a day's worth of them into memory to arrive at a
  // number for one log line would be a strange way to save a query. Both
  // statements sit in one transaction so the number reported is exactly the
  // number removed.
  return db.transaction(async (tx) => {
    const [counted] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(lt(usageEvents.receivedAt, cutoff));

    await tx.delete(usageEvents).where(lt(usageEvents.receivedAt, cutoff));

    return counted?.count ?? 0;
  });
}
