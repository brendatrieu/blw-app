import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { localDate, upNextMode } from "@blw/shared";
import { Button, ButtonLink } from "../../components/ui/Button.js";
import { Card, HOME_CARD_LABEL_CLASS } from "../../components/ui/Card.js";
import { ChevronLeftGlyph, ChevronRightGlyph } from "../../components/ui/iconButton.js";
import { PAGER_BUTTON, PageTrack, pageWindow, usePagedTrack, type PagedTrack } from "../../components/ui/Pager.js";
import { slideIndexFromScroll } from "../../lib/scrollTrack.js";
import { fitToRestingSlide, holdHeight, watchSettle, type SettleWatch } from "../../lib/trackSettle.js";
import { useIsOffline } from "../../lib/online.js";
import { track } from "../../lib/usage/track.js";
import { useDismissPlanOffer, usePreferences } from "../tour/hooks.js";
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
  todaysPlanKey,
  todaysPlanPages,
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
 * ledger 945, when Home's old Up next became Reminders), once today's plan
 * has loaded. With nothing planned today (a day that only follows Daily
 * meals, or a saved day with no meals) it is one page: "Nothing planned for
 * today." and Plan today, the Meal Plan on today (ledger 948, for every
 * family for now; an opt-in is parked, 949). It opens on the next meal (`nextPlannedMeal`);
 * ‹ › page through today's meals. On a saved day an empty meal says "Nothing
 * planned yet" with Plan this meal, its Plan a meal screen (ledger 927). Serve is the one tap; once served, the card stays on that
 * meal with "Served {time}", each served item with its stars (a tap rates
 * it), and Add more, the logged meal's Edit with Add more open (ledger 944,
 * replacing CD-After-Serve's Rate or change). With
 * everything served, the last page says so, with Plan tomorrow
 * (CD-Home-Today-Done). It reads the week the meal plan shows, so the two
 * share one cached answer.
 *
 * Ledger 995 changes the empty page (`upNextMode`): an account that has never
 * planned food, for any baby, sees the one-time offer instead ("Plan meals
 * ahead, if you like.", Plan today, Not now), and after Not now no card.
 */
export function TodaysPlanCard({ babyId }: { babyId: string }) {
  const today = localDate(new Date(), deviceTimeZone());
  const week = weekOf(today);
  const plan = usePlan(babyId, week[0]!, week[6]!);
  const pages = todaysPlanPages(plan.data?.days?.find((day) => day.date === today));
  const preferences = usePreferences().data;
  // Not loaded, failed (an older server 404s the plan route), or an answer
  // without days: no card (no flash of the empty page), never the error page.
  // Preferences not known yet: no offer either (ledger 995).
  const mode = upNextMode(pages, plan.data?.accountHasPlannedFood, preferences ? preferences.planOfferDismissedAt != null : undefined);
  if (mode === "hidden") return null;
  return mode === "offer" ? <PlanOffer today={today} /> : <TodaysPlan babyId={babyId} today={today} pages={pages} />;
}

/** `plan_offer_shown` goes once per app load, however often Home remounts. */
let offerShownSent = false;

/** Ledger 995: the one-time planning offer, in 948's card look. */
export function PlanOffer({ today }: { today: string }) {
  const dismiss = useDismissPlanOffer();
  useEffect(() => {
    if (offerShownSent) return;
    offerShownSent = true;
    track("plan_offer_shown", {});
  }, []);

  return (
    <Card as="section" padding="none" aria-labelledby="up-next" className="px-4 pt-4 pb-3.5">
      <h2 id="up-next" className={HOME_CARD_LABEL_CLASS}>
        Up next
      </h2>
      <p className="mt-2 text-[17px] leading-[1.3] font-bold text-[var(--color-text)]">Plan meals ahead, if you like.</p>
      <div className="mt-3 flex gap-2.5">
        <ButtonLink
          to={`/plan?date=${today}`}
          variant="quiet"
          size="lg"
          className="flex-1"
          onClick={() => track("plan_offer_answered", { answer: "plan_today" })}
        >
          Plan today
        </ButtonLink>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="flex-1"
          onClick={() => {
            track("plan_offer_answered", { answer: "not_now" });
            dismiss.mutate();
          }}
        >
          Not now
        </Button>
      </div>
    </Card>
  );
}

/**
 * The card itself, mounted only once there is a plan to show. Ledger 1142a:
 * each page is a slide on Home's swipe track (`PageTrack`, as the Food log
 * and Reminders), so a swipe follows the finger and snaps like theirs; ‹ ›
 * scroll that same track. Ledger 1142c: the card is as tall as the page it
 * shows, but only changes height once the track has settled on that page
 * (`watchSettle`), never mid-swipe; then it eases there. The track itself
 * keeps its tallest-page height inside a clip box, so the scroller never
 * resizes (1120's lesson). The page shown is still `todaysPlanIndex`:
 * the track is put there instantly (on load, or when the plan changes under
 * it), and a page the parent swipes or steps to becomes `picked`.
 */
export function TodaysPlan({ babyId, today, pages }: { babyId: string; today: string; pages: TodayPage[] }) {
  const oneTap = useOneTapServe(babyId);
  const offline = useIsOffline();
  // The page the parent paged to or served (null: wherever the rule says).
  const [picked, setPicked] = useState<string | null>(null);
  const index = todaysPlanIndex(pages, picked, localClock());
  const track = usePagedTrack(pages.length, 1);
  // The page the track's scroll position last showed.
  const scrolled = useRef(0);
  useLayoutEffect(() => {
    const el = track.trackRef.current;
    if (!el || index === scrolled.current) return;
    scrolled.current = index;
    el.scrollLeft = index * el.clientWidth;
  });
  // Ledger 1142c: the clip box takes the resting page's height once the track settles.
  const clip = useRef<HTMLDivElement | null>(null);
  const fit = () => {
    if (track.trackRef.current && clip.current) fitToRestingSlide(track.trackRef.current, clip.current);
  };
  const settle = useRef<SettleWatch | null>(null);
  settle.current ??= watchSettle(fit);
  const watch = settle.current;
  // First placement and any render while settled (a served meal's lines loading, offline) fit at once, before paint.
  useLayoutEffect(() => {
    if (watch.idle()) fit();
  });
  // A page whose content reflows while settled (rotation, lines arriving after
  // render). A timer left running at unmount finds no clip box and does nothing.
  useEffect(() => {
    const el = track.trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (watch.idle()) fit();
    });
    for (const slide of Array.from(el.children)) observer.observe(slide);
    return () => observer.disconnect();
  }, [pages.length]); // the slides change with the page count only
  const paged: PagedTrack = {
    ...track,
    // `inert` follows the page shown, before the first scroll event too.
    pages: pageWindow(pages.length, index, 1),
    onTouchStart: () => {
      track.onTouchStart();
      watch.touchStart();
      if (clip.current) holdHeight(clip.current);
    },
    onScroll: (event) => {
      track.onScroll(event);
      watch.scrolled();
      const el = event.currentTarget;
      scrolled.current = slideIndexFromScroll(el.scrollLeft, el.clientWidth, pages.length);
      if (scrolled.current !== index) setPicked(todaysPlanKey(pages[scrolled.current]!));
    },
  };
  const shown = pages[index]!;

  return (
    <Card as="section" padding="none" aria-labelledby="up-next" className="pt-4">
      <div className="flex items-center justify-between px-4">
        <h2 id="up-next" className={HOME_CARD_LABEL_CLASS}>
          Up next
        </h2>
        {/* The rows sit still on their slides, so this says which page a swipe or ‹ › reached (the Pager's range, item 775). */}
        <p aria-live="polite" className="sr-only">
          {shown === "done"
            ? "Everything planned for today is served."
            : shown === "empty"
              ? ""
              : shown.time
                ? `${shown.name}, ${mealTimeLabel(shown.time)}`
                : shown.name}
        </p>
        {/* 44px targets that take only the label's height in the row (Reminders' pager). */}
        <div className="-my-3.5 -mr-2 flex items-center">
          {/* aria-disabled, not disabled: the Pager's reason (focus stays put at an end). */}
          <button
            type="button"
            className={PAGER_BUTTON}
            aria-label="Previous meal"
            aria-disabled={index === 0 || undefined}
            onClick={() => {
              if (index > 0) track.goTo(index - 1);
            }}
          >
            <ChevronLeftGlyph />
          </button>
          <button
            type="button"
            className={PAGER_BUTTON}
            aria-label="Next meal"
            aria-disabled={index === pages.length - 1 || undefined}
            onClick={() => {
              if (index < pages.length - 1) track.goTo(index + 1);
            }}
          >
            <ChevronRightGlyph />
          </button>
        </div>
      </div>
      {/* No bleed: a slide's px-4 pb-3.5 is the card's old padding, so a page slides out at the card's edge. */}
      {/* Ledger 1142c: clips the track to the resting page; a taller page swiped in shows cut off until it settles. */}
      <div
        ref={clip}
        onTouchEnd={(event) => event.touches.length === 0 && watch.touchEnd()}
        onTouchCancel={(event) => event.touches.length === 0 && watch.touchEnd()}
        className="overflow-clip transition-[height] duration-[var(--duration-base)] ease-[var(--ease-out)] motion-reduce:transition-none"
      >
        <PageTrack
          track={paged}
          items={pages}
          renderSlide={([page]) => (
            <div className="px-4 pb-3.5">
              <UpNextPage babyId={babyId} today={today} page={page!} oneTap={oneTap} offline={offline} onServe={setPicked} />
            </div>
          )}
        />
      </div>
    </Card>
  );
}

