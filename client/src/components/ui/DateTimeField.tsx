import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Sheet } from "./Sheet.js";
import { Button } from "./Button.js";

/** Height of one wheel row in px. Also the scroll-snap step. */
export const WHEEL_ROW_HEIGHT = 44;
/** Visible height of a wheel column (5 rows), used to center the highlight band. */
export const WHEEL_VISIBLE_HEIGHT = WHEEL_ROW_HEIGHT * 5;
/** Vertical padding so the first/last row can still scroll to the centered highlight band. */
export const WHEEL_PADDING = (WHEEL_VISIBLE_HEIGHT - WHEEL_ROW_HEIGHT) / 2;

const DEFAULT_DAYS_BACK = 90;

export interface DateOption {
  /** Days before "now"'s calendar day. 0 = today, 1 = yesterday, etc. */
  dayIndex: number;
  label: string;
  year: number;
  month: number; // 0-11
  date: number; // day of month
}

/** Local-time calendar-day difference between two dates (DST-safe: never adds raw milliseconds). */
function calendarDayDiff(now: Date, other: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(other.getFullYear(), other.getMonth(), other.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * Builds the date wheel's options: "Today" at index 0 (the newest end),
 * "Yesterday" at 1, then weekday + month + day labels going back `daysBack`
 * days. Never includes a future date. Built with local-time date-field
 * arithmetic (year/month/day, not raw millisecond addition) so month
 * rollovers and DST transitions land on the correct calendar day.
 */
export function buildDateOptions(now: Date, daysBack: number = DEFAULT_DAYS_BACK): DateOption[] {
  const options: DateOption[] = [];
  for (let dayIndex = 0; dayIndex <= daysBack; dayIndex++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayIndex);
    const label =
      dayIndex === 0
        ? "Today"
        : dayIndex === 1
          ? "Yesterday"
          : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    options.push({ dayIndex, label, year: d.getFullYear(), month: d.getMonth(), date: d.getDate() });
  }
  return options;
}

/**
 * Extends `daysBack` so a preset `value` older than the default window is
 * never out of range — the date wheel must always be able to show whatever
 * value it opens with. Computed here (not by callers) so every `DateTimeField`
 * consumer gets a correctly-ranged wheel "for free" when it presets an old
 * value, without having to compute the extension itself.
 */
export function resolveDaysBack(daysBack: number, value: Date, now: Date): number {
  return Math.max(daysBack, calendarDayDiff(now, value) + 1);
}

export interface SplitDateTime {
  dayIndex: number;
  hour12: number; // 1-12
  minute: number; // 0-59
  meridiem: "AM" | "PM";
}

/** Decomposes a `Date` into the wheel picker's draft shape, relative to `now`'s calendar day. */
export function splitDateTime(date: Date, now: Date): SplitDateTime {
  const dayIndex = calendarDayDiff(now, date);
  const hour24 = date.getHours();
  const meridiem: "AM" | "PM" = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { dayIndex, hour12, minute: date.getMinutes(), meridiem };
}

/**
 * Recombines a wheel-picker draft into a concrete `Date`, anchored to `now`'s
 * calendar day minus `dayIndex`. Handles the 12h->24h edges explicitly:
 * 12 AM is hour 0, 12 PM is hour 12 (a naive `hour12 + (PM ? 12 : 0)` would
 * put 12 AM at hour 12 and 12 PM at hour 24).
 */
export function combineDateTime(parts: SplitDateTime, now: Date): Date {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - parts.dayIndex);
  const hour24 = (parts.hour12 % 12) + (parts.meridiem === "PM" ? 12 : 0);
  base.setHours(hour24, parts.minute, 0, 0);
  return base;
}

/**
 * Presets the wheel draft from `value`, relative to `now`. A future-dated
 * `value` (dayIndex < 0 — e.g. clock skew or a manually-posted future
 * timestamp) can't be represented on the backward-only date wheel, so the
 * draft opens at `now` instead of an out-of-range negative index.
 */
export function resolvePresetDraft(value: Date, now: Date): SplitDateTime {
  const split = splitDateTime(value, now);
  return split.dayIndex < 0 ? splitDateTime(now, now) : split;
}

