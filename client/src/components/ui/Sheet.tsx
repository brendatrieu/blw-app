import { useRef, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { CloseGlyph, ICON_BUTTON_CLASSES, ICON_BUTTON_EDGE_INSET } from "./iconButton.js";
import { useModal } from "./useModal.js";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /**
   * Renders an icon-only X at the LEFT of the sheet's header row, sharing
   * the exact position and 44px footprint pages give `CloseButton` (item
   * 258). Opt-in: sheets whose body already ends in a committing "Done"
   * (the wheel pickers) close from there, and only the sheets that are a
   * screen in their own right — the Serve sheet (item 263) — need a visible
   * way out besides the overlay tap.
   */
  showClose?: boolean;
  /**
   * Ledger 789: the panel is a fixed 85svh from the start, hung from the top
   * rather than the bottom, so it never changes height with its content and
   * stays put when the iOS keyboard shrinks the box fixed elements hang from
   * (item 379) — the keyboard covers its lower part instead. The body lays
   * out its own scrolling list. svh, not vh: 100vh is the LARGE viewport, so
   * with a browser toolbar showing (iOS Safari tab, Android Chrome) a vh panel
   * ran below the visible area and hid the pinned Add (VERIFY-789-c1); svh is
   * the toolbar-shown height and, like vh, never changes, so it never resizes.
   * Ledger 792: it also stretches to the bottom of its fixed box, see
   * FIXED_HEIGHT_CLASSES.
   */
  fixedHeight?: boolean;
  children: ReactNode;
}

/**
 * Ledger 792: the fixedHeight panel's bottom. Its top stays at 15svh and it is
 * never shorter than 85svh (789), but it also stretches to the bottom of the
 * fixed box it hangs in: on iOS 100svh can stop short of that box (Safari with
 * the page under its toolbar; an installed app, where svh can leave out the
 * home-indicator inset), which left a strip of page under the sheet. The
 * first shadow paints the panel's color 50vh further down, for when the box
 * itself stops short of the screen (the band item 379 describes after the
 * keyboard); listed first so the soft shadow cannot grey it. No max-height:
 * 85vh would cap the stretch.
 */
const FIXED_HEIGHT_CLASSES =
  "mt-[15svh] h-[calc(100%-15svh)] min-h-[85svh] shadow-[0_50vh_0_0_var(--color-bg-elevated),var(--shadow-lg)]";

/**
 * Bottom sheet: a dimmed overlay behind a panel that slides up from the
 * bottom edge (instant, no slide, for reduced-motion users — see the
 * `.sheet-overlay` / `.sheet-panel` rules in index.css). Closes on Escape
 * or an overlay click, and traps Tab focus inside the panel while open — the
 * same `useModal` mechanics as `Dialog`.
 */
export function Sheet({ open, onClose, title, showClose = false, fixedHeight = false, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModal(open, panelRef, onClose, true);

  if (!open) return null;

  return createPortal(
    <div className={`fixed inset-0 z-30 flex justify-center ${fixedHeight ? "items-start" : "items-end"}`}>
      <div
        className="sheet-overlay absolute inset-0 bg-[var(--color-text)]/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <SheetPanel panelRef={panelRef} title={title} showClose={showClose} fixedHeight={fixedHeight} onClose={onClose}>
        {children}
      </SheetPanel>
    </div>,
    document.body,
  );
}

interface SheetPanelProps {
  title?: ReactNode;
  showClose?: boolean;
  fixedHeight?: boolean;
  onClose: () => void;
  children: ReactNode;
  panelRef?: Ref<HTMLDivElement>;
}

/**
 * The open panel's chrome, exported standalone (mirroring
 * `MultiComboboxPanel`) so a render test can assert its open-state markup —
 * the grab handle, the header row, the left-hand X — without a DOM env for
 * `createPortal` to mount into.
 */
export function SheetPanel({ title, showClose = false, fixedHeight = false, onClose, children, panelRef }: SheetPanelProps) {
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
      tabIndex={-1}
      className={`sheet-panel scroll-momentum relative z-10 flex w-full max-w-lg scroll-pt-28 flex-col gap-3 overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 outline-none scroll-thin ${fixedHeight ? FIXED_HEIGHT_CLASSES : "max-h-[85vh] shadow-[var(--shadow-lg)]"}`}
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      {/* Item 737: the handle and header row stay pinned while a long body
          scrolls, so the X never leaves the screen. Sticky inside the panel's
          own scroll (never position: fixed, which iOS mis-places), with the
          panel's top padding moved inside it (pt-4) so it pins at the very
          top edge in every engine. At rest it lays out exactly as before.
          Below it, a 12px fade (after:) keeps scrolled text from being sliced
          right under the title; it takes no taps, so HowToLink's 44px target,
          which reaches 12px up into the gap (-my-3), still gets them. At rest
          it only covers that empty gap, in the panel's own color.
          scroll-pt-28 (taller than a two-line header) keeps a focused field
          from scrolling in under it. */}
      <div
        data-sheet-header=""
        className="sticky top-0 z-10 -mx-4 flex shrink-0 flex-col gap-3 bg-[var(--color-bg-elevated)] px-4 pt-4 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-linear-to-b after:from-[var(--color-bg-elevated)] after:to-transparent"
      >
        <div className="mx-auto h-1.5 w-10 shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-border)]" aria-hidden="true" />
        {/* The close X sits at the LEFT of the header row, before the title —
            the same slot and footprint pages give `CloseButton` (item 258). */}
        {title || showClose ? (
          <div className="flex items-center gap-1">
            {showClose ? (
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className={`${ICON_BUTTON_CLASSES} ${ICON_BUTTON_EDGE_INSET}`}
              >
                <CloseGlyph />
              </button>
            ) : null}
            {title ? <h2 className="font-h2 min-w-0 text-[var(--color-text)]">{title}</h2> : null}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
