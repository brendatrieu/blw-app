import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Optional decorative emoji shown beside the title, e.g. "🥑". */
  emoji?: string;
}

/** Consistent title/description/action row used at the top of every page. */
export function PageHeader({ title, description, action, emoji }: PageHeaderProps) {
  return (
    // Single-line headers center the action against the title; only when a
    // description makes the left block taller does top-alignment look right.
    <div className={`flex justify-between gap-3 ${description ? "items-start" : "items-center"}`}>
      <div className="flex flex-col gap-1">
        <h1 className="font-display flex items-center gap-2 text-[var(--color-text)]">
          {emoji ? (
            <span aria-hidden="true" className="text-2xl leading-none">
              {emoji}
            </span>
          ) : null}
          {title}
        </h1>
        {description ? <p className="text-sm text-[var(--color-text-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
