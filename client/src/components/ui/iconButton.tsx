/**
 * The icon-only header/confirm affordances' shared geometry — kept in its
 * own module (rather than inside `BackButton` or `CloseButton`) so both of
 * those, `Sheet`'s header X and `KeepButton` can import it without any of
 * them importing each other.
 */

/**
 * One 44×44 target (the design-system minimum) with the glyph centred
 * inside it. Shared so the back chevron, the close X and the destructive
 * "keep it" × can't drift apart on size or hit area.
 */
export const ICON_BUTTON_CLASSES =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-inset)] disabled:opacity-60";

/**
 * Added by the affordances that sit at a container's own left EDGE (a page
 * header's chevron/X, a sheet header's X): the 44px box is wider than the
 * 24px glyph, so it's pulled left by the difference's half-ish so the
 * *glyph* — not the padding — lines up with the text below it. Confirm-row
 * ×'s sit mid-row and take no inset.
 */
export const ICON_BUTTON_EDGE_INSET = "-ml-2";

/**
 * Stroke geometry shared by the header glyphs — deliberately the same
 * `viewBox`/`strokeWidth` as `AppLayout`'s sun/moon icons (24 viewBox, 1.8
 * stroke, round caps) so a back chevron and the theme toggle in the same
 * header read as one icon set rather than two weights.
 */
const GLYPH_PROPS = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  width: 24,
  height: 24,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** The "×" glyph, shared by every close/dismiss control. */
export function CloseGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** The "‹" back chevron, shared by `BackButton` and anything mirroring it. */
export function ChevronLeftGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
