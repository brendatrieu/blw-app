import type { SVGProps } from "react";
import { NavLink } from "react-router-dom";

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

function BasketIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M8.3 10a3.7 3.7 0 0 1 7.4 0" />
      <path d="M5 10h14l-1.3 8.2a2 2 0 0 1-2 1.7H8.3a2 2 0 0 1-2-1.7L5 10Z" />
      <path d="M10 13.2v4M14 13.2v4" />
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

function BookIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 6.2c-1.6-1.4-4-1.9-6.5-1.4a1 1 0 0 0-.8 1v11.7a1 1 0 0 0 1.2 1c2.1-.4 4.2 0 5.6 1.3.3.3.9.3 1.2 0 1.4-1.3 3.5-1.7 5.6-1.3a1 1 0 0 0 1.2-1V5.8a1 1 0 0 0-.8-1c-2.5-.5-4.9 0-6.5 1.4Z" />
      <path d="M12 6.2v13" />
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

const tabs = [
  { to: "/", label: "Home", Icon: HomeIcon },
  { to: "/pantry", label: "Pantry", Icon: BasketIcon },
  { to: "/foods", label: "Foods", Icon: AppleIcon },
  { to: "/safety", label: "Learn", Icon: BookIcon },
  { to: "/more", label: "More", Icon: DotsIcon },
];

export function BottomNav() {
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
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-xs"
        >
          {({ isActive }) => (
            <>
              <span
                className="flex h-8 w-12 items-center justify-center rounded-[var(--radius-pill)] transition-[background-color,transform] duration-[var(--duration-base)] ease-[var(--ease-spring)] motion-reduce:transition-none"
                style={{
                  backgroundColor: isActive ? "var(--color-primary)" : "transparent",
                  color: isActive ? "var(--color-primary-contrast)" : "var(--color-text-muted)",
                  transform: isActive ? "scale(1)" : "scale(0.92)",
                }}
              >
                <Icon />
              </span>
              <span
                className="font-caption"
                style={{ color: isActive ? "var(--color-primary)" : "var(--color-text-muted)" }}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
