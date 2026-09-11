import { useEffect, useRef, type SVGProps } from "react";
import { Link, Outlet, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { ageInMonths } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { usePreferences } from "../features/tour/hooks.js";
import { shouldRedirectToTour } from "../features/tour/tour.js";
import { isDaytimeHour, timeOfDayGreeting } from "../lib/greeting.js";
import { BottomNav } from "./BottomNav.js";
import { CelebrationProvider } from "./ui/Celebration.js";

// Small hand-drawn icons matching BottomNav's idiom: 24 viewBox, 1.8 stroke,
// rounded caps/joins, colored entirely via `currentColor`.
const ICON_PROPS: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function SunIcon() {
  return (
    // Filled golden sun — the one decorative color in the header, matching
    // the emoji-colored icons used across the app. Fixed hexes (not tokens):
    // gold reads on both grounds and the icon is aria-hidden decoration.
    <svg {...ICON_PROPS} width={18} height={18} stroke="#c1912f">
      <circle cx="12" cy="12" r="4" fill="#F9D779" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...ICON_PROPS} width={18} height={18} stroke="#c1912f">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill="#F9D779" />
    </svg>
  );
}

/** Sun for daytime hours, moon for evening/night — same boundary as the greeting text. */
function TimeOfDayIcon({ now = new Date() }: { now?: Date }) {
  return isDaytimeHour(now.getHours()) ? <SunIcon /> : <MoonIcon />;
}

function GearIcon() {
  return (
    <svg {...ICON_PROPS} width={20} height={20}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function BabySwitcher() {
  const { babies, activeBaby, setActiveBabyId } = useActiveBaby();

  if (babies.length === 0) {
    return (
      <Link
        to="/settings"
        className="text-sm font-semibold underline underline-offset-2"
        style={{ color: "var(--color-accent)" }}
      >
        Add a baby
      </Link>
    );
  }

  const months = activeBaby ? ageInMonths(activeBaby.birthDate) : null;
  const ageLabel = months === null ? null : months === 1 ? "1 month" : `${months} months`;

  // A single baby needs no picker — just show whose data is on screen,
  // with a friendly greeting above it.
  if (babies.length === 1) {
    return (
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5 text-lg font-semibold text-[var(--color-text-muted)]">
          <TimeOfDayIcon />
          {timeOfDayGreeting()}
        </span>
        <span className="font-display text-[var(--color-text)]">
          {activeBaby?.name}
          {ageLabel ? <span className="ml-6 text-sm font-medium text-[var(--color-text-muted)]">{ageLabel}</span> : null}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-lg font-semibold text-[var(--color-text-muted)]">
        <TimeOfDayIcon />
        {timeOfDayGreeting()}
      </span>
      <label className="flex items-center gap-6">
        <span className="sr-only">Active baby</span>
        <select
          className="font-display appearance-none border-0 bg-transparent p-0 text-[var(--color-text)] outline-none"
          value={activeBaby?.id ?? ""}
          onChange={(event) => {
            setActiveBabyId(event.target.value || null);
          }}
        >
          {babies.map((baby) => (
            <option key={baby.id} value={baby.id}>
              {baby.name}
            </option>
          ))}
        </select>
        {ageLabel ? <span className="text-sm font-medium text-[var(--color-text-muted)]">{ageLabel}</span> : null}
      </label>
    </div>
  );
}

// Replaces the old initial-circle avatar menu: sign-out now lives on the
// Settings page itself, so the header just needs a direct link there.
function SettingsLink() {
  return (
    <Link
      to="/settings"
      aria-label="Settings"
      className="flex min-h-11 min-w-11 items-center justify-center text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-accent)]"
    >
      <GearIcon />
    </Link>
  );
}

/**
 * Whether a route change should start at the top of the page. Forward
 * navigation (tapping into an article, a food, a recipe) should — the page
 * scrolls the window, so a tap deep in a list would otherwise land the new
 * page already scrolled down. Back/forward (POP) keeps the browser's own
 * restored position so returning to a list lands where the user left it.
 */
export function shouldScrollToTop(navigationType: "PUSH" | "POP" | "REPLACE"): boolean {
  return navigationType !== "POP";
}

/**
 * Routes that own the whole viewport: no header, no bottom nav, no
 * nav-height padding. The tour is the only one — it is a full-bleed,
 * six-slide takeover with its own Skip control, and the app's chrome around
 * it would both crop it and offer a half-configured account (an empty baby
 * switcher, a nav to pages they have not been introduced to yet).
 *
 * A function over a set rather than a `startsWith`: chromelessness is a
 * property of specific routes, and a prefix rule would quietly swallow any
 * future `/tour/...` sub-page's decision to keep the chrome.
 */
const CHROMELESS_PATHS = new Set(["/tour"]);

export function isChromelessPath(pathname: string): boolean {
  return CHROMELESS_PATHS.has(pathname);
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  // Read through a ref so the effect keys on the PATH alone — a ?tab=
  // change on the same page keeps its scroll position.
  const navigationTypeRef = useRef(navigationType);
  navigationTypeRef.current = navigationType;

  useEffect(() => {
    // Guarded: this layout is also exercised outside a browser (the
    // node-env test suite calls it as a function).
    if (typeof window === "undefined") return;
    if (shouldScrollToTop(navigationTypeRef.current)) window.scrollTo(0, 0);
  }, [location.pathname]);

  // -----------------------------------------------------------------------
  // First-run gate (item 304)
  // -----------------------------------------------------------------------
  // Nothing about this renders: while the query is pending the app looks
  // exactly as it always did, and the redirect only fires once the answer is
  // actually known — so there is no flash of the dashboard-then-tour for a
  // returning parent, and no blank screen for anyone.
  const { data: preferences, status: preferencesStatus } = usePreferences();
  const redirectedToTourRef = useRef(false);

  useEffect(() => {
    const redirect = shouldRedirectToTour({
      status: preferencesStatus,
      tourCompletedAt: preferences?.tourCompletedAt,
      pathname: location.pathname,
      alreadyRedirected: redirectedToTourRef.current,
    });
    if (!redirect) return;
    // Latched before navigating: one automatic trip to the tour per session,
    // however the visit ends. A parent who skips it and whose PATCH failed
    // gets the app, not a loop back into the tour.
    redirectedToTourRef.current = true;
    navigate("/tour", { replace: true });
  }, [preferencesStatus, preferences, location.pathname, navigate]);

  const chromeless = isChromelessPath(location.pathname);

  return (
    <CelebrationProvider>
      <div
        className="mx-auto flex min-h-full max-w-lg flex-col"
        style={
          chromeless ? undefined : { paddingBottom: "calc(var(--nav-height) + env(safe-area-inset-bottom))" }
        }
      >
        {chromeless ? null : (
          <header
            className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-2.5"
            style={{
              backgroundColor: "var(--color-bg-elevated)",
              borderColor: "var(--color-border)",
              paddingTop: "calc(0.625rem + env(safe-area-inset-top))",
            }}
          >
            <BabySwitcher />
            <SettingsLink />
          </header>
        )}

        <main className="scroll-momentum flex-1">
          <div key={location.pathname} className="page-transition">
            <Outlet />
          </div>
        </main>
        {chromeless ? null : <BottomNav />}
      </div>
    </CelebrationProvider>
  );
}
