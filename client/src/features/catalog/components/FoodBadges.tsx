import type { FoodListItem } from "@blw/shared";
import { Badge } from "./Badge.js";
import { allergenLabel, levelLabel } from "../constants.js";

interface FoodBadgesProps {
  food: Pick<FoodListItem, "ironLevel" | "vitaminCLevel" | "allergens" | "minAgeMonths">;
}

/** The badge row reused by both the food card and the food detail page. */
export function FoodBadges({ food }: FoodBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {food.ironLevel === "high" && <Badge tone="primary">Iron {levelLabel(food.ironLevel)}</Badge>}
      {food.ironLevel !== "high" && <Badge tone="neutral">Iron {levelLabel(food.ironLevel)}</Badge>}
      {food.vitaminCLevel !== "low" && <Badge tone="sunshine">Vit C {levelLabel(food.vitaminCLevel)}</Badge>}
      <Badge tone="neutral">{food.minAgeMonths}m+</Badge>
      {food.allergens.map((slug) => (
        <Badge key={slug} tone="danger">
          {allergenLabel(slug)}
        </Badge>
      ))}
    </div>
  );
}
