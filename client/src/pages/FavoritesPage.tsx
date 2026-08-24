import type { FavoriteItem } from "@blw/shared";
import { useFavorites } from "../features/tracking/hooks.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { allergenLabel } from "../features/catalog/constants.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { CardLink } from "../components/ui/Card.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { ButtonLink } from "../components/ui/Button.js";
import { SkeletonList } from "../components/ui/Skeleton.js";

function FavoriteCard({ item }: { item: FavoriteItem }) {
  return (
    <CardLink to={`/recipes/${item.recipeId}`} padding="sm" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <span aria-hidden="true" className="text-xl leading-none">
            💛
          </span>
          {item.title}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">{item.minAgeMonths}m+</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {item.ironFocus && <Badge tone="primary">Iron focus</Badge>}
        {item.allergens.map((slug) => (
          <Badge key={slug} tone="danger">
            {allergenLabel(slug)}
          </Badge>
        ))}
      </div>
    </CardLink>
  );
}

export function FavoritesPage() {
  const { data, isLoading, isError } = useFavorites();

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Favorites" emoji="💛" description="Recipes you've saved to come back to." />

      {isLoading && <SkeletonList count={3} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load favorites.</p>}

      {data && data.items.length === 0 && (
        <EmptyState
          icon="♡"
          title="No favorites yet"
          description="Browse recipes and tap the heart to save one here."
          action={<ButtonLink to="/foods">Browse foods & recipes</ButtonLink>}
        />
      )}

      {data && data.items.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.items.map((item) => (
            <FavoriteCard key={item.recipeId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
