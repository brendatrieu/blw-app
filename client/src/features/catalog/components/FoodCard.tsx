import type { FoodListItem } from "@blw/shared";
import { FoodBadges } from "./FoodBadges.js";
import { CATEGORIES } from "../constants.js";
import { CardLink } from "../../../components/ui/Card.js";

interface FoodCardProps {
  food: FoodListItem;
}

export function FoodCard({ food }: FoodCardProps) {
  const categoryLabel = CATEGORIES.find((c) => c.value === food.category)?.label ?? food.category;
  return (
    <CardLink to={`/foods/${food.slug}`} padding="sm" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-[var(--color-text)]">{food.name}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{categoryLabel}</span>
      </div>
      <FoodBadges food={food} />
    </CardLink>
  );
}
