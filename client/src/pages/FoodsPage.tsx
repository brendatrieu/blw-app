import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import type { FoodCategory, FoodsQuery, Level } from "@blw/shared";
import { useFoods } from "../features/catalog/hooks.js";
import { FoodTile } from "../features/catalog/components/FoodTile.js";
import { ActiveFilterPill, FilterChip, FunnelButton } from "../features/catalog/components/filters.js";
import {
  ALLERGEN_SLUGS,
  AGE_THRESHOLDS,
  CATEGORIES,
  IRON_LEVELS,
  VITAMIN_C_LEVELS,
  RECIPES_TAB_PATH,
  addCustomFoodLabel,
  allergenLabel,
} from "../features/catalog/constants.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { SkeletonList } from "../components/ui/Skeleton.js";
import { Input } from "../components/ui/Input.js";
import { Sheet } from "../components/ui/Sheet.js";
import { Button, ButtonLink } from "../components/ui/Button.js";

/**
 * What the grid shows when the filters match nothing. With a search term in
 * play that's not a dead end — it's the strongest signal we ever get that a
 * food the parent feeds is missing from the catalog — so the state offers to
 * make it one, carrying the query over as `?name=` (item 179). Clearing a
 * filter is the only useful advice when there's no query to add.
 *
 * Exported and prop-driven (rather than inlined into the page's JSX) so a
 * render test can pin the with-query variant: `q` is page state, and these
 * tests have no DOM to type into.
 */
export function NoFoodsEmptyState({ query }: { query: string }) {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return <EmptyState title="No foods match those filters" description="Try clearing a filter or two." />;
  }
  return (
    <EmptyState
      title="No foods match those filters"
      description="Not in the catalog? Add it as your own — it'll show up everywhere a catalog food does."
      action={
        <ButtonLink to={`/foods/new?name=${encodeURIComponent(trimmed)}`}>{addCustomFoodLabel(trimmed)}</ButtonLink>
      }
    />
  );
}

export interface ExtraFoodFilters {
  allergen: string | undefined;
  ironLevel: Level | undefined;
  vitaminCLevel: Level | undefined;
  maxAgeMonths: number | undefined;
}

export type ExtraFoodFilterKey = keyof ExtraFoodFilters;

/** What "Clear all" applies — every funnel filter off. */
export const EMPTY_EXTRA_FILTERS: ExtraFoodFilters = {
  allergen: undefined,
  ironLevel: undefined,
  vitaminCLevel: undefined,
  maxAgeMonths: undefined,
};

/** The request the grid makes: search + category + every funnel filter. */
export function buildFoodsFilters(q: string, category: FoodCategory | undefined, extra: ExtraFoodFilters): FoodsQuery {
  return {
    q: q.trim() || undefined,
    category,
    allergen: extra.allergen,
    ironLevel: extra.ironLevel,
    vitaminCLevel: extra.vitaminCLevel,
    maxAgeMonths: extra.maxAgeMonths,
  };
}

/**
 * The filters that live behind the funnel button, resolved to the pills the
 * page shows — one entry per set filter, in display order. Pure, so the
 * funnel count and the pill row can't disagree and both are testable
 * without opening the (node-env-invisible) Sheet.
 */
export function activeExtraFilters(filters: ExtraFoodFilters): Array<{ key: ExtraFoodFilterKey; label: string }> {
  const pills: Array<{ key: ExtraFoodFilterKey; label: string }> = [];
  if (filters.allergen) pills.push({ key: "allergen", label: allergenLabel(filters.allergen) });
  if (filters.ironLevel) {
    pills.push({
      key: "ironLevel",
      label: IRON_LEVELS.find((l) => l.value === filters.ironLevel)?.label ?? filters.ironLevel,
    });
  }
  if (filters.vitaminCLevel) {
    pills.push({
      key: "vitaminCLevel",
      label: VITAMIN_C_LEVELS.find((l) => l.value === filters.vitaminCLevel)?.label ?? filters.vitaminCLevel,
    });
  }
  if (filters.maxAgeMonths !== undefined) {
    const ageLabel = AGE_THRESHOLDS.find((a) => a.value === filters.maxAgeMonths)?.label;
    if (ageLabel) pills.push({ key: "maxAgeMonths", label: ageLabel });
  }
  return pills;
}

interface FoodFilterGroupsProps extends ExtraFoodFilters {
  onChange: (next: ExtraFoodFilters) => void;
}

