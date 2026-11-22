import { clampSlide } from "./scrollTrack.js";

/**
 * Ledger 1142c: a box around a swipe track that is as tall as the slide on
 * show, resized only once the track has settled. Never mid-gesture: 1105's
 * `fit` changed heights at the swipe's midpoint and left iOS stuck between
 * two pages (1120). The track itself is never resized; only the clip box
 * around it is, after the scroll has stopped on a whole page.
 */

/** How long a track must go without a scroll event to count as settled. */
export const SETTLE_MS = 100;

/**
 * The slide a track rests on: its scroll is on a slide's edge (within half a
 * pixel, for WebKit's whole-pixel scrollLeft), else null (mid-swipe, mid-snap;
 * a finger lifted 1px short still has that last snap to come).
 */
export function restingSlide(scrollLeft: number, width: number, count: number): number | null {
  if (count <= 0 || !Number.isFinite(scrollLeft) || !Number.isFinite(width) || width <= 0) return null;
  const index = clampSlide(Math.round(scrollLeft / width), count);
  return Math.abs(scrollLeft - index * width) <= 0.5 ? index : null;
}

interface Track {
  scrollLeft: number;
  clientWidth: number;
  children: ArrayLike<{ getBoundingClientRect(): { height: number } }>;
}
interface Box {
  style: { height: string; transition: string };
  getBoundingClientRect(): { height: number };
  offsetHeight: number;
}

/** Sizes `box` to the slide `track` rests on; does nothing while it is between slides. */
export function fitToRestingSlide(track: Track, box: Box): void {
  const at = restingSlide(track.scrollLeft, track.clientWidth, track.children.length);
  const slide = at === null ? undefined : track.children[at];
  if (!slide) return;
  const height = `${slide.getBoundingClientRect().height}px`;
  if (box.style.height !== height) box.style.height = height;
}

/** A finger came down: stop a resize still easing in where it is, so nothing moves under the finger. */
export function holdHeight(box: Box): void {
  const now = box.getBoundingClientRect().height;
  if (!box.style.height || Math.abs(now - parseFloat(box.style.height)) <= 0.5) return;
  box.style.transition = "none";
  box.style.height = `${now}px`;
  void box.offsetHeight; // commit the held height before the transition comes back
  box.style.transition = "";
}

export interface SettleWatch {
  scrolled(): void;
  touchStart(): void;
  touchEnd(): void;
  /** No finger down and no scroll in the last SETTLE_MS: a resize now is not mid-gesture. */
  idle(): boolean;
}

/**
 * Calls `settle` once the track has had no scroll event for SETTLE_MS with
 * no finger down: after a swipe snaps, after an arrow's scroll ends, after a
 * finger lifts off a still track. A held finger never settles.
 */
export function watchSettle(settle: () => void, wait = SETTLE_MS): SettleWatch {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let down = false;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const restart = () => {
    clear();
    if (down) return;
    timer = setTimeout(() => {
      timer = undefined;
      settle();
    }, wait);
  };
  return {
    scrolled: restart,
    touchStart: () => {
      down = true;
      clear();
    },
    touchEnd: () => {
      down = false;
      restart();
    },
    idle: () => !down && timer === undefined,
  };
}
