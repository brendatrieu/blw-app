import { useMemo, useState } from "react";
import type { FoodCategory, Level } from "@blw/shared";
import { useFoods } from "../features/catalog/hooks.js";
import { FoodCard } from "../features/catalog/components/FoodCard.js";
import { ChipGroup } from "../features/catalog/components/ChipGroup.js";
import { ALLERGEN_SLUGS, AGE_THRESHOLDS, CATEGORIES, IRON_LEVELS } from "../features/catalog/constants.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { SkeletonList } from "../components/ui/Skeleton.js";

export function FoodsPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<FoodCategory | undefined>(undefined);
  const [allergen, setAllergen] = useState<string | undefined>(undefined);
  const [ironLevel, setIronLevel] = useState<Level | undefined>(undefined);
  const [maxAgeMonths, setMaxAgeMonths] = useState<number | undefined>(undefined);

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

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Foods" description="Iron-rich foods first — filter by category, allergen, or age." />

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search foods…"
        aria-label="Search foods"
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
      />

      <div className="flex flex-col gap-3">
        <ChipGroup label="Category" options={CATEGORIES} value={category} onChange={setCategory} />
        <ChipGroup label="Allergen" options={ALLERGEN_SLUGS} value={allergen} onChange={setAllergen} />
        <ChipGroup label="Iron" options={IRON_LEVELS} value={ironLevel} onChange={setIronLevel} />
        <ChipGroup
          label="Age"
          options={AGE_THRESHOLDS.map((a) => ({ value: String(a.value), label: a.label }))}
          value={maxAgeMonths !== undefined ? String(maxAgeMonths) : undefined}
          onChange={(v) => setMaxAgeMonths(v === undefined ? undefined : Number(v))}
        />
      </div>

      {isLoading && <SkeletonList count={4} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load foods. Try again.</p>}
      {data && data.foods.length === 0 && (
        <EmptyState title="No foods match those filters" description="Try clearing a filter or two." />
      )}

      {data && data.foods.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.foods.map((food) => (
            <FoodCard key={food.slug} food={food} />
          ))}
        </div>
      )}
    </div>
  );
}
