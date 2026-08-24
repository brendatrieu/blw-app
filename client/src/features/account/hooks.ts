import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearPersistedQueryCache } from "../../lib/persister.js";
import { ACTIVE_BABY_STORAGE_KEY } from "../babies/useActiveBaby.js";
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
 * the way out. `queryClient.clear()` only empties the in-memory cache, so
 * the IndexedDB-persisted copy and the active-baby localStorage key are
 * purged too — otherwise they'd survive on a shared device for whoever
 * signs in next.
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (password: string) => deleteAccount(password),
    onSuccess: () => {
      queryClient.clear();
      void clearPersistedQueryCache();
      try {
        window.localStorage.removeItem(ACTIVE_BABY_STORAGE_KEY);
      } catch {
        // Private browsing modes can throw on localStorage access; the
        // in-memory and IndexedDB clears above already cover the account
        // data that matters most.
      }
    },
  });
}
