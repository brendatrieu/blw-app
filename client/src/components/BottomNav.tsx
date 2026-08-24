import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Home" },
  { to: "/pantry", label: "Pantry" },
  { to: "/foods", label: "Foods" },
  { to: "/log", label: "Log" },
  { to: "/more", label: "More" },
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
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/"}
          className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-medium transition-colors"
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden="true"
                className="h-1 w-6 rounded-full transition-colors"
                style={{ backgroundColor: isActive ? "var(--color-primary)" : "transparent" }}
              />
              <span
                className="rounded-full px-2.5 py-1 transition-colors"
                style={{
                  color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                  backgroundColor: isActive ? "var(--color-primary-soft)" : "transparent",
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                {tab.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