/** One page of Up next: a meal, the done page, or the empty page. */
function UpNextPage({
  babyId,
  today,
  page,
  oneTap,
  offline,
  onServe,
}: {
  babyId: string;
  today: string;
  page: TodayPage;
  oneTap: ReturnType<typeof useOneTapServe>;
  offline: boolean;
  onServe: (slotId: string) => void;
}) {
  const planned = typeof page !== "string" && page.items.length > 0 && (
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
  return page === "empty" ? (
    // Ledger 948: nothing planned today; styled like the done page.
    <>
      <p className="mt-2 text-[17px] leading-[1.3] font-bold text-[var(--color-text)]">Nothing planned for today.</p>
      <ButtonLink to={`/plan?date=${today}`} variant="quiet" size="lg" className="mt-3 w-full">
        Plan today
      </ButtonLink>
    </>
  ) : page === "done" ? (
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
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
            aria-describedby={offline ? `up-next-offline-${page.slotId}` : undefined}
            disabled={oneTap.pendingSlot === page.slotId || offline}
            onClick={() => {
              // The card stays on this meal once it is served (CD-After-Serve).
              onServe(page.slotId);
              oneTap.serve(today, today, page);
            }}
            className="w-full"
          >
            {oneTap.pendingSlot === page.slotId ? "Serving…" : "Serve"}
          </Button>
          {offline && (
            <p id={`up-next-offline-${page.slotId}`} className="mt-1.5 text-center text-xs text-[var(--color-text-muted)]">
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
  );
}
