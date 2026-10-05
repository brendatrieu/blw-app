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
  children: ReactNode;
}

/**
 * Bottom sheet: a dimmed overlay behind a panel that slides up from the
 * bottom edge (instant, no slide, for reduced-motion users — see the
 * `.sheet-overlay` / `.sheet-panel` rules in index.css). Closes on Escape
 * or an overlay click, and traps Tab focus inside the panel while open — the
 * same `useModal` mechanics as `Dialog`.
 */
export function Sheet({ open, onClose, title, showClose = false, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModal(open, panelRef, onClose, true);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div
        className="sheet-overlay absolute inset-0 bg-[var(--color-text)]/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <SheetPanel panelRef={panelRef} title={title} showClose={showClose} onClose={onClose}>
        {children}
      </SheetPanel>
    </div>,
    document.body,
  );
}

interface SheetPanelProps {
  title?: ReactNode;
  showClose?: boolean;
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
export function SheetPanel({ title, showClose = false, onClose, children, panelRef }: SheetPanelProps) {
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
      tabIndex={-1}
      className="sheet-panel scroll-momentum relative z-10 flex max-h-[85vh] w-full max-w-lg scroll-pt-28 flex-col gap-3 overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 shadow-[var(--shadow-lg)] outline-none scroll-thin"
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
