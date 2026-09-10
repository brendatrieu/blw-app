import type { ReactElement, SVGProps } from "react";
import { Link, useLocation } from "react-router-dom";

// Five hand-drawn, friendly-geometry icons — rounded strokes, no sharp
// corners, matching the Sunny Sprout illustration style. Color comes from
// `currentColor` so the active/inactive state is set entirely by the
// wrapping <span>'s text color.
const ICON_PROPS: SVGProps<SVGSVGElement> = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function HomeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v8.3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" />
      <path d="M10 19.3v-3.8a2 2 0 0 1 4 0v3.8" />
    </svg>
  );
}

/** A simple fridge outline (item 286) — the Fridge tab's glyph, replacing the
 * basket the tab used to carry: one rounded body, the divider under the
 * freezer compartment, and a short handle either side of it, drawn in the
 * same 24-box outline weight as its neighbours. */
function FridgeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="5.5" y="3.2" width="13" height="17.6" rx="2.6" />
      <path d="M5.5 9.6h13" />
      <path d="M15.3 6v2M15.3 11.9v3" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 8.7c-2.6-2.3-6.3-.7-6.3 3.1 0 3.6 2.9 7.2 5.2 7.2.5 0 .9-.2 1.1-.2.2 0 .6.2 1.1.2 2.3 0 5.2-3.6 5.2-7.2 0-3.8-3.7-5.4-6.3-3.1Z" />
      <path d="M12 8.7V6.3" />
      <path d="M12 6.3c.4-1 1.7-1.5 2.8-1.1" />
    </svg>
  );
}

/** A lidded cooking pot (item 272) — the Recipes tab's glyph, drawn in the
 * same 24-box outline weight as its neighbours: domed lid with a knob, the
 * rim, then the body with a nub of a handle either side. */
function PotIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M7.6 10.4a4.4 4.4 0 0 1 8.8 0M12 6v-1.4" />
      <path d="M3.4 10.4h17.2" />
      <path d="M5.3 10.4v4.8a4 4 0 0 0 4 4h5.4a4 4 0 0 0 4-4v-4.8M5.3 12.7H3.7M18.7 12.7h1.6" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Is `pathname` that route or one nested under it? `/safety` covers
 * `/safety/choking`; it must NOT cover `/safetyville`. */
function isWithin(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Which paths light the More tab (item 272). Learn left the bar to make room
 * for Recipes, so the safety library has no tab of its own any more — its
 * routes belong to More, which is where the "Learn" entry now lives, as do
 * the other More-page destinations (settings, favorites, chat, the symptom
 * checker). Pure and exported so the rule is pinned by a test.
 */
export function isMoreTabPath(pathname: string): boolean {
  return ["/more", "/safety", "/settings", "/favorites", "/chat", "/symptom-check"].some((base) =>
    isWithin(pathname, base),
  );
}

interface Tab {
  to: string;
  label: string;
  Icon: () => ReactElement;
}

const tabs: Tab[] = [
  { to: "/", label: "Home", Icon: HomeIcon },
  { to: "/fridge", label: "Fridge", Icon: FridgeIcon },
  { to: "/foods", label: "Foods", Icon: AppleIcon },
  { to: "/recipes", label: "Recipes", Icon: PotIcon },
  { to: "/more", label: "More", Icon: DotsIcon },
];

/**
 * The single active-tab rule, pure so it is pinned by a test and so the
 * rendered `aria-current="page"` always agrees with the highlight (NavLink's
 * own matching couldn't express "More owns /safety"). Home is exact; the
 * section tabs cover their nested routes; More covers everything it lists.
 * Returns the tab's `to`, or null when no tab owns the path.
 */
export function resolveActiveTab(pathname: string): string | null {
  if (pathname === "/") return "/";
  if (isMoreTabPath(pathname)) return "/more";
  for (const base of ["/fridge", "/foods", "/recipes"]) if (isWithin(pathname, base)) return base;
  return null;
}

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-lg items-stretch border-t px-1 pt-1"
      style={{
        backgroundColor: "var(--color-bg-elevated)",
        borderColor: "var(--color-border)",
        height: "calc(var(--nav-height) + env(safe-area-inset-bottom))",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {tabs.map(({ to, label, Icon }) => {
        const active = resolveActiveTab(pathname) === to;
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-xs"
          >
            <span
              className="flex h-8 w-12 items-center justify-center rounded-[var(--radius-pill)] transition-[background-color,transform] duration-[var(--duration-base)] ease-[var(--ease-spring)] motion-reduce:transition-none"
              style={{
                backgroundColor: active ? "var(--color-primary)" : "transparent",
                color: active ? "var(--color-primary-contrast)" : "var(--color-text-muted)",
                transform: active ? "scale(1)" : "scale(0.92)",
              }}
            >
              <Icon />
            </span>
            <span className="font-caption" style={{ color: active ? "var(--color-accent)" : "var(--color-text-muted)" }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
