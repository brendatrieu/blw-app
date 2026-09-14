import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { AiKeyStatus, Baby, RoutePattern } from "@blw/shared";
import { ApiError } from "../api.js";
import { babyKeys } from "../../features/babies/api.js";
import { ACTIVE_BABY_STORAGE_KEY } from "../../features/babies/useActiveBaby.js";
import { aiKeys } from "../../features/ai/hooks.js";
import { usePreferences } from "../../features/tour/hooks.js";
import { requiredRoutePattern } from "./buildEvent.js";
import { resolvePreference } from "./consent.js";
import {
  activeBabyAgeMonths,
  readEnvironment,
  setUsageAccountContext,
  type UsageAccountContext,
} from "./context.js";
import { trackClientError } from "./errors.js";
import { toRoutePattern } from "./routes.js";
import { recordRouteChange, setUsageConsent, stopUsageTransport, track } from "./track.js";

/**
 * Everything the app measures about itself that is not caused by a parent
 * pressing something: the screens they visit, the session they are in, how
 * the app was launched, when it lost the network, and when it broke.
 *
 * Mounted INSIDE `BrowserRouter` but OUTSIDE `AppLayout` (see main.tsx), so
 * `/login` and `/signup` are measured too — the signup funnel is one of the
 * first questions the plan asks, and it starts on a screen no authenticated
 * layout ever renders.
 *
 * It renders nothing and gates nothing: if every line here failed, the app
 * would look and behave exactly as it does now.
 */

/** A 401 is not an error here — it is "nobody is signed in yet". */
function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** standalone/browser, the way both PWA events report it. */
function displayMode(): "standalone" | "browser" {
  return readEnvironment().standalone ? "standalone" : "browser";
}

function storedActiveBabyId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_BABY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The account facts, read out of caches the app has already filled rather
 * than by fetching anything of our own: `useBabies` and `useAiKeyStatus` are
 * mounted by the screens that need them, and analytics must not add a
 * request — least of all one that 401s on the login page.
 *
 * Mirrors `useActiveBaby`'s fallback (the stored id, else the first baby) so
 * `baby_age_bucket` is the age of the baby actually on screen.
 */
export function readAccountContext(queryClient: QueryClient, activeBabyId: string | null): UsageAccountContext {
  const babies = queryClient.getQueryData<Baby[]>(babyKeys.list(false)) ?? [];
  const activeBaby = babies.find((baby) => baby.id === activeBabyId) ?? babies[0] ?? null;
  const aiKey = queryClient.getQueryData<AiKeyStatus>(aiKeys.status());
  return {
    babyAgeMonths: activeBabyAgeMonths(activeBaby),
    babyCount: babies.length,
    hasAiKey: aiKey?.configured === true,
  };
}

export function UsageProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const preferences = usePreferences();

  const preference = resolvePreference({
    status: preferences.status,
    shareUsageData: preferences.data?.shareUsageData,
    unauthenticated: isUnauthenticated(preferences.error),
  });

  // ---------------------------------------------------------------------
  // Consent. Nothing below this line reaches the network until it resolves.
  // ---------------------------------------------------------------------
  useEffect(() => {
    setUsageConsent(preference);
  }, [preference]);

  // ---------------------------------------------------------------------
  // Session context, kept current from the query cache (no fetches of our own).
  // ---------------------------------------------------------------------
  useEffect(() => {
    const publish = () => setUsageAccountContext(readAccountContext(queryClient, storedActiveBabyId()));
    publish();
    return queryClient.getQueryCache().subscribe(publish);
  }, [queryClient]);

  // ---------------------------------------------------------------------
  // Boot. `session_started` rides in front of this automatically (see track).
  // ---------------------------------------------------------------------
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    track("pwa_launch", { display: displayMode() });
  }, []);

  // ---------------------------------------------------------------------
  // screen_viewed — once per pathname change, with where it came from.
  // ---------------------------------------------------------------------
  const lastPathnameRef = useRef<string | null>(null);
  useEffect(() => {
    const pathname = location.pathname;
    // StrictMode mounts effects twice in development; a ref (which survives
    // the simulated remount) is what keeps that from being two page views.
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;

    const pattern: RoutePattern = toRoutePattern(pathname);
    const fromRoute = recordRouteChange(pattern);
    track("screen_viewed", { route_pattern: pattern, from_route: fromRoute }, { pathname });
  }, [location.pathname]);

  // ---------------------------------------------------------------------
  // Window events: install, offline, and the two ways JS fails on its own.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onAppInstalled = () => track("pwa_installed", { display: displayMode() });
    const onOffline = () => track("offline_entered", { route_pattern: requiredRoutePattern() });
    // The browser has already printed both of these to the console; we add a
    // count, not a second copy of the message.
    const onError = (event: ErrorEvent) => trackClientError(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => trackClientError(event.reason);

    window.addEventListener("appinstalled", onAppInstalled);
    window.addEventListener("offline", onOffline);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("appinstalled", onAppInstalled);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => stopUsageTransport, []);

  return <>{children}</>;
}
