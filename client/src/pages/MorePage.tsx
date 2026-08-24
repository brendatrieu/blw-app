import type { ReactNode } from "react";
import { PageHeader } from "../components/ui/PageHeader.js";
import { CardLink } from "../components/ui/Card.js";

interface MoreLink {
  to: string;
  label: string;
  description: string;
  emoji: string;
  badge?: string;
}

const moreLinks: MoreLink[] = [
  {
    to: "/safety",
    label: "Safety Library",
    description: "Choking, allergies, storage, and more — works offline.",
    emoji: "🛟",
  },
  { to: "/favorites", label: "Favorites", description: "Recipes you've saved.", emoji: "❤️" },
  {
    to: "/symptom-check",
    label: "Symptom Check",
    description: "Pattern-spotting after a reaction, not a diagnosis.",
    emoji: "🩺",
  },
  {
    to: "/chat",
    label: "Chat",
    description: "Recipe help and ask-anything BLW questions.",
    emoji: "💬",
  },
  { to: "/settings", label: "Settings", description: "Babies, account, and app preferences.", emoji: "⚙️" },
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
      <PageHeader title="More" emoji="✨" />

      <nav className="flex flex-col gap-2">
        {moreLinks.map((link) => (
          <CardLink key={link.to} to={link.to} padding="sm" className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-inset)] text-xl leading-none"
            >
              {link.emoji}
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold text-[var(--color-text)]">{link.label}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{link.description}</span>
            </span>
            {link.badge ? <ComingSoonChip>{link.badge}</ComingSoonChip> : null}
          </CardLink>
        ))}
      </nav>

      <p className="mt-2 text-center font-caption text-[var(--color-text-muted)]">blw-app v{__APP_VERSION__}</p>
    </div>
  );
}
