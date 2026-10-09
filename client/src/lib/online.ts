import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";
import { isOffline } from "./usage/properties.js";

/**
 * Offline as the app's mutations see it (ledger 765/766): TanStack's
 * onlineManager pauses a mutation once an `offline` event has fired, which is
 * what left Serve stuck on "Serving…". navigator.onLine covers the cold start
 * offline, where onlineManager still says online (it only learns from events).
 */
export function isAppOffline(): boolean {
  return !onlineManager.isOnline() || isOffline();
}

function subscribe(onChange: () => void): () => void {
  // Both: onlineManager notifies once its own state has flipped, and the
  // window events cover a cold-start offline coming back, which never
  // changes onlineManager (it was "online" all along).
  const unsubscribe = onlineManager.subscribe(onChange);
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    unsubscribe();
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Re-renders when the device goes offline or comes back. */
export function useIsOffline(): boolean {
  // No SSR in this app; the same read keeps renderToString tests honest.
  return useSyncExternalStore(subscribe, isAppOffline, isAppOffline);
}
