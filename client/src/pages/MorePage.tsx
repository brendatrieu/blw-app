import type { ReactNode } from "react";
import { PageHeader } from "../components/ui/PageHeader.js";
import { CardButton, CardLink } from "../components/ui/Card.js";
import { useTour } from "../features/tour/TourProvider.js";

interface MoreRow {
  label: string;
  description: string;
  emoji: string;
  badge?: string;
  /** Where the row goes, or `"tour"` for the one row that opens a dialog instead. */
  to?: string;
  action?: "tour";
}

const moreLinks: MoreRow[] = [
  // First in the list, and named for the bottom-nav tab it replaced: "Learn"
  // left the bar to make room for Recipes (item 274).
  {
    to: "/safety",
    label: "Learn",
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
  // Item 311: the tour's only other way in. It is a modal now, not a route,
  // so this row is a button wearing the same card as its neighbours — last of
  // the content rows and ahead of Settings, which stays the end of the list.
  {
    action: "tour",
    label: "Take the tour",
    description: "A quick look around the app",
    emoji: "🧭",
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

/** One row's insides, shared so the link rows and the button row cannot drift apart. */
function RowContent({ row }: { row: MoreRow }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-inset)] text-xl leading-none"
      >
        {row.emoji}
      </span>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-[var(--color-text)]">{row.label}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{row.description}</span>
      </span>
      {row.badge ? <ComingSoonChip>{row.badge}</ComingSoonChip> : null}
    </>
  );
}

const ROW_CLASSES = "flex items-center gap-3";

export function MorePage() {
  const { openTour } = useTour();

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="More" emoji="✨" />

      <nav className="flex flex-col gap-2">
        {moreLinks.map((row) =>
          row.to ? (
            <CardLink key={row.to} to={row.to} padding="sm" className={ROW_CLASSES}>
              <RowContent row={row} />
            </CardLink>
          ) : (
            <CardButton key={row.label} padding="sm" className={ROW_CLASSES} onClick={openTour}>
              <RowContent row={row} />
            </CardButton>
          ),
        )}
      </nav>

      <p className="mt-2 text-center font-caption text-[var(--color-text-muted)]">
        Little Meals v{__APP_VERSION__}
      </p>
    </div>
  );
}
