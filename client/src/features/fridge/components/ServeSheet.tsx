import { useState } from "react";
import type { FridgeItem } from "@blw/shared";
import { useFridgeServe } from "../hooks.js";
import { clampServings, fridgeItemTitle } from "../format.js";
import { Button } from "../../../components/ui/Button.js";
import { Textarea } from "../../../components/ui/Input.js";
import { Sheet } from "../../../components/ui/Sheet.js";

/** Ceiling for the serve stepper on an untracked item (no servingsLeft to
 * bound it by) — generous enough never to feel like a real limit. */
const UNTRACKED_SERVINGS_MAX = 99;

/**
 * Builds the serve mutation's input — exported pure so tests pin the exact
 * payload shape (babyId explicit, notes trimmed to null) without a DOM env.
 */
export function buildServeInput(babyId: string, servings: number, reactionNote: string, notes: string) {
  return {
    babyId,
    servings,
    reactionNote: reactionNote.trim() || null,
    notes: notes.trim() || null,
  };
}

interface ServeControlProps {
  item: FridgeItem;
  babyId: string;
  /** Fired after a successful serve so the owning sheet can close itself. */
  onServed?: () => void;
}

/**
 * The Serve sheet's BODY (item 263): a −/+ servings stepper (default 1,
 * clamped to `[1, servingsLeft]` when tracked or `[1, 99]` otherwise), the
 * optional note fields always visible ABOVE the button, and one primary
 * "Serve" that posts the serve.
 *
 * This used to be a collapsed button that expanded into a confirming row on
 * the fridge card, with the notes hidden behind a "+ Add a note" toggle and
 * a Cancel beside Confirm. Both are gone: there is exactly one Serve
 * surface now, the sheet, so there is nothing to collapse back to and the
 * sheet's own X / overlay tap is the way out.
 *
 * Serve semantics are untouched — same `useFridgeServe` mutation, same
 * celebration, same auto-depletion (a depleted item leaves Active because
 * of that hook's cache invalidation, not anything here).
 */
export function ServeControl({ item, babyId, onServed }: ServeControlProps) {
  const maxServings = item.servingsLeft ?? UNTRACKED_SERVINGS_MAX;
  const [servings, setServings] = useState(1);
  const [reactionNote, setReactionNote] = useState("");
  const [notes, setNotes] = useState("");
  const serve = useFridgeServe(babyId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--color-text)]">Servings</span>
        <div className="flex items-center gap-1.5" role="group" aria-label="Servings">
          <button
            type="button"
            aria-label="Decrease servings"
            disabled={serve.isPending}
            onClick={() => setServings((s) => clampServings(s - 1, maxServings))}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm font-semibold text-[var(--color-text)] disabled:opacity-60"
          >
            −
          </button>
          <span aria-live="polite" className="min-w-6 text-center text-sm font-semibold text-[var(--color-text)]">
            {servings}
          </span>
          <button
            type="button"
            aria-label="Increase servings"
            disabled={serve.isPending}
            onClick={() => setServings((s) => clampServings(s + 1, maxServings))}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm font-semibold text-[var(--color-text)] disabled:opacity-60"
          >
            +
          </button>
        </div>
      </div>

      {/* Always visible, above the button (item 263) — the "+ Add a note"
          toggle that used to hide these is gone. Both fields are kept: the
          reaction note is what feeds allergen tracking, so hiding it behind
          a tap was the problem, not the field itself. */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-text-muted)]">Reaction note (optional)</span>
        <Textarea
          value={reactionNote}
          onChange={(e) => setReactionNote(e.target.value)}
          rows={2}
          placeholder="e.g. mild rash around mouth"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-text-muted)]">Note (optional)</span>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. ate the whole thing"
        />
      </label>

      {serve.isError && <span className="text-xs text-[var(--color-danger)]">Couldn't serve — try again.</span>}

      <Button
        type="button"
        disabled={serve.isPending}
        className="w-full"
        onClick={() =>
          serve.mutate(
            { id: item.id, input: buildServeInput(babyId, servings, reactionNote, notes) },
            { onSuccess: () => onServed?.() },
          )
        }
      >
        {serve.isPending ? "Serving…" : "Serve"}
      </Button>
    </div>
  );
}

interface ServeSheetProps {
  item: FridgeItem;
  babyId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * The one Serve surface in the app (item 263): a bottom sheet titled
 * "Serve <item>", opened from the fridge card's Serve button AND from the
 * kebab menu's Serve row, so the two paths can no longer drift. Closed by
 * the X at the LEFT of its header, an overlay tap, or Escape.
 */
export function ServeSheet({ item, babyId, open, onClose }: ServeSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={`Serve ${fridgeItemTitle(item)}`} showClose>
      <ServeControl item={item} babyId={babyId} onServed={onClose} />
    </Sheet>
  );
}

/**
 * A "Serve" button that owns its own sheet — what a full-size fridge card
 * (`FridgeDetailPage`) renders in its action row. The kebab menu opens
 * `ServeSheet` directly instead, since its trigger is the menu row.
 */
export function ServeAction({ item, babyId }: { item: FridgeItem; babyId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Serve
      </Button>
      <ServeSheet item={item} babyId={babyId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
