import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Names the dialog for assistive tech — required, since the panel has no visible title row. */
  ariaLabel: string;
  children: ReactNode;
}

/**
 * Centred modal card: a dimmed overlay behind a panel that sits in the
 * middle of the viewport, rather than `Sheet`'s panel riding up from the
 * bottom edge.
 *
 * The mechanics are deliberately Sheet's, line for line — portal to
 * `document.body`, background scroll locked and restored to whatever inline
 * value was there before, focus moved into the panel on open and returned to
 * whatever had it on close, Tab trapped inside the panel, Escape and an
 * overlay tap both closing. A second, subtly different focus trap in the app
 * is a bug factory; this one is the same trap with a different box around it.
 *
 * A click on the panel cannot close: the overlay is the panel's SIBLING, not
 * its ancestor, so a tap inside the card never reaches the overlay's handler
 * and needs no `stopPropagation` to say so.
 */
export function Dialog({ open, onClose, ariaLabel, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Guarded: the node-env suite drives this component as a function, with
    // a stand-in document or none at all.
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Focus lands on the panel itself (tabIndex -1, no outline), not on its
    // first control: a programmatic focus on a button draws the browser's
    // focus ring around it on mobile, which read as a stray border on Skip.
    // Tab from here goes to the first control as usual.
    const panel = panelRef.current;
    panel?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div
        className="dialog-overlay absolute inset-0 bg-[var(--color-text)]/40"
        aria-hidden="true"
        onClick={onClose}
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
      className="dialog-panel scroll-momentum relative z-10 flex max-h-[85dvh] w-[min(100%-2rem,24rem)] flex-col overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-lg)] outline-none scroll-thin"
    >
      {children}
    </div>
  );
}
