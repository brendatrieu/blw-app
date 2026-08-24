import { Link } from "react-router-dom";

const moreLinks = [
  { to: "/safety", label: "Safety Library" },
  { to: "/favorites", label: "Favorites" },
  { to: "/symptom-check", label: "Symptom Check" },
  { to: "/chat", label: "Chat" },
  { to: "/settings", label: "Settings" },
];

export function MorePage() {
  return (
    <div className="flex flex-col gap-2 p-4">
      <h1 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>
        More
      </h1>
      <nav className="flex flex-col divide-y" style={{ borderColor: "var(--color-border)" }}>
        {moreLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="py-3 text-sm"
            style={{ color: "var(--color-text)" }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
