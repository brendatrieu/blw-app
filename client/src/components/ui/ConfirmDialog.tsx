import type { ReactNode } from "react";
import { Button } from "./Button.js";
import { Dialog } from "./Dialog.js";

interface ConfirmDialogProps {
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
 * The one way a destructive action asks first (items 599, 610): a centred
 * pop-up that names the action as a question, adds at most one short line
 * (close under it — item 610's gap is ~30% of the old sheet's), and ends in
 * Cancel then the quiet red commit, both 44px. Nothing happens until that
 * commit is tapped; Cancel, an overlay tap or Escape backs out. Confirm
 * pop-ups are the one place with a Cancel — item 257's no-Cancel rule stays
 * for sheets and pages. Focus opens on the panel, never on the commit.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  pendingLabel,
  pending,
  onConfirm,
  error,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} ariaLabel={title}>
      <h2 className="font-h2 text-[var(--color-text)]">{title}</h2>
      {children ? (
        <div className="mt-1.5 flex flex-col gap-3 text-sm text-[var(--color-text-muted)]">{children}</div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {onConfirm ? (
          <Button type="button" variant="danger-quiet" disabled={pending} onClick={onConfirm}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
