import type { Database } from "../db/index.js";
import { deploys } from "../db/schema.js";

/**
 * Records the running build, once.
 *
 * How the server learns its own version: the deploy workflow already passes
 * `GITHUB_SHA` to `docker build`, and the Dockerfile's runner stage bakes it
 * in as `APP_VERSION`, truncated to the same 12 characters the client's
 * `__APP_VERSION__` uses (see APP_VERSION_LENGTH in config.ts). So one commit
 * produces one string on both sides of the wire, and an event's `app_version`
 * joins to `deploys.sha` on equality with no normalising.
 *
 * Optional on purpose: dev and test have no deploy to record, `APP_VERSION` is
 * unset there, and this is a no-op rather than a boot failure. That is also
 * what keeps `docker compose up` working for anyone building the image by
 * hand without the build-arg.
 *
 * Restarts are not deploys: the insert is `ON CONFLICT DO NOTHING` on the
 * SHA, so a container that restarts five times in a day still shows one
 * marker on the dashboard, at the moment the build first ran.
 *
 * Returns true only when a NEW row was written.
 */
export async function recordDeploy(
  db: Database,
  appVersion: string | undefined,
  note: string | null = null,
): Promise<boolean> {
  if (!appVersion) return false;

  const inserted = await db
    .insert(deploys)
    .values({ sha: appVersion, note })
    .onConflictDoNothing({ target: deploys.sha })
    // Bare: drizzle's field-projection overload of `returning()` does not
    // resolve against the dual node-postgres/PGlite `Database` union.
    .returning();

  return inserted.length > 0;
}
