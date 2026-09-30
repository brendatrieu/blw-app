import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "../lib/auth.js";

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
    if (location.pathname === "/") return <Navigate to="/about" replace />;
    // Anywhere else, remember where they were headed so sign-in can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/**
 * Keeps signed-in users off `/login` and `/signup`. It also finishes a deep
 * link: this redirect fires as soon as sign-in creates the session, ahead of
 * LoginPage's own navigate, so it must honour the `from` RequireAuth stored.
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
