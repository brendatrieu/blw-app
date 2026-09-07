import type { FoodListItem } from "@blw/shared";
import { Link } from "react-router-dom";
import { Badge } from "./Badge.js";
import { getFoodEmoji } from "../foodEmoji.js";

interface FoodTileProps {
  /** `emoji`/`isCustom` are optional rather than part of the `Pick`: several
   * callers (and fixtures) hand this tile a trimmed-down food that predates
   * custom foods, and a catalog food behaves exactly as it always did when
   * they're absent. */
  food: Pick<FoodListItem, "slug" | "name" | "category"> & { emoji?: string | null; isCustom?: boolean };
}

/**
 * Tappable emoji tile for the foods grid — a compact alternative to the
 * one-per-row card. Deliberately no iron/allergen dots: unlabeled 8px
 * circles read as arbitrary shades; the food page carries the real badges.
 */
export function FoodTile({ food }: FoodTileProps) {
  return (
    <Link
      to={`/foods/${food.slug}`}
      className="relative flex min-h-[44px] flex-col items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-3 text-center shadow-[var(--shadow-sm)] transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <span aria-hidden="true" className="text-3xl leading-none">
        {getFoodEmoji(food.slug, food.category, food.emoji)}
      </span>
      <span className="font-caption line-clamp-2 text-[var(--color-text)]">{food.name}</span>
      {/* Item 182: a quiet neutral label, in the flow under the name rather
          than floated over the emoji — a 3-across tile has no corner to
          spare, and this is a provenance note, not a status alert. */}
      {food.isCustom ? <Badge tone="neutral">Custom</Badge> : null}
    </Link>
  );
}
