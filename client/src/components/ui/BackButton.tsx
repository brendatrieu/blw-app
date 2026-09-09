import { useNavigate } from "react-router-dom";
import { ChevronLeftGlyph, ICON_BUTTON_CLASSES, ICON_BUTTON_EDGE_INSET } from "./iconButton.js";

interface BackButtonProps {
  /** Route to land on when there's no previous history entry to pop (e.g. a fresh deep link). */
  fallback: string;
  className?: string;
}

/**
 * Shared history-aware back navigation: pops the router history when there's
 * a previous entry to return to (so back behaves like the user expects after
 * navigating within the app), otherwise lands on `fallback` (e.g. a
 * bookmarked or shared deep link with no history). Extracted so both
 * `BackButton` and icon-only controls (e.g. `CloseButton`) share one
 * implementation of the idiom. Deliberately not memoized (no `useCallback`)
 * so it keeps working when a test invokes the owning component as a plain
 * function with `useNavigate` mocked, outside a real render pass.
 */
export function useBackNavigate(fallback: string): () => void {
  const navigate = useNavigate();

  return () => {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };
}

/**
 * Back navigation for detail pages — the installed PWA has no browser chrome,
 * so every page that's reached by drilling in needs its own way out.
 *
 * Chevron-only (item 258): a 24px "‹" at the sun/moon icons' stroke weight
 * in a 44px target, with the word "Back" kept for assistive tech as
 * `sr-only` text rather than shown. It renders in `PageHeader`'s `leading`
 * slot, on the same row as the h1 — never on a line of its own above it —
 * so the title row is the one place a page's way out ever lives. There is no
 * `children` label: a page that wants to name its destination says so in its
 * own title, not in the chevron.
 */
export function BackButton({ fallback, className = "" }: BackButtonProps) {
  const handleClick = useBackNavigate(fallback);

  return (
    <button type="button" onClick={handleClick} className={`${ICON_BUTTON_CLASSES} ${ICON_BUTTON_EDGE_INSET} ${className}`}>
      <ChevronLeftGlyph />
      <span className="sr-only">Back</span>
    </button>
  );
}
