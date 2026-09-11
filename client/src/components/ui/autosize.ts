/**
 * Auto-growing textareas (item 300).
 *
 * A step box and the notes box start at two rows and grow with what's typed
 * in them — no inner scrollbar, no cap. A parent writing a five-line step
 * should see all five lines, not a two-line porthole onto them.
 */

import { useEffect, useRef, type MutableRefObject } from "react";

/** Two rows: the height a step/notes box starts at and never shrinks below. */
export const AUTOSIZE_MIN_ROWS = 2;

/**
 * Used only when the computed `line-height` is unreadable — `normal`, or a
 * server render with no layout at all. 1.5x the app's 16px control text.
 */
export const AUTOSIZE_FALLBACK_LINE_HEIGHT = 24;

/**
 * The height an auto-growing textarea should be given, in px.
 *
 * `scrollHeight` is measured with the element's own height set to `auto`, so
 * it is the height the content actually wants (text + the control's vertical
 * padding). The floor — `minRows * lineHeight` — is a guard, not the usual
 * path: with `rows={2}` still on the element, an empty box already measures
 * at least two rows. It matters when there is no layout to measure (a hidden
 * or not-yet-laid-out field reports `scrollHeight` 0), where returning 0
 * would collapse the control to nothing.
 *
 * This is the height of the element's CONTENT + PADDING, which is what
 * `scrollHeight` reports. Under `box-sizing: border-box` — what the app uses
 * everywhere — the CSS `height` also has to cover the border, so
 * `autosizeTextarea` adds that on top; see `verticalBorder` below.
 *
 * Pure so the rule can be tested without a DOM; `autosizeTextarea` below is
 * the only thing that reads a real element.
 */
export function resolveTextareaHeight(scrollHeight: number, minRows: number, lineHeight: number): number {
  const floor = Math.max(0, minRows * lineHeight);
  if (!Number.isFinite(scrollHeight) || scrollHeight <= 0) return floor;
  return Math.max(Math.ceil(scrollHeight), floor);
}

/** The element's computed line-height in px, or the fallback when the browser
 * reports something unmeasurable (`normal`, or an empty string off a stub). */
function readLineHeight(el: HTMLTextAreaElement, view: Window): number {
  const parsed = Number.parseFloat(view.getComputedStyle(el).lineHeight);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : AUTOSIZE_FALLBACK_LINE_HEIGHT;
}

/**
 * How much taller than `scrollHeight` the CSS `height` has to be, in px.
 *
 * Under `box-sizing: border-box` (Tailwind's preflight sets it on every
 * element in the app) `height` covers the border, but `scrollHeight` does
 * not — so `height = scrollHeight` clips the last line by exactly the
 * border's width. Measured, not assumed: `offsetHeight - clientHeight` is the
 * border the element actually has. Under `content-box` the two boxes already
 * line up and there is nothing to add.
 *
 * (Found by measuring: a 1px-bordered control still reported
 * `scrollHeight - clientHeight === 2` after autosizing.)
 */
function verticalBorder(el: HTMLTextAreaElement, view: Window): number {
  if (view.getComputedStyle(el).boxSizing !== "border-box") return 0;
  const border = el.offsetHeight - el.clientHeight;
  return Number.isFinite(border) && border > 0 ? border : 0;
}

/**
 * Grow (or shrink) one textarea to fit its content.
 *
 * Height is reset to `auto` BEFORE measuring: `scrollHeight` never drops
 * below the element's current height, so measuring against a previously
 * grown box would make the field one-way — it could only ever get taller,
 * and deleting a line would leave the gap behind.
 *
 * `overflow-y: hidden` is set here rather than in CSS so it travels with the
 * behaviour: the point of fitting the content is that there is nothing left
 * to scroll, and a scrollbar appearing mid-grow is what this replaces.
 *
 * Safe to call with `null` — React hands a ref callback `null` on unmount.
 */
export function autosizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  const view = el.ownerDocument?.defaultView;
  if (!view) return;
  el.style.overflowY = "hidden";
  el.style.height = "auto";
  // Both reads happen at `auto`, so they describe the same box.
  const fitted = resolveTextareaHeight(el.scrollHeight, AUTOSIZE_MIN_ROWS, readLineHeight(el, view));
  el.style.height = `${fitted + verticalBorder(el, view)}px`;
}

/**
 * The whole autosize wiring as one spreadable prop object, in the same spirit
 * as `getStepKeyProps` in `CustomRecipeForm`: a field opts in by spreading
 * this and sets none of it itself, so removing item 300's behaviour means
 * removing the spread — and the spread carries a rendered attribute
 * (`data-autosize`), which a static render test can see is gone.
 *
 * `ref` is the module-level `autosizeTextarea` itself, deliberately: a stable
 * function means React attaches it once, on mount, so a prefilled edit form
 * opens at the right height without re-measuring on every unrelated render.
 * `onInput` covers everything after that — every keystroke, paste, and the
 * Shift+Enter newlines that make a step grow.
 */
export function getAutosizeProps(): {
  "data-autosize": "true";
  ref: (el: HTMLTextAreaElement | null) => void;
  onInput: (event: { currentTarget: HTMLTextAreaElement }) => void;
} {
  return {
    "data-autosize": "true",
    ref: autosizeTextarea,
    onInput: (event) => autosizeTextarea(event.currentTarget),
  };
}

/** How an auto-growing field marks itself on the page — the attribute
 * `getAutosizeProps` renders. It is also how `autosizeAll` finds the fields
 * again later: one marker, used for both the wiring and the re-fitting. */
export const AUTOSIZE_SELECTOR = '[data-autosize="true"]';

/**
 * Re-fit every auto-growing textarea inside `root`.
 *
 * `autosizeTextarea` is idempotent — it measures against `auto` every time —
 * so running it over a whole list costs a layout per field and changes
 * nothing about the ones that are already the right size.
 *
 * Safe on a missing root, and on anything that cannot be queried (a server
 * render, a stub): a field that doesn't grow beats a form that throws.
 */
export function autosizeAll(root: ParentNode | null | undefined): void {
  if (!root || typeof root.querySelectorAll !== "function") return;
  for (const field of Array.from(root.querySelectorAll<HTMLTextAreaElement>(AUTOSIZE_SELECTOR))) {
    autosizeTextarea(field);
  }
}

/**
 * The wiring for a LIST of auto-growing fields, spread onto the element that
 * contains them (item 300).
 *
 * Why a list needs anything beyond `getAutosizeProps`: a list of textareas
 * keyed by index re-uses the same DOM elements when a row is removed, so the
 * box that held step 2 is handed step 3's text. That fires no `input` event
 * and re-runs no ref (`getAutosizeProps().ref` is deliberately stable), so
 * the box would keep the removed step's height — and since autosize sets
 * `overflow-y: hidden`, the text that no longer fits would be invisible AND
 * unscrollable. Re-fitting the whole list when it changes shape is what
 * keeps "the whole step is visible while editing" true after a removal.
 *
 * `rowCount` is the signal on purpose: adding or removing a row is the only
 * thing that moves text between existing boxes, and typing is already
 * covered by `onInput` — so this re-measures on add/remove and never on a
 * keystroke, where a per-field layout pass would be pure thrash.
 *
 * Like `getAutosizeProps`, it carries a rendered attribute, so unwiring it
 * is visible to a static render test rather than only at runtime.
 */
export function useAutosizeListProps<T extends HTMLElement>(rowCount: number): {
  "data-autosize-list": "true";
  ref: MutableRefObject<T | null>;
} {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    autosizeAll(ref.current);
  }, [rowCount]);
  return { "data-autosize-list": "true", ref };
}
