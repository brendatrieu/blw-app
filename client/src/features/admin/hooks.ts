import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  METRICS_CACHE_TTL_MS,
  type AdminCollaboratorsResponse,
  type AdminMetricsResponse,
  type MetricsRange,
} from "@blw/shared";
import { fetchAdminMetrics, fetchCollaborators, fetchIsAdmin, grantCollaborator, revokeCollaborator } from "./api.js";

export const adminKeys = {
  me: () => ["admin", "me"] as const,
  metrics: (range: MetricsRange) => ["admin", "metrics", range] as const,
  collaborators: () => ["admin", "collaborators"] as const,
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
