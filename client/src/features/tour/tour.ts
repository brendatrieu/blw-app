/**
 * The tour's decisions, as pure functions.
 *
 * Everything the carousel and the first-run gate actually *decide* lives
 * here rather than inside an effect or a scroll handler: which slide the
 * track is showing, where a Skip goes, and whether a signed-in parent should
 * be sent to `/tour` at all. The components stay a thin shell over these, so
 * the node-env suite (renderToString, no DOM) can pin the behaviour without
 * a browser.
 */

/**
 * Clamps a slide index into `[0, count - 1]`.
 *
 * Every way into the carousel goes through here — a rounded scroll position,
 * a Next tap on the last slide, an End key, a dot — so "there is no slide 6
 * of 6" is answered in one place instead of at each call site.
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

/** What Skip and "Get started" do, which is the same thing twice over. */
export interface TourExit {
  /** Whether to mark the tour seen. A replay must not re-stamp the date. */
  patch: boolean;
  to: string;
  replace: boolean;
}

/**
 * Where leaving the tour lands.
 *
 * `replay` is "the tour was already marked seen when this page opened" —
 * i.e. the parent arrived from More's "Take the tour" row rather than from
 * the first-run redirect. A replay goes back where it came from and writes
 * nothing; a first run marks the tour seen and starts the app properly at
 * the dashboard.
 *
 * Both replace rather than push: the tour is not somewhere the back button
 * should be able to return to.
 */
export function resolveTourExit(replay: boolean): TourExit {
  return replay ? { patch: false, to: "/more", replace: true } : { patch: true, to: "/", replace: true };
}

export interface TourRedirectInput {
  /** The `["preferences"]` query's status — nothing is decided until it resolves. */
  status: "pending" | "error" | "success";
  tourCompletedAt: string | null | undefined;
  pathname: string;
  /** Whether this session has already sent the user to the tour once. */
  alreadyRedirected: boolean;
}

/**
 * Whether a signed-in parent should be sent to the tour right now.
 *
 * Deliberately false in every uncertain case. A pending query must not
 * redirect (that is the flash), an errored one must not either (an API blip
 * is not a reason to interrupt someone who has already seen the tour), and
 * once a session has redirected once it never does so again — otherwise a
 * failed PATCH would trap the user in a loop between the dashboard and the
 * tour, which is exactly the wall the tour must not be.
 */
export function shouldRedirectToTour({
  status,
  tourCompletedAt,
  pathname,
  alreadyRedirected,
}: TourRedirectInput): boolean {
  if (status !== "success") return false;
  // `undefined` is "resolved to nothing", which is not the same as a known
  // null and is not worth redirecting on.
  if (tourCompletedAt !== null) return false;
  if (pathname === "/tour") return false;
  return !alreadyRedirected;
}
