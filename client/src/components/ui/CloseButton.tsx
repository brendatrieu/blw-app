import { createPortal } from "react-dom";
import { useBackNavigate } from "./BackButton.js";
import { useHeaderSlot } from "./headerSlot.js";
import { CloseGlyph, ICON_BUTTON_CLASSES, ICON_BUTTON_EDGE_INSET } from "./iconButton.js";

interface CloseButtonProps {
  /** Route to land on when there's no previous history entry to pop. */
  fallback: string;
  className?: string;
}

/**
 * Icon-only "X" dismissal control for full-screen action pages (log food,
 * add/edit storage item). Shares the exact history-aware back idiom
 * `BackButton` uses — pop history when there's somewhere to pop back to,
 * otherwise land on `fallback` — just presented as a close glyph instead of
 * a back chevron, matching how these pages were reached (opened as an
 * action, not drilled into).
 *
 * Both this and `BackButton` go in `PageHeader`'s `leading` slot at the same
 * size and the same left position (item 258), and both portal into the slim
 * app header's left slot when there is one (item 654): a page shows one or
 * the other, never both, always in the same place.
 */
export function CloseButton({ fallback, className = "" }: CloseButtonProps) {
  const handleClick = useBackNavigate(fallback);
  const slot = useHeaderSlot();

  const button = (
    <button type="button" onClick={handleClick} aria-label="Close" className={`${ICON_BUTTON_CLASSES} ${ICON_BUTTON_EDGE_INSET} ${className}`}>
      <CloseGlyph />
    </button>
  );
  return slot ? createPortal(button, slot) : button;
}
