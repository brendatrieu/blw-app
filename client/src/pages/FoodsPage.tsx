import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import type { FoodCategory, FoodsQuery, Level } from "@blw/shared";
import { useFoods } from "../features/catalog/hooks.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useRatings } from "../features/tracking/hooks.js";
import { ratingSortLabel, sortByRating, type RatingSort } from "../features/catalog/ratingSort.js";
import { useCatalogFilteredEvent } from "../lib/usage/useCatalogFiltered.js";
import { FoodTile } from "../features/catalog/components/FoodTile.js";
import {
  ActiveFilterPill,
  FilterChip,
  FunnelButton,
  RatingSortGroup,
  toggleValue,
  withoutPill,
} from "../features/catalog/components/filters.js";
import {
  ALLERGEN_SLUGS,
  AGE_THRESHOLDS,
  CATEGORIES,
  categoryChipLabel,
  IRON_LEVELS,
  VITAMIN_C_LEVELS,
  FIBER_LEVELS,
  RECIPES_TAB_PATH,
  addCustomFoodLabel,
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
  /** Pick-several (item 592): any picked value matches; `[]` is no filter. */
  allergen: string[];
  ironLevel: Level[];
  vitaminCLevel: Level[];
  fiberLevel: Level[];
  /** Pick-one: 9m+ already includes 6m+. */
  maxAgeMonths: number | undefined;
  /** Foods › Deleted: ONLY the parent's own deleted custom foods, each
   * opening its read-only page with Restore (ledger 544). */
  deleted: boolean | undefined;
  /** Item 576: a rating sort for the active baby. Client-side only — the
   * server returns the usual order and `sortByRating` reorders it. */
  sort?: RatingSort;
}

export type ExtraFoodFilterKey = keyof ExtraFoodFilters;

/** What "Clear all" applies — every funnel filter off. */
export const EMPTY_EXTRA_FILTERS: ExtraFoodFilters = {
  allergen: [],
  ironLevel: [],
  vitaminCLevel: [],
  fiberLevel: [],
  maxAgeMonths: undefined,
  deleted: undefined,
  sort: undefined,
};

/** A `?key=` param, given once or repeated, narrowed to the chips that
 * exist, in chip order — anything else (blank, "HIGH", a typo) is ignored,
 * never rendered as a chip that matches nothing. */
function pickedFromSearch<V extends string>(params: URLSearchParams, key: string, options: readonly { value: V }[]): V[] {
  const raw = params.getAll(key);
  return options.map((option) => option.value).filter((value) => raw.includes(value));
}

/**
 * The funnel state a link into this page asks for (item 280): the tummy
 * article's constipation section points at `/foods?fiberLevel=high`, and
 * `?ironLevel=`, `?vitaminCLevel=` and `?allergen=` work the same way so a
 * link can preset any of the level filters rather than only the one that
 * happened to need it first. Each may repeat (`?ironLevel=high&ironLevel=moderate`)
 * to preselect several chips.
 *
 * Pure, and total: anything unrecognised (a bad level, an allergen slug the
 * chips don't have) falls back to that filter being off, so a hand-edited URL
 * lands on the plain catalog rather than an empty grid nobody can explain.
 * `maxAgeMonths` deliberately isn't read — the age chips are a browsing aid,
 * and no link in the app or the corpus asks for one.
 */
export function initialExtraFiltersFromSearch(params: URLSearchParams): ExtraFoodFilters {
  return {
    ...EMPTY_EXTRA_FILTERS,
    allergen: pickedFromSearch(params, "allergen", ALLERGEN_SLUGS),
    ironLevel: pickedFromSearch(params, "ironLevel", IRON_LEVELS),
    vitaminCLevel: pickedFromSearch(params, "vitaminCLevel", VITAMIN_C_LEVELS),
    fiberLevel: pickedFromSearch(params, "fiberLevel", FIBER_LEVELS),
  };
}

