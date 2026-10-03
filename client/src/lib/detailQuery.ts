/**
 * Whether a detail page must keep showing its skeleton instead of deciding
 * "not found" (ledger 716). It may only call a record missing once a query
 * has really answered:
 *
 * - `isPending`: no answer yet. This includes a cold load while the
 *   persisted cache is still restoring from IndexedDB — React Query holds
 *   every query idle then, so `isLoading` (pending AND fetching) is false
 *   and a page keyed on it redirected away from a perfectly good URL.
 * - `isFetching` while the record is absent: a restored (stale) list from
 *   before the record existed, with the refetch that will contain it still
 *   in flight.
 *
 * A found record always renders; a settled answer without it is missing.
 */
export function awaitingDetail(query: { isPending: boolean; isFetching: boolean }, found: boolean): boolean {
  return !found && (query.isPending || query.isFetching);
}
