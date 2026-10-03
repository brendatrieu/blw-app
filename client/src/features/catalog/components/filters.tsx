import { RATING_SORTS, type RatingSort } from "../ratingSort.js";

interface FilterChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}

/**
 * Toggle chip — tapping an active chip clears it, whether its group is
 * pick-one or pick-several (see `toggleValue`). Lifted out of `FoodsPage` when the Recipes segment (item
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
          ? "border-[var(--color-selected)] bg-[var(--color-selected)] text-[var(--color-selected-contrast)]"
          : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
      } ${className}`}
    >
      {label}
    </button>
  );
}

/**
 * A pick-several group (item 592) with `value` tapped: added if it was off,
 * removed if it was on. The result is always in the chips' own order, so the
 * order the parent tapped in never changes the list (or its cache key).
 */
export function toggleValue<V>(options: readonly { value: V }[], picked: readonly V[], value: V): V[] {
  return options.map((option) => option.value).filter((v) => (v === value) !== picked.includes(v));
}

/**
 * The filters with one pill removed (item 596): a pick-several group loses
 * just that pill's value; any other filter goes back to its `empty` value.
 */
export function withoutPill<T extends object>(filters: T, empty: T, pill: { key: keyof T; value?: unknown }): T {
  const current = filters[pill.key];
  return {
    ...filters,
    [pill.key]: Array.isArray(current) ? current.filter((v: unknown) => v !== pill.value) : empty[pill.key],
  };
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
  /** Drives the little apricot count dot; 0 renders none. */
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
          className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-apricot-graphic)] px-1 text-[10px] font-semibold tabular-nums text-[var(--color-apricot-graphic-ink)]"
        >
          {activeCount}
        </span>
      )}
    </button>
  );
}

/** Item 576: the "Sort" chips, shared by the Foods and Recipes filter
 * sheets. Tapping the active chip goes back to the usual order. */
export function RatingSortGroup({
  value,
  onChange,
}: {
  value: RatingSort | undefined;
  onChange: (sort: RatingSort | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">Sort</span>
      <div className="flex flex-wrap gap-1.5">
        {RATING_SORTS.map((opt) => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            active={opt.value === value}
            onClick={() => onChange(opt.value === value ? undefined : opt.value)}
          />
        ))}
      </div>
    </div>
  );
}
