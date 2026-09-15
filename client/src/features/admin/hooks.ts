import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  METRICS_CACHE_TTL_MS,
  type AdminCollaboratorsResponse,
  type AdminFeedbackListResponse,
  type AdminFeedbackSummary,
  type AdminMetricsResponse,
  type FeedbackFilter,
  type MetricsRange,
  type UpdateFeedbackInput,
} from "@blw/shared";
import {
  fetchAdminFeedback,
  fetchAdminMetrics,
  fetchCollaborators,
  fetchFeedbackSummary,
  fetchIsAdmin,
  grantCollaborator,
  revokeCollaborator,
  updateFeedback,
} from "./api.js";

/**
 * Every key here starts with "admin", and that prefix is deliberately absent
 * from `PERSISTED_QUERY_KEY_PREFIXES` in main.tsx: nothing on the admin
 * surface is written to IndexedDB. For the metrics that is hygiene; for the
 * feedback inbox it is the rule that keeps parents' free text off an admin's
 * disk after the tab is closed.
 *
 * `feedbackSummary` is a SIBLING of `feedback`, not a child of it, so that
 * "invalidate the list and the summary" after a PATCH is two real
 * invalidations rather than one plus a no-op — a prefix invalidation of
 * `["admin", "feedback"]` would otherwise silently cover the counts too, and
 * the day the keys were reshaped the counts would go stale without a word.
 */
export const adminKeys = {
  me: () => ["admin", "me"] as const,
  metrics: (range: MetricsRange) => ["admin", "metrics", range] as const,
  collaborators: () => ["admin", "collaborators"] as const,
  /** Every tab of the inbox — the prefix a PATCH invalidates. */
  feedbackAll: () => ["admin", "feedback"] as const,
  feedback: (filter: FeedbackFilter) => ["admin", "feedback", filter] as const,
  feedbackSummary: () => ["admin", "feedbackSummary"] as const,
};

export interface AdminStatus {
  isAdmin: boolean;
  /** False only while the first answer is still in flight. */
  isResolved: boolean;
}

/**
 * Whether this account can see the dashboard.
 *
 * `retry: false` is load-bearing: the negative answer is a 404, and retrying
 * it three times would turn every non-admin's visit to More into a burst of
 * requests for a route that is supposed to look like it does not exist.
 * Cached for ten minutes and never persisted to IndexedDB (see
 * `PERSISTED_QUERY_KEY_PREFIXES` in main.tsx — "admin" is deliberately
 * absent), so a revoked collaborator cannot carry a stale "yes" into their
 * next cold start.
 *
 * `isResolved` exists so a page can wait rather than guess: rendering "not
 * found" for the split second before the answer lands would flash the wrong
 * page at the owner on every visit. A query paused for want of a network
 * counts as resolved — offline there is no answer coming, and a page that
 * waits forever is a blank screen; "not found" is at least what everybody
 * else sees, admin or not.
 */
export function useIsAdmin(): AdminStatus {
  const query = useQuery({
    queryKey: adminKeys.me(),
    queryFn: fetchIsAdmin,
    staleTime: 10 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    isAdmin: query.data === true,
    isResolved: query.isSuccess || query.isError || query.isPaused,
  };
}

/**
 * One range's dashboard payload. `staleTime` matches the server's own
 * five-minute cache: asking again inside that window would return the
 * identical bytes, `generatedAt` included, so the request is pure cost.
 */
export function useAdminMetrics(range: MetricsRange) {
  return useQuery<AdminMetricsResponse>({
    queryKey: adminKeys.metrics(range),
    queryFn: () => fetchAdminMetrics(range),
    staleTime: METRICS_CACHE_TTL_MS,
    retry: false,
  });
}

export function useCollaborators() {
  return useQuery<AdminCollaboratorsResponse>({
    queryKey: adminKeys.collaborators(),
    queryFn: fetchCollaborators,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Grant and revoke both answer with the WHOLE list, so the panel writes the
 * server's own answer into the cache instead of patching a local copy. Access
 * control is the last thing that should be shown optimistically: a row that
 * disappears before the server agreed would say "revoked" about somebody who
 * still has access.
 */
export function useGrantCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (email: string) => grantCollaborator(email),
    onSuccess: (response) => {
      queryClient.setQueryData(adminKeys.collaborators(), response);
    },
  });
}

export function useRevokeCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => revokeCollaborator(userId),
    onSuccess: (response) => {
      queryClient.setQueryData(adminKeys.collaborators(), response);
    },
  });
}

/**
 * The inbox's four counts (item 361).
 *
 * `enabled` is how the More page asks this question at all: hooks cannot be
 * called conditionally, so the page calls it on every render and passes
 * `isAdmin` — a parent's browser therefore never sends the request, and
 * their More page is byte-identical to what it was before this feature
 * existed.
 *
 * `retry: false` for the same load-bearing reason as `useIsAdmin`: the
 * negative answer is a 404, and retrying it three times turns an answer into
 * a burst of traffic for a route that is supposed to look absent. A minute
 * of `staleTime` keeps the chip and the tab counts from re-asking on every
 * navigation back to More.
 */
export function useFeedbackSummary(enabled: boolean) {
  return useQuery<AdminFeedbackSummary>({
    queryKey: adminKeys.feedbackSummary(),
    queryFn: fetchFeedbackSummary,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** One tab of the inbox. Only ever rendered inside the admin-gated page. */
export function useAdminFeedback(filter: FeedbackFilter) {
  return useQuery<AdminFeedbackListResponse>({
    queryKey: adminKeys.feedback(filter),
    queryFn: () => fetchAdminFeedback(filter),
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Mark read / resolve / reopen / clear / restore.
 *
 * No optimistic write, deliberately: every action MOVES the item between
 * tabs, and the server owns the transition (`readAt` is coalesced,
 * `resolvedAt`/`resolvedBy` are set and cleared there). Patching a local copy
 * would mean re-implementing those rules in the client and being wrong about
 * them the first time one changes. Both the lists and the counts are
 * invalidated, since an action that moves a row changes two tabs' contents
 * and two tabs' numbers at once.
 */
export function useUpdateFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateFeedbackInput }) => updateFeedback(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.feedbackAll() });
      void queryClient.invalidateQueries({ queryKey: adminKeys.feedbackSummary() });
    },
  });
}
