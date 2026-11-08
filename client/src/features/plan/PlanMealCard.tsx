import { useState } from "react";
import { Link } from "react-router-dom";
import type { PlannedMeal } from "@blw/shared";
import { Button, ButtonLink } from "../../components/ui/Button.js";
import { Card } from "../../components/ui/Card.js";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.js";
import { Menu, MenuItem, MenuLinkItem } from "../../components/ui/Menu.js";
import { useIsOffline } from "../../lib/online.js";
import { DeletedMark } from "../catalog/components/DeletedMark.js";
import { ItemPlate, WarningGlyph } from "../plate/PlateItemRow.js";
import { timeLabel } from "../tracking/components/ServeLogList.js";
import { ServedMealLines, addMoreHref } from "../tracking/components/RatedMealLines.js";
import { useRemovePlannedMeal, useReorderPlanDay } from "./hooks.js";
import { flagNotes, mealTimeLabel, moveRow, planMealEditHref, plannedLines } from "./plan.js";

export interface PlanMealCardProps {
  babyId: string;
  date: string;
  /** The caller's today, `YYYY-MM-DD`. */
  today: string;
  meal: PlannedMeal;
  /** Serve (SPEC §3.5): shown on an unserved meal with something planned,
   * today (one tap) or before (the plate); never on a future day. */
  onServe?: () => void;
  /** Today's one tap is on its way ("Serving…"), or failed ("try again"). */
  serving?: boolean;
  serveFailed?: boolean;
  /** ⋮ Copy to…, offered once something is planned (there is nothing to copy before). */
  onCopy?: () => void;
  /** The day's meals in order, by slot id: ⋮ Move up (not on the first) and
   * Move down (not on the last), that day only (909). */
  daySlotIds?: readonly string[];
}

/** Serve's and Add more's 44px tap strip on the small (36px) button: the
 * ::after sits on the padding box, inside the 1px border, so 34 + 2 x 5 = 44
 * (ledger 934; 944 found -inset-y-1 gave 42). */
const SMALL_BUTTON_TAP = "relative after:absolute after:inset-x-0 after:-inset-y-[5px]";

/** Whether a meal offers Serve: unserved, something on it, not in the future. */
export function canServe(date: string, today: string, meal: Pick<PlannedMeal, "served" | "items">): boolean {
  return meal.served === null && meal.items.length > 0 && date <= today;
}

/** "Served {time}" beside a served meal's name (here and on Home's Up next). */
export function ServedChip({ servedAt }: { servedAt: string }) {
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
 * per flagged container, and ⋮ (Edit, ledger 954; Copy to… once something
 * is planned, Move up / Move down within the day, Remove). Once served it shows what was
 * served, each item with its stars (a tap rates it on the logged meal), and
 * Add more in Serve's place (ledger 944).
 * Tapping the card opens the meal (`/plan/:date/:slotId`). A card with at
 * most one line and no flags keeps its buttons beside the whole card, as
 * the board's Morning snack does; a longer one keeps them on its name's row.
 */
export function PlanMealCard({ babyId, date, today, meal, onServe, serving = false, serveFailed = false, onCopy, daySlotIds = [] }: PlanMealCardProps) {
  const [removing, setRemoving] = useState(false);
  const offline = useIsOffline();
  const reorder = useReorderPlanDay(babyId);
  const at = daySlotIds.indexOf(meal.slotId);
  const moves = (
    [
      ["Move up", -1],
      ["Move down", 1],
    ] as const
  ).filter(([, step]) => at >= 0 && daySlotIds[at + step] !== undefined);
  const serves = Boolean(onServe) && canServe(date, today, meal);
  const offlineId = `serve-offline-${meal.slotId}`;
  const lines = plannedLines(meal);
  const notes = flagNotes(meal);
  // Ledger 944: a served meal shows what was served, with stars, and Add more.
  const served = meal.served;
  const compact = !served && lines.length <= 1 && notes.length === 0;

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
    // The 44px ⋮ overhangs the row, so it doesn't make it taller. With Serve
    // the row is the small Serve's 36px, so Serve sits inside the card's own
    // padding instead of overhanging its border (ledger 934).
    <div className={`relative z-10 ${serves || served ? "-my-1" : "-my-[9px]"} -mr-2.5 flex shrink-0 items-center gap-1`}>
      {serves && (
        // Every write waits offline (SPEC §4.4), the plate's Serve pattern.
        // Small (36px) to look; the ::after strip keeps a 44px tap target.
        <Button
          type="button"
          size="sm"
          className={SMALL_BUTTON_TAP}
          aria-label={`Serve ${meal.name}`}
          aria-describedby={offline ? offlineId : undefined}
          disabled={serving || offline}
          onClick={onServe}
        >
          {serving ? "Serving…" : "Serve"}
        </Button>
      )}
      {served && (
        // Ledger 944: in Serve's slot, the same small size and 44px strip.
        <ButtonLink
          to={addMoreHref(served.mealId)}
          variant="quiet"
          size="sm"
          className={SMALL_BUTTON_TAP}
          aria-label={`Add more to ${meal.name}`}
        >
          Add more
        </ButtonLink>
      )}
      <Menu label={`More for ${meal.name}`}>
        {(close) => (
          <>
            {/* Ledger 954: Edit first, as on the Food log's ⋮. */}
            <MenuLinkItem to={planMealEditHref(date, meal)} onSelect={close}>
              Edit
            </MenuLinkItem>
            {onCopy && meal.items.length > 0 && (
              <MenuItem
                onSelect={() => {
                  onCopy();
                  close();
                }}
              >
                Copy to…
              </MenuItem>
            )}
            {moves.map(([label, step]) => (
              // Every write waits offline (SPEC §4.4).
              <MenuItem
                key={label}
                disabled={offline || reorder.busy}
                onSelect={() => {
                  reorder.mutate({ date, slotIds: moveRow([...daySlotIds], at, at + step) });
                  close();
                }}
              >
                {label}
              </MenuItem>
            ))}
            <MenuItem
              onSelect={() => {
                setRemoving(true);
                close();
              }}
            >
              <span className="text-[var(--color-danger)]">Remove</span>
            </MenuItem>
          </>
        )}
      </Menu>
    </div>
  );

  const plannedList = (
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
  );

  const body = (
    <>
      {served ? (
        <div className="mt-1.5">
          <ServedMealLines babyId={babyId} mealId={served.mealId} look="plan" fallback={plannedList} />
        </div>
      ) : lines.length > 0 ? (
        plannedList
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
      {serves && offline && (
        <p id={offlineId} className="mt-1 text-xs text-[var(--color-text-muted)]">
          You're offline.
        </p>
      )}
      {reorder.isError && (
        <p role="alert" className="mt-1 text-xs text-[var(--color-danger)]">
          Couldn't move that — try again.
        </p>
      )}
      {serves && serveFailed && !offline && (
        <p role="alert" className="mt-1 text-xs text-[var(--color-danger)]">
          Couldn't serve — try again.
        </p>
      )}
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
