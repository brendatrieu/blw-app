import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

/** Friendly one-liner + primary action, used wherever a list has nothing in it yet. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] bg-[var(--color-bg-inset)] p-8 text-center">
      {icon ? (
        <div className="text-5xl leading-none" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <p className="font-h2 text-[var(--color-text)]">{title}</p>
      {description ? <p className="text-sm text-[var(--color-text-muted)]">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
