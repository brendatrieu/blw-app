import { useState, type ReactNode } from "react";
import type { PantryItem } from "@blw/shared";
import { Badge } from "../../catalog/components/Badge.js";
import { getFoodEmoji } from "../../catalog/foodEmoji.js";
import { usePantryServe } from "../hooks.js";
import { bestByLabel, clampServings, countdownLabel, isLabelOnly, LOCATION_LABEL, pantryItemTitle, servingsLabel } from "../format.js";
import { Button, ButtonLink } from "../../../components/ui/Button.js";
import { Textarea } from "../../../components/ui/Input.js";

/** Emoji for a pantry item: the food's own emoji when it was prepped from a
 * catalog food, otherwise a friendly stand-in for a recipe or free-form entry. */
function pantryItemEmoji(item: PantryItem): string {
  if (item.foodSlug) return getFoodEmoji(item.foodSlug);
  if (item.recipeTitle) return "🍲";
  return "📝";
}

/** Ceiling for the serve stepper on an untracked item (no servingsLeft to
 * bound it by) — generous enough never to feel like a real limit. */
const UNTRACKED_SERVINGS_MAX = 99;

interface ServeControlProps {
  startExpanded?: boolean;
  item: PantryItem;
  babyId: string;
}

/**
 * The card's Serve action: collapsed to a single "Serve" button until
 * tapped, then a compact −/+ stepper (default 1, clamped to
 * `[1, servingsLeft]` when tracked or `[1, 99]` otherwise) plus a Confirm
 * that posts the serve. A "+ Add a note" toggle sits behind that expanded
 * state, revealing the same two optional notes LogFoodForm exposes
 * (reaction note, general note) — collapsed by default so the common
 * one-tap "Serve → Confirm" path stays exactly as compact as before.
 * Success resets back to the fully collapsed state — a depleted item's
 * disappearance from Active (it moves to History) and the meal showing up
 * in the log both come from `usePantryServe`'s cache invalidation, not from
 * anything this component does directly.
 */

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

export function ServeControl({ item, babyId, startExpanded = false }: ServeControlProps) {
  const maxServings = item.servingsLeft ?? UNTRACKED_SERVINGS_MAX;
  // startExpanded: when the control opens from an explicit "Serve" action
  // (e.g. Home's kebab menu -> Sheet), the stepper shows immediately —
  // demanding a second "Serve" tap inside the popup would be a dead step.
  const [confirming, setConfirming] = useState(startExpanded);
  const [servings, setServings] = useState(1);
  const [notesOpen, setNotesOpen] = useState(false);
  const [reactionNote, setReactionNote] = useState("");
  const [notes, setNotes] = useState("");
  const serve = usePantryServe(babyId);

  function reset() {
    setConfirming(false);
    setServings(1);
    setNotesOpen(false);
    setReactionNote("");
    setNotes("");
  }

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)}>
        Serve
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5" role="group" aria-label="Servings">
          <button
            type="button"
            aria-label="Decrease servings"
            disabled={serve.isPending}
            onClick={() => setServings((s) => clampServings(s - 1, maxServings))}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm font-semibold text-[var(--color-text)] disabled:opacity-60"
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
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm font-semibold text-[var(--color-text)] disabled:opacity-60"
          >
            +
          </button>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={serve.isPending}
          onClick={() =>
            serve.mutate(
              {
                id: item.id,
                input: buildServeInput(babyId, servings, reactionNote, notes),
              },
              { onSuccess: reset },
            )
          }
        >
          {serve.isPending ? "Serving…" : "Confirm"}
        </Button>
        <button
          type="button"
          onClick={reset}
          disabled={serve.isPending}
          className="rounded px-2 py-1 text-xs font-medium text-[var(--color-text-muted)]"
        >
          Cancel
        </button>
      </div>

      {!notesOpen ? (
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          className="self-start rounded px-1 py-1 text-xs font-medium text-[var(--color-accent)]"
        >
          + Add a note
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-[var(--color-text-muted)]">Reaction note (optional)</span>
            <Textarea
              value={reactionNote}
              onChange={(e) => setReactionNote(e.target.value)}
              rows={1}
              placeholder="e.g. mild rash around mouth"
              className="text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-[var(--color-text-muted)]">Notes (optional)</span>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={1}
              placeholder="e.g. ate the whole thing"
              className="text-xs"
            />
          </label>
        </div>
      )}

      {serve.isError && <span className="text-xs text-[var(--color-danger)]">Couldn't serve — try again.</span>}
    </div>
  );
}

