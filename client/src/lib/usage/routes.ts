import { matchPath } from "react-router-dom";
import { ROUTE_PATTERNS, type RoutePattern } from "@blw/shared";

/**
 * A pathname → route PATTERN, which is the only shape of a URL an event is
 * ever allowed to carry.
 *
 * `/foods/sweet-potato` becomes `/foods/:slug`; `/babies/<uuid>/allergens`
 * becomes `/babies/:id/allergens`. A path segment is the one place a real id,
 * slug or search term could ride along into an event, and `route` is a closed
 * enum in the shared schema, so anything this function cannot match becomes
 * `"/*"` rather than travelling as itself.
 */

/** What an unrecognised pathname resolves to — also App's `*` catch-all. */
export const UNMATCHED_ROUTE: RoutePattern = "/*";

/**
 * Every pattern except the catch-all, in `App()`'s declaration order.
 *
 * Order is how `/foods/new` wins over `/foods/:slug` — the same reason the
 * routes themselves are declared in that order. `matchPath` is exact (a
 * pattern only matches the whole pathname unless it ends in `*`), so the
 * specific-before-generic pairs are the only place it could matter, but the
 * list is kept in lockstep with the router either way and a test pins that.
 */
const MATCHABLE_PATTERNS: readonly RoutePattern[] = ROUTE_PATTERNS.filter(
  (pattern) => pattern !== UNMATCHED_ROUTE,
);

/**
 * The route pattern for a pathname, or `"/*"` when nothing matches.
 *
 * Takes the pathname alone — never the search or hash — so `?food=<id>` and
 * `#section` have nowhere to leak from. Callers that need to know a query
 * param was present derive a BOOLEAN or an enum from it (see
 * `properties.ts`), never the value.
 */
export function toRoutePattern(pathname: string): RoutePattern {
  if (typeof pathname !== "string" || pathname.length === 0) return UNMATCHED_ROUTE;
  for (const pattern of MATCHABLE_PATTERNS) {
    if (matchPath(pattern, pathname)) return pattern;
  }
  return UNMATCHED_ROUTE;
}

/**
 * The pathname the app is currently on, read from the browser.
 *
 * `BrowserRouter` is backed by the real History API, so `location.pathname`
 * IS the router's pathname — which means `track()` can resolve a route
 * without every call site threading one down, and surfaces OUTSIDE the
 * router (the top-level `ErrorBoundary`) still report the right screen.
 * Returns null where there is no browser at all (the node test suite).
 */
export function currentPathname(): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  return window.location.pathname;
}
