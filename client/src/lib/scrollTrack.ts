/**
 * A horizontal scroll-snap track's decisions: which slide it is showing,
 * and how it should move. Shared by the tour's carousel and Home's paged
 * lists (items 698, 775); the track's scroll position is the one source of truth,
 * read back through `slideIndexFromScroll`.
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

/** Whether a programmatic scroll should jump instead of animating. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
