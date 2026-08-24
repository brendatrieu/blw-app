import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}

/**
 * Bottom sheet: a dimmed overlay behind a panel that slides up from the
 * bottom edge (instant, no slide, for reduced-motion users — see the
 * `.sheet-overlay` / `.sheet-panel` rules in index.css). Closes on Escape
 * or an overlay click, and traps Tab focus inside the panel while open.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Lock background scroll while the sheet is open. Restore whatever
    // inline value was there before (usually "") so nested sheets or other
    // code that also touches overflow don't get clobbered on close.
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? panel)?.focus();

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

  return createPortal(
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div
        className="sheet-overlay absolute inset-0 bg-[var(--color-text)]/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className="sheet-panel scroll-momentum relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-lg)] outline-none"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto h-1.5 w-10 shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-border)]" aria-hidden="true" />
        {title ? <h2 className="font-h2 text-[var(--color-text)]">{title}</h2> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