/**
 * Clamps `date` to `now` when it is later than `now`. Used to commit the
 * wheel draft: the hour/minute wheels reach 23:59 even on the "Today"
 * option, so a drafted future time must be pulled back to the open-anchored
 * "now" rather than committed as-is.
 */
export function clampToNow(date: Date, now: Date): Date {
  return date.getTime() > now.getTime() ? now : date;
}

/**
 * Truncates `date` (defaults to the real current time) down to the minute —
 * zeroes seconds and milliseconds. Matches the granularity the old native
 * `datetime-local`/`date` inputs serialized at, so a picker whose Sheet is
 * never opened still submits the same value those inputs would have.
 */
export function nowAtMinute(date?: Date): Date {
  const base = date ?? new Date();
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), base.getHours(), base.getMinutes(), 0, 0);
}

/** "Today, 10:36 AM" / "Yesterday, 6:15 PM" / "Sun, Aug 24, 6:15 PM". */
export function formatDateTimeLabel(date: Date, now: Date): string {
  const dayIndex = calendarDayDiff(now, date);
  const dateLabel =
    dayIndex === 0
      ? "Today"
      : dayIndex === 1
        ? "Yesterday"
        : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateLabel}, ${timeLabel}`;
}

/**
 * Maps a wheel's raw `scrollTop` to a selected row index, given the fixed
 * row height and item count. Pure so the scroll-settle handler can be a thin
 * wrapper and this arithmetic is unit-testable without jsdom/scroll events.
 * Clamps to the valid range so an overscrolled edge still resolves sanely.
 */
export function indexFromScrollTop(scrollTop: number, rowHeight: number, count: number): number {
  if (count <= 0) return 0;
  const index = Math.round(scrollTop / rowHeight);
  return Math.min(Math.max(index, 0), count - 1);
}

/**
 * Maps a dayIndex (0 = today, the data model's newest end) to its visual row
 * position in the reversed date wheel (oldest at row 0/top, "Today" at the
 * last row/bottom). Its own inverse given the same `count`, so the identical
 * formula also converts a row back to a dayIndex — see `rowToDayIndex`.
 */
export function dayIndexToRow(dayIndex: number, count: number): number {
  return count - 1 - dayIndex;
}

/** Inverse of `dayIndexToRow` (same formula — the mapping is an involution). */
export function rowToDayIndex(row: number, count: number): number {
  return count - 1 - row;
}

/** Number of back-to-back copies a `loop` wheel column renders, so momentum
 * scrolling can never outrun the buffer and hit a real (non-wrapping) edge. */
export const LOOP_REPEAT_COUNT = 5;

/** Normalizes any integer (including negative offsets) into `[0, count)`. */
export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/**
 * The "true index -> scrollTop" direction for a loop column: the absolute
 * (un-modulo'd) row, centered in the middle of `copies` back-to-back
 * repetitions of `count` items, that corresponds to `trueIndex`. Used both to
 * preset the initial scroll position and as the re-center target after a
 * settle (via `recenterRow`).
 */
export function centeredRowForIndex(trueIndex: number, count: number, copies: number = LOOP_REPEAT_COUNT): number {
  return Math.floor(copies / 2) * count + wrapIndex(trueIndex, count);
}

/**
 * The "scrollTop -> true index" direction for a loop column: given the
 * absolute row a scroll settled on (from `indexFromScrollTop` against the
 * full repeated-row count), returns the real 0-based item index — never a
 * copy-relative row — for `onIndexChange`/ARIA reporting.
 */
export function trueIndexFromRow(row: number, count: number): number {
  return wrapIndex(row, count);
}

/**
 * The absolute row to silently re-center a settled loop column to: the same
 * true index, back in the middle copy. Composing `trueIndexFromRow` then
 * `centeredRowForIndex` makes the "re-centering never changes the selected
 * value" guarantee directly testable (same true index in and out).
 */
export function recenterRow(settledRow: number, count: number, copies: number = LOOP_REPEAT_COUNT): number {
  return centeredRowForIndex(trueIndexFromRow(settledRow, count), count, copies);
}

/**
 * The per-keystroke arithmetic for a loop column's ArrowUp/ArrowDown handler
 * (item 52). Rather than accumulating `delta` onto the previous absolute row
 * (which can walk arbitrarily far from the middle copy under a long run of
 * unsettled key-repeats), this ALWAYS re-derives from the current true index
 * and re-centers into the middle copy on every single step. That makes
 * "absRow stays in the middle band" an invariant of the formula itself
 * (`centeredRowForIndex` is always in-band by construction) rather than
 * something that only holds after an eventual settle — so no run of steps,
 * however long or fast, can push `absoluteRowRef` outside the safe band or
 * leave a later settle to change the selected value.
 */
export function stepLoopIndex(
  prevAbsRow: number,
  direction: number,
  count: number,
  copies: number = LOOP_REPEAT_COUNT,
): { trueIndex: number; absRow: number } {
  const trueIndex = wrapIndex(trueIndexFromRow(prevAbsRow, count) + direction, count);
  return { trueIndex, absRow: centeredRowForIndex(trueIndex, count, copies) };
}

/**
 * Re-derives a loop-or-not WheelColumn's scroll target from the CURRENT
 * `index` prop when its `items` array changes length while the column stays
 * mounted (item 51) — e.g. DateField's Day column across a month/year switch
 * that changes the day count. Defensive even though the Day column is also
 * keyed by count (a clean remount already re-presets it): a future caller
 * that swaps `items` in place, without a `key` remount, must still land on
 * the current index instead of the old count's stale scroll position. Wraps
 * (loop) or clamps (non-loop) `index` into the new count's valid range so the
 * result is always in range even if the caller passed a stale one.
 */
export function reindexForCountChange(
  index: number,
  count: number,
  loop: boolean,
  copies: number = LOOP_REPEAT_COUNT,
): { row: number; trueIndex: number } {
  if (loop) {
    const trueIndex = wrapIndex(index, count);
    return { row: centeredRowForIndex(trueIndex, count, copies), trueIndex };
  }
  const trueIndex = count <= 0 ? 0 : Math.min(Math.max(index, 0), count - 1);
  return { row: trueIndex, trueIndex };
}

export interface WheelItem {
  key: string;
  label: string;
}

export interface WheelColumnProps {
  ariaLabel: string;
  items: WheelItem[];
  index: number;
  onIndexChange: (index: number) => void;
  valueNow: number;
  valueMin: number;
  valueMax: number;
  valueText?: string;
  className?: string;
  /**
   * Loops the column endlessly (hour, minute, and DateField's month/day):
   * scrolling past either end wraps instead of stopping, and keyboard arrows
   * wrap too. Implemented by rendering `LOOP_REPEAT_COUNT` back-to-back
   * copies of `items`, starting centered in the middle copy, and silently
   * re-centering (scroll `behavior: "auto"`) back to the middle copy at the
   * same true index whenever a scroll settles — the visible selection never
   * changes, only its underlying copy does. `index`/`valueNow`/`valueText`
   * always carry the TRUE (0-based) value, never a copy-relative row.
   * Columns with real boundaries (date, year, AM/PM) leave this unset.
   */
  loop?: boolean;
}

/**
 * One scroll-snap wheel column: touch-scrollable, keyboard-steppable, ARIA
 * spinbutton. Exported so other date/time wheel pickers (e.g. `DateField`'s
 * month/day/year columns) reuse this exact mechanics rather than forking it.
 */
export function WheelColumn({
  ariaLabel,
  items,
  index,
  onIndexChange,
  valueNow,
  valueMin,
  valueMax,
  valueText,
  className = "",
  loop = false,
}: WheelColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const count = items.length;
  // Tracks the absolute (un-modulo'd) row a loop column is scrolled to, so
  // keyboard stepping moves by one row instead of jumping back to the middle
  // copy every keystroke. Irrelevant (and unused) for non-loop columns.
  const absoluteRowRef = useRef(centeredRowForIndex(index, count));
  // Tracks the item count this instance last positioned itself for, so the
  // count-change effect below can tell "count changed under me" apart from
  // "just mounted" (the mount effect already handles the latter).
  const prevCountRef = useRef(count);

  // Preset scroll position once, on mount (the Sheet mounts this column fresh
  // every time it opens, carrying the field's current value as the draft).
  useEffect(() => {
    const startRow = loop ? absoluteRowRef.current : index;
    scrollRef.current?.scrollTo({ top: startRow * WHEEL_ROW_HEIGHT, behavior: "auto" });
    // Intentionally mount-only: this presets the wheel's scroll position from
    // the draft the Sheet opened with. It must NOT re-run as `index` changes
    // from then on, or every scroll/keyboard step would fight the user by
    // re-snapping the wheel back to wherever it started.
  }, []);

  // Defensive re-derivation for item 51: if `items.length` changes on an
  // already-mounted instance (a caller that swaps `items` in place instead of
  // remounting via `key`, as DateField's Day column now does), re-center the
  // scroll position AND `absoluteRowRef` from the CURRENT `index` prop for the
  // NEW count. Without this, the physical scrollTop stays wherever the OLD
  // count left it, so the row the wheel visually centers on drifts out of
  // sync with `index`/`aria-valuenow`/the highlighted row — exactly the
  // silent-drift bug item 51 closes. Skips the initial mount (handled above).
  useEffect(() => {
    if (prevCountRef.current === count) return;
    prevCountRef.current = count;
    const { row } = reindexForCountChange(index, count, loop);
    if (loop) absoluteRowRef.current = row;
    scrollRef.current?.scrollTo({ top: row * WHEEL_ROW_HEIGHT, behavior: "auto" });
    // Deliberately keyed on `count` alone (not `index`/`loop`, which this
    // effect also reads): it must fire only when the item count itself
    // changes, not on every ordinary index update from scrolling/stepping.
  }, [count]);

  useEffect(() => {
    return () => clearTimeout(settleTimeout.current);
  }, []);

  function stepTo(nextIndex: number) {
    const clamped = Math.min(Math.max(nextIndex, 0), count - 1);
    onIndexChange(clamped);
    scrollRef.current?.scrollTo({ top: clamped * WHEEL_ROW_HEIGHT, behavior: "smooth" });
  }

  function stepLoop(delta: number) {
    const { trueIndex, absRow } = stepLoopIndex(absoluteRowRef.current, delta, count);
    absoluteRowRef.current = absRow;
    onIndexChange(trueIndex);
    scrollRef.current?.scrollTo({ top: absRow * WHEEL_ROW_HEIGHT, behavior: "smooth" });
  }

  function handleScroll() {
    clearTimeout(settleTimeout.current);
    settleTimeout.current = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (loop) {
        const settledRow = indexFromScrollTop(el.scrollTop, WHEEL_ROW_HEIGHT, count * LOOP_REPEAT_COUNT);
        onIndexChange(trueIndexFromRow(settledRow, count));
        const target = recenterRow(settledRow, count);
        absoluteRowRef.current = target;
        el.scrollTo({ top: target * WHEEL_ROW_HEIGHT, behavior: "auto" });
      } else {
        onIndexChange(indexFromScrollTop(el.scrollTop, WHEEL_ROW_HEIGHT, count));
      }
    }, 120);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (loop) stepLoop(-1);
      else stepTo(index - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (loop) stepLoop(1);
      else stepTo(index + 1);
    }
  }

  const rowCount = loop ? count * LOOP_REPEAT_COUNT : count;

  return (
    <div
      ref={scrollRef}
      role="spinbutton"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuenow={valueNow}
      {...(valueText !== undefined ? { "aria-valuetext": valueText } : {})}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      className={`snap-y snap-mandatory overflow-y-auto outline-none scroll-momentum [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      style={{ height: WHEEL_VISIBLE_HEIGHT, paddingTop: WHEEL_PADDING, paddingBottom: WHEEL_PADDING }}
    >
      {Array.from({ length: rowCount }, (_, row) => {
        const trueIndex = loop ? trueIndexFromRow(row, count) : row;
        const item = items[trueIndex]!;
        return (
          <div
            key={loop ? `${Math.floor(row / count)}-${item.key}` : item.key}
            className={`flex items-center justify-center px-1 text-sm transition-colors duration-[var(--duration-fast)] snap-center ${
              trueIndex === index ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
            }`}
            style={{ height: WHEEL_ROW_HEIGHT }}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}

const HOUR_ITEMS: WheelItem[] = Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1), label: String(i + 1) }));
const MINUTE_ITEMS: WheelItem[] = Array.from({ length: 60 }, (_, i) => ({
  key: String(i),
  label: String(i).padStart(2, "0"),
}));
const MERIDIEM_ITEMS: WheelItem[] = [
  { key: "AM", label: "AM" },
  { key: "PM", label: "PM" },
];

