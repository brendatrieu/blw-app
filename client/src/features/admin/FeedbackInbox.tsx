import { useState } from "react";
import {
  adminFeedbackFilterSchema,
  type AdminFeedbackItem,
  type AdminFeedbackSummary,
  type FeedbackFilter,
  type UpdateFeedbackInput,
} from "@blw/shared";
import { Button } from "../../components/ui/Button.js";
import { Card } from "../../components/ui/Card.js";
import { SegmentedControl, type SegmentedControlOption } from "../../components/ui/SegmentedControl.js";
import { Skeleton } from "../../components/ui/Skeleton.js";
import { useAdminFeedback, useFeedbackSummary, useUpdateFeedback } from "./hooks.js";

/**
 * What parents wrote, and the three states a message can be in (item 361).
 *
 * This is the second — and last — place on the admin surface where a parent
 * appears at all. `AccessPanel` above it shows admins to admins; this shows
 * one parent's words and the address to answer them at, to an admin, because
 * an inbox you cannot reply from is a suggestion box. Everything else on the
 * Metrics page is an aggregate with nowhere in its types to put a person.
 *
 * Nothing here is destructive. "Clear" archives; the Archived tab is the
 * undo, and Restore brings a message back. There is no delete, so a misread
 * tap costs a second, not a parent's report.
 */

export const FEEDBACK_INBOX_TITLE = "Inbox";

export const FEEDBACK_INBOX_DESCRIPTION =
  "What parents sent from Send feedback. Their words and their address, so you can answer — the only place on this page a parent appears.";

/** What an empty tab says. The same three words on all three tabs. */
export const FEEDBACK_INBOX_EMPTY = "Nothing here.";

const FILTER_LABELS: Record<FeedbackFilter, string> = {
  open: "Open",
  resolved: "Resolved",
  archived: "Archived",
};

/**
 * The number on a tab.
 *
 * "Open" is `new + read` — both are messages that still need a human, which
 * is what the tab means; the server's summary keeps them apart because the
 * More-page chip counts only the unread ones. Missing counts read as 0
 * rather than blank, so the tabs never change width as the summary lands.
 */
export function feedbackTabCount(summary: AdminFeedbackSummary | undefined, filter: FeedbackFilter): number {
  if (!summary) return 0;
  if (filter === "open") return summary.new + summary.read;
  if (filter === "resolved") return summary.resolved;
  return summary.archived;
}

export interface FeedbackAction {
  label: string;
  patch: UpdateFeedbackInput;
}

/**
 * Which buttons one item offers, given the tab it is being read in. Pure, so
 * the table is pinned by a test rather than inferred from JSX.
 *
 * Mark read disappears once the message has been read: the button exists to
 * take a message out of the More-page chip's count, and an action that
 * changes nothing is a tap that teaches the wrong thing.
 */
export function feedbackActions(item: AdminFeedbackItem, filter: FeedbackFilter): FeedbackAction[] {
  if (filter === "archived") return [{ label: "Restore", patch: { archived: false } }];
  if (filter === "resolved") {
    return [
      { label: "Reopen", patch: { status: "read" } },
      { label: "Clear", patch: { archived: true } },
    ];
  }
  return [
    ...(item.status === "new" ? [{ label: "Mark read", patch: { status: "read" as const } }] : []),
    { label: "Resolve", patch: { status: "resolved" } },
    { label: "Clear", patch: { archived: true } },
  ];
}

/**
 * "3h ago" — how long ago a message was sent, in the coarsest unit that is
 * still useful. An inbox is read by recency, and the exact minute of
 * something sent last Tuesday is noise; the full instant is in the data if
 * it is ever needed.
 *
 * Pure, with an injectable `now`, so it is testable without freezing a
 * clock. An unparseable stamp returns an empty string rather than "NaN
 * ago" — a missing age beats a broken one.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.round((now.getTime() - then) / 1000);
  // A clock skewed a few seconds the other way is "just now", not "in 4s".
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** The route pattern the message was sent from, or an honest blank. */
export function feedbackContextLine(item: AdminFeedbackItem): string {
  const parts = [item.routePattern ?? "no screen", `v${item.appVersion}`, relativeTime(item.createdAt)];
  return parts.filter((part) => part.length > 0).join(" · ");
}

export function FeedbackInbox() {
  const [filter, setFilter] = useState<FeedbackFilter>("open");
  // Rendered only inside the admin-gated page, so the summary is always
  // wanted here — `enabled` exists for the More page, which is not.
  const summary = useFeedbackSummary(true);
  const list = useAdminFeedback(filter);
  const update = useUpdateFeedback();

  const items = list.data?.items ?? [];

  const options: Array<SegmentedControlOption<FeedbackFilter>> = adminFeedbackFilterSchema.options.map(
    (value) => ({
      value,
      label: `${FILTER_LABELS[value]} (${feedbackTabCount(summary.data, value)})`,
      icon: null,
    }),
  );

  return (
    <section className="flex flex-col gap-3" aria-labelledby="admin-inbox-heading">
      <div className="flex flex-col gap-1">
        <h2 id="admin-inbox-heading" className="font-h2 text-[var(--color-text)]">
          {FEEDBACK_INBOX_TITLE}
        </h2>
        <p className="text-xs text-[var(--color-text-muted)]">{FEEDBACK_INBOX_DESCRIPTION}</p>
      </div>

      <SegmentedControl
        options={options}
        value={filter}
        onChange={setFilter}
        aria-label="Feedback filter"
      />

      {list.isLoading ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {list.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          Couldn't load feedback.
        </p>
      ) : null}

      {!list.isLoading && !list.isError ? (
        items.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{FEEDBACK_INBOX_EMPTY}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <Card as="li" padding="sm" key={item.id} className="flex flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                  <a
                    href={`mailto:${item.senderEmail}`}
                    className="text-sm font-semibold break-all text-[var(--color-text)] underline decoration-[var(--color-border)] underline-offset-2"
                  >
                    {item.senderEmail}
                  </a>
                  <span className="text-xs text-[var(--color-text-muted)]">{feedbackContextLine(item)}</span>
                </div>

                {/* The message exactly as it was typed: paragraphs a parent
                    put in stay in, and nothing is collapsed to one line. */}
                <p className="text-sm whitespace-pre-wrap text-[var(--color-text)]">{item.message}</p>

                <div className="flex flex-wrap gap-2">
                  {feedbackActions(item, filter).map((action) => (
                    // `the Button default (size "md")` rather than the dense `sm`: these move a
                    // parent's message between tabs, and the 44px target is
                    // not something to shave off a destructive-feeling tap.
                    <Button
                      key={action.label}
                      type="button"
                      variant="secondary"
                      disabled={update.isPending}
                      onClick={() => {
                        update.mutate({ id: item.id, patch: action.patch });
                      }}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </Card>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
