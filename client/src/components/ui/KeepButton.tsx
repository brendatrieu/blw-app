import { CloseGlyph, ICON_BUTTON_CLASSES } from "./iconButton.js";

interface KeepButtonProps {
  onClick: () => void;
  disabled?: boolean;
  /** Accessible name — "Keep it" by default; "Don't delete" reads better
   * beside an account-deletion form. */
  label?: string;
  className?: string;
}

/**
 * The only dismiss affordance that survives item 257: the "×" beside a
 * DESTRUCTIVE inline confirm ("Remove this meal?", "Delete for good",
 * "Delete my account forever"). Those confirms have no other way out — no
 * back chevron, no sheet close, no Done — so backing out has to stay
 * reachable; everywhere else the header's chevron or X already is that way
 * out and the Cancel button is gone.
 *
 * Icon-only on purpose: a text "Cancel"/"Keep" next to a red destructive
 * button competes with it for weight. Same 44px footprint and glyph as
 * `CloseButton` so the gesture reads identically wherever it appears.
 */
export function KeepButton({ onClick, disabled = false, label = "Keep it", className = "" }: KeepButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`${ICON_BUTTON_CLASSES} text-[var(--color-text-muted)] ${className}`}
    >
      <CloseGlyph />
    </button>
  );
}
