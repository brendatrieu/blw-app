import { Badge } from "./Badge.js";
import { allergenLabel } from "../constants.js";

interface AllergenChipsProps {
  /** Allergen slugs from the seeded `allergens` table, in the order the API
   * sent them. An empty list renders nothing at all — no wrapper, no gap. */
  allergens: string[];
}

/**
 * The one allergen mark in the app (item 334): a danger-toned Badge per
 * allergen, labelled through `allergenLabel`.
 *
 * Extracted from the identical loops the food detail page's `FoodBadges` and
 * the recipe header carried, because it now has to appear in five more
 * places — the log-meal picker rows and chips, storage's picker, custom
 * recipe ingredients, recipe ingredient rows and the meal detail page. A
 * parent who saw "Fish" on the salmon page and nothing on the meal they put
 * salmon into reasonably read that as the app not knowing.
 *
 * Renders a bare fragment rather than its own flex row: every caller already
 * has a row (a badge line, a chip, an ingredient row) with its own gap, and
 * a wrapper would either double the spacing or fight it.
 */
export function AllergenChips({ allergens }: AllergenChipsProps) {
  return (
    <>
      {allergens.map((slug) => (
        <Badge key={slug} tone="danger">
          {allergenLabel(slug)}
        </Badge>
      ))}
    </>
  );
}
