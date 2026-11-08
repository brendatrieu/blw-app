// The one thing every read of `recipes` has to agree on: who can see which
// rows. Sibling of `visibleFoodsCondition` and for the same reason — meals,
// storage, favorites and the AI tools all read recipes, and a second copy of
// this condition is exactly how one of them would eventually forget it.
import { and, eq, isNull, or, type SQL } from "drizzle-orm";
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

/**
 * `visibleRecipesCondition` minus the recipes their owner has deleted
 * (ledger 957). Every CHOOSING or BROWSING read (the Recipes list and
 * search, every picker, favorites, a food's "used in" recipes, the AI's
 * recipe lookup, and the check that a write may ADD a recipe) uses this;
 * HISTORY reads (a meal, a storage item, a recipe opened by id) keep the
 * plain rule, so what already happened still resolves and says "(deleted)".
 */
export function choosableRecipesCondition(userId: string | null): SQL | undefined {
  return and(visibleRecipesCondition(userId), isNull(recipes.deletedAt));
}