interface PantryItemCardProps {
  item: PantryItem;
  busy: boolean;
  /** Single manual removal action — records "discarded" upstream; "finished"
   * is only ever stamped automatically when tracked servings hit zero. */
  onRemove?: () => void;
  /** Route to the full-screen edit page (e.g. `/pantry/${item.id}/edit`); omit to hide the Edit affordance. */
  editHref?: string;
  onRestore?: () => void;
  /** The baby to serve as — required to show the Serve action (see
   * `ServeControl`); omit to hide it (e.g. no baby resolved yet). */
  babyId?: string;
  /** Extra controls rendered next to the location Badge (e.g. Home's
   * three-dot Actions menu) — independent of the `onRemove`/
   * `editHref`/`babyId` footer buttons below, so a caller can offer a
   * compact menu instead of (not in addition to) that full button row. */
  actions?: ReactNode;
}

export function PantryItemCard({ item, busy, onRemove, editHref, onRestore, babyId, actions }: PantryItemCardProps) {
  const preparedLabel = new Date(item.preparedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const canServe = Boolean(babyId) && item.status === "active" && !isLabelOnly(item);

  return (
    <li className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className="text-xl leading-none">
            {pantryItemEmoji(item)}
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-[var(--color-text)]">{pantryItemTitle(item)}</span>
            <span className="text-xs text-[var(--color-text-muted)]">
              Prepared {preparedLabel}
              {item.quantityNote ? ` · ${item.quantityNote}` : ""}
              {item.servingsTotal != null && item.servingsLeft != null
                ? ` · ${servingsLabel(item.servingsLeft, item.servingsTotal)}`
                : ""}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge tone="neutral">{LOCATION_LABEL[item.location]}</Badge>
          {actions}
        </div>
      </div>

      {item.notes && <p className="text-xs text-[var(--color-text-muted)]">{item.notes}</p>}

      {item.status === "active" && (
        <div className="flex items-center gap-2">
          {item.expired ? (
            <Badge tone="dangerSoft">Expired</Badge>
          ) : item.useSoon ? (
            <Badge tone="sunshine">⏰ Use soon</Badge>
          ) : null}
          {/* A user-entered best-by is shown even beside the safety badges —
              the badges warn, the date informs; neither hides the other. */}
          {(item.bestBy || (!item.expired && !item.useSoon)) && (
            <span className="text-xs text-[var(--color-text-muted)]">
              {item.bestBy ? bestByLabel(item.bestBy) : countdownLabel(item.expiresAt)}
            </span>
          )}
        </div>
      )}

      {item.status !== "active" && (
        <Badge tone={item.status === "finished" ? "primary" : "neutral"}>
          {item.status === "finished" ? "Finished" : "Discarded"}
        </Badge>
      )}

      {(canServe || onRemove || editHref || onRestore) && (
      <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-2">
        {canServe && <ServeControl item={item} babyId={babyId!} />}
        {onRemove && (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onRemove}>
            Remove
          </Button>
        )}
        {editHref && (
          <ButtonLink to={editHref} size="sm" variant="secondary">
            Edit
          </ButtonLink>
        )}
        {onRestore && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onRestore}
            className="text-[var(--color-accent)]"
          >
            Restore to active
          </Button>
        )}
      </div>
      )}
    </li>
  );
}
