import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { localDate, planDateSchema } from "@blw/shared";
import { BackButton } from "../../components/ui/BackButton.js";
import { ButtonLink } from "../../components/ui/Button.js";
import { EmptyState } from "../../components/ui/EmptyState.js";
import { ChevronLeftGlyph, ChevronRightGlyph, ICON_BUTTON_CLASSES } from "../../components/ui/iconButton.js";
import { PageHeader } from "../../components/ui/PageHeader.js";
import { Skeleton, SkeletonList } from "../../components/ui/Skeleton.js";
import { useActiveBaby } from "../babies/useActiveBaby.js";
import { DailyMealsSheet } from "./DailyMealsSheet.js";
import { usePlan } from "./hooks.js";
import { PlanMealCard } from "./PlanMealCard.js";
import { WEEKDAY_INITIALS, addDays, dayHasPlan, dayName, dayOfMonth, deviceTimeZone, weekLabel, weekOf } from "./plan.js";

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

/**
 * The meal plan (ledger 904, CD-Plan-Day): a Monday-to-Sunday week strip
 * paged with ‹ ›, Today when another day is selected, and the selected day's
 * meals. The day lives in the URL (`?date=`, absent for today), so Back from
 * a meal lands on the same day. Daily meals opens its own sheet.
 */
export function PlanPage() {
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  const [searchParams, setSearchParams] = useSearchParams();
  // Until step 4.2 gives /plan/:date/:slotId its own page, that path shows its day here.
  const { date: pathDate } = useParams();
  const [dailyMealsOpen, setDailyMealsOpen] = useState(false);
  const today = localDate(new Date(), deviceTimeZone());
  const selected = dateParam(searchParams.get("date")) ?? dateParam(pathDate) ?? today;
  const week = weekOf(selected);
  const plan = usePlan(activeBaby?.id, week[0]!, week[6]!);
  const days = plan.data?.days ?? [];
  const day = days.find((entry) => entry.date === selected);

  // Today needs no `?date=` (so a page left open shows the new today), except
  // on a meal's path, whose own date would win.
  const select = (date: string) => setSearchParams(date === today && !pathDate ? {} : { date }, { replace: true });

  return (
    <div className="flex flex-col gap-1.5 p-4">
      <PageHeader
        title="Meal plan"
        leading={<BackButton fallback="/" />}
        action={
          <button type="button" className={PLAN_PILL} disabled={!plan.data} onClick={() => setDailyMealsOpen(true)}>
            <ListGlyph />
            Daily meals
          </button>
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

          {plan.isLoading && <SkeletonList count={3} />}
          {plan.isError && !plan.data && <p className="text-sm text-[var(--color-danger)]">Couldn't load the plan.</p>}

          {day && (
            <ul className="mt-0.5 flex flex-col gap-1.5">
              {day.meals.map((meal) => (
                <PlanMealCard key={meal.slotId} babyId={activeBaby.id} date={day.date} today={plan.data?.today ?? today} meal={meal} />
              ))}
            </ul>
          )}

          {plan.data && (
            <DailyMealsSheet
              babyId={activeBaby.id}
              meals={plan.data.dailyMeals}
              open={dailyMealsOpen}
              onClose={() => setDailyMealsOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
