import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

const IDB_KEY = "blw.reactQueryCache";

/**
 * Async storage persister backed by IndexedDB (via idb-keyval) instead of
 * localStorage — the cached query data (foods, recipes, pantry, etc.) can
 * exceed localStorage's ~5MB synchronous quota and would otherwise block the
 * main thread on every write.
 */
export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(IDB_KEY, client);
    },
    restoreClient: async () => {
      return get<PersistedClient>(IDB_KEY);
    },
    removeClient: async () => {
      await del(IDB_KEY);
    },
  };
}

/**
 * Deletes the persisted react-query cache from IndexedDB directly, without
 * going through a `Persister` instance. Used by sign-out and account
 * deletion so a shared device never rehydrates the previous account's data.
 */
export async function clearPersistedQueryCache(): Promise<void> {
  await del(IDB_KEY);
}
