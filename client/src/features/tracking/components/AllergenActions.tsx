import { useState } from "react";
import { useMarkAllergenEstablished, useUndoAllergenEstablished } from "../hooks.js";
import { Button } from "../../../components/ui/Button.js";
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { Field } from "../../../components/ui/Field.js";
import { Sheet } from "../../../components/ui/Sheet.js";

interface AllergenActionProps {
  babyId: string;
  allergenSlug: string;
}

/**
 * The mark sheet's BODY: a "When" field defaulting to the current minute and
 * one primary button that writes the override.
 *
 * Exported standalone (the `ServeControl` idiom) so a handler test can drive
 * its state as a plain function and pin the one thing item 365 turns on —
 * which instant actually reaches the mutation. The date is the whole point of
 * the sheet: the maintenance countdown starts from it, so a dropped value
 * would quietly restart the week at "now" and still look right.
 */
export function MarkEstablishedForm({
  babyId,
  allergenSlug,
  onMarked,
}: AllergenActionProps & { onMarked?: () => void }) {
  // The future guard is `DateTimeField`'s own (its wheel only goes backwards,
  // and Save refuses a future time) — not a second rule re-implemented here.
  const [establishedAt, setEstablishedAt] = useState(() => nowAtMinute());
  const mark = useMarkAllergenEstablished(babyId);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--color-text-muted)]">
        When did you last serve it? The reminder to serve it again counts from that day.
      </p>

      <Field label="When" htmlFor="allergen-established-when">
        <DateTimeField
          id="allergen-established-when"
          value={establishedAt}
          onChange={setEstablishedAt}
          disabled={mark.isPending}
        />
      </Field>

      {mark.isError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={mark.isPending}
        onClick={() =>
          mark.mutate(
            { allergenSlug, establishedAt: establishedAt.toISOString() },
            { onSuccess: () => onMarked?.() },
          )
        }
      >
        {mark.isPending ? "Marking…" : "Mark established"}
      </Button>
    </div>
  );
}

/**
 * Backfill control: opens a small sheet that asks WHEN before writing the
 * override (item 365). It used to write immediately on tap — which was fine
 * while the mark carried no date, and wrong the moment the maintenance
 * countdown started running from it: a parent who established peanut in March
 * would have reset the clock to today just by telling us.
 *
 * Undo stays one tap (`OverriddenHint`): removing a fact needs no date, and
 * the sheet is the safety net the mark needs, not the undo.
 *
 * Extracted out of `BabyAllergensPage` so the ladder row and the allergen
 * detail page offer the byte-identical control (ledger 187: extract, don't
 * duplicate) — both drive the same mutation, which invalidates the ladder and
 * the detail query together.
 */
export function MarkEstablishedAction({ babyId, allergenSlug }: AllergenActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Mark as established
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Mark as established" showClose>
        <MarkEstablishedForm babyId={babyId} allergenSlug={allergenSlug} onMarked={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

/**
 * Muted "marked by you" hint + Undo for a row established only via a parent
 * override. Never shown once the meal log itself establishes the allergen —
 * the override un-flags itself the moment real exposures catch up (see
 * `unionAllergenStatus` in shared/src/tracking.ts).
 */
export function OverriddenHint({ babyId, allergenSlug }: AllergenActionProps) {
  const undo = useUndoAllergenEstablished(babyId);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-[var(--color-text-muted)]">Marked by you</span>
      <button
        type="button"
        disabled={undo.isPending}
        onClick={() => undo.mutate(allergenSlug)}
        className="font-semibold text-[var(--color-accent)] underline disabled:opacity-60"
      >
        {undo.isPending ? "Undoing…" : "Undo"}
      </button>
      {undo.isError && <span className="text-[var(--color-danger)]">Couldn't undo — try again.</span>}
    </div>
  );
}