/** The request the grid makes: search + category + every funnel filter. */
export function buildFoodsFilters(q: string, category: FoodCategory[], extra: ExtraFoodFilters): FoodsQuery {
  return {
    q: q.trim() || undefined,
    category,
    allergen: extra.allergen,
    ironLevel: extra.ironLevel,
    vitaminCLevel: extra.vitaminCLevel,
    fiberLevel: extra.fiberLevel,
    maxAgeMonths: extra.maxAgeMonths,
    deleted: extra.deleted,
  };
}

/** One removable pill; `value` names the pick it removes in a pick-several group. */
export interface FoodFilterPill {
  key: ExtraFoodFilterKey;
  label: string;
  value?: string;
}

type MultiFoodFilterKey = "allergen" | "ironLevel" | "vitaminCLevel" | "fiberLevel";

/**
 * The filters that live behind the funnel button, resolved to the pills the
 * page shows — one entry per set filter, and one per picked value in a
 * pick-several group (item 596), in display order. Pure, so the
 * funnel count and the pill row can't disagree and both are testable
 * without opening the (node-env-invisible) Sheet.
 */
export function activeExtraFilters(filters: ExtraFoodFilters): FoodFilterPill[] {
  const pills: FoodFilterPill[] = [];
  const multi = (key: MultiFoodFilterKey, options: readonly { value: string; label: string }[]) => {
    const picked: readonly string[] = filters[key];
    for (const option of options) {
      if (picked.includes(option.value)) pills.push({ key, value: option.value, label: option.label });
    }
  };
  multi("allergen", ALLERGEN_SLUGS);
  multi("ironLevel", IRON_LEVELS);
  multi("vitaminCLevel", VITAMIN_C_LEVELS);
  multi("fiberLevel", FIBER_LEVELS);
  if (filters.maxAgeMonths !== undefined) {
    const ageLabel = AGE_THRESHOLDS.find((a) => a.value === filters.maxAgeMonths)?.label;
    if (ageLabel) pills.push({ key: "maxAgeMonths", label: ageLabel });
  }
  if (filters.deleted) pills.push({ key: "deleted", label: "Deleted" });
  if (filters.sort) pills.push({ key: "sort", label: ratingSortLabel(filters.sort) });
  return pills;
}

interface FoodFilterGroupsProps extends ExtraFoodFilters {
  onChange: (next: ExtraFoodFilters) => void;
}

