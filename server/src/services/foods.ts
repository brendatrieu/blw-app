// The one thing every read of `foods` has to agree on: who can see which
// rows. It lives here rather than beside the catalog routes because the
// allergen detail reads foods too, and a second copy of this condition is
// exactly how one read would eventually forget it.
import { eq, isNull, or, type SQL } from "drizzle-orm";
import { foods } from "../db/schema.js";

/**
 * The one visibility rule, applied to every food read: the seeded catalog is
 * everybody's, a custom food is its owner's alone. Returned as a condition
 * rather than applied inline so no read can forget it by taking a different
 * query shape. `null` is an anonymous caller — catalog only.
 */
export function visibleFoodsCondition(userId: string | null): SQL | undefined {
  return userId ? or(isNull(foods.ownerId), eq(foods.ownerId, userId)) : isNull(foods.ownerId);
}
