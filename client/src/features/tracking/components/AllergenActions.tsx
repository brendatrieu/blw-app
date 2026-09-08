import { useMarkAllergenEstablished, useUndoAllergenEstablished } from "../hooks.js";
import { Button } from "../../../components/ui/Button.js";

interface AllergenActionProps {
  babyId: string;
  allergenSlug: string;
}

/**
 * Single-tap backfill: writes the override immediately — the "Marked by you ·
 * Undo" affordance is the safety net (undo beats a confirm step). The
 * explanatory copy lives once at the top of the ladder page.
 *
 * Extracted out of `BabyAllergensPage` so the ladder row and the allergen
 * detail page offer the byte-identical control (ledger 187: extract, don't
 * duplicate) — both drive the same mutation, which invalidates the ladder and
 * the detail query together.
 */
export function MarkEstablishedAction({ babyId, allergenSlug }: AllergenActionProps) {
  const mark = useMarkAllergenEstablished(babyId);

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={mark.isPending}
        onClick={() => mark.mutate(allergenSlug)}
      >
        {mark.isPending ? "Marking…" : "Mark as established"}
      </Button>
      {mark.isError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}
    </div>
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
