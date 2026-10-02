import { useEffect, useRef, useState, type SVGProps } from "react";
import { Link, Outlet, useLocation, useNavigationType } from "react-router-dom";
import { ageInMonths } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useAllergenProgress } from "../features/tracking/hooks.js";
import { TourProvider } from "../features/tour/TourProvider.js";
import { timeOfDayGreeting } from "../lib/greeting.js";
import { BabyChip } from "./BabyChip.js";
import { BottomNav } from "./BottomNav.js";
import { CelebrationProvider } from "./ui/Celebration.js";
import { HeaderSlotContext } from "./ui/headerSlot.js";

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

function GearIcon() {
  return (
    <svg {...ICON_PROPS} width={20} height={20}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Small uppercase apricot label above the baby name (CSS uppercases it, so
// the copy stays "Good evening"). No sun/moon: direction A is emoji-free.
// Normal line height, as in A-Home: the body's 1.5 pushed the name 1.5px down.
const GREETING_CLASS =
  "text-[11px] leading-[normal] font-extrabold uppercase tracking-[0.14em] text-[var(--color-apricot-text)]";

function BabySwitcher() {
  const { babies, activeBaby, setActiveBabyId } = useActiveBaby();
  // Item 680: rides on the allergen-progress query Home already fetches. An
  // older persisted cache has no foodsTried, so the suffix just stays hidden.
  const foodsTried = useAllergenProgress(activeBaby?.id).data?.foodsTried;

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
  const ageLabel =
    months === null
      ? null
      : [
          months === 1 ? "1 month" : `${months} months`,
          typeof foodsTried === "number" ? `${foodsTried} ${foodsTried === 1 ? "food" : "foods"} tried` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  // A single baby needs no picker — just show whose data is on screen,
  // with a friendly greeting above it.
  if (babies.length === 1) {
    return (
      <div className="flex flex-col gap-1">
        <span className={GREETING_CLASS}>{timeOfDayGreeting()}</span>
        {/* The age sits beside the name, not inside it, so it stays Nunito. */}
        {/* Wraps the age under a long name instead of squeezing the name mid-word (680 B1). */}
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="font-display text-[var(--color-text)]">{activeBaby?.name}</span>
          {ageLabel ? <span className="text-sm whitespace-nowrap text-[var(--color-text-muted)]">{ageLabel}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className={GREETING_CLASS}>{timeOfDayGreeting()}</span>
      {/* A select can't wrap, so a long name would push the gear off screen
          (680 B1). The name is drawn as wrapping text, as for one baby, and
          the real select lies invisibly over the row, as in BabyChip; the
          label draws the focus ring the hidden select can't. */}
      <label className="relative flex flex-wrap items-baseline gap-x-2.5 rounded-[var(--radius-sm)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]">
        <span className="sr-only">Active baby</span>
        <span aria-hidden="true" className="font-display text-[var(--color-text)]">
          {activeBaby?.name}
        </span>
        {ageLabel ? <span className="text-sm whitespace-nowrap text-[var(--color-text-muted)]">{ageLabel}</span> : null}
        <select
          data-no-focus-ring
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
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
      className="flex min-h-11 min-w-11 items-center justify-center text-[var(--color-icon)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-accent)]"
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

export function AppLayout() {
  const location = useLocation();
  const navigationType = useNavigationType();
  // Read through a ref so the effect keys on the PATH alone — a ?tab=
  // change on the same page keeps its scroll position.
  const navigationTypeRef = useRef(navigationType);
  navigationTypeRef.current = navigationType;
  // Home keeps its tall greeting header; every other page gets one slim row
  // whose left slot receives the page's Back/Close button (item 654).
  const isHome = location.pathname === "/";
  // A ref callback into state: set in the commit phase, so the button moves
  // into the header before the first paint (no inline flash).
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Guarded: this layout is also exercised outside a browser (the
    // node-env test suite calls it as a function).
    if (typeof window === "undefined") return;
    if (shouldScrollToTop(navigationTypeRef.current)) window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <CelebrationProvider>
      {/* The tour lives here rather than in App so it can open over any
          authenticated page, keep the chrome behind it, and leave the parent
          exactly where they were when it closes. */}
      <TourProvider>
        {/* The shell column is at least a viewport tall so the sticky nav at
            its end sits on the bottom edge of even a short page. `min-h-screen`
            (100vh) is the fallback; `min-h-[100dvh]` tracks the collapsing
            mobile URL bar and wins where `dvh` is understood. The @supports
            wrapper is what makes it win: Tailwind v4 emits the bare
            `.min-h-[100dvh]` rule BEFORE `.min-h-screen`, so an unwrapped pair
            would leave 100vh overriding the dvh one it is meant to back up.
            No bottom padding reservation any more — the nav is in flow and
            occupies its own space (item 379). */}
        <div className="mx-auto flex min-h-screen supports-[height:100dvh]:min-h-[100dvh] max-w-lg flex-col">
          {/* z-20, not z-10 (item 674): card action rows are `relative z-10`
              and come later in the tree, so at a tie they painted over the
              header when scrolled under it (reduced motion, where
              .page-transition leaves no stacking context). Menu (z-20) and
              Sheet/Dialog (z-30) portal to body, after the header, so they
              still float above it. */}
          <header
            // Home tops the gear with the greeting, as A-Home does.
            className={`sticky top-0 z-20 flex justify-between gap-3 px-4 ${isHome ? "items-start py-2.5" : "items-center py-1"}`}
            style={{
              // The page's own color, no line (item 679, A-Home/A-Salmon): the
              // bar reads as part of the page, still opaque so content
              // scrolling under it disappears.
              backgroundColor: "var(--color-bg)",
              paddingTop: `calc(${isHome ? "1.125rem" : "0.25rem"} + env(safe-area-inset-top))`,
            }}
          >
            {isHome ? (
              <>
                <BabySwitcher />
                <SettingsLink />
              </>
            ) : (
              <>
                {/* Item 692: [back/X][chip] on the left, the gear alone on the
                    right. The slot is `contents`, so with no button in it (tab
                    pages) it takes no space and the chip starts at 16px; the
                    44px gear keeps the row 52px tall. */}
                <div className="flex min-w-0 items-center gap-0.5">
                  <div ref={setHeaderSlot} className="contents" />
                  <BabyChip />
                </div>
                <SettingsLink />
              </>
            )}
          </header>

          <main className="scroll-momentum flex-1">
            <div key={location.pathname} className="page-transition">
              <HeaderSlotContext.Provider value={headerSlot}>
                <Outlet />
              </HeaderSlotContext.Provider>
            </div>
          </main>
          <BottomNav />
        </div>
      </TourProvider>
    </CelebrationProvider>
  );
}