/** The Filters sheet's chip groups — exported so tests can render them open. */
export function FoodFilterGroups({ onChange, ...filters }: FoodFilterGroupsProps) {
  const set = (patch: Partial<ExtraFoodFilters>) => onChange({ ...filters, ...patch });
  const levelGroup = (
    label: string,
    key: "ironLevel" | "vitaminCLevel",
    options: { value: Level; label: string }[],
  ) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            active={opt.value === filters[key]}
            onClick={() => set({ [key]: opt.value === filters[key] ? undefined : opt.value })}
          />
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Allergen</span>
        <div className="flex flex-wrap gap-1.5">
          {ALLERGEN_SLUGS.map((opt) => (
            <FilterChip
              key={opt.value}
              label={opt.label}
              active={opt.value === filters.allergen}
              onClick={() => set({ allergen: opt.value === filters.allergen ? undefined : opt.value })}
            />
          ))}
        </div>
      </div>

      {levelGroup("Iron", "ironLevel", IRON_LEVELS)}
      {levelGroup("Vitamin C", "vitaminCLevel", VITAMIN_C_LEVELS)}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Age</span>
        <div className="flex flex-wrap gap-1.5">
          {AGE_THRESHOLDS.map((opt) => {
            const active = filters.maxAgeMonths === opt.value;
            return (
              <FilterChip
                key={opt.value}
                label={opt.label}
                active={active}
                onClick={() => set({ maxAgeMonths: active ? undefined : opt.value })}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

/**
 * `/foods` — the food catalog: the grid, its sticky search/category bar and
 * its Filters sheet. Recipes used to share this page behind a `?tab=`
 * segmented control; they have their own route and nav tab now (item 273),
 * so this page is the catalog alone again.
 */
export function FoodsPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<FoodCategory | undefined>(undefined);
  const [allergen, setAllergen] = useState<string | undefined>(undefined);
  const [ironLevel, setIronLevel] = useState<Level | undefined>(undefined);
  const [vitaminCLevel, setVitaminCLevel] = useState<Level | undefined>(undefined);
  const [maxAgeMonths, setMaxAgeMonths] = useState<number | undefined>(undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const extraFilters = useMemo<ExtraFoodFilters>(
    () => ({ allergen, ironLevel, vitaminCLevel, maxAgeMonths }),
    [allergen, ironLevel, vitaminCLevel, maxAgeMonths],
  );
  const filters = useMemo(() => buildFoodsFilters(q, category, extraFilters), [q, category, extraFilters]);

  const { data, isLoading, isError } = useFoods(filters);

  const pills = activeExtraFilters(extraFilters);
  const activeExtraFilterCount = pills.length;
  function applyExtra(next: ExtraFoodFilters) {
    setAllergen(next.allergen);
    setIronLevel(next.ironLevel);
    setVitaminCLevel(next.vitaminCLevel);
    setMaxAgeMonths(next.maxAgeMonths);
  }
  const clearExtra = (key: ExtraFoodFilterKey) => applyExtra({ ...extraFilters, [key]: undefined });

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Foods"
        emoji="🍎"
        description="Iron-rich foods first — filter by category, allergen, or age."
        action={
          <ButtonLink to="/foods/new" size="sm">
            Add food
          </ButtonLink>
        }
      />

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
          <FunnelButton onClick={() => setFiltersOpen(true)} activeCount={activeExtraFilterCount} />
        </div>
      </div>

      {pills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pills.map((pill) => (
            <ActiveFilterPill key={pill.key} label={pill.label} onRemove={() => clearExtra(pill.key)} />
          ))}
        </div>
      )}

      {isLoading && <SkeletonList count={4} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load foods. Try again.</p>}
      {data && data.foods.length === 0 && <NoFoodsEmptyState query={q} />}

      {data && data.foods.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {data.foods.map((food) => (
            <FoodTile key={food.slug} food={food} />
          ))}
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="flex flex-col gap-4">
          <FoodFilterGroups {...extraFilters} onChange={applyExtra} />

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => applyExtra(EMPTY_EXTRA_FILTERS)}
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

/**
 * Where `/foods?tab=` should send you instead of rendering the catalog, or
 * `null` to stay put (item 273). `?tab=recipes` used to select the Recipes
 * segment of this page; those links — bookmarks, anything already shared —
 * now belong at `/recipes`. Every other value (absent, blank, "foods",
 * hand-edited nonsense) was already the Foods segment, so it just renders the
 * catalog and the stray param is ignored. Pure, so the one rule that matters
 * is pinned by a test rather than by a redirect a server render never runs.
 */
export function legacyRecipesTabRedirect(tabParam: string | null): string | null {
  return tabParam === "recipes" ? RECIPES_TAB_PATH : null;
}

/** The `/foods` route element: the catalog, behind the `?tab=recipes`
 * redirect that keeps old links to the recipe list working. */
export function FoodsRoute() {
  const [searchParams] = useSearchParams();
  const redirectTo = legacyRecipesTabRedirect(searchParams.get("tab"));

  if (redirectTo) return <Navigate to={redirectTo} replace />;
  return <FoodsPage />;
}
