import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The WebKit re-sync nudge run after a modal unlocks background scroll (item
 * 379). In an installed iOS app the layout viewport that fixed and sticky
 * boxes hang from stays shrunken once the keyboard has been up — the note
 * fields in the Serve sheet — until something scrolls the document. Scrolling
 * to exactly where the page already is re-syncs it without moving anything.
 * Deferred a frame so it lands after the restored `overflow` has taken effect.
 * Guarded: the node-env test suite drives these components with no window.
 */
function nudgeViewportSync() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
  window.requestAnimationFrame(() => {
    window.scrollTo(window.scrollX, window.scrollY);
  });
}

/**
 * Open modals — sheets AND dialogs — oldest first. Every open one listens on
 * the document, so only the TOP one may act on Escape or Tab: a how-to guide
 * over the Serve sheet, or a delete question over a sheet, closes alone
 * (items 601, 610).
 */
const openModals: object[] = [];

/**
 * What `Sheet` and `Dialog` share, so there is one focus trap in the app, not
 * two subtly different ones: background scroll locked and restored to whatever
 * inline value was there before, focus moved in on open and returned on close,
 * Tab trapped inside the panel, Escape closing — for the top modal only.
 *
 * `onClose` is read through a ref: a caller re-rendering with a fresh inline
 * arrow (a pending mutation, a picker change) must not tear the effect down,
 * which bounced focus back on every render (item 599).
 *
 * `focusFirstControl`: a sheet focuses its first control; a dialog focuses its
 * panel (tabIndex -1), so a programmatic focus never rings a button — and a
 * delete question never starts on Delete.
 */
export function useModal(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose: (reason: "escape") => void,
  focusFirstControl: boolean,
) {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    // Guarded: the node-env suite drives these components as functions, with
    // a stand-in document or none at all.
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = focusFirstControl ? panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)[0] : undefined;
    (first ?? panel)?.focus();

    const token = {};
    openModals.push(token);

    function handleKeyDown(event: KeyboardEvent) {
      if (openModals[openModals.length - 1] !== token) return;
      // A control inside already used this key — an open list closing on
      // Escape — so the modal must not close on it too.
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current("escape");
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;

      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openModals.splice(openModals.indexOf(token), 1);
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused.current?.focus();
      nudgeViewportSync();
    };
  }, [open, panelRef, focusFirstControl]);
}