/**
 * Shared wheel-picker chrome: the centered highlight band plus the relative
 * wrapper that keeps row text painting ABOVE it (the band is absolutely
 * positioned and opaque — without `relative` on the row wrapper, it would
 * cover the selected row instead of framing it). Wraps any number of
 * `WheelColumn`s so every wheel picker (date+time, date-only, …) shares this
 * exact chrome instead of forking it. `w-3/4 mx-auto` keeps the wheel block
 * from spanning the full sheet width; the sheet, title, and footer buttons
 * are unaffected since this class lives only on the wheel block itself.
 */
export function WheelFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-3/4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border-y border-[var(--color-border)] bg-[var(--color-bg-inset)]"
        style={{ height: WHEEL_ROW_HEIGHT }}
      />
      <div className="relative flex gap-1">{children}</div>
    </div>
  );
}

export interface WheelPickerBodyProps {
  draft: SplitDateTime;
  onDraftChange: (next: SplitDateTime) => void;
  dateOptions: DateOption[];
}

/**
 * The four-column wheel body + shared highlight band, hosted inside the
 * Sheet. Exported (like `MultiComboboxOptionList`) so the open-sheet markup
 * — four spinbuttons with correct ARIA values, the highlight band — can be
 * rendered and asserted on directly, without needing to drive the parent
 * `DateTimeField`'s internal open-state through simulated events.
 */
