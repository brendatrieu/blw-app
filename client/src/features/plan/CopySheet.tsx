import { useState } from "react";
import { earliestCopyDate, type PlannedMeal } from "@blw/shared";
import { Button } from "../../components/ui/Button.js";
import { ChevronLeftGlyph, ChevronRightGlyph, ICON_BUTTON_CLASSES } from "../../components/ui/iconButton.js";
import { Sheet } from "../../components/ui/Sheet.js";
import { useIsOffline } from "../../lib/online.js";
import { DeletedMark } from "../catalog/components/DeletedMark.js";
import { ItemPlate, WarningGlyph } from "../plate/PlateItemRow.js";
import { COPY_FAILED, COPY_PAST_LIMIT, allClashesLabel, clashCountLine, clashLine } from "./copy.js";
import { useCopyCheck, useCopyPlan, usePlanWeeks } from "./hooks.js";
import {
  WEEKDAY_INITIALS,
  addDays,
  allClashChoice,
  canCopyInto,
  copyClashes,
  copyFillsAny,
  copyKey,
  copyRows,
  copyTargets,
  copyWarningNotes,
  dayName,
  dayOfMonth,
  firstCopiedDate,
  plannedLines,
  setAllClashes,
  shortDay,
  toggleCopyDay,
  toggleCopySlot,
  weekLabel,
  weekOf,
  type CopyChoices,
  type CopySelection,
  type CopySource,
} from "./plan.js";

export interface CopySheetProps {
  babyId: string;
  /** The day of the meal being copied. */
  date: string;
  /** The caller's today: only the 7 days before it, or later, take a copy (936). */
  today: string;
  /** The meal being copied (it has something planned); null = closed. */
  meal: PlannedMeal | null;
  onClose: () => void;
  /** The copy is saved: how many meals got it, and the day to show. */
  onCopied: (filled: number, date: string | undefined) => void;
}

/**
 * Copy to… (814; CD-Copy-Per-Day, CD-Copy-Warnings): the meal's plate, a
 * week strip to select days in any week, then one row per selected day with
 * that day's own meals as chips. A meal that already has something planned
 * asks Keep it / Replace it (Keep it first); with two or more, the pinned
 * footer answers them all at once. A calm box says what may run out, pass
 * its Best by or not keep, from the server's dry run; nothing in it blocks
 * Copy (a past day has none: flags count from today on). The past 7 days
 * take a copy too (ledger 936; the week where they start says "You can copy
 * up to 7 days back.", 956); further back is Log meal's. Served meals
 * and the meal itself can't take the copy. The form
 * mounts with the sheet, so every opening starts empty.
 */
export function CopySheet({ meal, onClose, ...rest }: CopySheetProps) {
  return (
    <Sheet open={meal !== null} onClose={onClose} title={meal ? `Copy ${meal.name}` : undefined} showClose fixedHeight>
      {meal && <CopyForm meal={meal} {...rest} />}
    </Sheet>
  );
}

function CheckGlyph() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" className="shrink-0">
      <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LABEL = "text-sm font-semibold leading-[1.3] text-[var(--color-text)]";
const CAUTION_BOX = "rounded-[var(--radius-md)] bg-[var(--color-caution-soft)] px-3 py-2 text-[var(--color-caution-soft-text)]";

/** Keep it / Replace it: two radios in one pill (the board's switch). A
 * render helper, not a component, so the form's own tree holds the radios. */
function keepOrReplace(value: "keep" | "replace" | null, onChange: (value: "keep" | "replace") => void) {
  return (
    <div className="flex shrink-0 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0.5">
      {(["keep", "replace"] as const).map((choice) => (
        <button
          key={choice}
          type="button"
          role="radio"
          aria-checked={value === choice}
          onClick={() => onChange(choice)}
          className={`flex min-h-11 items-center rounded-[var(--radius-pill)] px-3 text-sm whitespace-nowrap ${
            value === choice
              ? "bg-[var(--color-accent)] font-bold text-[var(--color-bg-elevated)]"
              : "font-semibold text-[var(--color-text)]"
          }`}
        >
          {choice === "keep" ? "Keep it" : "Replace it"}
        </button>
      ))}
    </div>
  );
}

