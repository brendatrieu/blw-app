import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import { Navigate } from "react-router-dom";
import { PLAN_NAME_MAX, localDate, placeByTime, type DailyMeal } from "@blw/shared";
import { BackButton, useBackNavigate } from "../../components/ui/BackButton.js";
import { Button } from "../../components/ui/Button.js";
import { CloseGlyph, ICON_BUTTON_CLASSES } from "../../components/ui/iconButton.js";
import { PageHeader } from "../../components/ui/PageHeader.js";
import { SkeletonList } from "../../components/ui/Skeleton.js";
import { focusFieldById } from "../../lib/forms.js";
import { useIsOffline } from "../../lib/online.js";
import { useActiveBaby } from "../babies/useActiveBaby.js";
import { usePlan, useSaveDailyMeals } from "./hooks.js";
import {
  canAddDailyMeal,
  canRemoveDailyMeal,
  dailyMealErrors,
  dailyMealRows,
  deviceTimeZone,
  dragTarget,
  mealTimeLabel,
  moveRow,
  toDailyMealsInput,
  weekOf,
  type DailyMealRow,
} from "./plan.js";

/**
 * Daily meals (804, CD-Daily-Meals; a page since ledger 924): the meals every
 * new day starts with, each with an optional time. Rename in place, add,
 * remove, and reorder by the handle (drag it, or arrow keys on it). Days
 * already planned, and past days, keep their own meals. Opened from the Meal
 * Plan's header. Save saves and goes back to the plan (the week it was on);
 * Back leaves without saving, no question asked, like Log meal. A plain
 * route, so a native shell can push it like any screen.
 */
export function DailyMealsPage() {
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  const today = localDate(new Date(), deviceTimeZone());
  const week = weekOf(today);
  // Today's week: the same cache entry the plan opens on.
  const plan = usePlan(activeBaby?.id, week[0]!, week[6]!);
  const goBack = useBackNavigate("/plan");

  if (!babyLoading && !activeBaby) return <Navigate to="/plan" replace />;
  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Daily meals" leading={<BackButton fallback="/plan" />} />
      {/* Only the list as saved now: a copy restored from the offline cache
          waits for its refetch (offline the fetch pauses, so it shows). */}
      {plan.data && activeBaby && !plan.isFetching ? (
        <DailyMealsForm babyId={activeBaby.id} meals={plan.data.dailyMeals} onDone={goBack} />
      ) : plan.isError ? (
        <p className="text-sm text-[var(--color-danger)]">Couldn't load the plan.</p>
      ) : (
        <SkeletonList count={4} />
      )}
    </div>
  );
}

function GripGlyph() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      {[6, 12, 18].map((y) => (
        <g key={y}>
          <circle cx="9" cy={y} r="1.6" />
          <circle cx="15" cy={y} r="1.6" />
        </g>
      ))}
    </svg>
  );
}

/**
 * The platform's own time picker, laid invisibly over a field that shows the
 * time in the app's format (Daily meals, Plan a meal): tapping anywhere on
 * the field opens it. Clearing a time is the picker's own (iOS: Reset).
 */
export function nativeTimeInput(value: string | null, onChange: (time: string | null) => void) {
  return {
    type: "time",
    value: value ?? "",
    onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value.slice(0, 5) || null),
    onClick: (event: MouseEvent<HTMLInputElement>) => {
      // Desktop browsers open the picker only from its icon.
      try {
        event.currentTarget.showPicker();
      } catch {
        // Already open, or not offered: the field still works.
      }
    },
    // A field even inside a row that selects nothing (910).
    className: "absolute inset-0 h-full w-full cursor-pointer opacity-0 select-text [-webkit-touch-callout:default]",
  } as const;
}

/** The plate's "+ Add more" look (CD boards' dashed button). */
const ADD_BUTTON =
  "flex min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] border-[1.5px] border-dashed border-[var(--color-border)] text-[15px] font-semibold text-[var(--color-accent)] disabled:opacity-60";

const FIELD_BOX = "h-11 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text)]";

/** A row never starts a text selection or the iOS callout on a long press
 * (910: holding the handle to drag selected "Add time"); its fields still
 * do, as fields. The row being dragged lifts: a shadow and a slight scale,
 * eased in and out, instant under reduced motion. */
const ROW =
  "relative flex flex-col py-1 select-none [-webkit-touch-callout:none] not-first:border-t not-first:border-[var(--color-divider)] transition-[scale,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)] motion-reduce:transition-none";
const ROW_LIFTED = "z-10 scale-[1.03] rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)]";
const FIELD_TEXT = "select-text [-webkit-touch-callout:default]";

