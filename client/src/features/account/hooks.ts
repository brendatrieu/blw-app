import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAccount, downloadAccountExport } from "./api.js";

/**
 * Saves the export to the user's device. Not a query: it is an action with a
 * side effect on the filesystem, and caching a bundle that large — or
 * re-running it on a window focus — would be exactly wrong.
 */
export function useExportAccount() {
  return useMutation({
    mutationFn: () => downloadAccountExport(),
  });
}

/**
 * Deletes the account, then empties the cache.
 *
 * The clear matters: every cached query in memory belongs to an account that
 * no longer exists, and the sign-out redirect must not flash stale data on
 * the way out.
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (password: string) => deleteAccount(password),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
