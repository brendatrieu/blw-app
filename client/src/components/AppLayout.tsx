import type { SVGProps } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ageInMonths } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
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
    <svg {...ICON_PROPS} width={18} height={18}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...ICON_PROPS} width={18} height={18}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
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

export function AppLayout() {
  const location = useLocation();

  return (
    <CelebrationProvider>
      <div
        className="mx-auto flex min-h-full max-w-lg flex-col"
        style={{ paddingBottom: "calc(var(--nav-height) + env(safe-area-inset-bottom))" }}
      >
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

        <main className="scroll-momentum flex-1">
          <div key={location.pathname} className="page-transition">
            <Outlet />
          </div>
        </main>
        <BottomNav />
      </div>
    </CelebrationProvider>
  );
}