export function WheelPickerBody({ draft, onDraftChange, dateOptions }: WheelPickerBodyProps) {
  // Reversed presentation order — oldest date at row 0 (top), "Today" at the
  // last row (bottom) — while the DATA model (dateOptions, dayIndex) stays
  // oldest->newest unchanged (item 45). `dayIndexToRow`/`rowToDayIndex` are
  // the same involution, so mapping the array once here is enough for both
  // directions: `dateItems[row]` is `dateOptions[rowToDayIndex(row, count)]`.
  const reversedDateOptions = [...dateOptions].reverse();
  const dateItems: WheelItem[] = reversedDateOptions.map((o) => ({ key: String(o.dayIndex), label: o.label }));
  const dateRow = dayIndexToRow(draft.dayIndex, dateOptions.length);
  const meridiemIndex = draft.meridiem === "AM" ? 0 : 1;

  return (
    <WheelFrame>
      <WheelColumn
        ariaLabel="Date"
        items={dateItems}
        index={dateRow}
        onIndexChange={(row) => onDraftChange({ ...draft, dayIndex: rowToDayIndex(row, dateOptions.length) })}
        // aria-valuenow reports the visual ROW (0 at the oldest/top date,
        // increasing toward "Today" at the bottom) rather than the raw
        // dayIndex, which runs the opposite direction (0 = today) — a
        // spinbutton's value must move monotonically with its visual
        // position for arrow keys and screen-reader announcements to agree.
        // valueText still names the actual selected date.
        valueNow={dateRow}
        valueMin={0}
        valueMax={dateOptions.length - 1}
        valueText={dateOptions.find((o) => o.dayIndex === draft.dayIndex)?.label}
        className="flex-[2]"
      />
      <WheelColumn
        ariaLabel="Hour"
        items={HOUR_ITEMS}
        index={draft.hour12 - 1}
        onIndexChange={(i) => onDraftChange({ ...draft, hour12: i + 1 })}
        valueNow={draft.hour12}
        valueMin={1}
        valueMax={12}
        className="flex-1"
        loop
      />
      <WheelColumn
        ariaLabel="Minute"
        items={MINUTE_ITEMS}
        index={draft.minute}
        onIndexChange={(i) => onDraftChange({ ...draft, minute: i })}
        valueNow={draft.minute}
        valueMin={0}
        valueMax={59}
        className="flex-1"
        loop
      />
      <WheelColumn
        ariaLabel="AM or PM"
        items={MERIDIEM_ITEMS}
        index={meridiemIndex}
        onIndexChange={(i) => onDraftChange({ ...draft, meridiem: i === 0 ? "AM" : "PM" })}
        valueNow={meridiemIndex}
        valueMin={0}
        valueMax={1}
        valueText={MERIDIEM_ITEMS[meridiemIndex]!.label}
        className="flex-1"
      />
    </WheelFrame>
  );
}

