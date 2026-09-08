// The one thing every read of `recipes` has to agree on: who can see which
// rows. Sibling of `visibleFoodsCondition` and for the same reason — meals,
// pantry, favorites and the AI tools all read recipes, and a second copy of
// this condition is exactly how one of them would eventually forget it.
import { eq, isNull, or, type SQL } from "drizzle-orm";
import { recipes } from "../db/schema.js";

/**
 * The seeded catalog is everybody's; a recipe a parent wrote is theirs alone.
 * Returned as a condition rather than applied inline so no read can forget it
 * by taking a different query shape. `null` is an anonymous caller — catalog
 * only.
 */
export function visibleRecipesCondition(userId: string | null): SQL | undefined {
  return userId ? or(isNull(recipes.ownerId), eq(recipes.ownerId, userId)) : isNull(recipes.ownerId);
}
