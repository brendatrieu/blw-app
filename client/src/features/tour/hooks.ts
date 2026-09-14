import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdatePreferencesInput, UserPreferences } from "@blw/shared";
import { completeTour, fetchPreferences, updatePreferences } from "./api.js";

export const preferenceKeys = {
  all: () => ["preferences"] as const,
};

/**
 * This account's app preferences. Read once per app load by `TourProvider`
 * (the first-run gate depends on it) and cached generously — it only changes
 * when the parent finishes or skips the tour, which invalidates it by hand.
 *
 * Deliberately NOT in `PERSISTED_QUERY_KEY_PREFIXES` (see main.tsx): a
 * restored copy would make the query read "success" off the cache before the
 * server had answered, and the gate would open the tour again for someone
 * who had already finished it. The gate waits for the network instead.
 */
export function usePreferences() {
  return useQuery({
    queryKey: preferenceKeys.all(),
    queryFn: fetchPreferences,
    staleTime: 5 * 60_000,
  });
}

/**
 * Marks the tour seen. The caller navigates away immediately without waiting
 * on this — the tour is not a wall, so a failed PATCH costs the parent at
 * most one extra viewing next session, and never a blocked screen or an
 * error message about a preference they did not know existed.
 */
export function useCompleteTour() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => completeTour(),
    onSuccess: (preferences: UserPreferences) => {
      // The server has just told us the exact stored value, so write it in
      // rather than leaving the gate to guess until the refetch lands.
      queryClient.setQueryData(preferenceKeys.all(), preferences);
    },
    // Both ways: a success re-reads the authoritative row, and a failure
    // makes sure nothing optimistic is left behind.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: preferenceKeys.all() });
    },
    onError: () => {
      // Deliberately silent — see above.
    },
  });
}

/**
 * The general preference writer, behind the Settings switches.
 *
 * Deliberately the same shape as `useCompleteTour` — write the server's
 * answer straight in, then invalidate either way — rather than an optimistic
 * update: the Privacy switch's "off" also DELETES everything collected, and
 * a switch that flips before the server has agreed would be claiming a
 * deletion that has not happened yet.
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePreferencesInput) => updatePreferences(input),
    onSuccess: (preferences: UserPreferences) => {
      queryClient.setQueryData(preferenceKeys.all(), preferences);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: preferenceKeys.all() });
    },
  });
}