export interface PickerSheetFooterProps {
  onCancel: () => void;
  onSave: () => void;
}

/**
 * The Cancel/Save button row shared by every wheel-picker Sheet (item 53).
 * Extracted so `DateTimeField` and `DateField` render byte-identical footer
 * markup/styling/handlers from one place instead of two copies that could
 * silently drift apart.
 */
export function PickerSheetFooter({ onCancel, onSave }: PickerSheetFooterProps) {
  return (
    <div className="flex gap-2">
      <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
        Cancel
      </Button>
      <Button type="button" onClick={onSave} className="flex-1">
        Save
      </Button>
    </div>
  );
}

interface DateTimeFieldProps {
  id?: string;
  value: Date;
  onChange: (value: Date) => void;
  disabled?: boolean;
  daysBack?: number;
  /** Injectable "now" for deterministic tests; defaults to the real current time. */
  now?: Date;
}

/**
 * Styled like `Input`/`Select` (same tokens, min-h-11) but rendered as a
 * `<button>` so the whole surface is one tappable/focusable control — the
 * global `:focus-visible` rule applies to it with no opt-out needed. Tapping
 * it opens the app's `Sheet` with four scroll-snap wheel columns (date,
 * hour, minute, AM/PM); "Save" commits the draft to `onChange`, "Cancel"
 * (or the Sheet's own backdrop/Escape handling) discards it.
 */
