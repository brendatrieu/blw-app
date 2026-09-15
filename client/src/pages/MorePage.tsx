import type { ReactNode } from "react";
import { PageHeader } from "../components/ui/PageHeader.js";
import { CardButton, CardLink } from "../components/ui/Card.js";
import { useFeedbackSummary, useIsAdmin } from "../features/admin/hooks.js";
import { useTour } from "../features/tour/TourProvider.js";

interface MoreRow {
  label: string;
  description: string;
  emoji: string;
  badge?: string;
  /** Where the row goes, or `"tour"` for the one row that opens a dialog instead. */
  to?: string;
  action?: "tour";
  /**
   * Item 327: rendered only for an admin. This is a convenience, not a
   * guard — the page it points at renders Not found for everybody else and
   * the API behind it 404s them, so a leaked row would cost nothing but
   * confusion. Which is exactly why it can be a plain filter rather than a
   * second copy of the access rule.
   */
  adminOnly?: boolean;
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
  // Item 360, and for everybody — no `adminOnly`. The whole point is that a
  // parent who hits a bug has somewhere to say so from the screen they are
  // already on; a feedback row only admins can see is a dashboard, not an
  // inbox.
  {
    to: "/feedback",
    label: "Send feedback",
    description: "Something could be better? Let us know.",
    emoji: "💌",
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
  {
    to: "/admin/metrics",
    label: "Metrics",
    description: "How the app is actually being used.",
    emoji: "📈",
    adminOnly: true,
  },
  { to: "/settings", label: "Settings", description: "Babies, account, and app preferences.", emoji: "⚙️" },
];

/**
 * The small trailing pill on a row. Renamed from `ComingSoonChip` in item
 * 361 — the markup is byte-identical, only the name stopped lying: it has
 * never been used for a "coming soon" label and its first real producer is
 * the admin's unread-feedback count.
 */
function RowChip({ children }: { children: ReactNode }) {
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
      {row.badge ? <RowChip>{row.badge}</RowChip> : null}
    </>
  );
}

const ROW_CLASSES = "flex items-center gap-3";

/** The Metrics row's chip, or nothing. Pure, so "only an admin, only when
 * there is something unread" is one testable expression. */
export function unreadFeedbackBadge(isAdmin: boolean, newCount: number | undefined): string | undefined {
  if (!isAdmin) return undefined;
  const count = newCount ?? 0;
  return count > 0 ? `${count} new feedback` : undefined;
}

export function MorePage() {
  const { openTour } = useTour();
  const { isAdmin } = useIsAdmin();
  // Called on every render (hooks cannot be conditional) but only ENABLED
  // for an admin, so a parent's browser never asks — and their markup is
  // byte for byte what it was before the inbox existed.
  const feedback = useFeedbackSummary(isAdmin);
  const badge = unreadFeedbackBadge(isAdmin, feedback.data?.new);

  const rows = moreLinks
    .filter((row) => !row.adminOnly || isAdmin)
    // The count rides on the Metrics row as a chip; its description is
    // untouched, so the row still says what the page is for.
    .map((row) => (row.to === "/admin/metrics" && badge ? { ...row, badge } : row));

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="More" emoji="✨" />

      <nav className="flex flex-col gap-2">
        {rows.map((row) =>
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
