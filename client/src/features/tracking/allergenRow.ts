import { ALLERGEN_MAINTENANCE_DAYS, type AllergenProgressItem, type AllergenStatus } from "@blw/shared";
import type { BadgeTone } from "../../components/ui/Badge.js";

export type AllergenRowAction = "mark" | "undo" | "none";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The sentence this used to be (item 144): a muted hint once the last serve
 * was 14 days old. Item 365 replaced the sentence with a caution badge, and
 * keeps the sentence itself as that badge's `title` + screen-reader text —
 * "Serve again soon" is the glance, this is the reason.
 */
export const RECENCY_HINT_COPY = "Consider serving again soon to maintain tolerance.";

/** The caution badge's visible label once an established allergen is due. */
export const DUE_BADGE_LABEL = "Serve again soon";

/**
 * Whole calendar days between an ISO instant and `now`, counting by local
 * midnight boundaries — the same "Today"/"Yesterday" idiom `ServeLogList`'s
 * `dayLabel` uses, so "1d ago" always means "yesterday", not "somewhere in
 * the last 24-48 hours" depending on time of day. Negative for a future
 * instant (the countdown's case: `dueAt` is days AHEAD of now).
 */
function daysSince(iso: string, now: Date): number {
  const then = new Date(iso);
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startOfNow.getTime() - startOfThen.getTime()) / MS_PER_DAY);
}