export function DateTimeField({ id, value, onChange, disabled = false, daysBack = DEFAULT_DAYS_BACK, now }: DateTimeFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SplitDateTime>(() => resolvePresetDraft(value, now ?? new Date()));
  // The "now" the open sheet is anchored to. Split, option labels, and the
  // Save commit must all use the SAME reference: if the calendar day rolls
  // over while the sheet sits open, a draft shown as "Today, 11:58 PM" would
  // otherwise recombine against the NEW today and land a day late.
  const [anchorNow, setAnchorNow] = useState<Date>(() => now ?? new Date());

  function handleOpen() {
    if (disabled) return;
    const openedAt = now ?? new Date();
    setAnchorNow(openedAt);
    setDraft(resolvePresetDraft(value, openedAt));
    setOpen(true);
  }

  function handleSave() {
    // Clamp target is minute-truncated so even the clamped path submits a
    // minute-aligned timestamp, matching every other commit path (item 41).
    onChange(clampToNow(combineDateTime(draft, anchorNow), nowAtMinute(anchorNow)));
    setOpen(false);
  }

  function handleCancel() {
    setOpen(false);
  }

  const currentNow = open ? anchorNow : (now ?? new Date());
  // `value` may predate the default window (e.g. editing a long-stored
  // pantry item) — extend the range rather than opening to a preset the
  // wheel can't actually show.
  const effectiveDaysBack = resolveDaysBack(daysBack, value, currentNow);
  const dateOptions = buildDateOptions(currentNow, effectiveDaysBack);

  return (
    <>
      <button
        type="button"
        id={fieldId}
        disabled={disabled}
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-left text-sm text-[var(--color-text)] outline-none transition-colors duration-[var(--duration-fast)] focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none h-4 w-4 shrink-0 text-[var(--color-text-muted)]"
          fill="none"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="flex-1">{formatDateTimeLabel(value, currentNow)}</span>
      </button>

      <Sheet open={open} onClose={handleCancel} title="When">
        <WheelPickerBody draft={draft} onDraftChange={setDraft} dateOptions={dateOptions} />
        <PickerSheetFooter onCancel={handleCancel} onSave={handleSave} />
      </Sheet>
    </>
  );
}
