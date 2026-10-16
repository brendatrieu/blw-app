import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "../lib/auth.js";

/**
 * History state on the About entry that stands in for "/" while signed out
 * (item 612). Once the visitor signs in, Back can return to that entry; the
 * About page then forwards to Home instead of showing itself (ledger 828).
 */
export interface FrontDoorState {
  frontDoor: true;
}

function SessionPending() {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Loading…
      </p>
    </div>
  );
}

/**
 * Gate for every authenticated route.
 *
 * This is a convenience redirect, not the security boundary — the server
 * rejects unauthenticated API calls on its own. Rendering nothing while the
 * session resolves avoids a flash of the login screen on a warm reload.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <SessionPending />;
  if (!session) {
    // Item 612: a signed-out visit to the front door shows what the app is.
    if (location.pathname === "/") {
      return <Navigate to="/about" replace state={{ frontDoor: true } satisfies FrontDoorState} />;
    }
    // Anywhere else, remember where they were headed so sign-in can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/**
 * Keeps signed-in users off `/login` and `/signup`, and is the ONE place a
 * fresh sign-in or sign-up lands (ledger 828): the pages do not navigate on
 * success, because better-auth only refetches the session ~10 ms after the
 * call resolves, and a navigate in that gap meets RequireAuth while the
 * session still reads signed out ("/" → About). Honours the `from` that
 * RequireAuth stored, so a deep link comes back.
 */
export function RequireAnonymous({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <SessionPending />;
  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }
  return <>{children}</>;
}
