/**
 * Pure predicate functions for vite-plugin-pwa/workbox `runtimeCaching`
 * `urlPattern` matchers.
 *
 * Workbox's `RegExpRoute` execs a regex `urlPattern` against the FULL
 * `url.href`, not just the pathname — so a pattern anchored `^\/api\/...`
 * never matches a real request URL (which starts with `https://host/...`).
 * These matchers test `url.pathname` explicitly instead, and additionally
 * require the request be same-origin so cross-origin URLs that merely share
 * a path never match.
 *
 * Kept dependency-free (no workbox imports) so they're trivially unit
 * testable; `vite.config.ts` imports them as the `urlPattern` callbacks.
 */

export interface RouteMatcherArgs {
  url: URL;
  sameOrigin: boolean;
}

/** SWR catalog reads: /api/foods, /api/recipes (and their sub-paths). */
export function isCatalogRoute({ url, sameOrigin }: RouteMatcherArgs): boolean {
  return sameOrigin && /^\/api\/(foods|recipes)(\/|$|\?)/.test(url.pathname);
}

/** NetworkFirst user-owned reads: /api/babies, /api/pantry, /api/favorites. */
export function isUserDataRoute({ url, sameOrigin }: RouteMatcherArgs): boolean {
  return sameOrigin && /^\/api\/(babies|pantry|favorites)(\/|$|\?)/.test(url.pathname);
}

/** NetworkOnly, never cached: /api/auth, /api/ai, /api/account. */
export function isNetworkOnlyRoute({ url, sameOrigin }: RouteMatcherArgs): boolean {
  return sameOrigin && /^\/api\/(auth|ai|account)(\/|$|\?)/.test(url.pathname);
}

/** Meal-log POSTs, queued via BackgroundSync when offline. */
export function isMealPostRoute({ url, sameOrigin }: RouteMatcherArgs): boolean {
  return sameOrigin && /^\/api\/babies\/[^/]+\/meals(\/|$|\?)/.test(url.pathname);
}
