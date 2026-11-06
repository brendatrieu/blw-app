import { useState } from "react";
import { localDate } from "@blw/shared";
import { Button, ButtonLink } from "../../components/ui/Button.js";
import { Card, HOME_CARD_LABEL_CLASS } from "../../components/ui/Card.js";
import { ChevronLeftGlyph, ChevronRightGlyph } from "../../components/ui/iconButton.js";
import { PAGER_BUTTON } from "../../components/ui/Pager.js";
import { useIsOffline } from "../../lib/online.js";
import { DeletedMark } from "../catalog/components/DeletedMark.js";
import { ItemPlate } from "../plate/PlateItemRow.js";
import { ServedMealLines, addMoreHref } from "../tracking/components/RatedMealLines.js";
import { useOneTapServe, usePlan } from "./hooks.js";
import { ServedChip } from "./PlanMealCard.js";
import {
  addDays,
  deviceTimeZone,
  localClock,
  mealTimeLabel,
  plannedLines,
  todaysPlanIndex,
  todaysPlanPages,
  todaysPlanStep,
  weekOf,
  type TodayPage,
} from "./plan.js";

function CheckGlyph({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16">
      <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * "Up next" on Home (SPEC §5, CD-Home-Today; titled "Today's plan" until
 * ledger 945, when Home's old Up next became Reminders): only when something is
 * planned today, or today is a saved plan day, so Home for a non-planner is
 * unchanged (CD-Home-No-Plan). It opens on the next meal (`nextPlannedMeal`);
 * ‹ › page through today's meals. On a saved day an empty meal says "Nothing
 * planned yet" with Plan this meal, its Plan a meal screen (ledger 927). Serve is the one tap; once served, the card stays on that
 * meal with "Served {time}", each served item with its stars (a tap rates
 * it), and Add more, the logged meal's Edit with Add more open (ledger 944,
 * replacing CD-After-Serve's Rate or change). With
 * everything served, the last page says so, with Plan tomorrow
 * (CD-Home-Today-Done). It reads the week the meal plan shows, so the two
 * share one cached answer.
 */
export function TodaysPlanCard({ babyId }: { babyId: string }) {
  const today = localDate(new Date(), deviceTimeZone());
  const week = weekOf(today);
  const plan = usePlan(babyId, week[0]!, week[6]!);
  const pages = todaysPlanPages(plan.data?.days.find((day) => day.date === today));
  // Nothing planned today (or not loaded, or an older server): no card.
  return pages.length === 0 ? null : <TodaysPlan babyId={babyId} today={today} pages={pages} />;
}

/** The card itself, mounted only once there is a plan to show. */
export function TodaysPlan({ babyId, today, pages }: { babyId: string; today: string; pages: TodayPage[] }) {
  const oneTap = useOneTapServe(babyId);
  const offline = useIsOffline();
  // The page the parent paged to or served (null: wherever the rule says).
  const [picked, setPicked] = useState<string | null>(null);
  const index = todaysPlanIndex(pages, picked, localClock());
  const page = pages[index]!;
  const planned = page !== "done" && page.items.length > 0 && (
    <ul aria-label="On the plate" className="mt-1 flex flex-col">
      {plannedLines(page).map((line, at) => (
        <li key={line.key} className={`flex items-center gap-2.5 py-[7px] ${at > 0 ? "border-t border-[var(--color-divider)]" : ""}`}>
          <ItemPlate plates={line.plates} size={36} />
          <div className="min-w-0">
            <p className="text-[15px] leading-[1.3] font-semibold break-words text-[var(--color-text)]">
              {line.name}
              <DeletedMark deleted={line.deleted} />
            </p>
            {line.detail && <p className="text-[13px] leading-[1.35] text-[var(--color-text-muted)]">{line.detail}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
  const step = (by: -1 | 1) => {
    const to = todaysPlanStep(pages, index, by);
    if (to !== null) setPicked(to);
  };

  return (
    <Card as="section" padding="none" aria-labelledby="up-next" className="px-4 pt-4 pb-3.5">
      <div className="flex items-center justify-between">
        <h2 id="up-next" className={HOME_CARD_LABEL_CLASS}>
          Up next
        </h2>
        {/* 44px targets that take only the label's height in the row (Reminders' pager). */}
        <div className="-my-3.5 -mr-2 flex items-center">
          {/* aria-disabled, not disabled: the Pager's reason (focus stays put at an end). */}
          <button type="button" className={PAGER_BUTTON} aria-label="Previous meal" aria-disabled={index === 0 || undefined} onClick={() => step(-1)}>
            <ChevronLeftGlyph />
          </button>
          <button
            type="button"
            className={PAGER_BUTTON}
            aria-label="Next meal"
            aria-disabled={index === pages.length - 1 || undefined}
            onClick={() => step(1)}
          >
            <ChevronRightGlyph />
          </button>
        </div>
      </div>

      {page === "done" ? (
        <>
          <div role="status" className="mt-2 flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-[var(--color-success-soft-text)]"
            >
              <CheckGlyph size={14} />
            </span>
            <span className="text-[17px] leading-[1.3] font-bold text-[var(--color-text)]">Everything planned for today is served.</span>
          </div>
          <ButtonLink to={`/plan?date=${addDays(today, 1)}`} variant="quiet" size="lg" className="mt-3 w-full">
            Plan tomorrow
          </ButtonLink>
        </>
      ) : (
        <>
          <div aria-live="polite" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xl leading-[1.3] font-extrabold break-words text-[var(--color-text)]">{page.name}</span>
            {page.time && <span className="text-sm font-semibold whitespace-nowrap text-[var(--color-text-muted)]">{mealTimeLabel(page.time)}</span>}
            {page.served && <ServedChip servedAt={page.served.servedAt} />}
          </div>
          {page.served ? (
            // Ledger 944: what was served, each item with its stars (a tap
            // rates it on the logged meal); the plan's lines until it loads.
            <div className="mt-1">
              <ServedMealLines babyId={babyId} mealId={page.served.mealId} look="home" fallback={planned} />
            </div>
          ) : page.items.length > 0 ? (
            planned
          ) : (
            <p className="mt-1 text-[15px] leading-[1.3] text-[var(--color-text-muted)]">Nothing planned yet</p>
          )}
          {page.served ? (
            // Ledger 944: the logged meal's Edit, with Add more already open.
            <ButtonLink to={addMoreHref(page.served.mealId)} variant="quiet" size="lg" className="mt-2.5 w-full">
              Add more
            </ButtonLink>
          ) : page.items.length === 0 ? (
            // Ledger 927: the meal's Plan a meal, as on the Meal Plan.
            <ButtonLink to={`/plan/${today}/${page.slotId}`} size="lg" className="mt-2.5 w-full">
              Plan this meal
            </ButtonLink>
          ) : (
            <div className="mt-2.5 flex flex-col">
              <Button
                type="button"
                size="lg"
                aria-label={`Serve ${page.name}`}
                aria-describedby={offline ? "up-next-offline" : undefined}
                disabled={oneTap.pendingSlot === page.slotId || offline}
                onClick={() => {
                  // The card stays on this meal once it is served (CD-After-Serve).
                  setPicked(page.slotId);
                  oneTap.serve(today, today, page);
                }}
                className="w-full"
              >
                {oneTap.pendingSlot === page.slotId ? "Serving…" : "Serve"}
              </Button>
              {offline && (
                <p id="up-next-offline" className="mt-1.5 text-center text-xs text-[var(--color-text-muted)]">
                  You're offline.
                </p>
              )}
              {!offline && oneTap.failedSlot === page.slotId && (
                <p role="alert" className="mt-1.5 text-center text-xs text-[var(--color-danger)]">
                  Couldn't serve — try again.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
