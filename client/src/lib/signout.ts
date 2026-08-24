import type { QueryClient } from "@tanstack/react-query";
import { signOut } from "./auth.js";
import { clearPersistedQueryCache } from "./persister.js";
import { ACTIVE_BABY_STORAGE_KEY } from "../features/babies/useActiveBaby.js";

export interface SignOutDeps {
  authSignOut: () => Promise<unknown>;
  queryClient: Pick<QueryClient, "clear">;
  clearCache: () => Promise<void>;
  storage: Pick<Storage, "removeItem">;
}

/**
 * Real dependencies for use from app code. Kept separate from
 * `performSignOut` so the function itself stays testable without a browser
 * or a live QueryClient.
 */
export function createSignOutDeps(queryClient: Pick<QueryClient, "clear">): SignOutDeps {
  return {
    authSignOut: signOut,
    queryClient,
    clearCache: clearPersistedQueryCache,
    storage: window.localStorage,
  };
}

/**
 * Purges every client-side trace of the signed-in account: the live
 * react-query cache, its IndexedDB-persisted copy, and the active-baby
 * choice in localStorage. Without this, a shared device can rehydrate the
 * previous account's child data (nickname, birth date, serve logs, pantry,
 * favourites) for up to `maxAge` after the next person signs in.
 *
 * Runs the cleanup steps after the auth sign-out resolves, so a later step
 * failing never leaves an earlier one undone — each step is awaited in turn.
 */
export async function performSignOut(deps: SignOutDeps): Promise<void> {
  await deps.authSignOut();
  deps.queryClient.clear();
  await deps.clearCache();
  deps.storage.removeItem(ACTIVE_BABY_STORAGE_KEY);
}
