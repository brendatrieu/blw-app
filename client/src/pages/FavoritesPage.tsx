import { Link } from "react-router-dom";
import type { FavoriteItem } from "@blw/shared";
import { useFavorites } from "../features/tracking/hooks.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { allergenLabel } from "../features/catalog/constants.js";

function FavoriteCard({ item }: { item: FavoriteItem }) {
  return (
    <Link
      to={`/recipes/${item.recipeId}`}
      className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 transition-colors hover:border-[var(--color-primary)]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-[var(--color-text)]">{item.title}</span>
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
    </Link>
  );
}

export function FavoritesPage() {
  const { data, isLoading, isError } = useFavorites();

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Favorites</h1>

      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load favorites.</p>}

      {data && data.items.length === 0 && (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            No favorites yet — browse recipes and tap the heart to save one here.
          </p>
          <Link to="/foods" className="text-sm font-medium underline" style={{ color: "var(--color-primary)" }}>
            Browse foods & recipes
          </Link>
        </div>
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
