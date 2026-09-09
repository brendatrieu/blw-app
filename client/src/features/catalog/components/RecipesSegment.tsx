import { useMemo, useState } from "react";
import type { RecipeListItem, RecipeScope } from "@blw/shared";
import type { RecipeFilters } from "../api.js";
import { AGE_THRESHOLDS, ALLERGEN_SLUGS, RECIPE_SCOPES, allergenLabel } from "../constants.js";
import { useFoods, useRecipes } from "../hooks.js";
import { BASIC_RECIPE_LABEL, isBasicRecipe } from "../basicRecipe.js";
import { ActiveFilterPill, FilterChip, FunnelButton } from "./filters.js";
import { SingleFoodPicker } from "./FoodPicker.js";
import { Badge } from "./Badge.js";
import { Button, ButtonLink } from "../../../components/ui/Button.js";
import { CardLink } from "../../../components/ui/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState.js";
import { Input } from "../../../components/ui/Input.js";
import { Sheet } from "../../../components/ui/Sheet.js";
import { SkeletonList } from "../../../components/ui/Skeleton.js";

/**
 * One recipe in the list (item 210). The whole row is the link, so nothing
 * inside it may be interactive — the favorite mark is a decorative `<span>`,
 * not a toggle; favoriting happens on the recipe's own page, where the
 * button can say what it does.
 *
 * Exported so a render test can pin every badge combination without needing
 * a server to produce one.
 */
