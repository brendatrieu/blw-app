import { useRef, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { useModal } from "./useModal.js";

/**
 * How a dialog was dismissed. The two ways OUT of a modal that are not a
 * button — a tap on the dimmed backdrop, and Escape — are different gestures
 * with different meanings ("I am done here" vs "get me out"), and the tour
 * reports which one it was. Callers that do not care take no argument, since
 * `() => void` is assignable to this.
 */
export type DialogCloseReason = "overlay" | "escape";

interface DialogProps {
  open: boolean;
  onClose: (reason?: DialogCloseReason) => void;
  /** Names the dialog for assistive tech — required, since the panel has no visible title row. */
  ariaLabel: string;
  children: ReactNode;
}

/**
 * Centred modal card: a dimmed overlay behind a panel that sits in the
 * middle of the viewport, rather than `Sheet`'s panel riding up from the
 * bottom edge.
 *
 * The mechanics are Sheet's own `useModal` — background scroll locked and
 * restored, focus moved into the panel on open and returned on close, Tab
 * trapped inside the panel, Escape closing only the TOP modal (so a delete
 * question over a sheet closes alone) — plus an overlay tap. A second,
 * subtly different focus trap in the app is a bug factory; this is the same
 * trap with a different box around it.
 *
 * A click on the panel cannot close: the overlay is the panel's SIBLING, not
 * its ancestor, so a tap inside the card never reaches the overlay's handler
 * and needs no `stopPropagation` to say so.
 */
export function Dialog({ open, onClose, ariaLabel, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModal(open, panelRef, onClose, false);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div
        className="dialog-overlay absolute inset-0 bg-[var(--color-text)]/40"
        aria-hidden="true"
        onClick={() => onClose("overlay")}
      />
      <DialogPanel panelRef={panelRef} ariaLabel={ariaLabel}>
        {children}
      </DialogPanel>
    </div>,
    document.body,
  );
}

interface DialogPanelProps {
  ariaLabel: string;
  children: ReactNode;
  panelRef?: Ref<HTMLDivElement>;
}

/**
 * The open dialog's card, exported standalone (mirroring `SheetPanel`) so a
 * render test can assert its markup without a DOM for `createPortal` to
 * mount into.
 */
export function DialogPanel({ ariaLabel, children, panelRef }: DialogPanelProps) {
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      // The panel takes focus when the dialog opens (see Dialog's effect); the
      // global `:focus-visible` ring must not draw around the whole card.
      data-no-focus-ring=""
      className="dialog-panel scroll-momentum relative z-10 flex max-h-[85dvh] w-[min(100%-2rem,24rem)] flex-col overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-lg)] outline-none scroll-thin"
    >
      {children}
    </div>
  );
}
