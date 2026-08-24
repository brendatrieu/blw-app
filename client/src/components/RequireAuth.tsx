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
    // Remember where they were headed so sign-in can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/** Keeps signed-in users off `/login` and `/signup`. */
export function RequireAnonymous({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();

  if (isPending) return <SessionPending />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}