export function CopyForm({ babyId, date, today, meal, onCopied }: Omit<CopySheetProps, "meal" | "onClose"> & { meal: PlannedMeal }) {
  const source: CopySource = { date, slotId: meal.slotId, name: meal.name };
  const earliest = earliestCopyDate(today);
  const [monday, setMonday] = useState(() => weekOf(date > today ? date : today)[0]!);
  const [selection, setSelection] = useState<CopySelection>({});
  const [choices, setChoices] = useState<CopyChoices>({});
  const offline = useIsOffline();
  const week = weekOf(monday);
  // The week holding today-7 (936): ‹ stops here and its earlier days are off.
  const firstWeek = addDays(monday, -1) < earliest;
  const dayOf = usePlanWeeks(babyId, [monday, ...Object.keys(selection).map((day) => weekOf(day)[0]!)]);
  const rows = copyRows(selection, dayOf);
  const targets = copyTargets(selection, dayOf, source, choices);
  const clashes = copyClashes(selection, dayOf, source);
  const check = useCopyCheck(babyId, targets.length > 0 && !offline ? { source: { date, slotId: meal.slotId }, targets } : null);
  const notes = targets.length > 0 && check.data && !check.isError ? copyWarningNotes(check.data.warnings, meal) : [];
  const copy = useCopyPlan(babyId);
  const choose = (key: string, choice: "keep" | "replace") => setChoices((current) => ({ ...current, [key]: choice }));

  return (
    <>
      {/* The only part that scrolls; the clash summary and Copy stay put. */}
      <div className="scroll-momentum scroll-thin -mx-4 min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        <span id="copy-plate" className={LABEL}>
          On the plate
        </span>
        <ul aria-labelledby="copy-plate" className="mt-0.5 flex flex-col">
          {plannedLines(meal).map((line) => (
            <li key={line.key} className="flex items-center gap-2.5 py-[5px] not-first:border-t not-first:border-[var(--color-divider)]">
              <ItemPlate plates={line.plates} size={32} />
              <div className="min-w-0">
                <p className="text-[15px] leading-[1.3] font-semibold break-words text-[var(--color-text)]">
                  {line.name}
                  <DeletedMark deleted={line.deleted} />
                </p>
                {line.detail && <p className="text-[13px] leading-[1.3] text-[var(--color-text-muted)]">{line.detail}</p>}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-1 flex items-center justify-between gap-2">
          <span id="copy-days" className={LABEL}>
            Days
          </span>
          <div className="-mx-2.5 flex items-center">
            <button
              type="button"
              aria-label="Previous week"
              // Every day before this week is out of reach (936: 7 days back).
              disabled={firstWeek}
              onClick={() => setMonday(addDays(monday, -7))}
              className={`${ICON_BUTTON_CLASSES} text-[var(--color-icon)] disabled:opacity-35`}
            >
              <ChevronLeftGlyph />
            </button>
            <span aria-live="polite" className="text-[15px] font-bold whitespace-nowrap text-[var(--color-text)]">
              {weekLabel(week)}
            </span>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => setMonday(addDays(monday, 7))}
              className={`${ICON_BUTTON_CLASSES} text-[var(--color-icon)]`}
            >
              <ChevronRightGlyph />
            </button>
          </div>
        </div>
        <div
          role="group"
          aria-labelledby="copy-days"
          aria-describedby={firstWeek ? "copy-past-limit" : undefined}
          className="mt-0.5 flex gap-1"
        >
          {week.map((day, index) => {
            const pressed = day in selection;
            const plan = dayOf(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={pressed}
                aria-label={dayName(day)}
                disabled={day < earliest || !plan}
                onClick={() => plan && setSelection(toggleCopyDay(selection, plan, source))}
                className={`flex min-w-0 flex-1 flex-col items-center gap-px rounded-[var(--radius-md)] pt-1.5 pb-1 disabled:opacity-45 ${
                  pressed
                    ? "bg-[var(--color-apricot)] text-[var(--color-apricot-ink)]"
                    : "bg-[var(--color-bg-inset)] text-[var(--color-text)]"
                }`}
              >
                <span aria-hidden="true" className="text-xs font-semibold">
                  {WEEKDAY_INITIALS[index]}
                </span>
                <span aria-hidden="true" className="text-base leading-[1.25] font-extrabold">
                  {dayOfMonth(day)}
                </span>
                {pressed ? <CheckGlyph /> : <span aria-hidden="true" className="h-3.5" />}
              </button>
            );
          })}
        </div>
        {firstWeek && (
          <p id="copy-past-limit" className="mt-1 text-[13px] leading-[1.3] text-[var(--color-text-muted)]">
            {COPY_PAST_LIMIT}
          </p>
        )}

        {rows.length > 0 && <p className={`${LABEL} mt-2 mb-1`}>Meals</p>}
        {rows.map(({ date: day, day: plan, ticked }) => (
          <div key={day} role="group" aria-labelledby={`copy-day-${day}`} className="border-t border-[var(--color-divider)] pt-2.5 pb-3">
            <p id={`copy-day-${day}`} className="text-[15px] leading-[1.3] font-extrabold text-[var(--color-text)]">
              {shortDay(day)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(plan?.meals ?? []).map((entry) => {
                const on = ticked.includes(entry.slotId);
                return (
                  <button
                    key={entry.slotId}
                    type="button"
                    aria-pressed={on}
                    disabled={!canCopyInto(source, day, entry)}
                    onClick={() => setSelection(toggleCopySlot(selection, day, entry.slotId))}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3.5 text-sm text-[var(--color-text)] disabled:opacity-50 ${
                      on
                        ? "border-[var(--color-apricot-text)] bg-[var(--color-apricot-soft)] font-bold"
                        : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] font-semibold"
                    }`}
                  >
                    {on && <CheckGlyph />}
                    {entry.name}
                  </button>
                );
              })}
            </div>
            {clashes
              .filter((clash) => clash.date === day)
              .map((clash) => {
                const key = copyKey(clash.date, clash.slotId);
                return (
                  <div key={key} role="radiogroup" aria-label={`${shortDay(day)} ${clash.name}`} className={`${CAUTION_BOX} mt-2`}>
                    <p className="text-sm leading-[1.35] font-bold">{clashLine(shortDay(day), clash.name)}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="min-w-0 flex-1 text-[13px] leading-[1.3] break-words">{clash.planned}</p>
                      {keepOrReplace(choices[key] ?? "keep", (choice) => choose(key, choice))}
                    </div>
                  </div>
                );
              })}
          </div>
        ))}

        {notes.length > 0 && (
          <div role="note" className={`${CAUTION_BOX} flex flex-col gap-1.5`}>
            {notes.map((note) => (
              <div key={note.key} className="flex items-start gap-2 text-[13px] leading-[1.35]">
                <WarningGlyph />
                <div className="min-w-0">
                  {note.heading && <p className="text-sm font-bold">{note.heading}</p>}
                  <p>{note.line}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="-mx-4 shrink-0 border-t border-[var(--color-divider)] px-4 pt-2.5">
        {clashes.length >= 2 && (
          <div className={`${CAUTION_BOX} mb-2.5 pb-0.5`}>
            <p className="text-sm leading-[1.35] font-bold">{clashCountLine(clashes.length)}</p>
            <div role="radiogroup" aria-label={allClashesLabel(clashes)} className="flex items-center gap-2 py-1">
              <p className="min-w-0 flex-1 text-sm font-bold">{allClashesLabel(clashes)}</p>
              {keepOrReplace(allClashChoice(clashes, choices), (choice) => setChoices(setAllClashes(clashes, choices, choice)))}
            </div>
          </div>
        )}
        {copy.isError && !offline && (
          <p role="alert" className="pb-2 text-xs text-[var(--color-danger)]">
            {COPY_FAILED}
          </p>
        )}
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!copyFillsAny(targets, clashes) || offline || copy.isPending}
          aria-describedby={offline ? "copy-offline" : undefined}
          onClick={() =>
            copy.mutate(
              { source: { date, slotId: meal.slotId }, targets },
              { onSuccess: (result) => onCopied(result.filled, firstCopiedDate(targets, result)) },
            )
          }
        >
          {copy.isPending ? "Copying…" : "Copy"}
        </Button>
        <div role="status">
          {offline && (
            <p id="copy-offline" className="mt-1.5 text-center text-xs text-[var(--color-text-muted)]">
              You're offline.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
