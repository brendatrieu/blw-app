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
      className="fixed inset-x-0 bottom-0 z-10 flex h-16 items-stretch border-t"
      style={{ backgroundColor: "var(--color-bg-elevated)", borderColor: "var(--color-border)" }}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/"}
          className="flex flex-1 flex-col items-center justify-center text-xs font-medium"
          style={({ isActive }) => ({
            color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
          })}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
