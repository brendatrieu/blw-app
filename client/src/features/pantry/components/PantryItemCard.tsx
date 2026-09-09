import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { PantryItem } from "@blw/shared";
import { Badge } from "../../catalog/components/Badge.js";
import { getFoodEmoji } from "../../catalog/foodEmoji.js";
import { bestByLabel, countdownLabel, isLabelOnly, LOCATION_LABEL, pantryItemTitle, servingsLabel } from "../format.js";
import { Button, ButtonLink } from "../../../components/ui/Button.js";
import { ServeAction } from "./ServeSheet.js";

/** Emoji for a pantry item: the food's own emoji when it was prepped from a
 * catalog food, otherwise a friendly stand-in for a recipe or free-form entry.
 * Exported so `PantryDetailPage` can reuse it for its own header. */
export function pantryItemEmoji(item: PantryItem): string {
  // Pantry rows carry no category — a custom food's own emoji, or the
  // slug map, is all there is to go on.
  if (item.foodSlug) return getFoodEmoji(item.foodSlug, null, item.foodEmoji);
  if (item.recipeTitle) return "🍲";
  return "📝";
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
  /** Extra controls rendered next to the location Badge — the three-dot
   * Actions menu every LIST card now uses (item 264). Independent of the
   * `onRemove`/`editHref`/`babyId` footer buttons below, so a caller offers
   * a compact menu instead of (not in addition to) that full button row;
   * only `PantryDetailPage` still passes the footer props. */
  actions?: ReactNode;
  /** False renders the info block as plain content instead of a Link to
   * `/pantry/:id` — for `PantryDetailPage` itself, which must not link to
   * itself. Defaults to true (Home and the Pantry list both tap through). */
  linkable?: boolean;
}

export function PantryItemCard({ item, busy, onRemove, editHref, onRestore, babyId, actions, linkable = true }: PantryItemCardProps) {
  const preparedLabel = new Date(item.preparedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const canServe = Boolean(babyId) && item.status === "active" && !isLabelOnly(item);

  const info = (
    <>
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
    </>
  );

  return (
    <li className="relative flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
      <div className="flex items-start justify-between gap-2">
        {/* Stretched link: the anchor's ::after overlay covers the whole card
            so every edge is tappable, while the kebab/actions slot and the
            Serve/Edit/Remove/Restore footer sit ABOVE it (relative z-10) as
            siblings — nothing interactive is ever nested inside the anchor. */}
        {linkable ? (
          <Link
            to={`/pantry/${item.id}`}
            className="flex items-start gap-2 rounded-[var(--radius-sm)] after:absolute after:inset-0 after:rounded-[var(--radius-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            {info}
          </Link>
        ) : (
          <div className="flex items-start gap-2">{info}</div>
        )}
        <div className="relative z-10 flex shrink-0 items-center gap-1">
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

      {/* The full-size action row is now `PantryDetailPage`'s alone (item
          264): list cards on Home AND the Pantry tab pass `actions` (the
          kebab) and none of these props, so this block doesn't render for
          them. items-start keeps each button at its own height when the row
          wraps. */}
      {(canServe || onRemove || editHref || onRestore) && (
      <div className="relative z-10 flex flex-wrap items-start gap-2 border-t border-[var(--color-border)] pt-2">
        {canServe && <ServeAction item={item} babyId={babyId!} />}
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
