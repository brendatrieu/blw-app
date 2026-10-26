import { useState } from "react";
import { Link } from "react-router-dom";
import type { PlannedMeal } from "@blw/shared";
import { Button } from "../../components/ui/Button.js";
import { Card } from "../../components/ui/Card.js";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.js";
import { Menu, MenuItem } from "../../components/ui/Menu.js";
import { useIsOffline } from "../../lib/online.js";
import { DeletedMark } from "../catalog/components/DeletedMark.js";
import { ItemPlate, WarningGlyph } from "../plate/PlateItemRow.js";
import { timeLabel } from "../tracking/components/ServeLogList.js";
import { useRemovePlannedMeal } from "./hooks.js";
import { flagNotes, mealTimeLabel, plannedLines } from "./plan.js";

export interface PlanMealCardProps {
  babyId: string;
  date: string;
  /** The caller's today, `YYYY-MM-DD`. */
  today: string;
  meal: PlannedMeal;
  /** Serve (SPEC §3.5), wired in plan step 4.3: shown on an unserved meal
   * with something planned, today or before; never on a future day. */
  onServe?: () => void;
}

/** Whether a meal offers Serve: unserved, something on it, not in the future. */
export function canServe(date: string, today: string, meal: Pick<PlannedMeal, "served" | "items">): boolean {
  return meal.served === null && meal.items.length > 0 && date <= today;
}

function ServedChip({ servedAt }: { servedAt: string }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-success-soft)] px-2 text-xs font-bold whitespace-nowrap text-[var(--color-success-soft-text)]">
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16">
        <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Served {timeLabel(servedAt)}
    </span>
  );
}

/**
 * One meal of a plan day (CD-Plan-Day, CD-Plan-After-Copy): its name, its
 * optional time and "Served {time}", one line per planned item, a flag box
 * per flagged container, and ⋮ (Remove; Copy to… joins it in step 4.2).
 * Tapping the card opens the meal (`/plan/:date/:slotId`). A card with at
 * most one line and no flags keeps its buttons beside the whole card, as
 * the board's Morning snack does; a longer one keeps them on its name's row.
 */
export function PlanMealCard({ babyId, date, today, meal, onServe }: PlanMealCardProps) {
  const [removing, setRemoving] = useState(false);
  const lines = plannedLines(meal);
  const notes = flagNotes(meal);
  const compact = lines.length <= 1 && notes.length === 0;

  const title = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
      {/* Stretched link: tapping anywhere on the card opens the meal. The
          buttons sit above it (relative z-10), never inside it. */}
      <Link
        to={`/plan/${date}/${meal.slotId}`}
        className="min-w-0 rounded-[var(--radius-sm)] text-[17px] leading-[1.3] font-extrabold break-words text-[var(--color-text)] after:absolute after:inset-0 after:rounded-[var(--radius-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        {meal.name}
      </Link>
      {meal.time && (
        <span className="text-[13px] font-semibold whitespace-nowrap text-[var(--color-text-muted)]">{mealTimeLabel(meal.time)}</span>
      )}
      {meal.served && <ServedChip servedAt={meal.served.servedAt} />}
    </div>
  );

  const actions = (
    // The 44px buttons overhang the row, so they don't make it taller.
    <div className="relative z-10 -my-[9px] -mr-2.5 flex shrink-0 items-center gap-1">
      {onServe && canServe(date, today, meal) && (
        <Button type="button" aria-label={`Serve ${meal.name}`} onClick={onServe}>
          Serve
        </Button>
      )}
      <Menu label={`More for ${meal.name}`}>
        {(close) => (
          <MenuItem
            onSelect={() => {
              setRemoving(true);
              close();
            }}
          >
            <span className="text-[var(--color-danger)]">Remove</span>
          </MenuItem>
        )}
      </Menu>
    </div>
  );

  const body = (
    <>
      {lines.length > 0 ? (
        <ul aria-label="On the plate" className={`flex flex-col gap-1 ${compact ? "mt-1" : "mt-1.5"}`}>
          {lines.map((line) => (
            <li key={line.key} className="flex items-center gap-1.5">
              <ItemPlate plates={line.plates} size={24} />
              <span className="min-w-0 text-[13px] leading-[1.3] break-words text-[var(--color-text-muted)]">
                {line.name}
                <DeletedMark deleted={line.deleted} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] leading-[1.3] text-[var(--color-text-muted)]">Nothing planned yet</p>
      )}
      {notes.map((note) => (
        <div
          key={note.key}
          className="mt-1.5 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--color-caution-soft)] px-2 py-1 text-[13px] leading-[1.35] text-[var(--color-caution-soft-text)]"
        >
          <WarningGlyph />
          <div className="min-w-0">
            <div className="font-bold break-words">{note.name}</div>
            {note.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <Card as="li" padding="none" className={`relative px-3.5 py-2 ${compact ? "flex items-center gap-3" : ""}`}>
      {compact ? (
        <>
          <div className="min-w-0 flex-1">
            {title}
            {body}
          </div>
          {actions}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {title}
            {actions}
          </div>
          {body}
        </>
      )}
      <RemovePlannedMealDialog
        babyId={babyId}
        date={date}
        meal={meal}
        open={removing}
        onClose={() => setRemoving(false)}
      />
    </Card>
  );
}

interface RemovePlannedMealDialogProps {
  babyId: string;
  date: string;
  meal: PlannedMeal;
  open: boolean;
  onClose: () => void;
}

/** ⋮ Remove asks first (PP-COPY: "asks to confirm in the app"). Only that
 * day changes; a meal served from it stays in the Food log. */
export function RemovePlannedMealDialog({ babyId, date, meal, open, onClose }: RemovePlannedMealDialogProps) {
  const remove = useRemovePlannedMeal(babyId);
  const offline = useIsOffline();
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Remove ${meal.name}?`}
      confirmLabel="Remove"
      pendingLabel="Removing…"
      pending={remove.isPending}
      onConfirm={offline ? undefined : () => remove.mutate({ date, slotId: meal.slotId }, { onSuccess: onClose })}
      error={offline ? "You're offline." : remove.isError ? "Couldn't remove that — try again." : undefined}
    >
      <p>
        Just for this day. Daily meals stay as they are.{meal.served ? " What you served stays in the Food log." : ""}
      </p>
    </ConfirmDialog>
  );
}
