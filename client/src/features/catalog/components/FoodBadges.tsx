import type { FoodListItem } from "@blw/shared";
import { Badge } from "./Badge.js";
import { allergenLabel, levelLabel } from "../constants.js";

interface FoodBadgesProps {
  food: Pick<FoodListItem, "ironLevel" | "vitaminCLevel" | "allergens" | "minAgeMonths"> & { isCustom?: boolean };
}

/**
 * The badge row reused by both the food card and the food detail page.
 *
 * A custom food (item 181) shows a neutral "Custom" badge and NO iron,
 * vitamin-C, or min-age badge: those columns exist on its row only because
 * they're NOT NULL, and their placeholder values would read as researched
 * facts about a food nobody wrote guidance for. The allergen badges stay — the
 * parent ticked those themselves, and they're what allergen tracking counts.
 */
export function FoodBadges({ food }: FoodBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {food.isCustom && <Badge tone="neutral">Custom</Badge>}
      {!food.isCustom && food.ironLevel === "high" && <Badge tone="primary">Iron {levelLabel(food.ironLevel)}</Badge>}
      {!food.isCustom && food.ironLevel !== "high" && <Badge tone="neutral">Iron {levelLabel(food.ironLevel)}</Badge>}
      {!food.isCustom && food.vitaminCLevel !== "low" && (
        <Badge tone="sunshine">Vit C {levelLabel(food.vitaminCLevel)}</Badge>
      )}
      {!food.isCustom && <Badge tone="neutral">{food.minAgeMonths}m+</Badge>}
      {food.allergens.map((slug) => (
        <Badge key={slug} tone="danger">
          {allergenLabel(slug)}
        </Badge>
      ))}
    </div>
  );
}
