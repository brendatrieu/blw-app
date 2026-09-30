import type { ReactNode } from "react";
import { Button } from "./Button.js";
import { Sheet } from "./Sheet.js";

interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  /** The question itself, e.g. "Delete this meal?" — also the dialog's name. */
  title: string;
  /** At most one short, muted line (and any choices before it). */
  children?: ReactNode;
  /** e.g. "Delete" — shown as "Deleting…" (`pendingLabel`) while in flight. */
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  /** Omitted while the question can't be answered yet (still checking). */
  onConfirm?: () => void;
  /** Why the last attempt failed; announced as an alert. */
  error?: ReactNode;
}

/**
 * The one way a destructive action asks first (item 599): a bottom sheet that
 * names the action as a question, adds at most one short line, and holds ONE
 * right-aligned (still 44px tall), red-outlined commit (quieter per item 607). Nothing happens until that button is tapped; the sheet's × (or an
 * overlay tap / Escape) backs out — no Cancel, per item 257. Replaces the old
 * two-tap inline confirms, whose only signal was the button turning red.
 */
export function ConfirmSheet({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  pendingLabel,
  pending,
  onConfirm,
  error,
}: ConfirmSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title} showClose>
      {children ? <div className="flex flex-col gap-3 text-sm text-[var(--color-text-muted)]">{children}</div> : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {onConfirm ? (
        <Button type="button" variant="danger-quiet" className="self-end" disabled={pending} onClick={onConfirm}>
          {pending ? pendingLabel : confirmLabel}
        </Button>
      ) : null}
    </Sheet>
  );
}
