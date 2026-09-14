import type { QueryClient } from "@tanstack/react-query";
import { signOut } from "./auth.js";
import { clearPersistedQueryCache } from "./persister.js";
import { discardUsage, flushUsage } from "./usage/track.js";
import { resetUsageAccountContext } from "./usage/context.js";
import { ACTIVE_BABY_STORAGE_KEY } from "../features/babies/useActiveBaby.js";

export interface SignOutDeps {
  authSignOut: () => Promise<unknown>;
  queryClient: Pick<QueryClient, "clear">;
  clearCache: () => Promise<void>;
  storage: Pick<Storage, "removeItem">;
  /** Sends whatever usage events are still queued, WHILE the session cookie
   * is still valid — after the sign-out they would arrive anonymous. */
  flushUsage: () => Promise<void>;
  /** Then forgets them, so the next person on this device starts empty. */
  discardUsage: () => Promise<void>;
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
    flushUsage,
    discardUsage,
  };
}

/**
 * Purges every client-side trace of the signed-in account: the live
 * react-query cache, its IndexedDB-persisted copy, and the active-baby
 * choice in localStorage. Without this, a shared device can rehydrate the
 * previous account's child data (nickname, birth date, serve logs, storage,
 * favourites) for up to `maxAge` after the next person signs in.
 *
 * Runs the cleanup steps after the auth sign-out resolves, so a later step
 * failing never leaves an earlier one undone — each step is awaited in turn.
 */
export async function performSignOut(deps: SignOutDeps): Promise<void> {
  // Before the sign-out, not after: a queued event sent once the cookie is
  // gone arrives anonymous and lands in nobody's account. A failed flush is
  // never allowed to block the sign-out itself.
  await deps.flushUsage().catch(() => undefined);
  await deps.authSignOut();
  deps.queryClient.clear();
  await deps.clearCache();
  deps.storage.removeItem(ACTIVE_BABY_STORAGE_KEY);
  // The queue is client-side state about the account that just left, exactly
  // like the caches above — including the persisted copy in IndexedDB.
  await deps.discardUsage().catch(() => undefined);
  resetUsageAccountContext();
}
