import { Link } from "react-router-dom";
import type { FoodListItem } from "@blw/shared";
import { FoodBadges } from "./FoodBadges.js";
import { CATEGORIES } from "../constants.js";

interface FoodCardProps {
  food: FoodListItem;
}

export function FoodCard({ food }: FoodCardProps) {
  const categoryLabel = CATEGORIES.find((c) => c.value === food.category)?.label ?? food.category;
  return (
    <Link
      to={`/foods/${food.slug}`}
      className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 transition-colors hover:border-[var(--color-primary)]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-[var(--color-text)]">{food.name}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{categoryLabel}</span>
      </div>
      <FoodBadges food={food} />
    </Link>
  );
}
