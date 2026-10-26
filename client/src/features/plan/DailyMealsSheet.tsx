import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PLAN_NAME_MAX, type DailyMeal } from "@blw/shared";
import { Button } from "../../components/ui/Button.js";
import { CloseGlyph, ICON_BUTTON_CLASSES } from "../../components/ui/iconButton.js";
import { Sheet } from "../../components/ui/Sheet.js";
import { focusFieldById } from "../../lib/forms.js";
import { useIsOffline } from "../../lib/online.js";
import { useSaveDailyMeals } from "./hooks.js";
import {
  canAddDailyMeal,
  canRemoveDailyMeal,
  dailyMealErrors,
  dailyMealRows,
  dragTarget,
  mealTimeLabel,
  moveRow,
  toDailyMealsInput,
  type DailyMealRow,
} from "./plan.js";

export interface DailyMealsSheetProps {
  babyId: string;
  /** The list as saved (the plan answer's `dailyMeals`). */
  meals: readonly DailyMeal[];
  open: boolean;
  onClose: () => void;
}

/**
 * Daily meals (804, CD-Daily-Meals): the meals every new day starts with,
 * each with an optional time. Rename in place, add, remove, and reorder by
 * the handle (drag it, or arrow keys on it). Days already planned, and past
 * days, keep their own meals. Opened from the Meal plan's header; the form
 * mounts with the sheet, so each opening starts from the saved list.
 */
export function DailyMealsSheet({ babyId, meals, open, onClose }: DailyMealsSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Daily meals" showClose fixedHeight>
      <DailyMealsForm babyId={babyId} meals={meals} onDone={onClose} />
    </Sheet>
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

/** The plate's "+ Add more" look (CD boards' dashed button). */
const ADD_BUTTON =
  "flex min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] border-[1.5px] border-dashed border-[var(--color-border)] text-[15px] font-semibold text-[var(--color-accent)] disabled:opacity-60";

const FIELD_BOX = "h-11 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text)]";

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

  const fieldId = (row: DailyMealRow, part: "name" | "move" | "error") => `${idPrefix}-${row.key}-${part}`;
  const errors = attempted ? dailyMealErrors(rows) : {};
  const update = (key: string, patch: Partial<DailyMealRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
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
            <li
              key={row.key}
              className={`relative flex flex-col py-1 not-first:border-t not-first:border-[var(--color-divider)] ${
                dragging === row.key ? "rounded-[var(--radius-md)] bg-[var(--color-bg-inset)]" : ""
              }`}
            >
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
                  className={`${FIELD_BOX} min-w-0 flex-1 px-2 text-base font-bold outline-none focus:border-[var(--color-accent)] ${
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
                  <input
                    type="time"
                    aria-label={`Time for ${row.name}`}
                    value={row.time ?? ""}
                    onChange={(event) => update(row.key, { time: event.target.value.slice(0, 5) || null })}
                    onClick={(event) => {
                      // Desktop browsers open the picker only from its icon.
                      try {
                        event.currentTarget.showPicker();
                      } catch {
                        // Already open, or not offered: the field still works.
                      }
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
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
