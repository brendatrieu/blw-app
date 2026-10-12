import { useSyncExternalStore } from "react";

/**
 * Ledger 790: the update prompt's state, one module-level store so the card
 * (AppLayout) and the More row read the same thing. main.tsx feeds it from
 * vite-plugin-pwa's `onNeedRefresh`; nothing here imports the virtual module,
 * so the node test suite can drive it directly.
 */

/** The server build the parent tapped Later on; that build never pops up again. */
export const UPDATE_DISMISSED_KEY = "blw.updateDismissed";

/**
 * Where the card may show: Home and the list pages. Every form (Log meal, the
 * storage, food and recipe forms, symptom check, settings) and every detail
 * page is left out, so the card waits for the parent to come back to a list.
 */
const PROMPT_ROUTES = new Set(["/", "/storage", "/foods", "/recipes", "/meals", "/favorites", "/safety", "/guides", "/more"]);

export function isUpdatePromptRoute(pathname: string): boolean {
  return PROMPT_ROUTES.has(pathname);
}

export interface UpdateState {
  /** A new version has downloaded and is waiting for Reload. */
  ready: boolean;
  /** Later was tapped for this version: no card, only the More row. */
  dismissed: boolean;
}

let state: UpdateState = { ready: false, dismissed: false };
let version: string | null = null;
let apply: (() => Promise<void>) | null = null;
const listeners = new Set<() => void>();

function set(next: UpdateState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function storage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * A new version is waiting. `serverVersion` is the build /api/version reports
 * (the one that downloaded), or null when it could not be asked: then any
 * earlier Later counts, since a quiet miss still leaves the More row.
 */
export function setUpdateReady(serverVersion: string | null, applyUpdate: () => Promise<void>) {
  version = serverVersion;
  apply = applyUpdate;
  let stored: string | null = null;
  try {
    stored = storage()?.getItem(UPDATE_DISMISSED_KEY) ?? null;
  } catch {
    // Unreadable reads as "never dismissed": the card shows once more.
  }
  set({ ready: true, dismissed: stored !== null && (serverVersion === null || stored === serverVersion) });
}

/** Later: hides the card for this version; the More row stays until reload. */
export function dismissUpdate() {
  try {
    storage()?.setItem(UPDATE_DISMISSED_KEY, version ?? "unknown");
  } catch {
    // Unwritable storage: hidden for this session only.
  }
  set({ ...state, dismissed: true });
}

/** Reload: activates the waiting worker; the page reloads once it controls. */
export function applyUpdate() {
  void apply?.();
}

/** The build the server is serving now, or null when it cannot be asked. */
export async function fetchServerVersion(fetchVersion: () => Promise<Response>): Promise<string | null> {
  try {
    const response = await fetchVersion();
    if (!response.ok) return null;
    const value = ((await response.json()) as { version?: unknown } | null)?.version;
    return typeof value === "string" && value !== "" ? value : null;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Test-only: back to "nothing waiting". */
export function resetUpdateStateForTests() {
  version = null;
  apply = null;
  set({ ready: false, dismissed: false });
}
