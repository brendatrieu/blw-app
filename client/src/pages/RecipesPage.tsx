import { RecipesSegment } from "../features/catalog/components/RecipesSegment.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { ButtonLink } from "../components/ui/Button.js";

/**
 * `/recipes` — the recipe list, promoted from a segment of the Foods page to
 * a route (and a bottom-nav tab) of its own (item 273). The body is
 * `RecipesSegment` unchanged: search, the All · Favorites · Custom scope
 * chips, the funnel sheet and the list. This page is only the header the
 * segment used to borrow from FoodsPage.
 */
export function RecipesPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
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

      <RecipesSegment />
    </div>
  );
}
