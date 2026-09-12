/**
 * The tour's decisions, as pure functions.
 *
 * Everything the carousel and the first-run gate actually *decide* lives
 * here rather than inside an effect or a scroll handler: which slide the
 * track is showing, what leaving writes, and whether the dialog should open
 * itself at all. The components stay a thin shell over these, so the
 * node-env suite (no DOM) can pin the behaviour without a browser.
 */

/**
 * Clamps a slide index into `[0, count - 1]`.
 *
 * Every way into the carousel goes through here — a rounded scroll position,
 * a Next tap on the last slide, a Back tap on the first, an End key, a dot —
 * so "there is no slide 6 of 6" is answered in one place instead of at each
 * call site.
 */
export function clampSlide(index: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), count - 1);
}

/**
 * Which slide a scroll position is showing.
 *
 * Rounding (not flooring) is what makes a half-swipe read as the slide the
 * track will actually snap back to. A zero/unknown width — the first paint,
 * a hidden track — has no answer but the first slide, and elastic overscroll
 * at either end (negative on iOS, past the last slide on a trackpad) is
 * clamped rather than reported as a slide that does not exist.
 */
export function slideIndexFromScroll(scrollLeft: number, slideWidth: number, count: number): number {
  if (!Number.isFinite(scrollLeft) || !Number.isFinite(slideWidth) || slideWidth <= 0) return 0;
  return clampSlide(Math.round(scrollLeft / slideWidth), count);
}

/** What every way out of the tour does, which is the same thing four times over. */
export interface TourExit {
  /** Whether to mark the tour seen. A replay must not re-stamp the date. */
  patch: boolean;
}

/**
 * What leaving the tour writes.
 *
 * `replay` is "the tour was already marked seen when the dialog opened" —
 * i.e. the parent tapped More's "Take the tour" row after finishing it once,
 * rather than meeting it on a first run. A replay writes nothing; a first run
 * marks the tour seen.
 *
 * Nowhere to go: the tour is a modal over the app now, so every exit just
 * closes it and leaves the parent on the page they were already on. The
 * decision is still a function rather than an `if` inside the dialog so the
 * "a replay must not re-stamp the date" rule has one pinned home.
 */
export function resolveTourExit(replay: boolean): TourExit {
  return { patch: !replay };
}

export interface TourOpenInput {
  /** The `["preferences"]` query's status — nothing is decided until it resolves. */
  status: "pending" | "error" | "success";
  /**
   * The same query's `fetchStatus`. "idle" alongside a "success" status means
   * the answer on hand is the one the network gave us this session.
   */
  fetchStatus: "fetching" | "paused" | "idle";
  tourCompletedAt: string | null | undefined;
  /** Whether this session has already opened the tour once. */
  alreadyOpened: boolean;
}

/**
 * Whether the tour should open itself right now.
 *
 * Deliberately false in every uncertain case. A pending query must not open
 * it, an errored one must not either (an API blip is not a reason to
 * interrupt someone who has already seen the tour), and once a session has
 * opened it once it never re-opens by itself.
 *
 * `fetchStatus === "idle"` is the load-bearing clause, not a belt-and-braces
 * one: a persisted cache can make `status` read "success" off a *restored*
 * `{ tourCompletedAt: null }` while the real answer is still in flight, and
 * that is exactly how a parent who had finished the tour got it again on the
 * next cold start. A restored-but-refetching query reads "success" +
 * "fetching", so it decides nothing until the network answers.
 */
export function shouldOpenTour({ status, fetchStatus, tourCompletedAt, alreadyOpened }: TourOpenInput): boolean {
  if (status !== "success") return false;
  if (fetchStatus !== "idle") return false;
  // `undefined` is "resolved to nothing", which is not the same as a known
  // null and is not worth interrupting anyone over.
  if (tourCompletedAt !== null) return false;
  return !alreadyOpened;
}