export function DailyMealsForm({ babyId, meals, onDone }: { babyId: string; meals: readonly DailyMeal[]; onDone: () => void }) {
  const [rows, setRows] = useState<DailyMealRow[]>(() => dailyMealRows(meals));
  const [attempted, setAttempted] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const added = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);
  // The control to focus once React has put the rows in their new order: a
  // moved row's handle (moving a node can drop its focus), or a new name.
  const focusNext = useRef<string | null>(null);
  const idPrefix = useId();
  const save = useSaveDailyMeals(babyId);
  const offline = useIsOffline();

  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    focusNext.current = null;
    focusFieldById(id);
  });

  const fieldId = (row: DailyMealRow, part: "name" | "move" | "time" | "error") => `${idPrefix}-${row.key}-${part}`;
  const errors = attempted ? dailyMealErrors(rows) : {};
  const update = (key: string, patch: Partial<DailyMealRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  // Ledger 925: a time set or changed places its meal by the clock at once;
  // if that moves the row, its time field keeps (or gets back) the focus.
  const setTime = (row: DailyMealRow, time: string | null) => {
    const at = rows.indexOf(row);
    const timed = rows.map((entry) => (entry.key === row.key ? { ...entry, time } : entry));
    const placed = placeByTime(timed, at);
    if (placed[at] !== timed[at]) focusNext.current = fieldId(row, "time");
    setRows(placed);
  };
  const move = (row: DailyMealRow, to: number) => {
    const from = rows.indexOf(row);
    if (from === to || to < 0 || to >= rows.length) return;
    focusNext.current = fieldId(row, "move");
    setRows(moveRow(rows, from, to));
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    const invalid = rows.find((row) => dailyMealErrors(rows)[row.key]);
    if (invalid) {
      focusFieldById(fieldId(invalid, "name"));
      return;
    }
    save.mutate(toDailyMealsInput(rows), { onSuccess: onDone });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-2.5">
      <p className="-mt-1 text-[15px] leading-[1.45] text-[var(--color-text-muted)]">
        New days start with these meals. Days you've already planned, and past days, keep the meals they have. Times are optional.
      </p>

      <ul
        ref={listRef}
        className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-0.5 pr-1 pl-0.5 shadow-[var(--shadow-sm)]"
      >
        {rows.map((row, index) => {
          const error = errors[row.key];
          return (
            <li key={row.key} className={`${ROW} ${dragging === row.key ? ROW_LIFTED : ""}`}>
              {/* 2px gaps under 360 so the name keeps room for "Breakfast". */}
              <div className="flex items-center gap-0.5 min-[360px]:gap-1">
                <button
                  type="button"
                  id={fieldId(row, "move")}
                  aria-label={`Move ${row.name}`}
                  className={`${ICON_BUTTON_CLASSES} cursor-grab touch-none text-[var(--color-icon)]`}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                    event.preventDefault();
                    move(row, index + (event.key === "ArrowUp" ? -1 : 1));
                  }}
                  onPointerDown={(event) => {
                    const list = listRef.current;
                    if (event.button !== 0 || !list) return;
                    // On the window, not captured by the handle: reordering
                    // moves the row's node, which drops a pointer capture.
                    const onMove = (moved: PointerEvent) => {
                      const to = dragTarget(moved.clientY, [...list.children].map((item) => item.getBoundingClientRect()));
                      setRows((current) => moveRow(current, current.findIndex((entry) => entry.key === row.key), to));
                    };
                    const onEnd = () => {
                      setDragging(null);
                      window.removeEventListener("pointermove", onMove);
                      window.removeEventListener("pointerup", onEnd);
                      window.removeEventListener("pointercancel", onEnd);
                    };
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onEnd);
                    window.addEventListener("pointercancel", onEnd);
                    setDragging(row.key);
                  }}
                >
                  <GripGlyph />
                </button>
                <input
                  id={fieldId(row, "name")}
                  aria-label="Meal name"
                  value={row.name}
                  maxLength={PLAN_NAME_MAX}
                  autoComplete="off"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? fieldId(row, "error") : undefined}
                  onChange={(event) => update(row.key, { name: event.target.value })}
                  className={`${FIELD_BOX} ${FIELD_TEXT} min-w-0 flex-1 px-2 text-base font-bold outline-none focus:border-[var(--color-accent)] ${
                    error ? "border-[var(--color-danger)]" : ""
                  }`}
                />
                {/* The platform's own time picker under the board's field:
                    tapping anywhere on it opens the picker. 88px, not the
                    board's 104: "12:00 PM" fits, and at 320 the name keeps
                    what it can. */}
                <label
                  className={`${FIELD_BOX} relative flex w-[88px] shrink-0 items-center px-2.5 text-[15px] font-semibold whitespace-nowrap has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]`}
                >
                  <span aria-hidden="true" className={row.time ? "" : "font-medium text-[var(--color-text-muted)]"}>
                    {row.time ? mealTimeLabel(row.time) : "Add time"}
                  </span>
                  <input id={fieldId(row, "time")} aria-label={`Time for ${row.name}`} {...nativeTimeInput(row.time, (time) => setTime(row, time))} />
                </label>
                <button
                  type="button"
                  aria-label={`Remove ${row.name}`}
                  disabled={!canRemoveDailyMeal(rows)}
                  onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}
                  className={`${ICON_BUTTON_CLASSES} disabled:cursor-not-allowed`}
                >
                  <CloseGlyph />
                </button>
              </div>
              {error && (
                <p id={fieldId(row, "error")} className="pt-1 pl-12 text-xs text-[var(--color-danger)]">
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className={ADD_BUTTON}
        disabled={!canAddDailyMeal(rows)}
        onClick={() => {
          const row: DailyMealRow = { key: `added-${(added.current += 1)}`, name: "", time: null };
          focusNext.current = fieldId(row, "name");
          setRows((current) => [...current, row]);
        }}
      >
        + Add a meal
      </button>

      {save.isError && !offline && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}

      {/* No gap: the empty live region must add no space while online. */}
      <div className="flex flex-col">
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={save.isPending || offline}
          aria-describedby={offline ? "daily-meals-offline" : undefined}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <div role="status">
          {offline && (
            <p id="daily-meals-offline" className="mt-1.5 text-center text-xs text-[var(--color-text-muted)]">
              You're offline.
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
