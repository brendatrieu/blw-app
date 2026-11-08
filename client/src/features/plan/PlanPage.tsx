import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { localDate, planDateSchema, type PlannedMeal } from "@blw/shared";
import { BackButton } from "../../components/ui/BackButton.js";
import { ButtonLink } from "../../components/ui/Button.js";
import { EmptyState } from "../../components/ui/EmptyState.js";
import { ChevronLeftGlyph, ChevronRightGlyph, ICON_BUTTON_CLASSES } from "../../components/ui/iconButton.js";
import { PageHeader } from "../../components/ui/PageHeader.js";
import { Skeleton, SkeletonList } from "../../components/ui/Skeleton.js";
import { useActiveBaby } from "../babies/useActiveBaby.js";
import { copiedLabel } from "./copy.js";
import { CopySheet } from "./CopySheet.js";
import { useOneTapServe, usePlan } from "./hooks.js";
import { PlanMealCard } from "./PlanMealCard.js";
import {
  NEW_PLANNED_MEAL,
  WEEKDAY_INITIALS,
  addDays,
  dayHasPlan,
  dayName,
  dayOfMonth,
  deviceTimeZone,
  weekLabel,
  weekOf,
} from "./plan.js";

/** The header's two pills, Daily meals and Today (CD-Plan-Day). */
export const PLAN_PILL =
  "flex min-h-11 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3.5 text-sm font-bold whitespace-nowrap text-[var(--color-accent)] disabled:opacity-60";

function ListGlyph() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r=".8" fill="currentColor" />
      <circle cx="4.5" cy="12" r=".8" fill="currentColor" />
      <circle cx="4.5" cy="18" r=".8" fill="currentColor" />
    </svg>
  );
}

/** `?date=` when it names a real day, else null. */
function dateParam(value: string | null | undefined): string | null {
  return value && planDateSchema.safeParse(value).success ? value : null;
}

/** The day strip's sticky box (ledger 951). */
export const DAY_STRIP_ID = "plan-day-strip";

/**
 * Ledger 951: a day picked while the strip is pinned starts at its top. If
 * what follows the strip (the "Copied" line, then the first meal) has
 * scrolled under it, scroll back just enough to show it; otherwise nothing.
 */
export function revealBelowStrip(strip: Element | null): void {
  const next = strip?.nextElementSibling;
  if (!strip || !next) return;
  const hidden = strip.getBoundingClientRect().bottom - next.getBoundingClientRect().top;
  if (hidden > 0) window.scrollBy(0, -hidden);
}

/**
 * A-N3 (WCAG 2.4.11): while the strip is on the page, the page's scroll
 * padding covers the header and the strip, so a control that Tab or
 * Shift+Tab focuses is scrolled out from under them. The strip is measured
 * (and re-measured if its size changes, e.g. larger text); the header keeps
 * its own --header-height, safe area included. Returns the undo, run when
 * the page goes, so no other page keeps the padding.
 */
export function padScrollForStrip(strip: HTMLElement | null): () => void {
  if (!strip || typeof ResizeObserver === "undefined") return () => {};
  const root = document.documentElement.style;
  const observer = new ResizeObserver(() => root.setProperty("scroll-padding-top", `calc(var(--header-height) + ${strip.offsetHeight}px)`));
  observer.observe(strip);
  return () => {
    observer.disconnect();
    root.removeProperty("scroll-padding-top");
  };
}

/** The plate-style dashed button ("+ Add a meal", CD-Plan-After-Copy). */
const ADD_MEAL =
  "flex min-h-12 items-center justify-center rounded-[var(--radius-md)] border-[1.5px] border-dashed border-[var(--color-border)] text-[15px] font-semibold text-[var(--color-accent)]";

/**
 * The meal plan (ledger 904, CD-Plan-Day): a Sunday-to-Saturday week strip (969)
 * paged with ‹ ›, Today when another day is selected, and the selected day's
 * meals, then "+ Add a meal". The day lives in the URL (`?date=`, absent
 * for today), so Back from a meal (or from Daily meals, its own page since
 * ledger 924) lands on the same day. Copy to… opens a sheet; after a Copy the plan shows the first day
 * it copied to, with "Copied to {n} meals" until another day is picked.
 */
