import { requiredRoutePattern } from "./buildEvent.js";
import { errorMessage, errorStatus, isChunkLoadError, statusBucket, type ClientErrorKind } from "./properties.js";
import { track } from "./track.js";

/**
 * `client_error` — a count, a route and a kind. Never a message, never a
 * stack, never a request id.
 *
 * That is the whole point of tracking errors first-party rather than sending
 * them to a crash service: an exception thrown inside a form a parent is
 * filling in can carry their child's name, and a stack frame can carry the
 * text they typed. The one number the plan actually asks for — errors per
 * 100 sessions, and which routes they cluster on — needs none of it.
 * Everything else goes to `console.error`, which stays on their device.
 */
export function trackClientError(reason: unknown, kind: ClientErrorKind = "unhandled", status?: number): void {
  const message = errorMessage(reason);
  track("client_error", {
    route_pattern: requiredRoutePattern(),
    // A failed dynamic import is a deploy artefact, not a bug: the fix is a
    // reload, so it must not sit in the same bucket as a real crash.
    kind: kind === "unhandled" && isChunkLoadError(message) ? "chunk_load" : kind,
    status: statusBucket(status ?? errorStatus(reason)),
  });
}

/**
 * A request that failed at the transport level or came back 5xx.
 *
 * Only those two: a 400/401/404 is the API answering a question correctly
 * (not signed in, not found, not yours) and counting it as a client error
 * would bury the real ones. `/api/usage` itself is never reported — an
 * endpoint that measured its own failures would spin.
 */
export function trackApiFailure(path: string, status: number | undefined): void {
  if (path.startsWith("/api/usage")) return;
  if (status === undefined) {
    track("client_error", { route_pattern: requiredRoutePattern(), kind: "api_network", status: "none" });
    return;
  }
  if (status < 500) return;
  track("client_error", { route_pattern: requiredRoutePattern(), kind: "api_5xx", status: statusBucket(status) });
}
