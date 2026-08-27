import { useBackNavigate } from "./BackButton.js";

interface CloseButtonProps {
  /** Route to land on when there's no previous history entry to pop. */
  fallback: string;
  className?: string;
}

/**
 * Icon-only "X" dismissal control for full-screen action pages (log food,
 * add/edit pantry item). Shares the exact history-aware back idiom
 * `BackButton` uses — pop history when there's somewhere to pop back to,
 * otherwise land on `fallback` — just presented as a close glyph instead of
 * a labeled back chevron, matching how these pages were reached (opened as
 * an action, not drilled into).
 */
export function CloseButton({ fallback, className = "" }: CloseButtonProps) {
  const handleClick = useBackNavigate(fallback);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Close"
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-inset)] ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
