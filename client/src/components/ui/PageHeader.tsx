import type { ReactNode } from "react";

/** Which way out a page's header offers in its `leading` slot (item 258). */
export type HeaderAffordance = "back" | "close" | "none";

/**
 * Which affordance a page's header shows, from the only two facts that
 * decide it: whether the page was *drilled into* (a detail page reached from
 * a list — that gets a back chevron) and whether it was *opened as a task*
 * (a full-screen create/edit form — that gets a close X). Pure and exported
 * so the "never both" rule of item 258 is one testable expression rather
 * than a `&&` repeated down twenty pages.
 *
 * `close` wins when a page claims both, because an X is the stronger promise
 * (this screen goes away) and showing two ways out in one slot is exactly
 * what item 258 forbids.
 */
export function resolveHeaderAffordance({
  drilledInto = false,
  openedAsTask = false,
}: {
  drilledInto?: boolean;
  openedAsTask?: boolean;
}): HeaderAffordance {
  if (openedAsTask) return "close";
  if (drilledInto) return "back";
  return "none";
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /**
   * Optional decorative visual beside the title: an emoji string (e.g. "🥑"),
   * or a node such as a 40px `FoodPlate` on detail pages (item 673). A node
   * renders as given, so it must carry its own aria-hidden.
   */
  emoji?: ReactNode;
  /**
   * The page's way out — a `BackButton` chevron or a `CloseButton` X. Inside
   * AppLayout it portals into the slim header's left slot (item 654);
   * elsewhere it sits at the LEFT of the h1's own row (item 258). One or the other,
   * never both; page *actions* ("Add food", "Log meal") stay in `action` on
   * the right.
   */
  leading?: ReactNode;
}

/** Consistent title/description/action row used at the top of every page. */
export function PageHeader({ title, description, action, emoji, leading }: PageHeaderProps) {
  return (
    // Single-line headers center the action against the title; only when a
    // description makes the left block taller does top-alignment look right.
    <div className={`flex justify-between gap-3 ${description ? "items-start" : "items-center"}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Outside AppLayout the leading affordance shares the h1's row,
            vertically centered (item 258); inside it, it portals into the
            slim header instead (item 654). */}
        <div className="flex items-center gap-1">
          {leading}
          <h1 className="font-display flex min-w-0 items-center gap-2 text-[var(--color-text)]">
            {typeof emoji === "string" && emoji ? (
              <span aria-hidden="true" className="text-2xl leading-none">
                {emoji}
              </span>
            ) : (
              emoji
            )}
            {title}
          </h1>
        </div>
        {description ? <p className="text-sm text-[var(--color-text-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
