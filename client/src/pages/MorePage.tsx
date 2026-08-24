import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface MoreLink {
  to: string;
  label: string;
  description: string;
  badge?: string;
}

const moreLinks: MoreLink[] = [
  {
    to: "/safety",
    label: "Safety Library",
    description: "Choking, allergies, storage, and more — works offline.",
  },
  { to: "/favorites", label: "Favorites", description: "Recipes you've saved." },
  {
    to: "/symptom-check",
    label: "Symptom Check",
    description: "Pattern-spotting after a reaction, not a diagnosis.",
  },
  {
    to: "/chat",
    label: "Chat",
    description: "Recipe help and ask-anything BLW questions.",
  },
  { to: "/settings", label: "Settings", description: "Babies, account, and app preferences." },
];

function ComingSoonChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex flex-shrink-0 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-[var(--color-text-muted)]">
      {children}
    </span>
  );
}

export function MorePage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">More</h1>

      <nav className="flex flex-col gap-2">
        {moreLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 transition-colors hover:border-[var(--color-primary)]"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-[var(--color-text)]">{link.label}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{link.description}</span>
            </span>
            {link.badge ? <ComingSoonChip>{link.badge}</ComingSoonChip> : null}
          </Link>
        ))}
      </nav>

      <p className="mt-2 text-center text-xs text-[var(--color-text-muted)]">blw-app v{__APP_VERSION__}</p>
    </div>
  );
}
