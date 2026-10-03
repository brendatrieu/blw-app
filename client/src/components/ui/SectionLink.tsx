import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** -(44 - 25) / 2: a 44px control beside a 25px `font-h2` line takes no extra
 * row height, so the heading sits 10px above its card as in A-Home (item 696). */
export const HEADING_CONTROL_INSET = "-my-[9.5px]";

/**
 * A section heading's trailing link ("See all ›", "Ladder ›") per A-Home:
 * 14px bold accent, no underline, the chevron decorative. `min-h-11` keeps
 * the tap target at 44px; next to a 20px heading wrap it (or the controls
 * group) in HEADING_CONTROL_INSET so the row stays the heading's height.
 */
export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-accent)]">
      {children}
      <span aria-hidden="true">&nbsp;›</span>
    </Link>
  );
}