export function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  return (
    <CardLink to={`/recipes/${recipe.id}`} padding="sm" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-[var(--color-text)]">{recipe.title}</span>
        {recipe.isFavorite && (
          <span aria-hidden="true" className="shrink-0 text-sm leading-none text-[var(--color-primary-soft-text)]">
            ♥
          </span>
        )}
      </div>
      {recipe.ingredientNames.length > 0 && (
        <p className="truncate text-xs text-[var(--color-text-muted)]">{recipe.ingredientNames.join(", ")}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{recipe.minAgeMonths}m+</Badge>
        {/* Derived, not stored: one ingredient IS the recipe (item 255). */}
        {isBasicRecipe(recipe.ingredientNames.length) && <Badge tone="neutral">{BASIC_RECIPE_LABEL}</Badge>}
        {recipe.ironFocus && <Badge tone="primary">Iron</Badge>}
        {recipe.vitaminCHigh && <Badge tone="sunshine">Vit C</Badge>}
        {recipe.isCustom && <Badge tone="neutral">Custom</Badge>}
        {recipe.allergens.map((slug) => (
          <Badge key={slug} tone="danger">
            {allergenLabel(slug)}
          </Badge>
        ))}
      </div>
    </CardLink>
  );
}

/**
 * What the list shows when the filters match nothing. Unlike the foods grid
 * there's no query to carry over (a recipe is written, not named), so the
 * offer is the plain "write one of your own" — the same escape hatch the
 * header action gives, repeated where the dead end actually happens.
 *
 * Exported and prop-free for the same reason `NoFoodsEmptyState` is: this
 * state depends on live filter state a static render can't reach.
 */
export function NoRecipesEmptyState() {
  return (
    <EmptyState
      icon="🍳"
      title="No recipes match those filters"
      description="Try clearing a filter — or write the one you actually cook."
      action={<ButtonLink to="/recipes/new">Add a recipe</ButtonLink>}
    />
  );
}

/** The funnel-only filters: everything behind the sheet, excluding search
 * and scope (which live in their own always-visible controls). */
export interface ExtraRecipeFilters {
  maxAgeMonths: number | undefined;
  allergen: string | undefined;
  ironFocus: boolean;
  vitaminCHigh: boolean;
  ingredientFoodId: string;
}

export type ExtraRecipeFilterKey = keyof ExtraRecipeFilters;

/** What "Clear all" applies — every funnel filter off. Also the source of
 * each filter's own "off" value, so removing one pill resets exactly that
 * key without having to restate what "off" means for it. */
export const EMPTY_RECIPE_FILTERS: ExtraRecipeFilters = {
  maxAgeMonths: undefined,
  allergen: undefined,
  ironFocus: false,
  vitaminCHigh: false,
  ingredientFoodId: "",
};

/** The raw filter state the Recipes segment's controls hold. */
interface RecipesFilterState extends ExtraRecipeFilters {
  q: string;
  scope: RecipeScope;
}

/**
 * The segment's control state -> the request filters `useRecipes` sends.
 * Pure and exported so the one rule that's easy to drop — `ironFocus` and
 * `vitaminCHigh` are both exact-match toggles, so "off" must OMIT the key
 * rather than send `false` (see `buildRecipesQueryString`) — is pinned by a
 * test instead of by reading this component.
 */
export function buildRecipesFilters(state: RecipesFilterState): RecipeFilters {
  return {
    q: state.q.trim() || undefined,
    scope: state.scope,
    maxAgeMonths: state.maxAgeMonths,
    allergen: state.allergen,
    ironFocus: state.ironFocus || undefined,
    vitaminCHigh: state.vitaminCHigh || undefined,
    ingredientFoodId: state.ingredientFoodId || undefined,
  };
}

/**
 * The filters that live behind the funnel button, resolved to the pills the
 * page shows — one entry per set filter, in display order (age, allergen,
 * iron focus, high vitamin C, ingredient). Pure, so the funnel count and the
 * pill row can't disagree and both are testable without opening the
 * (node-env-invisible) Sheet. `ingredientName` is the only piece that isn't
 * static — it's the picked food's name, resolved by the caller — so it's a
 * separate argument rather than part of the filter state itself.
 */
export function activeRecipeFilters(
  filters: ExtraRecipeFilters,
  ingredientName?: string,
): Array<{ key: ExtraRecipeFilterKey; label: string }> {
  const pills: Array<{ key: ExtraRecipeFilterKey; label: string }> = [];
  if (filters.maxAgeMonths !== undefined) {
    const ageLabel = AGE_THRESHOLDS.find((age) => age.value === filters.maxAgeMonths)?.label;
    if (ageLabel) pills.push({ key: "maxAgeMonths", label: ageLabel });
  }
  if (filters.allergen) pills.push({ key: "allergen", label: allergenLabel(filters.allergen) });
  if (filters.ironFocus) pills.push({ key: "ironFocus", label: "Iron focus" });
  if (filters.vitaminCHigh) pills.push({ key: "vitaminCHigh", label: "High vitamin C" });
  if (filters.ingredientFoodId) {
    pills.push({ key: "ingredientFoodId", label: ingredientName ?? "Ingredient" });
  }
  return pills;
}

interface RecipeFilterGroupsProps extends ExtraRecipeFilters {
  onChange: (next: ExtraRecipeFilters) => void;
}

/** The Filters sheet's chip groups, incl. the iron/vitamin C toggles under
 * "Nutrition" — exported so tests can render them open. */
export function RecipeFilterGroups({ onChange, ...filters }: RecipeFilterGroupsProps) {
  const set = (patch: Partial<ExtraRecipeFilters>) => onChange({ ...filters, ...patch });

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Age</span>
        <div className="flex flex-wrap gap-1.5">
          {AGE_THRESHOLDS.map((option) => {
            const active = filters.maxAgeMonths === option.value;
            return (
              <FilterChip
                key={option.value}
                label={option.label}
                active={active}
                onClick={() => set({ maxAgeMonths: active ? undefined : option.value })}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Allergen</span>
        <div className="flex flex-wrap gap-1.5">
          {ALLERGEN_SLUGS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              active={option.value === filters.allergen}
              onClick={() => set({ allergen: option.value === filters.allergen ? undefined : option.value })}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Nutrition</span>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="Iron focus"
            active={filters.ironFocus}
            onClick={() => set({ ironFocus: !filters.ironFocus })}
          />
          <FilterChip
            label="High vitamin C"
            active={filters.vitaminCHigh}
            onClick={() => set({ vitaminCHigh: !filters.vitaminCHigh })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="recipes-ingredient" className="text-xs font-medium text-[var(--color-text-muted)]">
          Contains ingredient
        </label>
        <SingleFoodPicker
          id="recipes-ingredient"
          value={filters.ingredientFoodId}
          onChange={(id) => set({ ingredientFoodId: id })}
          placeholder="Any food…"
        />
      </div>
    </>
  );
}

/**
 * The Recipes half of the Foods page (item 210): search, the All ·
 * Favorites · Custom scope chips, and a funnel sheet for age, allergen,
 * iron focus, high vitamin C and "contains ingredient". Every filter is
 * applied server-side by `GET /api/recipes`, so this component holds only
 * the filter state and the query key built from it.
 */
export function RecipesSegment() {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<RecipeScope>("all");
  const [extra, setExtra] = useState<ExtraRecipeFilters>(EMPTY_RECIPE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filters = useMemo(() => buildRecipesFilters({ q, scope, ...extra }), [q, scope, extra]);

  const { data, isLoading, isError } = useRecipes(filters);
  // Only to name the picked ingredient in its pill; the picker itself reads
  // the same (deduplicated) query.
  const { data: foodsData } = useFoods();
  const ingredientName = foodsData?.foods.find((food) => food.id === extra.ingredientFoodId)?.name;

  const pills = activeRecipeFilters(extra, ingredientName);
  const activeExtraFilterCount = pills.length;

  function clearPill(key: ExtraRecipeFilterKey) {
    setExtra((current) => ({ ...current, [key]: EMPTY_RECIPE_FILTERS[key] }));
  }

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
          placeholder="Search recipes…"
          aria-label="Search recipes"
        />

        <div className="flex items-center gap-1" role="group" aria-label="Recipe scope">
          {RECIPE_SCOPES.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              active={option.value === scope}
              // Tapping the active chip falls back to "All" — the default —
              // rather than leaving the list with no scope at all.
              onClick={() => setScope(option.value === scope ? "all" : option.value)}
              className="min-w-0 flex-1 overflow-hidden px-1 text-xs text-ellipsis"
            />
          ))}
          <FunnelButton onClick={() => setFiltersOpen(true)} activeCount={activeExtraFilterCount} />
        </div>
      </div>

      {pills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pills.map((pill) => (
            <ActiveFilterPill key={pill.key} label={pill.label} onRemove={() => clearPill(pill.key)} />
          ))}
        </div>
      )}

      {isLoading && <SkeletonList count={4} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load recipes. Try again.</p>}
      {data && data.recipes.length === 0 && <NoRecipesEmptyState />}

      {data && data.recipes.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="flex flex-col gap-4">
          <RecipeFilterGroups {...extra} onChange={setExtra} />

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setExtra(EMPTY_RECIPE_FILTERS)}
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
