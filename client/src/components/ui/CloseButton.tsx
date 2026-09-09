import { useBackNavigate } from "./BackButton.js";
import { CloseGlyph, ICON_BUTTON_CLASSES, ICON_BUTTON_EDGE_INSET } from "./iconButton.js";

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
 * a back chevron, matching how these pages were reached (opened as an
 * action, not drilled into).
 *
 * Both this and `BackButton` render into `PageHeader`'s `leading` slot at
 * the same size and the same left position (item 258): a page shows one or
 * the other, never both.
 */
export function CloseButton({ fallback, className = "" }: CloseButtonProps) {
  const handleClick = useBackNavigate(fallback);

  return (
    <button type="button" onClick={handleClick} aria-label="Close" className={`${ICON_BUTTON_CLASSES} ${ICON_BUTTON_EDGE_INSET} ${className}`}>
      <CloseGlyph />
    </button>
  );
}
