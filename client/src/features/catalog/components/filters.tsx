interface FilterChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}

/**
 * Single-select-clears-on-reclick chip, matching the app's existing filter
 * chip behavior. Lifted out of `FoodsPage` when the Recipes segment (item
 * 210) needed the same chip for its scope/allergen/age filters — "the same
 * FilterChip style" is a shared component here, not a copy that can drift.
 */
export function FilterChip({ active, label, onClick, className = "" }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center justify-center rounded-full border px-2.5 py-1 text-center text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
          : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
      } ${className}`}
    >
      {label}
    </button>
  );
}

/** Removable pill for an active filter, shown below the sticky bar. */
export function ActiveFilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-0.5 rounded-full border border-[var(--color-accent)] bg-[var(--color-primary-soft)] py-1 pr-1 pl-3 text-xs font-medium text-[var(--color-text)]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </span>
  );
}

/** The funnel glyph on the button that opens a list's Filters sheet. */
export function FunnelIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16l-6 7.5V19l-4 2v-8.5L4 5z" />
    </svg>
  );
}

interface FunnelButtonProps {
  onClick: () => void;
  /** Drives the little red count badge; 0 renders none. */
  activeCount: number;
}

/** The funnel button itself, badge and all — identical on both segments. */
export function FunnelButton({ onClick, activeCount }: FunnelButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-medium text-[var(--color-text)]"
    >
      <FunnelIcon />
      <span className="sr-only">Filters</span>
      {activeCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-danger)] px-1 text-[10px] font-bold text-[var(--color-danger-contrast)]"
        >
          {activeCount}
        </span>
      )}
    </button>
  );
}
