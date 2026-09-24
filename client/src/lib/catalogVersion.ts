import type { Query, QueryClient } from "@tanstack/react-query";

export const CATALOG_VERSION_STORAGE_KEY = "blw.catalogVersion";
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
// The query families the catalog hooks key on (features/catalog/hooks.ts).
const CATALOG_QUERY_KEYS = new Set(["foods", "food", "recipes", "recipe"]);

export interface CatalogVersionDeps {
  fetchVersion: () => Promise<Response>;
  /** Null when the browser has no Cache API (nothing for the SW to have cached). */
  deleteCatalogCache: (() => Promise<unknown>) | null;
  queryClient: Pick<QueryClient, "cancelQueries" | "invalidateQueries">;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  now: () => number;
}

/** Real dependencies for use from app code, as in `createSignOutDeps`. */
export function createCatalogVersionDeps(
  queryClient: Pick<QueryClient, "cancelQueries" | "invalidateQueries">,
): CatalogVersionDeps {
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    // Blocked site data: every check then reads "none stored" and refreshes.
  }
  return {
    // Bounded: a request hanging on a bad connection would otherwise hold the
    // in-flight slot, and every resume would wait on it. (iOS < 16 lacks
    // AbortSignal.timeout and simply goes unbounded.)
    fetchVersion: () =>
      window.fetch("/api/version", {
        cache: "no-store",
        signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(10_000) : undefined,
      }),
    deleteCatalogCache: "caches" in window ? () => caches.delete("catalog-cache") : null,
    queryClient,
    storage,
    now: () => Date.now(),
  };
}

/**
 * The service worker serves the catalog stale-while-revalidate from
 * `catalog-cache`, which survives deploys — so a phone could keep showing a
 * catalog from before a new food was added. When the server reports a build
 * this device has not seen, drop that cache and refetch the catalog queries.
 *
 * Resolves true once the server answered (even with nothing to do), false when
 * it could not be asked. Any failure is a no-op: the next check tries again.
 */
export async function checkCatalogVersion(deps: CatalogVersionDeps): Promise<boolean> {
  let version: unknown;
  try {
    const response = await deps.fetchVersion();
    if (!response.ok) return false;
    version = ((await response.json()) as { version?: unknown } | null)?.version;
  } catch {
    return false;
  }
  // null when the server has no APP_VERSION (local dev): nothing to compare.
  if (typeof version !== "string" || version === "") return true;

  let stored: string | null = null;
  try {
    stored = deps.storage?.getItem(CATALOG_VERSION_STORAGE_KEY) ?? null;
  } catch {
    // Unreadable reads as "none stored": refreshing once too often is harmless.
  }
  if (stored === version) return true;

  const predicate = (query: Pick<Query, "queryKey">) => CATALOG_QUERY_KEYS.has(query.queryKey[0] as string);
  // The SW cache first, so the refetches below cannot be answered from it.
  if (deps.deleteCatalogCache) await deps.deleteCatalogCache();
  // Then cancel what is already in flight: a query with no data yet may have
  // asked the SW before the delete, and invalidate would wait on that stale
  // answer rather than cancel it (query-core only cancels queries holding data).
  await deps.queryClient.cancelQueries({ predicate });
  await deps.queryClient.invalidateQueries({ predicate });
  // Only now: had either step failed, the next check must try the clear again.
  try {
    deps.storage?.setItem(CATALOG_VERSION_STORAGE_KEY, version);
  } catch {
    // Unwritable storage just means the clear repeats next time.
  }
  return true;
}

/**
 * Wraps `checkCatalogVersion` for its triggers (launch and every resume): at
 * most one check per 15 minutes, and overlapping calls share the one in flight.
 */
export function createCatalogVersionChecker(deps: CatalogVersionDeps): () => Promise<void> {
  let lastChecked = -Infinity;
  let inFlight: Promise<void> | null = null;
  return () => {
    if (inFlight) return inFlight;
    if (deps.now() - lastChecked < CHECK_INTERVAL_MS) return Promise.resolve();
    inFlight = checkCatalogVersion(deps)
      .then(
        // Only a check that reached the server starts the 15 minutes: one made
        // offline must not stop the resume after reconnecting from retrying.
        (answered) => {
          if (answered) lastChecked = deps.now();
        },
        () => undefined,
      )
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}