/** The Filters sheet's chip groups — exported so tests can render them open. */
export function FoodFilterGroups({ onChange, ...filters }: FoodFilterGroupsProps) {
  const set = (patch: Partial<ExtraFoodFilters>) => onChange({ ...filters, ...patch });
  // Pick-several (item 592): each chip toggles its own value.
  const multiGroup = (label: string, key: MultiFoodFilterKey, options: readonly { value: string; label: string }[]) => {
    const picked: readonly string[] = filters[key];
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <FilterChip
              key={opt.value}
              label={opt.label}
              active={picked.includes(opt.value)}
              onClick={() => set({ [key]: toggleValue(options, picked, opt.value) })}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <RatingSortGroup value={filters.sort} onChange={(sort) => set({ sort })} />

      {multiGroup("Allergen", "allergen", ALLERGEN_SLUGS)}
      {multiGroup("Iron", "ironLevel", IRON_LEVELS)}
      {multiGroup("Vitamin C", "vitaminCLevel", VITAMIN_C_LEVELS)}
      {multiGroup("Fiber", "fiberLevel", FIBER_LEVELS)}

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

      {/* Always offered, rather than only once something is deleted: that
          would cost a second query just to decide whether to show a chip. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Show</span>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="Deleted"
            active={Boolean(filters.deleted)}
            onClick={() => set({ deleted: filters.deleted ? undefined : true })}
          />
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
  const [searchParams] = useSearchParams();
  // Read ONCE, on the first render (item 280): the funnel is state the parent
  // then edits, so a later `?fiberLevel=` change would fight their taps. The
  // lazy initializers make that literal — after mount the URL is ignored.
  const [initial] = useState(() => initialExtraFiltersFromSearch(searchParams));
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<FoodCategory[]>([]);
  const [allergen, setAllergen] = useState<string[]>(initial.allergen);
  const [ironLevel, setIronLevel] = useState<Level[]>(initial.ironLevel);
  const [vitaminCLevel, setVitaminCLevel] = useState<Level[]>(initial.vitaminCLevel);
  const [fiberLevel, setFiberLevel] = useState<Level[]>(initial.fiberLevel);
  const [maxAgeMonths, setMaxAgeMonths] = useState<number | undefined>(initial.maxAgeMonths);
  const [deleted, setDeleted] = useState<boolean | undefined>(initial.deleted);
  const [sort, setSort] = useState<RatingSort | undefined>(initial.sort);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const extraFilters = useMemo<ExtraFoodFilters>(
    () => ({ allergen, ironLevel, vitaminCLevel, fiberLevel, maxAgeMonths, deleted, sort }),
    [allergen, ironLevel, vitaminCLevel, fiberLevel, maxAgeMonths, deleted, sort],
  );
  const filters = useMemo(() => buildFoodsFilters(q, category, extraFilters), [q, category, extraFilters]);

  const { data, isLoading, isError } = useFoods(filters);
  // Item 575/576: the active baby's ratings, fetched apart from the catalog
  // list (which is the same for every baby) and joined here by food id.
  const { activeBaby } = useActiveBaby();
  const { data: ratings } = useRatings(activeBaby?.id);
  const shownFoods = useMemo(
    () => sortByRating(data?.foods ?? [], sort, (food) => ratings?.foods[food.id]),
    [data, sort, ratings],
  );
  // `catalog_filtered`, once a changed filter set has actually resolved
  // (item 320). Keys and a results bucket only — never the search text.
  // The sort rides along as a key; the baby never does.
  const reported = useMemo(() => ({ ...filters, sort }), [filters, sort]);
  useCatalogFilteredEvent({ catalog: "foods", filters: reported, resultCount: data?.foods.length });

  const pills = activeExtraFilters(extraFilters);
  const activeExtraFilterCount = pills.length;
  function applyExtra(next: ExtraFoodFilters) {
    setAllergen(next.allergen);
    setIronLevel(next.ironLevel);
    setVitaminCLevel(next.vitaminCLevel);
    setFiberLevel(next.fiberLevel);
    setMaxAgeMonths(next.maxAgeMonths);
    setDeleted(next.deleted);
    setSort(next.sort);
  }
  const removePill = (pill: FoodFilterPill) => applyExtra(withoutPill(extraFilters, EMPTY_EXTRA_FILTERS, pill));

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Foods"
        emoji="🍎"
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

        <div className="flex items-center gap-0.5" role="group" aria-label="Category">
          {CATEGORIES.map((opt) => (
            <FilterChip
              key={opt.value}
              label={categoryChipLabel(opt)}
              active={category.includes(opt.value)}
              onClick={() => setCategory(toggleValue(CATEGORIES, category, opt.value))}
              className="min-w-0 flex-1 overflow-hidden px-1 text-[10px] text-ellipsis"
            />
          ))}
          <FunnelButton onClick={() => setFiltersOpen(true)} activeCount={activeExtraFilterCount} />
        </div>
      </div>

      {pills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pills.map((pill) => (
            <ActiveFilterPill key={`${pill.key}:${pill.value ?? ""}`} label={pill.label} onRemove={() => removePill(pill)} />
          ))}
        </div>
      )}

      {isLoading && <SkeletonList count={4} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load foods. Try again.</p>}
      {data && data.foods.length === 0 && <NoFoodsEmptyState query={q} />}

      {data && data.foods.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {shownFoods.map((food) => (
            <FoodTile key={food.slug} food={food} rating={ratings?.foods[food.id]} />
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