/** "today" / "yesterday" / "3d ago" for a past instant, on local midnights. */
function relativeDay(iso: string, now: Date): string {
  const days = daysSince(iso, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/**
 * Neutral, judgment-free recency fact for an allergen row (item 143):
 * "last served today/yesterday/Xd ago", or "no serves logged yet" for a row
 * established purely by a parent override (no exposure behind it at all —
 * see `unionAllergenStatus`). Never colored; plain muted text only.
 */
export function lastServedLabel(lastServedAt: string | null, now: Date = new Date()): string {
  if (!lastServedAt) return "no serves logged yet";
  return `last served ${relativeDay(lastServedAt, now)}`;
}

/**
 * Whether the parent's "we established this" mark is the LATEST way this baby
 * is known to have met the allergen, rather than a logged meal.
 *
 * `lastExposureAt` is the server's max of the two (see `loadAllergenProgress`),
 * so it is either exactly `lastServedAt` or exactly the mark's date — which
 * makes "they differ" the same question as "the mark is newer", without the
 * client re-deriving any date of its own.
 */
export function markIsLatestExposure(
  item: Pick<AllergenProgressItem, "lastServedAt" | "lastExposureAt">,
): boolean {
  return item.lastExposureAt !== null && item.lastExposureAt !== item.lastServedAt;
}

/**
 * The fact line: whichever exposure is the most recent one, said in its own
 * words. A mark is not a serve — claiming "last served" for a date nobody
 * logged a meal on would be the app inventing a meal — so a mark that is
 * newer than the last logged serve reads "marked 3d ago" instead.
 */
export function lastExposureLabel(
  item: Pick<AllergenProgressItem, "lastServedAt" | "lastExposureAt">,
  now: Date = new Date(),
): string {
  const marked = markIsLatestExposure(item) ? item.lastExposureAt : null;
  if (marked) return `marked ${relativeDay(marked, now)}`;
  return lastServedLabel(item.lastServedAt, now);
}

/**
 * Whether an established allergen has reached its maintenance due date.
 *
 * `dueAt` is server truth (`allergenDueAt` in shared), and this only asks
 * whether that DAY has arrived: the comparison is on local midnights, like
 * every other day count on this row, so a row that reads "last served 7d ago"
 * is due in the same breath rather than a few hours later.
 */
export function isAllergenDue(dueAt: string | null, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  return daysSince(dueAt, now) >= 0;
}

/**
 * "Serve again by Monday" — the countdown an established allergen carries
 * while it is still inside its maintenance week.
 *
 * A bare weekday is ambiguous at exactly one distance: a full window out
 * (`ALLERGEN_MAINTENANCE_DAYS`) lands on today's own weekday, where "Serve
 * again by Tuesday" on a Tuesday reads as "today". That one case says
 * "next Tuesday".
 */
export function serveAgainByLabel(dueAt: string | null, now: Date = new Date()): string | null {
  if (!dueAt) return null;
  const daysUntil = -daysSince(dueAt, now);
  if (daysUntil <= 0) return null;
  const weekday = new Date(dueAt).toLocaleDateString(undefined, { weekday: "long" });
  return daysUntil >= ALLERGEN_MAINTENANCE_DAYS ? `Serve again by next ${weekday}` : `Serve again by ${weekday}`;
}

export interface AllergenRecency {
  /** Muted fact line, or null to render nothing (a not-yet-started row has
   * no recency worth stating — "0 exposures" already covers it). */
  fact: string | null;
  /** Muted countdown ("Serve again by Monday") while an established allergen
   * is still inside its maintenance week; null once it is due, and null for
   * anything not established (a ladder still being climbed is paced by the
   * intro guidance, not by a maintenance cadence). */
  countdown: string | null;
  /** True once the maintenance week is up — the row shows the caution badge
   * (`DUE_BADGE_LABEL`) instead of the countdown. */
  due: boolean;
}

/**
 * Combines the fact + countdown/badge for one allergen row. Pure and
 * unit-tested so the gating (not_started rows get nothing; due and counting
 * down are mutually exclusive) can't silently drift from the helpers above.
 */
export function resolveAllergenRecency(
  item: Pick<AllergenProgressItem, "status" | "lastServedAt" | "lastExposureAt" | "dueAt">,
  now: Date = new Date(),
): AllergenRecency {
  if (item.status === "not_started") return { fact: null, countdown: null, due: false };
  const due = isAllergenDue(item.dueAt, now);
  return {
    fact: lastExposureLabel(item, now),
    countdown: due ? null : serveAgainByLabel(item.dueAt, now),
    due,
  };
}

/**
 * Home's nudge input (item 365): every allergen whose maintenance week is up.
 * Pure and exported so "how many are due" is one rule both the ladder rows
 * and the Home line answer with, rather than Home counting its own way.
 */
export function dueAllergens<T extends Pick<AllergenProgressItem, "dueAt">>(items: T[], now: Date = new Date()): T[] {
  return items.filter((item) => isAllergenDue(item.dueAt, now));
}

/**
 * Which manual-override action an allergen ladder row should offer, mirroring
 * the precedence `unionAllergenStatus` (shared/src/tracking.ts) already
 * pinned server-side:
 *  - A derived-established row (`overridden: false`) needs no action — the
 *    meal log already proves it, so there's nothing to mark or undo.
 *  - An override-established row (`overridden: true`) offers "Undo".
 *  - Anything else (`not_started`/`started`) offers "Mark as established".
 * Pure so the row-state -> action mapping is unit-testable without rendering.
 */
export function resolveAllergenRowAction(
  item: Pick<AllergenProgressItem, "status" | "overridden">,
): AllergenRowAction {
  if (item.status === "established") {
    return item.overridden ? "undo" : "none";
  }
  return "mark";
}

/** Human label per ladder status, shared by the ladder row and the detail page header. */
export const ALLERGEN_STATUS_LABEL: Record<AllergenStatus, string> = {
  not_started: "Not started",
  started: "Started",
  established: "Established",
};

/** Badge tone per ladder status — no new colors, the kit's existing tones only. */
export const ALLERGEN_STATUS_TONE: Record<AllergenStatus, BadgeTone> = {
  not_started: "neutral",
  started: "sunshine",
  established: "leaf",
};

/** "Aug 20, 2026" for a nullable ISO instant; an em dash when there is none. */
export function formatAllergenDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The date the parent said this allergen was established, or null when they
 * never marked it — `establishedAt` straight off the progress item.
 *
 * It used to be inferred (`overridden` AND the mark is the latest exposure),
 * which silently dropped the line for exactly the rows that most need it: a
 * marked allergen the parent has since served goes back under the maintenance
 * countdown, and the detail page was left printing only the serve. The mark's
 * date is now its own field, so there is nothing to infer — a name for the
 * field rather than a rule about it, kept so the pages read one helper.
 */
export function markedEstablishedAt(item: Pick<AllergenProgressItem, "establishedAt">): string | null {
  return item.establishedAt;
}
