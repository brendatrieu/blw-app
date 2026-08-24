import { useCallback, useEffect, useState } from "react";
import type { Baby } from "@blw/shared";
import { useBabies } from "./hooks.js";

const STORAGE_KEY = "blw.activeBabyId";

/** Broadcasts a change to every hook instance in this tab. */
const listeners = new Set<(id: string | null) => void>();

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing modes can throw on localStorage access.
    return null;
  }
}

function writeStored(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // A failed write only costs the persisted preference, not the session.
  }
}

/** Persists the choice and tells every mounted hook about it. */
function broadcastActiveBabyId(id: string | null): void {
  writeStored(id);
  for (const listener of listeners) listener(id);
}

/**
 * The baby whose data the app is currently showing.
 *
 * The choice is persisted in localStorage but always validated against the
 * babies the server actually returns, so a stale id (deleted or archived
 * profile, or someone else's account on a shared device) silently falls back
 * to the first available baby instead of leaving the app pointing at nothing.
 */
export function useActiveBaby() {
  const babiesQuery = useBabies();
  const babies: Baby[] = babiesQuery.data ?? [];

  const [storedId, setStoredId] = useState<string | null>(() => readStored());

  useEffect(() => {
    const listener = (id: string | null) => {
      setStoredId(id);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const activeBaby = babies.find((baby) => baby.id === storedId) ?? babies[0] ?? null;

  // Repair the persisted value once the real list is known.
  useEffect(() => {
    if (babiesQuery.isSuccess && activeBaby?.id !== storedId) {
      broadcastActiveBabyId(activeBaby?.id ?? null);
    }
  }, [babiesQuery.isSuccess, activeBaby?.id, storedId]);

  const setActiveBabyId = useCallback((id: string | null) => {
    broadcastActiveBabyId(id);
  }, []);

  return {
    babies,
    activeBaby,
    setActiveBabyId,
    isLoading: babiesQuery.isPending,
  };
}
