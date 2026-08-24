import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface BackButtonProps {
  /** Route to land on when there's no previous history entry to pop (e.g. a fresh deep link). */
  fallback: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Back navigation for detail pages — the installed PWA has no browser chrome,
 * so every page that's reached by drilling in needs its own way out. Pops
 * the router history when there's a previous entry to return to (so back
 * behaves like the user expects after navigating within the app), otherwise
 * lands on `fallback` (e.g. a bookmarked or shared deep link with no history).
 */
export function BackButton({ fallback, children = "Back", className = "" }: BackButtonProps) {
  const navigate = useNavigate();

  function handleClick() {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex min-h-11 w-fit items-center gap-1 rounded-[var(--radius-md)] px-2 -ml-2 text-sm font-medium text-[var(--color-text)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-inset)] ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {children}
    </button>
  );
}
