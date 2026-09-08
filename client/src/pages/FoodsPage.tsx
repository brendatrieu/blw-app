import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { FoodCategory, Level } from "@blw/shared";
import { useFoods } from "../features/catalog/hooks.js";
import { FoodTile } from "../features/catalog/components/FoodTile.js";
import { ActiveFilterPill, FilterChip, FunnelButton } from "../features/catalog/components/filters.js";
import { RecipesSegment } from "../features/catalog/components/RecipesSegment.js";
import {
  ALLERGEN_SLUGS,
  AGE_THRESHOLDS,
  CATEGORIES,
  IRON_LEVELS,
  addCustomFoodLabel,
  allergenLabel,
} from "../features/catalog/constants.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { SegmentedControl } from "../components/ui/SegmentedControl.js";
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

export type FoodsTab = "foods" | "recipes";

/**
 * Which segment `?tab=` selects (item 209). The segment lives in the URL, not
 * in component state, so a link can point at the recipe list, the browser's
 * Back button steps between the two, and a reload keeps the one you were on.
 * Anything other than "recipes" — absent, misspelled, hand-edited — is the
 * Foods segment, which is the page's original behavior.
 */
export function resolveFoodsTab(param: string | null): FoodsTab {
  return param === "recipes" ? "recipes" : "foods";
}

/** The foods grid, its sticky search/category bar, and its Filters sheet —
 * unchanged from before the segment split, just no longer the whole page. */
function FoodsSegment() {
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
    <>
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
    </>
  );
}

const TAB_OPTIONS = [
  { value: "foods" as const, label: "Foods", icon: null },
  { value: "recipes" as const, label: "Recipes", icon: null },
];

/**
 * `/foods` — the catalog, in two segments (item 209): the food grid this
 * page has always been, and the recipe list that used to have no home at
 * all (recipes were reachable only from a favorite or a dashboard card).
 *
 * The active segment is `?tab=`, pushed rather than replaced, so Back
 * returns to the segment the parent was just on instead of leaving the page.
 * Each segment keeps its own filter state in its own component, which is
 * also what unmounts a segment's filters when you leave it.
 */
export function FoodsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveFoodsTab(searchParams.get("tab"));

  function selectTab(next: FoodsTab) {
    if (next === tab) return;
    const params = new URLSearchParams(searchParams);
    if (next === "recipes") params.set("tab", "recipes");
    else params.delete("tab");
    setSearchParams(params);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {tab === "recipes" ? (
        <PageHeader
          title="Recipes"
          emoji="🍳"
          description="Ours and yours — filter by age, allergen, or what's in them."
          action={
            <ButtonLink to="/recipes/new" size="sm">
              Add recipe
            </ButtonLink>
          }
        />
      ) : (
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
      )}

      <SegmentedControl aria-label="Catalog section" options={TAB_OPTIONS} value={tab} onChange={selectTab} />

      {tab === "recipes" ? <RecipesSegment /> : <FoodsSegment />}
    </div>
  );
}
