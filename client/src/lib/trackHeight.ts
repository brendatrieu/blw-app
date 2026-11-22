import { clampSlide } from "./scrollTrack.js";

/**
 * Ledger 1144a: the height of the clip box around a swipe track at any scroll
 * position, so the card grows or shrinks in step with the finger (1142c's
 * resize once the snap had settled lagged ~0.5s behind it). Only the clip box
 * takes this height: the track and its slides are never resized (1105's `fit`
 * did, mid-swipe, and left iOS stuck between two pages, 1120).
 */

/**
 * The slide a track rests on: its scroll is on a slide's edge (within half a
 * pixel, for WebKit's whole-pixel scrollLeft), else null (mid-swipe, mid-snap).
 */
export function restingSlide(scrollLeft: number, width: number, count: number): number | null {
  if (count <= 0 || !Number.isFinite(scrollLeft) || !Number.isFinite(width) || width <= 0) return null;
  const index = clampSlide(Math.round(scrollLeft / width), count);
  return Math.abs(scrollLeft - index * width) <= 0.5 ? index : null;
}

/**
 * The two neighbouring slides' heights, mixed by how far the track is between
 * them: exactly a slide's height when resting on it, clamped to the end
 * slides in an overscroll; null with no slides or no width.
 */
export function heightAt(scrollLeft: number, width: number, heights: readonly number[]): number | null {
  if (heights.length === 0 || !Number.isFinite(scrollLeft) || !Number.isFinite(width) || width <= 0) return null;
  const at = restingSlide(scrollLeft, width, heights.length);
  if (at !== null) return heights[at]!;
  const pos = Math.min(Math.max(scrollLeft / width, 0), heights.length - 1);
  const i = Math.floor(pos);
  const from = heights[i]!;
  return from + ((heights[i + 1] ?? from) - from) * (pos - i);
}
