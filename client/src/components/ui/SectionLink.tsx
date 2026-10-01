import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * A section heading's trailing link ("See all ›", "Ladder ›") per A-Home:
 * 14px bold accent, no underline, the chevron decorative. `min-h-11` keeps
 * the tap target at 44px beside a 20px heading.
 */
export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-accent)]">
      {children}
      <span aria-hidden="true">&nbsp;›</span>
    </Link>
  );
}