export function PlanPage() {
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  const [searchParams, setSearchParams] = useSearchParams();
  const [copying, setCopying] = useState<PlannedMeal | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const today = localDate(new Date(), deviceTimeZone());
  const selected = dateParam(searchParams.get("date")) ?? today;
  const week = weekOf(selected);
  const plan = usePlan(activeBaby?.id, week[0]!, week[6]!);
  const days = plan.data?.days ?? [];
  const day = days.find((entry) => entry.date === selected);
  const oneTap = useOneTapServe(activeBaby?.id);

  // Today needs no `?date=`, so a page left open shows the new today.
  const select = (date: string) => {
    setCopied(null);
    if (typeof document !== "undefined") revealBelowStrip(document.getElementById(DAY_STRIP_ID));
    setSearchParams(date === today ? {} : { date }, { replace: true });
  };
  // After a Copy the same for "Copied", but only once the sheet has let go
  // of the page's scroll (its unlock runs before this effect); while it
  // holds it, select's own scroll does not move the page (measured).
  useEffect(() => {
    if (copied !== null && typeof document !== "undefined") revealBelowStrip(document.getElementById(DAY_STRIP_ID));
  }, [copied]);
  // A-N3: the strip is there whenever a baby is.
  const hasStrip = Boolean(activeBaby);
  useEffect(() => (hasStrip && typeof document !== "undefined" ? padScrollForStrip(document.getElementById(DAY_STRIP_ID)) : undefined), [hasStrip]);

  return (
    <div className="flex flex-col gap-1.5 p-4">
      <PageHeader
        title="Meal Plan"
        leading={<BackButton fallback="/" />}
        action={
          <Link to="/plan/daily-meals" className={PLAN_PILL}>
            <ListGlyph />
            Daily meals
          </Link>
        }
      />

      {babyLoading && <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />}

      {!babyLoading && !activeBaby && (
        <EmptyState
          icon="👋"
          title="Add a baby first"
          description="Once a baby profile exists you can start logging foods."
          action={<ButtonLink to="/settings">Add a baby</ButtonLink>}
        />
      )}

      {activeBaby && (
        <>
          {/* CD-Plan-Day: 2px between the week row and the strip. */}
          <div className="-mb-1 flex items-center justify-between gap-2">
            <div className="-mx-2.5 flex items-center">
              <button type="button" aria-label="Previous week" className={`${ICON_BUTTON_CLASSES} text-[var(--color-icon)]`} onClick={() => select(addDays(selected, -7))}>
                <ChevronLeftGlyph />
              </button>
              <span aria-live="polite" className="text-[15px] font-bold whitespace-nowrap text-[var(--color-text)]">
                {weekLabel(week)}
              </span>
              <button type="button" aria-label="Next week" className={`${ICON_BUTTON_CLASSES} text-[var(--color-icon)]`} onClick={() => select(addDays(selected, 7))}>
                <ChevronRightGlyph />
              </button>
            </div>
            {selected !== today && (
              <button type="button" className={PLAN_PILL} onClick={() => select(today)}>
                Today
              </button>
            )}
          </div>

          {/* Ledger 951: the strip stays under the app header while the day
              scrolls; the week row above scrolls away. Sticky in flow, never
              fixed (CLAUDE.md iOS rule), at the slim header's own height
              (--header-height: its row plus the safe area). The page colour
              behind it, out to the page's edges and 6px below (given back by
              -mb-1.5, so the layout is unchanged), hides cards passing under.
              z-15: above card action rows (z-10), below the header (z-20);
              Menu, Sheet and Dialog portal to body above both. */}
          <div id={DAY_STRIP_ID} className="sticky z-[15] -mx-4 -mb-1.5 bg-[var(--color-bg)] px-4 pb-1.5" style={{ top: "var(--header-height)" }}>
            <div
              role="group"
              aria-label="Days"
              className="flex gap-0.5 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1 shadow-[var(--shadow-sm)]"
            >
              {week.map((date, index) => {
                const pressed = date === selected;
                const dot = dayHasPlan(days.find((entry) => entry.date === date));
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={pressed}
                    aria-label={dayName(date)}
                    aria-current={date === today ? "date" : undefined}
                    onClick={() => select(date)}
                    className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[var(--radius-md)] pt-1.5 pb-[5px] ${
                      pressed ? "bg-[var(--color-apricot)] text-[var(--color-apricot-ink)]" : "text-[var(--color-text)]"
                    }`}
                  >
                    <span aria-hidden="true" className={`text-xs font-semibold ${pressed ? "" : "text-[var(--color-text-muted)]"}`}>
                      {WEEKDAY_INITIALS[index]}
                    </span>
                    <span aria-hidden="true" className="text-base leading-normal font-extrabold">
                      {dayOfMonth(date)}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`size-[5px] rounded-full ${dot ? (pressed ? "bg-[var(--color-apricot-ink)]" : "bg-[var(--color-accent)]") : ""}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* CD-Plan-After-Copy: a light confirmation, no Undo (round 2). The
              live region is always there; empty, it takes back its gap. */}
          <div role="status" className={copied === null ? "-mb-1.5" : ""}>
            {copied !== null && (
              <span className="mt-0.5 inline-flex h-7 items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-success-soft)] px-2.5 text-[13px] font-bold text-[var(--color-success-soft-text)]">
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16">
                  <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {copiedLabel(copied)}
              </span>
            )}
          </div>

          {plan.isLoading && <SkeletonList count={3} />}
          {plan.isError && !plan.data && <p className="text-sm text-[var(--color-danger)]">Couldn't load the plan.</p>}

          {day && (
            <>
              <ul className="mt-0.5 flex flex-col gap-1.5">
                {day.meals.map((meal) => (
                  <PlanMealCard
                    key={meal.slotId}
                    babyId={activeBaby.id}
                    date={day.date}
                    today={plan.data?.today ?? today}
                    meal={meal}
                    onServe={() => oneTap.serve(day.date, plan.data?.today ?? today, meal)}
                    serving={oneTap.pendingSlot === meal.slotId}
                    serveFailed={oneTap.failedSlot === meal.slotId}
                    onCopy={() => setCopying(meal)}
                    daySlotIds={day.meals.map((entry) => entry.slotId)}
                  />
                ))}
              </ul>
              <Link to={`/plan/${day.date}/${NEW_PLANNED_MEAL}`} className={ADD_MEAL}>
                + Add a meal
              </Link>
            </>
          )}

          {day && (
            <CopySheet
              babyId={activeBaby.id}
              date={day.date}
              today={plan.data?.today ?? today}
              meal={copying}
              onClose={() => setCopying(null)}
              onCopied={(filled, date) => {
                setCopying(null);
                if (date) select(date);
                setCopied(filled);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
