import { useId, useState } from "react";
import { Sheet } from "./Sheet.js";
import { PickerSheetFooter, WheelColumn, WheelFrame } from "./DateTimeField.js";

const DEFAULT_YEARS_BACK = 6;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_ITEMS = MONTH_LABELS.map((label, i) => ({ key: String(i), label }));

export interface YmdParts {
  year: number;
  month: number; // 0-11
  day: number; // day of month, 1-based
}

/**
 * Splits a "YYYY-MM-DD" string into calendar-field parts. `""` or anything
 * malformed falls back to `fallback`'s own calendar day — the contract the
 * form previously relied on for an unset value ("" -> opens preset to today).
 */
export function parseYmd(value: string, fallback: Date): YmdParts {
  const match = YMD_RE.exec(value);
  if (!match) {
    return { year: fallback.getFullYear(), month: fallback.getMonth(), day: fallback.getDate() };
  }
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

/** Recomposes calendar-field parts back into a "YYYY-MM-DD" string. */
export function formatYmd(parts: YmdParts): string {
  const mm = String(parts.month + 1).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}-${mm}-${dd}`;
}

/** Days in a local calendar month (0-11), leap-year aware via native Date rollover. */
export function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Clamps `day` down to the target month's length (e.g. drafted Feb 30 -> Feb 28/29). */
export function clampDayOverflow(parts: YmdParts): YmdParts {
  const max = daysInMonth(parts.month, parts.year);
  return parts.day > max ? { ...parts, day: max } : parts;
}

/**
 * Clamps a "YYYY-MM-DD" string to `today` when it names a date after today.
 * Zero-padded ISO date strings sort lexically the same as chronologically,
 * so a plain string comparison is enough — no Date parsing needed.
 */
export function clampFutureYmd(value: string, today: Date): string {
  const todayStr = formatYmd({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() });
  return value > todayStr ? todayStr : value;
}

/**
 * What "Save" commits for a drafted "YYYY-MM-DD": the draft as-is when
 * `allowFuture` opts the field out of the future ceiling (e.g. a best-by
 * date), otherwise clamped to `anchorNow` like every past-only field.
 * Extracted as a pure function so the allowFuture/default split is
 * unit-testable without a DOM environment.
 */
export function resolveCommittedYmd(drafted: string, allowFuture: boolean, anchorNow: Date): string {
  return allowFuture ? drafted : clampFutureYmd(drafted, anchorNow);
}

/**
 * Extends the year wheel's back-range so a preset older than the default
 * window is never out of range, mirroring `resolveDaysBack` in
 * `DateTimeField`. Computed here so every caller gets it for free.
 */
export function resolveYearsBack(yearsBack: number, presetYear: number, currentYear: number): number {
  return Math.max(yearsBack, currentYear - presetYear);
}

/**
 * Forward counterpart of `resolveYearsBack`, for `allowFuture` fields (e.g.
 * a pantry best-by date): extends the year wheel's forward range so a
 * preset already beyond the default forward window (an already-far-future
 * stored value) is never out of range. Never shrinks below the requested
 * default.
 */
export function resolveYearsForward(yearsForward: number, presetYear: number, currentYear: number): number {
  return Math.max(yearsForward, presetYear - currentYear);
}

export interface DateFieldPickerBodyProps {
  draft: YmdParts;
  onDraftChange: (next: YmdParts) => void;
  yearsBack: number;
  now: Date;
  /** Years the wheel extends past the current year. Defaults to 0 (today is
   * the latest selectable year), matching every existing (past-only) caller. */
  yearsForward?: number;
}

/**
 * The three-column (month / day / year) wheel body, hosted inside the Sheet.
 * Exported like `WheelPickerBody` so the open-sheet markup can be rendered
 * and asserted on directly.
 */
export function DateFieldPickerBody({ draft, onDraftChange, yearsBack, now, yearsForward = 0 }: DateFieldPickerBodyProps) {
  const currentYear = now.getFullYear();
  const years = Array.from({ length: yearsBack + yearsForward + 1 }, (_, i) => currentYear - yearsBack + i);
  const yearItems = years.map((y) => ({ key: String(y), label: String(y) }));
  const dayItems = Array.from({ length: daysInMonth(draft.month, draft.year) }, (_, i) => ({
    key: String(i + 1),
    label: String(i + 1),
  }));
  const yearIndex = Math.max(years.indexOf(draft.year), 0);

  function changeMonth(month: number) {
    onDraftChange(clampDayOverflow({ ...draft, month }));
  }

  function changeYear(year: number) {
    onDraftChange(clampDayOverflow({ ...draft, year }));
  }

  return (
    <WheelFrame>
      <WheelColumn
        ariaLabel="Month"
        items={MONTH_ITEMS}
        index={draft.month}
        onIndexChange={changeMonth}
        valueNow={draft.month + 1}
        valueMin={1}
        valueMax={12}
        valueText={MONTH_LABELS[draft.month]}
        className="flex-1"
        loop
      />
      <WheelColumn
        // Keyed by count (item 51): a full remount on every month/year switch
        // that changes the day count (e.g. Aug's 31 -> Feb's 28) gives the Day
        // column a clean preset from the CURRENT (already clampDayOverflow'd)
        // `draft.day`, rather than reusing stale scroll/absolute-row state
        // computed under the OLD count. `WheelColumn` also re-derives
        // defensively on its own if `items.length` ever changes without a
        // remount (see `reindexForCountChange`), but remounting is the
        // primary fix here since it's the simplest way to guarantee a clean
        // slate for this call site.
        key={dayItems.length}
        ariaLabel="Day"
        items={dayItems}
        index={draft.day - 1}
        onIndexChange={(i) => onDraftChange({ ...draft, day: i + 1 })}
        valueNow={draft.day}
        valueMin={1}
        valueMax={dayItems.length}
        className="flex-1"
        loop
      />
      <WheelColumn
        ariaLabel="Year"
        items={yearItems}
        index={yearIndex}
        onIndexChange={(i) => changeYear(years[i]!)}
        valueNow={draft.year}
        valueMin={years[0]!}
        valueMax={years[years.length - 1]!}
        className="flex-[1.3]"
      />
    </WheelFrame>
  );
}

/** Default forward range for an `allowFuture` field (e.g. a best-by date):
 * a year ahead covers the vast majority of real best-by dates while keeping
 * the wheel short; a preset further out still extends it (see
 * `resolveYearsForward`). */
const DEFAULT_YEARS_FORWARD = 1;

/**
 * Default for the `allowFuture` prop: future dates are refused (committed
 * drafts clamp to today) unless a call site opts out explicitly. Exported
 * and referenced by name in `DateField`'s own destructuring (not
 * re-literalled as `false` there) so this is the one place that default
 * lives — flipping it here is what "the component's default" means, and
 * `DateField (defaults)` below pins it against exactly that regression.
 */
export const DEFAULT_ALLOW_FUTURE = false;

interface DateFieldProps {
  id?: string;
  /** "YYYY-MM-DD", or "" for unset — opens preset to today. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  yearsBack?: number;
  title?: string;
  /** Injectable "now" for deterministic tests; defaults to the real current time. */
  now?: Date;
  /**
   * Opt-in: selectable future years/days, and "Save" commits the draft
   * as-is instead of clamping it to today. Past dates remain selectable
   * either way — this only lifts the future ceiling. Off by default, so
   * every existing (past-only) call site is unaffected.
   */
  allowFuture?: boolean;
  /** Years the wheel extends past the current year; only meaningful with
   * `allowFuture`. Defaults to `DEFAULT_YEARS_FORWARD`. */
  yearsForward?: number;
}

/**
 * Date-only sibling of `DateTimeField`: same button-opens-Sheet pattern and
 * styling, three wheel columns (month / day / year) instead of four. Reuses
 * `WheelColumn`/`WheelFrame` rather than forking the wheel mechanics. Future
 * dates can never be committed by default — "Save" clamps the draft to
 * today — unless `allowFuture` opts a field (e.g. a pantry best-by date)
 * out of that clamp.
 */
export function DateField({
  id,
  value,
  onChange,
  disabled = false,
  yearsBack = DEFAULT_YEARS_BACK,
  title = "Date",
  now,
  allowFuture = DEFAULT_ALLOW_FUTURE,
  yearsForward = DEFAULT_YEARS_FORWARD,
}: DateFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<YmdParts>(() => parseYmd(value, now ?? new Date()));
  // Same rationale as DateTimeField's anchorNow: split, wheel range, and the
  // Save commit must all use the SAME "now" reference for the life of an
  // open sheet.
  const [anchorNow, setAnchorNow] = useState<Date>(() => now ?? new Date());

  function handleOpen() {
    if (disabled) return;
    const openedAt = now ?? new Date();
    setAnchorNow(openedAt);
    setDraft(parseYmd(value, openedAt));
    setOpen(true);
  }

  function handleSave() {
    onChange(resolveCommittedYmd(formatYmd(draft), allowFuture, anchorNow));
    setOpen(false);
  }

  function handleCancel() {
    setOpen(false);
  }

  const currentNow = open ? anchorNow : (now ?? new Date());
  const presetYear = parseYmd(value, currentNow).year;
  const effectiveYearsBack = resolveYearsBack(yearsBack, presetYear, currentNow.getFullYear());
  const effectiveYearsForward = allowFuture
    ? resolveYearsForward(yearsForward, presetYear, currentNow.getFullYear())
    : 0;

  const displayParts = value ? parseYmd(value, currentNow) : null;
  const label = displayParts
    ? new Date(displayParts.year, displayParts.month, displayParts.day).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Select a date";

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
        <span className={`flex-1 ${value ? "" : "text-[var(--color-text-muted)]"}`}>{label}</span>
      </button>

      <Sheet open={open} onClose={handleCancel} title={title}>
        <DateFieldPickerBody
          draft={draft}
          onDraftChange={setDraft}
          yearsBack={effectiveYearsBack}
          yearsForward={effectiveYearsForward}
          now={currentNow}
        />
        <PickerSheetFooter onCancel={handleCancel} onSave={handleSave} />
      </Sheet>
    </>
  );
}
