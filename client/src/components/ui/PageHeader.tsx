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
    <div className="flex items-start justify-between gap-3">
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
