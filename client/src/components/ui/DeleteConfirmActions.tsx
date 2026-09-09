import { Button } from "./Button.js";
import { KeepButton } from "./KeepButton.js";

interface DeleteConfirmActionsProps {
  /** e.g. "Delete for good". */
  confirmLabel: string;
  /** e.g. "Deleting…" — shown in place of `confirmLabel` while in flight. */
  pendingLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onKeep: () => void;
  /** Accessible name for the × — defaults to `KeepButton`'s "Keep it". */
  keepLabel?: string;
}

/**
 * The two controls a destructive inline confirm shows once it's armed: the
 * red commit, and the icon-only × that backs out of it (item 257 — the only
 * dismiss affordance left in the app, because a confirm row has no header
 * chevron, sheet close or Done of its own).
 *
 * Returned as a fragment so it drops straight into each page's existing
 * action row, and extracted so the custom-food and custom-recipe delete
 * controls render byte-identical confirm markup from one place instead of
 * two copies that could drift — the same reason `MealDeleteControl` exists.
 */
export function DeleteConfirmActions({
  confirmLabel,
  pendingLabel,
  pending,
  onConfirm,
  onKeep,
  keepLabel,
}: DeleteConfirmActionsProps) {
  return (
    <>
      <Button type="button" variant="danger" size="sm" disabled={pending} onClick={onConfirm}>
        {pending ? pendingLabel : confirmLabel}
      </Button>
      <KeepButton onClick={onKeep} disabled={pending} {...(keepLabel ? { label: keepLabel } : {})} />
    </>
  );
}
