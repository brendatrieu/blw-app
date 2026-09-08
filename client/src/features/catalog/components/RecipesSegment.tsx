import { useMemo, useState } from "react";
import type { RecipeListItem, RecipeScope } from "@blw/shared";
import { AGE_THRESHOLDS, ALLERGEN_SLUGS, RECIPE_SCOPES, allergenLabel } from "../constants.js";
import { useFoods, useRecipes } from "../hooks.js";
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
        {recipe.ironFocus && <Badge tone="primary">Iron</Badge>}
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

/**
 * The Recipes half of the Foods page (item 210): search, the All ·
 * Favorites · Custom scope chips, and a funnel sheet for age, allergen,
 * iron focus and "contains ingredient". Every filter is applied server-side
 * by `GET /api/recipes`, so this component holds only the filter state and
 * the query key built from it.
 */
export function RecipesSegment() {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<RecipeScope>("all");
  const [maxAgeMonths, setMaxAgeMonths] = useState<number | undefined>(undefined);
  const [allergen, setAllergen] = useState<string | undefined>(undefined);
  const [ironFocus, setIronFocus] = useState(false);
  const [ingredientFoodId, setIngredientFoodId] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      scope,
      maxAgeMonths,
      allergen,
      // Off means "don't filter on this", not "recipes that aren't iron
      // focused" — the key has to be absent, not false (see
      // `buildRecipesQueryString`).
      ironFocus: ironFocus || undefined,
      ingredientFoodId: ingredientFoodId || undefined,
    }),
    [q, scope, maxAgeMonths, allergen, ironFocus, ingredientFoodId],
  );

  const { data, isLoading, isError } = useRecipes(filters);
  // Only to name the picked ingredient in its pill; the picker itself reads
  // the same (deduplicated) query.
  const { data: foodsData } = useFoods();
  const ingredientName = foodsData?.foods.find((food) => food.id === ingredientFoodId)?.name;

  const activeExtraFilterCount =
    [maxAgeMonths, allergen].filter((value) => value !== undefined).length +
    (ironFocus ? 1 : 0) +
    (ingredientFoodId ? 1 : 0);
  const ageLabel = AGE_THRESHOLDS.find((age) => age.value === maxAgeMonths)?.label;

  function clearAll() {
    setMaxAgeMonths(undefined);
    setAllergen(undefined);
    setIronFocus(false);
    setIngredientFoodId("");
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

      {activeExtraFilterCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ageLabel && <ActiveFilterPill label={ageLabel} onRemove={() => setMaxAgeMonths(undefined)} />}
          {allergen && <ActiveFilterPill label={allergenLabel(allergen)} onRemove={() => setAllergen(undefined)} />}
          {ironFocus && <ActiveFilterPill label="Iron focus" onRemove={() => setIronFocus(false)} />}
          {ingredientFoodId && (
            <ActiveFilterPill label={ingredientName ?? "Ingredient"} onRemove={() => setIngredientFoodId("")} />
          )}
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
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Age</span>
            <div className="flex flex-wrap gap-1.5">
              {AGE_THRESHOLDS.map((option) => {
                const active = maxAgeMonths === option.value;
                return (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    active={active}
                    onClick={() => setMaxAgeMonths(active ? undefined : option.value)}
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
                  active={option.value === allergen}
                  onClick={() => setAllergen(option.value === allergen ? undefined : option.value)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Iron</span>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip label="Iron focus" active={ironFocus} onClick={() => setIronFocus(!ironFocus)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="recipes-ingredient" className="text-xs font-medium text-[var(--color-text-muted)]">
              Contains ingredient
            </label>
            <SingleFoodPicker
              id="recipes-ingredient"
              value={ingredientFoodId}
              onChange={setIngredientFoodId}
              placeholder="Any food…"
            />
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={clearAll}>
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
