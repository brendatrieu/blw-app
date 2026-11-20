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

/** Ledger 1024: how far a finger travels sideways before a drag is a swipe. */
export const SWIPE_MIN_PX = 40;

/**
 * Which way a drag that started off the track (the landing's sheet) moves
 * it: 1 (next) for a swipe to the left, -1 for one to the right, 0 for a tap,
 * a short drag, or anything more up/down than sideways, so a vertical move
 * never changes the slide.
 */
export function swipeStep(dx: number, dy: number, min = SWIPE_MIN_PX): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (Math.abs(dx) < min || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** Wheel events closer together than this are one trackpad gesture (its momentum tail included). */
export const WHEEL_GAP_MS = 200;
export type WheelGesture = { sum: number; at: number; spent: boolean };
export const newWheelGesture = (): WheelGesture => ({ sum: 0, at: -Infinity, spent: false });

/**
 * A horizontal wheel/trackpad scroll over the sheet: one slide per gesture.
 * Forwarding the deltas with scrollBy would not do: on a snap track every
 * scrollBy jumps a whole slide, so a trackpad swipe would fly to the end.
 * Mutates `gesture`; `now` is the event's timeStamp.
 */
export function wheelStep(gesture: WheelGesture, dx: number, dy: number, now: number): -1 | 0 | 1 {
  if (now - gesture.at > WHEEL_GAP_MS) Object.assign(gesture, newWheelGesture());
  gesture.at = now;
  if (gesture.spent || !Number.isFinite(dx) || Math.abs(dx) <= Math.abs(dy)) return 0;
  gesture.sum += dx;
  // A positive deltaX scrolls the content right: the next slide, like a swipe to the left.
  const step = swipeStep(-gesture.sum, 0);
  if (step) gesture.spent = true;
  return step;
}
