import { useMemo, useState } from "react";
import type { FoodCategory, Level } from "@blw/shared";
import { useFoods } from "../features/catalog/hooks.js";
import { FoodTile } from "../features/catalog/components/FoodTile.js";
import { ALLERGEN_SLUGS, AGE_THRESHOLDS, CATEGORIES, IRON_LEVELS, allergenLabel } from "../features/catalog/constants.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { SkeletonList } from "../components/ui/Skeleton.js";
import { Input } from "../components/ui/Input.js";
import { Sheet } from "../components/ui/Sheet.js";
import { Button } from "../components/ui/Button.js";

interface FilterChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}

/** Single-select-clears-on-reclick chip, matching the app's existing filter chip behavior. */
function FilterChip({ active, label, onClick, className = "" }: FilterChipProps) {
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

/** Removable pill for an active allergen/iron/age filter, shown below the sticky bar. */
function ActiveFilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-0.5 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-soft)] py-1 pr-1 pl-3 text-xs font-medium text-[var(--color-text)]">
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

function FunnelIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16l-6 7.5V19l-4 2v-8.5L4 5z" />
    </svg>
  );
}

export function FoodsPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<FoodCategory | undefined>(undefined);
  const [allergen, setAllergen] = useState<string | undefined>(undefined);
  const [ironLevel, setIronLevel] = useState<Level | undefined>(undefined);
  const [maxAgeMonths, setMaxAgeMonths] = useState<number | undefined>(undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      category,
      allergen,
      ironLevel,
      maxAgeMonths,
    }),
    [q, category, allergen, ironLevel, maxAgeMonths],
  );

  const { data, isLoading, isError } = useFoods(filters);

  const activeExtraFilterCount = [allergen, ironLevel, maxAgeMonths].filter((v) => v !== undefined).length;

  const ageLabel = AGE_THRESHOLDS.find((a) => a.value === maxAgeMonths)?.label;

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Foods" emoji="🍎" description="Iron-rich foods first — filter by category, allergen, or age." />

      <div
        className="sticky z-[5] -mx-4 flex flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 pt-1 pb-2"
        style={{ top: "var(--header-height)" }}
      >
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods…"
          aria-label="Search foods"
        />

        <div className="flex items-center gap-1" role="group" aria-label="Category">
          {CATEGORIES.map((opt) => (
            <FilterChip
              key={opt.value}
              label={opt.label}
              active={opt.value === category}
              onClick={() => setCategory(opt.value === category ? undefined : opt.value)}
              className="min-w-0 flex-1 overflow-hidden px-1 text-[10px] text-ellipsis"
            />
          ))}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="relative flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-medium text-[var(--color-text)]"
          >
            <FunnelIcon />
            <span className="sr-only">Filters</span>
            {activeExtraFilterCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-danger)] px-1 text-[10px] font-bold text-[var(--color-primary-contrast)]"
              >
                {activeExtraFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeExtraFilterCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allergen && <ActiveFilterPill label={allergenLabel(allergen)} onRemove={() => setAllergen(undefined)} />}
          {ironLevel && (
            <ActiveFilterPill
              label={IRON_LEVELS.find((l) => l.value === ironLevel)?.label ?? ironLevel}
              onRemove={() => setIronLevel(undefined)}
            />
          )}
          {ageLabel && <ActiveFilterPill label={ageLabel} onRemove={() => setMaxAgeMonths(undefined)} />}
        </div>
      )}

      {isLoading && <SkeletonList count={4} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load foods. Try again.</p>}
      {data && data.foods.length === 0 && (
        <EmptyState title="No foods match those filters" description="Try clearing a filter or two." />
      )}

      {data && data.foods.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {data.foods.map((food) => (
            <FoodTile key={food.slug} food={food} />
          ))}
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Allergen</span>
            <div className="flex flex-wrap gap-1.5">
              {ALLERGEN_SLUGS.map((opt) => (
                <FilterChip
                  key={opt.value}
                  label={opt.label}
                  active={opt.value === allergen}
                  onClick={() => setAllergen(opt.value === allergen ? undefined : opt.value)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Iron</span>
            <div className="flex flex-wrap gap-1.5">
              {IRON_LEVELS.map((opt) => (
                <FilterChip
                  key={opt.value}
                  label={opt.label}
                  active={opt.value === ironLevel}
                  onClick={() => setIronLevel(opt.value === ironLevel ? undefined : opt.value)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Age</span>
            <div className="flex flex-wrap gap-1.5">
              {AGE_THRESHOLDS.map((opt) => {
                const active = maxAgeMonths === opt.value;
                return (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    active={active}
                    onClick={() => setMaxAgeMonths(active ? undefined : opt.value)}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setAllergen(undefined);
                setIronLevel(undefined);
                setMaxAgeMonths(undefined);
              }}
            >
              Clear all
            </Button>
            <Button type="button" className="flex-1" onClick={() => setFiltersOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
