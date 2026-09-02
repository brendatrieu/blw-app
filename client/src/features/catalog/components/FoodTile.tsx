import type { FoodListItem } from "@blw/shared";
import { Link } from "react-router-dom";
import { getFoodEmoji } from "../foodEmoji.js";

interface FoodTileProps {
  food: Pick<FoodListItem, "slug" | "name" | "category" | "ironLevel" | "allergens">;
}

const IRON_DOT_CLASS: Record<FoodListItem["ironLevel"], string> = {
  high: "bg-[var(--color-accent)]",
  moderate: "bg-[var(--color-caution)]",
  low: "border border-[var(--color-border)]",
};

/** Tappable emoji tile for the foods grid — a compact alternative to the one-per-row card. */
export function FoodTile({ food }: FoodTileProps) {
  const hasAllergens = food.allergens.length > 0;

  return (
    <Link
      to={`/foods/${food.slug}`}
      className="relative flex min-h-[44px] flex-col items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-3 text-center shadow-[var(--shadow-sm)] transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <span aria-hidden="true" className="text-3xl leading-none">
        {getFoodEmoji(food.slug, food.category)}
      </span>
      <span className="font-caption line-clamp-2 text-[var(--color-text)]">{food.name}</span>
      <span className="flex items-center gap-1">
        <span
          role="img"
          aria-label={`Iron: ${food.ironLevel}`}
          className={`h-2 w-2 rounded-full ${IRON_DOT_CLASS[food.ironLevel]}`}
        />
        {hasAllergens && (
          <span
            role="img"
            aria-label="Contains allergen"
            className="h-2 w-2 rounded-full bg-[var(--color-danger)]"
          />
        )}
      </span>
    </Link>
  );
}
