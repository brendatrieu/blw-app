import type { RoutePattern, UsageEventEnvelope, UsageEventName } from "@blw/shared";
import { buildEvent, type BuildEventOptions, type UsagePropsFor } from "./buildEvent.js";
import { isUsageSharingAllowed, readBrowserSignals } from "./consent.js";
import { createUsageQueue, type UsageQueue, type UsageQueueDeps } from "./queue.js";

/**
 * `track()` — the one door every call site in the app goes through, and the
 * one place consent is enforced.
 *
 * Three things make it safe to call from anywhere, including a mutation's
 * `onSuccess` and a React error boundary:
 *
 *   * it never awaits and never returns a promise, so no screen can end up
 *     waiting on analytics;
 *   * until the account's preference is KNOWN it only buffers in memory —
 *     it touches no storage and makes no request — and when the answer comes
 *     back "off" that buffer is dropped, along with anything a previous
 *     session persisted;
 *   * the transport is one module behind this function, so the day a second
 *     sink is wanted (Umami, PostHog, a Sentry tunnel) it is a second
 *     `enqueue` here, not a re-instrumentation of eighteen call sites.
 */

/** Idle gap that starts a new session. */
export const USAGE_SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * How many events may wait in memory for the preferences query to answer.
 *
 * A parent normally causes two or three before it resolves. The cap is for
 * the case where it never does (a 500 that keeps retrying, a test that
 * imports a call site): memory stays bounded and the OLDEST are dropped, so
 * what survives is what happened most recently.
 */
export const USAGE_PENDING_MAX = 100;

interface TrackState {
  preference: boolean | undefined;
  pending: UsageEventEnvelope[];
  lastEventAt: number | null;
  queue: UsageQueue | null;
  queueDeps: UsageQueueDeps | undefined;
}

const state: TrackState = {
  preference: undefined,
  pending: [],
  lastEventAt: null,
  queue: null,
  queueDeps: undefined,
};

const nav: { current: RoutePattern | null; previous: RoutePattern | null } = { current: null, previous: null };

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Remembers which screen the app is on and answers with the one before it.
 *
 * Called by `UsageProvider` exactly once per pathname change (the provider
 * holds the StrictMode latch), so `/foods/a` → `/foods/b` shifts properly
 * even though both resolve to the same pattern.
 */
export function recordRouteChange(pattern: RoutePattern): RoutePattern | null {
  const previous = nav.current;
  nav.previous = previous;
  nav.current = pattern;
  return previous;
}

/**
 * `from_route` for an event fired ON `pattern`.
 *
 * Written to be independent of whether the provider has recorded the arrival
 * yet: React runs a child's effects before its parent's, so a page's own
 * `article_viewed` lands BEFORE the provider's `screen_viewed`, and both have
 * to name the same previous screen. If the current route is already the one
 * asking, the answer is the one before it; otherwise the current route IS the
 * one we came from.
 */
export function fromRouteFor(pattern: RoutePattern): RoutePattern | null {
  return nav.current === pattern ? nav.previous : nav.current;
}

export function currentRoutePattern(): RoutePattern | null {
  return nav.current;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Pure: a fresh boot (`null`) or a long-enough gap starts a session. */
export function shouldStartSession(lastEventAt: number | null, now: number, idleMs = USAGE_SESSION_IDLE_MS): boolean {
  if (lastEventAt === null) return true;
  return now - lastEventAt >= idleMs;
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/** The live answer: preference AND the browser's own opt-out signals. */
export function isTrackingAllowed(): boolean {
  return isUsageSharingAllowed({ preference: state.preference, ...readBrowserSignals() });
}

/** True once we know the answer is no — nothing is built, buffered or kept. */
function isTrackingDenied(): boolean {
  const signals = readBrowserSignals();
  if (signals.doNotTrack || signals.globalPrivacyControl) return true;
  return state.preference === false;
}

/**
 * Publishes the account preference (or `undefined` while it is unknown).
 *
 * Resolving to `true` releases the buffered events into the queue; resolving
 * to `false` drops them AND wipes anything a previous session left on disk,
 * so "off" is off retroactively on this device as well as on the server.
 */
export function setUsageConsent(preference: boolean | undefined): void {
  state.preference = preference;
  if (preference === undefined) return;
  if (isTrackingAllowed()) {
    const released = state.pending;
    state.pending = [];
    const queue = ensureQueue();
    queue.start();
    queue.enqueue(released);
    return;
  }
  state.pending = [];
  void ensureQueue().discard();
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function ensureQueue(): UsageQueue {
  state.queue ??= createUsageQueue(state.queueDeps);
  return state.queue;
}

/**
 * Replaces the transport. Exists for tests (a fake `fetch` and a fake
 * IndexedDB); app code never calls it.
 */
export function configureUsageQueue(deps: UsageQueueDeps | undefined): void {
  state.queue?.stop();
  state.queueDeps = deps;
  state.queue = null;
}

/** Sends whatever is waiting. Never rejects. */
export async function flushUsage(): Promise<void> {
  if (!isTrackingAllowed()) return;
  await ensureQueue().flush();
}

/** Forgets everything, in memory and on disk. Sign-out, account delete, consent-off. */
export async function discardUsage(): Promise<void> {
  state.pending = [];
  await ensureQueue().discard();
}

/** Stops the timers and listeners the queue installed (provider unmount). */
export function stopUsageTransport(): void {
  state.queue?.stop();
}

/** Full reset, for tests: consent, buffer, session clock, navigation, queue. */
export function resetUsage(): void {
  state.queue?.stop();
  state.preference = undefined;
  state.pending = [];
  state.lastEventAt = null;
  state.queue = null;
  state.queueDeps = undefined;
  nav.current = null;
  nav.previous = null;
}

/** How many events are waiting for the preferences query. Test seam. */
export function pendingUsageCount(): number {
  return state.pending.length;
}

// ---------------------------------------------------------------------------
// track
// ---------------------------------------------------------------------------

function accept(envelope: UsageEventEnvelope | null): void {
  if (!envelope) return;
  if (isTrackingAllowed()) {
    ensureQueue().enqueue([envelope]);
    return;
  }
  // Still unknown: hold it, oldest out first.
  state.pending.push(envelope);
  if (state.pending.length > USAGE_PENDING_MAX) {
    state.pending.splice(0, state.pending.length - USAGE_PENDING_MAX);
  }
}

/**
 * Records one event.
 *
 * `session_started` rides along automatically: every event checks the idle
 * clock first, so a session boundary is a property of activity rather than
 * something each call site has to remember.
 */
export function track<N extends UsageEventName>(
  name: N,
  props: UsagePropsFor<N>,
  options: BuildEventOptions = {},
): void {
  if (isTrackingDenied()) return;

  const now = options.now ?? new Date();
  const at = now.getTime();

  if (name !== "session_started" && shouldStartSession(state.lastEventAt, at)) {
    // Stamped BEFORE building, so this can never recurse.
    state.lastEventAt = at;
    accept(buildEvent("session_started", {}, { ...options, now }));
  }
  state.lastEventAt = at;
  accept(buildEvent(name, props, { ...options, now }));
}
