import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../lib/auth.js";

/**
 * History state on the About entry that stands in for "/" while signed out
 * (item 612). Once the visitor signs in, Back can return to that entry; the
 * About page then forwards to Home instead of showing itself (ledger 828).
 */
export interface FrontDoorState {
  frontDoor: true;
}

/** "Loading…" while the session (or, ledger 849, a waiting version) resolves. */
export function SessionPending() {
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
  // Ledger 829: whether this guard has seen a session. One instance wraps the
  // whole app, so a signed-out render after one means the session ENDED here
  // (Sign out, account deletion, a sign-out in another tab), not a deep link.
  const [hadSession, setHadSession] = useState(false);
  if (session && !hadSession) setHadSession(true);

  if (isPending) return <SessionPending />;
  if (!session) {
    // Item 612: a signed-out visit to the front door shows what the app is.
    if (location.pathname === "/") {
      return <Navigate to="/about" replace state={{ frontDoor: true } satisfies FrontDoorState} />;
    }
    // The session just ended (no `from`), or (ledger 870) Back/Forward reached
    // a page from an earlier session: react-router keys every entry the app
    // made, so only an address from outside it (typed, a shared link, or a
    // reload of one) reads "default". Only that one is kept for sign-in; any
    // other lands Home, not on the page the last person was on.
    if (hadSession || location.key !== "default") return <Navigate to="/login" replace />;
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
 *
 * Ledger 856: that landing is a PUSH, so the sign-in page stays beneath it and
 * Back returns there, not to the previous session's pages. Arriving here
 * already signed in (that Back, or a typed /login) sends the person Home,
 * replacing this entry, so Back never loops forward or piles up entries.
 */
export function RequireAnonymous({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  // Whether this guard showed its page signed out: a session after that is a
  // sign-in (or sign-up) that happened here.
  const [shownSignedOut, setShownSignedOut] = useState(false);
  if (!isPending && !session && !shownSignedOut) setShownSignedOut(true);
  const landing = session && shownSignedOut ? ((location.state as { from?: string } | null)?.from ?? "/") : null;
  // One push, by hand: StrictMode runs effects twice in development, and a
  // pushing <Navigate> would add the landing twice.
  const landed = useRef(false);
  useEffect(() => {
    if (landing === null || landed.current) return;
    landed.current = true;
    navigate(landing);
  }, [landing, navigate]);

  if (isPending) return <SessionPending />;
  if (session) return landing === null ? <Navigate to="/" replace /> : null;
  return <>{children}</>;
}
